import { describe, it, expect } from "vitest";
import { generateLegalMoves } from "./movegen.ts";
import type { GameState } from "./state.ts";
import type { Stack } from "../types";

function mkHybridState(
  boardEntries: Array<[string, Stack]>,
  toMove: "B" | "W" = "B"
): GameState {
  return {
    board: new Map(boardEntries),
    toMove,
    phase: "idle",
    meta: {
      variantId: "hybrid_8_damasca",
      rulesetId: "hybrid",
      boardSize: 8,
    },
  };
}

describe("movegen Hybrid (Phase 2)", () => {
  it("mandatory capture: if any capture exists, only captures are returned", () => {
    const s = mkHybridState(
      [
        ["r2c2", [{ owner: "B", rank: "S" }]],
        ["r3c3", [{ owner: "W", rank: "S" }]],
        // Another black piece that would have a quiet move
        ["r5c5", [{ owner: "B", rank: "S" }]],
      ],
      "B"
    );

    const moves = generateLegalMoves(s);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((m) => m.kind === "capture")).toBe(true);
  });

  it("soldiers can capture backwards", () => {
    const s = mkHybridState(
      [
        ["r3c3", [{ owner: "B", rank: "S" }]],
        ["r2c2", [{ owner: "W", rank: "S" }]],
      ],
      "B"
    );

    const moves = generateLegalMoves(s);
    expect(moves).toEqual(
      expect.arrayContaining([
        { kind: "capture", from: "r3c3", over: "r2c2", to: "r1c1" },
      ])
    );
  });

  it("officers have flying quiet moves", () => {
    const s = mkHybridState([["r3c3", [{ owner: "B", rank: "O" }]]], "B");
    const moves = generateLegalMoves(s);

    expect(moves.every((m) => m.kind === "move")).toBe(true);
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
  });

  it("officers have flying captures (multiple landing squares)", () => {
    const s = mkHybridState(
      [
        ["r3c3", [{ owner: "B", rank: "O" }]],
        ["r4c4", [{ owner: "W", rank: "S" }]],
      ],
      "B"
    );

    const moves = generateLegalMoves(s);
    expect(moves.every((m) => m.kind === "capture")).toBe(true);
    expect(moves).toEqual(
      expect.arrayContaining([
        { kind: "capture", from: "r3c3", over: "r4c4", to: "r5c5" },
        { kind: "capture", from: "r3c3", over: "r4c4", to: "r6c6" },
        { kind: "capture", from: "r3c3", over: "r4c4", to: "r7c7" },
      ])
    );
  });

  it("enforces maximum-capture line (filters first steps)", () => {
    // Same structure as Dama test, but with hybrid ruleset.
    const s = mkHybridState(
      [
        ["r2c2", [{ owner: "B", rank: "S" }]],
        ["r3c3", [{ owner: "W", rank: "S" }]],
        ["r5c5", [{ owner: "W", rank: "S" }]],
        ["r3c1", [{ owner: "W", rank: "S" }]],
      ],
      "B"
    );

    const moves = generateLegalMoves(s);
    expect(moves).toEqual([{ kind: "capture", from: "r2c2", over: "r3c3", to: "r4c4" }]);
  });

  it("excludedJumpSquares prevents re-jumping a previously jumped square", () => {
    // Geometry would allow a recapture-back over the same square; it must be excluded.
    const afterFirst = mkHybridState(
      [
        ["r4c4", [{ owner: "B", rank: "S" }]],
        ["r3c3", [{ owner: "W", rank: "S" }]],
      ],
      "B"
    );

    const cont = generateLegalMoves(afterFirst, {
      forcedFrom: "r4c4",
      excludedJumpSquares: new Set(["r3c3"]),
    }).filter((m) => m.kind === "capture");

    expect(cont.some((m) => (m as any).over === "r3c3")).toBe(false);
  });
});
