// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { startLascaServer } from "../server/src/app.ts";
import { createInitialGameStateForVariant } from "./game/state.ts";
import { HistoryManager } from "./game/historyManager.ts";
import { nodeIdToA1 } from "./game/coordFormat.ts";
import { generateLegalMoves } from "./game/movegen.ts";
import { serializeWireGameState, serializeWireHistory, deserializeWireGameState } from "./shared/wireState.ts";

function canonicalBoard(wireBoard: Array<[string, any]>): string {
  return JSON.stringify(
    [...wireBoard]
      .slice()
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => [k, v]),
  );
}

describe("server persistence (Step F)", () => {
  it("reconstructs stateVersion + board after restart", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lasca-persist-"));
    const gamesDir = path.join(tmpRoot, "games");

    const s1 = await startLascaServer({ port: 0, gamesDir, snapshotEvery: 5 });

    // Create initial snapshot matching the client contract.
    const initial = createInitialGameStateForVariant("lasca_7_classic" as any);
    const history = new HistoryManager();
    history.push(initial);

    const createRes = await fetch(`${s1.url}/api/create`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        variantId: "lasca_7_classic",
        guestId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        displayName: "Alice",
        snapshot: {
          state: serializeWireGameState(initial),
          history: serializeWireHistory(history.exportSnapshots()),
          stateVersion: 0,
        },
      }),
    }).then((r) => r.json() as Promise<any>);

    expect(createRes.error).toBeUndefined();
    const roomId = createRes.roomId as string;

    // Join second player so both colors exist.
    const joinRes = await fetch(`${s1.url}/api/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        roomId,
        guestId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        displayName: "Bob",
      }),
    }).then((r) => r.json() as Promise<any>);
    expect(joinRes.error).toBeUndefined();

    const playerW = createRes.playerId as string;
    const playerB = joinRes.playerId as string;

    // Play a few moves (prefer quiet moves to avoid capture-chain complexity).
    const expectedNotations: string[] = [];
    for (let i = 0; i < 3; i++) {
      const snap = await fetch(`${s1.url}/api/room/${encodeURIComponent(roomId)}`).then((r) => r.json() as Promise<any>);
      expect(snap.error).toBeUndefined();

      const wireState = snap.snapshot.state;
      const state = deserializeWireGameState(wireState);
      const toMove = state.toMove as "W" | "B";
      const playerId = toMove === "W" ? playerW : playerB;

      const legal = generateLegalMoves(state);
      expect(legal.length).toBeGreaterThan(0);
      const move = legal.find((m) => m.kind === "move") ?? legal[0];

      if (move.kind === "move") {
        const boardSize = Number((state as any)?.meta?.boardSize ?? 7);
        expectedNotations.push(`${nodeIdToA1(move.from, boardSize)} → ${nodeIdToA1(move.to, boardSize)}`);
      }

      const submitRes = await fetch(`${s1.url}/api/submitMove`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId, playerId, move }),
      }).then((r) => r.json() as Promise<any>);
      expect(submitRes.error).toBeUndefined();
    }

    const beforeRestart = await fetch(`${s1.url}/api/room/${encodeURIComponent(roomId)}`).then((r) => r.json() as Promise<any>);
    expect(beforeRestart.error).toBeUndefined();
    const expectedVersion = beforeRestart.snapshot.stateVersion as number;
    const expectedBoard = canonicalBoard(beforeRestart.snapshot.state.board);

    await new Promise<void>((resolve) => s1.server.close(() => resolve()));

    const s2 = await startLascaServer({ port: 0, gamesDir, snapshotEvery: 5 });

    // Reconnect by fetching snapshot after restart (forces lazy-load from disk).
    const afterRestart = await fetch(`${s2.url}/api/room/${encodeURIComponent(roomId)}`).then((r) => r.json() as Promise<any>);
    expect(afterRestart.error).toBeUndefined();

    expect(afterRestart.snapshot.stateVersion).toBe(expectedVersion);
    expect(canonicalBoard(afterRestart.snapshot.state.board)).toBe(expectedBoard);

    expect(afterRestart.identity?.[playerW]?.displayName).toBe("Alice");
    expect(afterRestart.identity?.[playerB]?.displayName).toBe("Bob");

    const notation = afterRestart.snapshot.history.notation as string[];
    // index 0 is the initial position. History may also include additional entries
    // (e.g., capture-step notation), but it must preserve our chosen quiet-move
    // notations in order.
    let j = 0;
    for (let i = 1; i < notation.length && j < expectedNotations.length; i++) {
      if (notation[i] === expectedNotations[j]) j++;
    }
    expect(j).toBe(expectedNotations.length);

    await new Promise<void>((resolve) => s2.server.close(() => resolve()));
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }, 30_000);
});
