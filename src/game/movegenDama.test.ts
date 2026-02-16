import { describe, it, expect } from "vitest";
import { generateLegalMoves } from "./movegen.ts";
import { applyMove } from "./applyMove.ts";
import type { GameState } from "./state.ts";
import type { Stack } from "../types";

// 8×8 boards now use the opposite playable parity so that A1 is playable.
// These tests were originally written against the old parity; keep the
// coordinates stable by remapping IDs when talking to the engine.
//
// Important: `c ^ 1` is not safe at the edges (c=7) and breaks expected
// diagonal relationships for some positions. A horizontal mirror keeps all
// coordinates in-bounds and preserves adjacency.
function remap8x8Id(id: string): string {
  const m = /^r(\d+)c(\d+)$/.exec(id);
  if (!m) return id;
  const r = Number(m[1]);
  const c = Number(m[2]);
  const c2 = 7 - c;
  return `r${r}c${c2}`;
}

function toEngineBoardEntries(entries: Array<[string, Stack]>): Array<[string, Stack]> {
  return entries.map(([id, stack]) => [remap8x8Id(id), stack]);
}

function toTestMove(m: any): any {
  if (!m || typeof m !== "object") return m;
  const out: any = { ...m };
  if (typeof out.from === "string") out.from = remap8x8Id(out.from);
  if (typeof out.to === "string") out.to = remap8x8Id(out.to);
  if (typeof out.over === "string") out.over = remap8x8Id(out.over);
  return out;
}

function toTestMoves(ms: any[]): any[] {
  return ms.map(toTestMove);
}

function toEngineConstraints(constraints: any | undefined): any | undefined {
  if (!constraints) return constraints;
  const out: any = { ...constraints };
  if (typeof out.forcedFrom === "string") out.forcedFrom = remap8x8Id(out.forcedFrom);
  if (out.excludedJumpSquares instanceof Set) {
    out.excludedJumpSquares = new Set(Array.from(out.excludedJumpSquares).map((id) => remap8x8Id(String(id))));
  }
  if (out.lastCaptureDir && typeof out.lastCaptureDir === "object") {
    const dr = Number((out.lastCaptureDir as any).dr);
    const dc = Number((out.lastCaptureDir as any).dc);
    if (Number.isFinite(dr) && Number.isFinite(dc)) {
      out.lastCaptureDir = { dr, dc: -dc };
    }
  }
  return out;
}

function genMovesForTest(s: GameState, constraints?: any): any[] {
  return toTestMoves(generateLegalMoves(s, toEngineConstraints(constraints)) as any);
}

function mkDamaState(
  boardEntries: Array<[string, Stack]>,
  toMove: "B" | "W" = "B"
): GameState {
  return {
    board: new Map(toEngineBoardEntries(boardEntries)),
    toMove,
    phase: "idle",
    meta: {
      variantId: "dama_8_classic_standard",
      rulesetId: "dama",
      boardSize: 8,
    },
  };
}

