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

describe("MP2A restart", () => {
  it("restores grace timers (and timeControl/clock) from snapshot", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lasca-grace-restore-"));
    const gamesDir = path.join(tmpRoot, "games");

    const graceMs = 1_500;

    const s1 = await startLascaServer({ port: 0, gamesDir, disconnectGraceMs: graceMs });

    const initial = createInitialGameStateForVariant("lasca_7_classic" as any);
    const history = new HistoryManager();
    history.push(initial);

    const createRes = await fetch(`${s1.url}/api/create`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        variantId: "lasca_7_classic",
        timeControl: { mode: "clock", initialMs: 5_000, incrementMs: 0 },
        snapshot: {
          state: serializeWireGameState(initial),
          history: serializeWireHistory(history.exportSnapshots()),
          stateVersion: 0,
        },
      }),
    }).then((r) => r.json() as Promise<any>);

    expect(createRes.error).toBeUndefined();
    const roomId = createRes.roomId as string;

    const joinRes = await fetch(`${s1.url}/api/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomId }),
    }).then((r) => r.json() as Promise<any>);

    expect(joinRes.error).toBeUndefined();

    const playerW = createRes.playerId as string;
    const playerB = joinRes.playerId as string;

    const streamW = await openRawSse(`${s1.url}/api/stream/${encodeURIComponent(roomId)}?playerId=${encodeURIComponent(playerW)}`);
    const streamB = await openRawSse(`${s1.url}/api/stream/${encodeURIComponent(roomId)}?playerId=${encodeURIComponent(playerB)}`);

    // Trigger grace.
    streamB.close();
    await new Promise((r) => setTimeout(r, 20));

    const beforeRestart = await fetch(`${s1.url}/api/room/${encodeURIComponent(roomId)}`).then((r) => r.json() as Promise<any>);
    expect(beforeRestart.error).toBeUndefined();
    expect(beforeRestart.presence[playerB].inGrace).toBe(true);
    expect(beforeRestart.snapshot.state.forcedGameOver).toBeUndefined();
    expect(beforeRestart.timeControl?.mode).toBe("clock");
    expect(beforeRestart.clock).toBeTruthy();
    expect(beforeRestart.clock.paused).toBe(true);

    const closing1 = new Promise<void>((resolve) => s1.server.close(() => resolve()));
    streamW.close();
    await closing1;

    const s2 = await startLascaServer({ port: 0, gamesDir, disconnectGraceMs: graceMs });

    // Trigger lazy room-load immediately so restored timers can start running.
    const immediatelyAfterRestart = await fetch(`${s2.url}/api/room/${encodeURIComponent(roomId)}`).then((r) => r.json() as Promise<any>);
    expect(immediatelyAfterRestart.error).toBeUndefined();
    expect(immediatelyAfterRestart.timeControl?.mode).toBe("clock");
    expect(immediatelyAfterRestart.clock).toBeTruthy();
    // Depending on timing, the restored grace may still be active or may have already expired.
    const forcedNow = immediatelyAfterRestart.snapshot.state.forcedGameOver;
    if (forcedNow) {
      expect(forcedNow.reasonCode).toBe("DISCONNECT_TIMEOUT");
    } else {
      expect(immediatelyAfterRestart.presence[playerB].inGrace).toBe(true);
      expect(immediatelyAfterRestart.clock.paused).toBe(true);
    }

    // Wait long enough that the restored grace timer should expire (if it hasn't already).
    await new Promise((r) => setTimeout(r, 1_700));

    const afterRestart = await fetch(`${s2.url}/api/room/${encodeURIComponent(roomId)}`).then((r) => r.json() as Promise<any>);
    expect(afterRestart.error).toBeUndefined();

    // Grace expiry should have forced game over.
    const forced = afterRestart.snapshot.state.forcedGameOver;
    expect(forced).toBeTruthy();
    expect(forced.reasonCode).toBe("DISCONNECT_TIMEOUT");

    // Time control should still be present.
    expect(afterRestart.timeControl?.mode).toBe("clock");

    await new Promise<void>((resolve) => s2.server.close(() => resolve()));
    await rmWithRetries(tmpRoot);
  }, 30_000);
});
