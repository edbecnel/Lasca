// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { startLascaServer } from "../server/src/app.ts";
import { createInitialGameStateForVariant } from "./game/state.ts";
import { HistoryManager } from "./game/historyManager.ts";
import { serializeWireGameState, serializeWireHistory } from "./shared/wireState.ts";
import { generateLegalMoves } from "./game/movegen.ts";

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

describe("MP7 replay endpoint", () => {
  it("serves persisted event log with snapshots", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lasca-replay-"));
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
    const whitePlayerId = createRes.playerId as string;

    // Ensure both seats are filled before making moves.
    const joinRes = await fetch(`${s.url}/api/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomId }),
    }).then((r) => r.json() as Promise<any>);
    expect(joinRes.error).toBeUndefined();

    // Apply a legal move so the log includes MOVE_APPLIED.
    const legal = generateLegalMoves(initial as any);
    expect(legal.length).toBeGreaterThan(0);
    const mv = legal[0] as any;

    const submitRes = await fetch(`${s.url}/api/submitMove`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomId, playerId: whitePlayerId, move: mv, expectedStateVersion: 0 }),
    }).then((r) => r.json() as Promise<any>);

    expect(submitRes.error).toBeUndefined();

    const replayRes = await fetch(`${s.url}/api/room/${encodeURIComponent(roomId)}/replay`).then((r) =>
      r.json() as Promise<any>
    );

    expect(replayRes.error).toBeUndefined();
    expect(Array.isArray(replayRes.events)).toBe(true);

    const types = new Set((replayRes.events as any[]).map((e) => e?.type));
    expect(types.has("GAME_CREATED")).toBe(true);
    expect(types.has("MOVE_APPLIED")).toBe(true);

    const moveEv = (replayRes.events as any[]).find((e) => e?.type === "MOVE_APPLIED");
    expect(moveEv?.snapshot?.stateVersion).toBeGreaterThanOrEqual(1);

    const closing = new Promise<void>((resolve) => s.server.close(() => resolve()));
    await closing;
    await rmWithRetries(tmpRoot);
  }, 30_000);
});