describe("movegen Dama (Phase 4)", () => {
  it("men move forward only (quiet moves)", () => {
    const s = mkDamaState([["r3c3", [{ owner: "B", rank: "S" }]]], "B");
    const moves = genMovesForTest(s);
    expect(moves).toEqual(
      expect.arrayContaining([
        { kind: "move", from: "r3c3", to: "r4c2" },
        { kind: "move", from: "r3c3", to: "r4c4" },
      ])
    );
  });

  it("men can capture backwards", () => {
    const s = mkDamaState(
      [
        ["r3c3", [{ owner: "B", rank: "S" }]],
        ["r2c2", [{ owner: "W", rank: "S" }]],
      ],
      "B"
    );

    const moves = genMovesForTest(s);
    expect(moves).toEqual(
      expect.arrayContaining([
        { kind: "capture", from: "r3c3", over: "r2c2", to: "r1c1" },
      ])
    );
  });

  it("kings have flying captures (multiple landing squares)", () => {
    const s = mkDamaState(
      [
        ["r3c3", [{ owner: "B", rank: "O" }]],
        ["r4c4", [{ owner: "W", rank: "S" }]],
      ],
      "B"
    );

    const moves = genMovesForTest(s);
    // Must be captures (mandatory capture), and king can land beyond the captured piece.
    expect(moves).toEqual(
      expect.arrayContaining([
        { kind: "capture", from: "r3c3", over: "r4c4", to: "r5c5" },
        { kind: "capture", from: "r3c3", over: "r4c4", to: "r6c6" },
        { kind: "capture", from: "r3c3", over: "r4c4", to: "r7c7" },
      ])
    );
    expect(moves.every((m) => m.kind === "capture")).toBe(true);
  });

  it("kings may continue straight or turn 90°, but may not reverse 180° in multi-capture", () => {
    // Represent a continuation step: last capture direction was (+1,+1).
    // From r3c3:
    // - continuing (+1,+1) over r4c4 should be allowed.
    // - reversing (-1,-1) over r2c2 should be disallowed.
    const s = mkDamaState(
      [
        ["r3c3", [{ owner: "B", rank: "O" }]],
        ["r4c4", [{ owner: "W", rank: "S" }]],
        ["r2c2", [{ owner: "W", rank: "S" }]],
      ],
      "B"
    );

    const cont = genMovesForTest(s, {
      forcedFrom: "r3c3",
      excludedJumpSquares: new Set(),
      lastCaptureDir: { dr: 1, dc: 1 },
    }).filter((m: any) => m.kind === "capture");

    expect(cont.some((m: any) => m.over === "r4c4")).toBe(true);
    expect(cont.some((m: any) => m.over === "r2c2")).toBe(false);
  });

  it("kings have flying quiet moves (multiple squares)", () => {
    const s = mkDamaState([["r3c3", [{ owner: "B", rank: "O" }]]], "B");
    const moves = genMovesForTest(s);

    // With no captures available, a king should be able to slide any distance diagonally.
    expect(moves).toEqual(
      expect.arrayContaining([
        { kind: "move", from: "r3c3", to: "r2c2" },
        { kind: "move", from: "r3c3", to: "r1c1" },
        { kind: "move", from: "r3c3", to: "r0c0" },
        { kind: "move", from: "r3c3", to: "r4c4" },
        { kind: "move", from: "r3c3", to: "r5c5" },
        { kind: "move", from: "r3c3", to: "r6c6" },
        { kind: "move", from: "r3c3", to: "r7c7" },
      ])
    );
    expect(moves.every((m) => m.kind === "move")).toBe(true);
  });

  it("enforces maximum-capture line (filters first steps)", () => {
    // From r2c2 (Black man), there are two captures available:
    // - r2c2 x r3c3 -> r4c4 then x r5c5 -> r6c6 (2 captures)
    // - r2c2 x r3c1 -> r4c0 (1 capture)
    // Only the first step of the 2-capture line should be selectable.
    const s = mkDamaState(
      [
        ["r2c2", [{ owner: "B", rank: "S" }]],
        ["r3c3", [{ owner: "W", rank: "S" }]],
        ["r5c5", [{ owner: "W", rank: "S" }]],
        ["r3c1", [{ owner: "W", rank: "S" }]],
      ],
      "B"
    );

    const moves = genMovesForTest(s);
    expect(moves).toEqual([{ kind: "capture", from: "r2c2", over: "r3c3", to: "r4c4" }]);
  });

  it("no mid-turn promotion: reaching back rank does not enable flying king captures", () => {
    // White man captures to row 0 (its promotion row under our orientation),
    // and would have a flying capture as a king, but should NOT as a man.
    const before = mkDamaState(
      [
        ["r2c2", [{ owner: "W", rank: "S" }]],
        ["r1c1", [{ owner: "B", rank: "S" }]],
        ["r3c3", [{ owner: "B", rank: "S" }]],
      ],
      "W"
    );

    const first = genMovesForTest(before);
    expect(first).toEqual(
      expect.arrayContaining([
        { kind: "capture", from: "r2c2", over: "r1c1", to: "r0c0" },
      ])
    );

    // Now lock continuation from the landing square.
    const cont = genMovesForTest(before, { forcedFrom: "r0c0", excludedJumpSquares: new Set(["r1c1"]) });
    // No further captures should be available for a man at r0c0 in this position.
    expect(cont.filter((m) => m.kind === "capture")).toEqual([]);
  });

  it("capture removal mode: immediate can see through; end_of_sequence blocks", () => {
    const mk = (owner: "B" | "W", rank: "S" | "O") => [{ owner, rank }];

    // Position (8x8): black king at r4c4, white men at r3c3 and r5c5.
    // If black captures r3c3 and lands at r1c1:
    // - immediate: r3c3 is removed, king can later capture r5c5.
    // - end_of_sequence: r3c3 remains and is excluded, so it blocks the diagonal and king cannot see r5c5.
    const baseBoard = new Map<string, any>(
      [
        ["r4c4", mk("B", "O")],
        ["r3c3", mk("W", "S")],
        ["r5c5", mk("W", "S")],
      ].map(([id, stack]) => [remap8x8Id(id), stack])
    );

    const first: any = { kind: "capture", from: "r4c4", over: "r3c3", to: "r1c1" };

    const sImmediate: any = {
      board: new Map(baseBoard),
      toMove: "B",
      phase: "idle",
      meta: { variantId: "dama_8_classic_standard", rulesetId: "dama", boardSize: 8, damaCaptureRemoval: "immediate" },
    };
    const afterImmediate = applyMove(sImmediate, toTestMove(first));
    expect(afterImmediate.board.has(remap8x8Id("r3c3"))).toBe(false);
    const nextCapsImmediate = genMovesForTest(afterImmediate as any, { forcedFrom: "r1c1" }).filter(
      (m: any) => m.kind === "capture"
    );
    expect(nextCapsImmediate.some((m: any) => m.over === "r5c5")).toBe(true);

    const sEnd: any = {
      board: new Map(baseBoard),
      toMove: "B",
      phase: "idle",
      meta: {
        variantId: "dama_8_international",
        rulesetId: "dama",
        boardSize: 8,
        damaCaptureRemoval: "end_of_sequence",
      },
    };
    const afterEnd = applyMove(sEnd, toTestMove(first));
    expect(afterEnd.board.has(remap8x8Id("r3c3"))).toBe(true);
    const nextCapsEnd = genMovesForTest(afterEnd as any, {
      forcedFrom: "r1c1",
      excludedJumpSquares: new Set(["r3c3"]),
    }).filter((m: any) => m.kind === "capture");
    expect(nextCapsEnd.some((m: any) => m.over === "r5c5")).toBe(false);
  });

  it("end_of_sequence: cannot jump the same captured piece twice", () => {
    // Simple recapture-back scenario:
    // Black man captures white at r3c3 from r2c2 to r4c4.
    // In end_of_sequence, r3c3 remains on the board visually, but it must not be capturable again.
    const before: any = mkDamaState(
      [
        ["r2c2", [{ owner: "B", rank: "S" }]],
        ["r3c3", [{ owner: "W", rank: "S" }]],
      ],
      "B"
    );
    before.meta = {
      variantId: "dama_8_classic_international",
      rulesetId: "dama",
      boardSize: 8,
      damaCaptureRemoval: "end_of_sequence",
    };

    const first: any = { kind: "capture", from: "r2c2", over: "r3c3", to: "r4c4" };
    const after = applyMove(before, toTestMove(first));
    expect(after.board.has(remap8x8Id("r3c3"))).toBe(true);

    const cont = genMovesForTest(after as any, {
      forcedFrom: "r4c4",
      excludedJumpSquares: new Set(["r3c3"]),
    }).filter((m: any) => m.kind === "capture");

    // The only geometric capture would be jumping back over r3c3 to r2c2, which is illegal.
    expect(cont.some((m: any) => m.over === "r3c3")).toBe(false);
  });
});
