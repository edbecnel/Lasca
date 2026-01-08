// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { startLascaServer } from "../server/src/app.ts";
import { createInitialGameStateForVariant } from "./game/state.ts";
import { HistoryManager } from "./game/historyManager.ts";
import { serializeWireGameState, serializeWireHistory } from "./shared/wireState.ts";

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
});
