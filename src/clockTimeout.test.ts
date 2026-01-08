// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { startLascaServer } from "../server/src/app.ts";
import { createInitialGameStateForVariant } from "./game/state.ts";
import { HistoryManager } from "./game/historyManager.ts";
import { serializeWireGameState, serializeWireHistory } from "./shared/wireState.ts";

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

describe("MP2 time control", () => {
  it("forces game over on clock timeout", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lasca-clock-timeout-"));
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
        timeControl: { mode: "clock", initialMs: 60, incrementMs: 0 },
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

    // Let the active player's clock run out.
    await new Promise((r) => setTimeout(r, 120));

    const snap = await fetch(`${s.url}/api/room/${encodeURIComponent(roomId)}`).then((r) => r.json() as Promise<any>);
    expect(snap.error).toBeUndefined();

    const forced = snap.snapshot.state.forcedGameOver;
    expect(forced).toBeTruthy();
    expect(forced.reasonCode).toBe("TIMEOUT");

    await new Promise<void>((resolve) => s.server.close(() => resolve()));
    await rmWithRetries(tmpRoot);
  }, 30_000);
});
