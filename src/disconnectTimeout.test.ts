// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { startLascaServer } from "../server/src/app.ts";
import { createInitialGameStateForVariant } from "./game/state.ts";
import { HistoryManager } from "./game/historyManager.ts";
import { generateLegalMoves } from "./game/movegen.ts";
import { deserializeWireGameState, serializeWireGameState, serializeWireHistory } from "./shared/wireState.ts";

async function openRawSse(url: string): Promise<{ close: () => void }> {
  const controller = new AbortController();
  const res = await fetch(url, {
    headers: { accept: "text/event-stream" },
    signal: controller.signal,
  });
  if (!res.ok) throw new Error(`SSE HTTP ${res.status}`);
  return { close: () => controller.abort() };
}

async function rmWithRetries(p: string): Promise<void> {
  for (let i = 0; i < 6; i++) {
    try {
      await fs.rm(p, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 25 * (i + 1)));
    }
  }
  await fs.rm(p, { recursive: true, force: true });
}

describe("MP2A disconnect grace", () => {
  it("ends game after grace expires (DISCONNECT_TIMEOUT)", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lasca-disconnect-timeout-"));
    const gamesDir = path.join(tmpRoot, "games");
    const s = await startLascaServer({ port: 0, gamesDir, disconnectGraceMs: 40 });

    const initial = createInitialGameStateForVariant("lasca_7_classic" as any);
    const history = new HistoryManager();
    history.push(initial);

    const createRes = await fetch(`${s.url}/api/create`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        variantId: "lasca_7_classic",
        snapshot: {
          state: serializeWireGameState(initial),
          history: serializeWireHistory(history.exportSnapshots()),
          stateVersion: 0,
        },
      }),
    }).then((r) => r.json() as Promise<any>);

    expect(createRes.error).toBeUndefined();
    const roomId = createRes.roomId as string;

    const joinRes = await fetch(`${s.url}/api/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomId }),
    }).then((r) => r.json() as Promise<any>);

    expect(joinRes.error).toBeUndefined();

    const playerW = createRes.playerId as string;
    const playerB = joinRes.playerId as string;

    // Open streams for both
    const streamW = await openRawSse(`${s.url}/api/stream/${encodeURIComponent(roomId)}?playerId=${encodeURIComponent(playerW)}`);
    const streamB = await openRawSse(`${s.url}/api/stream/${encodeURIComponent(roomId)}?playerId=${encodeURIComponent(playerB)}`);

    // Disconnect player B
    streamB.close();

    await rmWithRetries(tmpRoot);
    await new Promise((r) => setTimeout(r, 80));

    const snap = await fetch(`${s.url}/api/room/${encodeURIComponent(roomId)}`).then((r) => r.json() as Promise<any>);
    expect(snap.error).toBeUndefined();

    const forced = snap.snapshot.state.forcedGameOver;
    expect(forced).toBeTruthy();
    expect(forced.reasonCode).toBe("DISCONNECT_TIMEOUT");

    // If Black disconnected, White should win (playerW is White).
    expect(forced.winner).toBe("W");

    const closing = new Promise<void>((resolve) => s.server.close(() => resolve()));
    streamW.close();
    await closing;
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }, 30_000);

  it("does not end game if both players disconnect (mutual pause)", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lasca-disconnect-both-"));
    const gamesDir = path.join(tmpRoot, "games");
    const s = await startLascaServer({ port: 0, gamesDir, disconnectGraceMs: 60 });

    const initial = createInitialGameStateForVariant("lasca_7_classic" as any);
    const history = new HistoryManager();
    history.push(initial);

    const createRes = await fetch(`${s.url}/api/create`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        variantId: "lasca_7_classic",
        snapshot: {
          state: serializeWireGameState(initial),
          history: serializeWireHistory(history.exportSnapshots()),
          stateVersion: 0,
        },
      }),
    }).then((r) => r.json() as Promise<any>);

    expect(createRes.error).toBeUndefined();
    const roomId = createRes.roomId as string;

    const joinRes = await fetch(`${s.url}/api/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomId }),
    }).then((r) => r.json() as Promise<any>);

    expect(joinRes.error).toBeUndefined();

    const playerW = createRes.playerId as string;
    const playerB = joinRes.playerId as string;

    const streamW = await openRawSse(`${s.url}/api/stream/${encodeURIComponent(roomId)}?playerId=${encodeURIComponent(playerW)}`);
    const streamB = await openRawSse(`${s.url}/api/stream/${encodeURIComponent(roomId)}?playerId=${encodeURIComponent(playerB)}`);

    // Both disconnect.
    streamW.close();
    streamB.close();

    // Wait long enough that grace would have expired at least once.
    await new Promise((r) => setTimeout(r, 160));

    const snap = await fetch(`${s.url}/api/room/${encodeURIComponent(roomId)}`).then((r) => r.json() as Promise<any>);
    expect(snap.error).toBeUndefined();

    // Mutual disconnect should not force game over.
    expect(snap.snapshot.state.forcedGameOver).toBeUndefined();

    const closing = new Promise<void>((resolve) => s.server.close(() => resolve()));
    await closing;
    await rmWithRetries(tmpRoot);
  }, 30_000);

  it("ends game after mutual pause once a player returns via polling", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lasca-disconnect-return-"));
    const gamesDir = path.join(tmpRoot, "games");
    const graceMs = 60;
    const s = await startLascaServer({ port: 0, gamesDir, disconnectGraceMs: graceMs });

    const initial = createInitialGameStateForVariant("lasca_7_classic" as any);
    const history = new HistoryManager();
    history.push(initial);

    const createRes = await fetch(`${s.url}/api/create`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        variantId: "lasca_7_classic",
        snapshot: {
          state: serializeWireGameState(initial),
          history: serializeWireHistory(history.exportSnapshots()),
          stateVersion: 0,
        },
      }),
    }).then((r) => r.json() as Promise<any>);

    expect(createRes.error).toBeUndefined();
    const roomId = createRes.roomId as string;

    const joinRes = await fetch(`${s.url}/api/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomId }),
    }).then((r) => r.json() as Promise<any>);

    expect(joinRes.error).toBeUndefined();

    const playerW = createRes.playerId as string;
    const playerB = joinRes.playerId as string;

    // Open streams for both, then simulate mutual disconnect.
    const streamW = await openRawSse(`${s.url}/api/stream/${encodeURIComponent(roomId)}?playerId=${encodeURIComponent(playerW)}`);
    const streamB = await openRawSse(`${s.url}/api/stream/${encodeURIComponent(roomId)}?playerId=${encodeURIComponent(playerB)}`);
    streamW.close();
    streamB.close();

    // Wait long enough that grace would have expired at least once.
    await new Promise((r) => setTimeout(r, graceMs + 40));

    const snap0 = await fetch(`${s.url}/api/room/${encodeURIComponent(roomId)}`).then((r) => r.json() as Promise<any>);
    expect(snap0.error).toBeUndefined();
    expect(snap0.snapshot.state.forcedGameOver).toBeUndefined();

    // Player W returns, but only via polling (no stream open).
    await fetch(`${s.url}/api/room/${encodeURIComponent(roomId)}?playerId=${encodeURIComponent(playerW)}`).then((r) =>
      r.json() as Promise<any>
    );

    // Next grace tick should forfeit the still-disconnected player.
    await new Promise((r) => setTimeout(r, graceMs + 60));

    const snap1 = await fetch(`${s.url}/api/room/${encodeURIComponent(roomId)}`).then((r) => r.json() as Promise<any>);
    expect(snap1.error).toBeUndefined();

    const forced = snap1.snapshot.state.forcedGameOver;
    expect(forced).toBeTruthy();
    expect(forced.reasonCode).toBe("DISCONNECT_TIMEOUT");
    expect(forced.winner).toBe("W");

    const closing = new Promise<void>((resolve) => s.server.close(() => resolve()));
    await closing;
    await rmWithRetries(tmpRoot);
  }, 30_000);

  it("blocks moves while opponent is disconnected (grace active)", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lasca-disconnect-block-move-"));
    const gamesDir = path.join(tmpRoot, "games");
    const s = await startLascaServer({ port: 0, gamesDir, disconnectGraceMs: 5000 });

    let streamW: { close: () => void } | null = null;
    let streamB: { close: () => void } | null = null;

    try {
      const initial = createInitialGameStateForVariant("lasca_7_classic" as any);
      const history = new HistoryManager();
      history.push(initial);

      const createRes = await fetch(`${s.url}/api/create`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          variantId: "lasca_7_classic",
          snapshot: {
            state: serializeWireGameState(initial),
            history: serializeWireHistory(history.exportSnapshots()),
            stateVersion: 0,
          },
        }),
      }).then((r) => r.json() as Promise<any>);

      expect(createRes.error).toBeUndefined();
      const roomId = createRes.roomId as string;

      const joinRes = await fetch(`${s.url}/api/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId }),
      }).then((r) => r.json() as Promise<any>);

      expect(joinRes.error).toBeUndefined();

      const playerW = (createRes.color === "W" ? createRes.playerId : joinRes.playerId) as string;
      const playerB = (createRes.color === "B" ? createRes.playerId : joinRes.playerId) as string;

      // Open SSE streams so disconnect is detected and grace starts.
      streamW = await openRawSse(
        `${s.url}/api/stream/${encodeURIComponent(roomId)}?playerId=${encodeURIComponent(playerW)}`
      );
      streamB = await openRawSse(
        `${s.url}/api/stream/${encodeURIComponent(roomId)}?playerId=${encodeURIComponent(playerB)}`
      );

      // Fetch authoritative state so we know whose turn it is.
      const snap0 = await fetch(`${s.url}/api/room/${encodeURIComponent(roomId)}`).then((r) => r.json() as Promise<any>);
      expect(snap0.error).toBeUndefined();
      const state0 = deserializeWireGameState(snap0.snapshot.state);

      const moverId = state0.toMove === "W" ? playerW : playerB;
      const opponentId = state0.toMove === "W" ? playerB : playerW;

      // Disconnect the opponent.
      if (opponentId === playerW) streamW?.close();
      else streamB?.close();

      // Allow the server close handler to run.
      await new Promise((r) => setTimeout(r, 30));

      // Attempt a legal move; should be rejected while opponent is disconnected.
      const legal = generateLegalMoves(state0 as any);
      expect(legal.length).toBeGreaterThan(0);
      const move = legal[0];

      const moveRes = await fetch(`${s.url}/api/submitMove`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId, playerId: moverId, move }),
      });
      expect(moveRes.ok).toBe(false);
      const moveJson = (await moveRes.json()) as any;
      expect(String(moveJson?.error ?? "")).toMatch(/Opponent disconnected/i);

      // Ensure the game did not advance.
      const snap1 = await fetch(`${s.url}/api/room/${encodeURIComponent(roomId)}`).then((r) => r.json() as Promise<any>);
      expect(snap1.error).toBeUndefined();
      expect(Number(snap1.snapshot.stateVersion ?? -1)).toBe(Number(snap0.snapshot.stateVersion ?? -1));
    } finally {
      const closing = new Promise<void>((resolve) => s.server.close(() => resolve()));
      try {
        streamW?.close();
      } catch {
        // ignore
      }
      try {
        streamB?.close();
      } catch {
        // ignore
      }
      await closing;
      await rmWithRetries(tmpRoot);
    }
  }, 30_000);
});
