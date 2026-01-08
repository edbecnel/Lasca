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

describe("MP2A clocks", () => {
  it("pauses clocks during disconnect grace and resumes after reconnect", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lasca-clock-grace-"));
    const gamesDir = path.join(tmpRoot, "games");
    const s = await startLascaServer({ port: 0, gamesDir, disconnectGraceMs: 5_000 });

    const initial = createInitialGameStateForVariant("lasca_7_classic" as any);
    const history = new HistoryManager();
    history.push(initial);

    const createRes = await fetch(`${s.url}/api/create`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        variantId: "lasca_7_classic",
        timeControl: { mode: "clock", initialMs: 10_000, incrementMs: 0 },
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

    // Disconnect player B, starting grace.
    streamB.close();
    await new Promise((r) => setTimeout(r, 25));

    const snapPaused1 = await fetch(`${s.url}/api/room/${encodeURIComponent(roomId)}`).then((r) => r.json() as Promise<any>);
    expect(snapPaused1.error).toBeUndefined();
    expect(snapPaused1.presence[playerB].inGrace).toBe(true);
    expect(snapPaused1.clock).toBeTruthy();
    expect(snapPaused1.clock.paused).toBe(true);

    const active = snapPaused1.clock.active as "W" | "B";
    const t1 = Number(snapPaused1.clock.remainingMs[active]);

    await new Promise((r) => setTimeout(r, 150));

    const snapPaused2 = await fetch(`${s.url}/api/room/${encodeURIComponent(roomId)}`).then((r) => r.json() as Promise<any>);
    expect(snapPaused2.error).toBeUndefined();
    expect(snapPaused2.clock.paused).toBe(true);

    const t2 = Number(snapPaused2.clock.remainingMs[active]);
    expect(t2).toBe(t1);

    // Reconnect player B; grace clears and clocks resume.
    const streamB2 = await openRawSse(`${s.url}/api/stream/${encodeURIComponent(roomId)}?playerId=${encodeURIComponent(playerB)}`);
    await new Promise((r) => setTimeout(r, 25));

    const snapResumed1 = await fetch(`${s.url}/api/room/${encodeURIComponent(roomId)}`).then((r) => r.json() as Promise<any>);
    expect(snapResumed1.error).toBeUndefined();
    expect(snapResumed1.presence[playerB].inGrace).toBeUndefined();
    expect(snapResumed1.clock.paused).toBe(false);

    const t3 = Number(snapResumed1.clock.remainingMs[active]);

    await new Promise((r) => setTimeout(r, 150));

    const snapResumed2 = await fetch(`${s.url}/api/room/${encodeURIComponent(roomId)}`).then((r) => r.json() as Promise<any>);
    expect(snapResumed2.error).toBeUndefined();
    expect(snapResumed2.clock.paused).toBe(false);

    const t4 = Number(snapResumed2.clock.remainingMs[active]);
    expect(t4).toBeLessThan(t3 - 50);

    const closing = new Promise<void>((resolve) => s.server.close(() => resolve()));
    streamW.close();
    streamB2.close();
    await closing;
    await rmWithRetries(tmpRoot);
  }, 30_000);
});
