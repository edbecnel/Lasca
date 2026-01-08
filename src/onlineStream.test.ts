// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { startLascaServer } from "../server/src/app.ts";
import { createInitialGameStateForVariant } from "./game/state.ts";
import { HistoryManager } from "./game/historyManager.ts";
import { generateLegalMoves } from "./game/movegen.ts";
import { serializeWireGameState, serializeWireHistory, deserializeWireGameState } from "./shared/wireState.ts";

async function openSseStream(url: string): Promise<{
  close: () => void;
  nextSnapshot: () => Promise<any>;
}> {
  const controller = new AbortController();
  const res = await fetch(url, {
    headers: {
      accept: "text/event-stream",
    },
    signal: controller.signal,
  });

  if (!res.ok) throw new Error(`SSE HTTP ${res.status}`);
  if (!res.body) throw new Error("SSE missing body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  const queue: any[] = [];
  let pendingResolve: ((v: any) => void) | null = null;
  let pendingReject: ((e: any) => void) | null = null;

  async function pump(): Promise<void> {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse SSE messages separated by blank line.
        while (true) {
          const sep = buffer.indexOf("\n\n");
          if (sep < 0) break;
          const raw = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);

          // Ignore comment/heartbeat-only frames
          const lines = raw
            .split("\n")
            .map((l) => l.trimEnd())
            .filter(Boolean);

          let eventType: string | null = null;
          const dataLines: string[] = [];
          for (const line of lines) {
            if (line.startsWith(":")) continue;
            if (line.startsWith("event:")) eventType = line.slice("event:".length).trim();
            if (line.startsWith("data:")) dataLines.push(line.slice("data:".length).trim());
          }

          if (eventType !== "snapshot") continue;
          if (dataLines.length === 0) continue;

          const data = JSON.parse(dataLines.join("\n"));
          queue.push(data);

          if (pendingResolve) {
            const r = pendingResolve;
            pendingResolve = null;
            pendingReject = null;
            r(queue.shift());
          }
        }
      }

      // Stream ended: fail any waiters
      if (pendingReject) {
        const rj = pendingReject;
        pendingResolve = null;
        pendingReject = null;
        rj(new Error("SSE stream ended"));
      }
    } catch (err) {
      if (pendingReject) {
        const rj = pendingReject;
        pendingResolve = null;
        pendingReject = null;
        rj(err);
      }
    }
  }

  void pump();

  return {
    close: () => controller.abort(),
    nextSnapshot: async () => {
      if (queue.length > 0) return queue.shift();
      return new Promise<any>((resolve, reject) => {
        pendingResolve = resolve;
        pendingReject = reject;
      });
    },
  };
}

async function nextSnapshotWithNewerVersion(stream: { nextSnapshot: () => Promise<any> }, minVersion: number): Promise<any> {
  // Streams may emit multiple snapshots for non-move updates (e.g., presence).
  // Keep reading until stateVersion advances.
  while (true) {
    const ev = await stream.nextSnapshot();
    const v = Number(ev?.snapshot?.stateVersion ?? -1);
    if (v > minVersion) return ev;
  }
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

describe("MP1.5 realtime push transport (SSE)", () => {
  it("broadcasts snapshots to all connected streams", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lasca-online-stream-"));
    const gamesDir = path.join(tmpRoot, "games");
    const s = await startLascaServer({ port: 0, gamesDir });

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

    // Connect as observers only (no playerId) so stream close doesn't trigger grace timers.
    const a = await openSseStream(`${s.url}/api/stream/${encodeURIComponent(roomId)}`);
    const b = await openSseStream(`${s.url}/api/stream/${encodeURIComponent(roomId)}`);

    // Drain initial snapshot from both streams
    const a0 = await a.nextSnapshot();
    const b0 = await b.nextSnapshot();
    expect(a0.roomId).toBe(roomId);
    expect(b0.roomId).toBe(roomId);

    // Make one legal move
    const snap = await fetch(`${s.url}/api/room/${encodeURIComponent(roomId)}`).then((r) => r.json() as Promise<any>);
    const state = deserializeWireGameState(snap.snapshot.state);
    const toMove = state.toMove as "W" | "B";
    const mover = toMove === "W" ? playerW : playerB;

    const legal = generateLegalMoves(state);
    expect(legal.length).toBeGreaterThan(0);
    const move = legal.find((m) => m.kind === "move") ?? legal[0];

    const submitRes = await fetch(`${s.url}/api/submitMove`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomId, playerId: mover, move }),
    }).then((r) => r.json() as Promise<any>);

    expect(submitRes.error).toBeUndefined();

    const a1 = await nextSnapshotWithNewerVersion(a, a0.snapshot.stateVersion);
    const b1 = await nextSnapshotWithNewerVersion(b, b0.snapshot.stateVersion);

    expect(a1.snapshot.stateVersion).toBeGreaterThan(a0.snapshot.stateVersion);
    expect(b1.snapshot.stateVersion).toBeGreaterThan(b0.snapshot.stateVersion);

    const closing = new Promise<void>((resolve) => s.server.close(() => resolve()));
    a.close();
    b.close();
    await closing;
    await rmWithRetries(tmpRoot);
  }, 30_000);
});
