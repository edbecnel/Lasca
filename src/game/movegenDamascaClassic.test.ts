import { describe, it, expect } from "vitest";
import { generateLegalMoves } from "./movegen.ts";
import type { GameState } from "./state.ts";
import type { Stack } from "../types";

function mkDamascaClassicState(
  boardEntries: Array<[string, Stack]>,
  toMove: "B" | "W" = "B"
): GameState {
  return {
    board: new Map(boardEntries),
    toMove,
    phase: "idle",
    meta: {
      variantId: "damasca_8_classic",
      rulesetId: "damasca_classic",
      boardSize: 8,
    },
  };
}

describe("movegen Damasca Classic", () => {
  it("officers have non-flying quiet moves (one square)", () => {
    const s = mkDamascaClassicState([["r3c3", [{ owner: "B", rank: "O" }]]], "B");
    const moves = generateLegalMoves(s);

    expect(moves.every((m) => m.kind === "move")).toBe(true);
    expect(moves).toEqual(
      expect.arrayContaining([
        { kind: "move", from: "r3c3", to: "r2c2" },
        { kind: "move", from: "r3c3", to: "r2c4" },
        { kind: "move", from: "r3c3", to: "r4c2" },
        { kind: "move", from: "r3c3", to: "r4c4" },
      ])
    );

    // Ensure it does NOT include flying destinations.
    expect(moves).not.toEqual(expect.arrayContaining([{ kind: "move", from: "r3c3", to: "r1c1" }]));
  });

  it("officers have non-flying captures (single landing square)", () => {
    const s = mkDamascaClassicState(
      [
        ["r3c3", [{ owner: "B", rank: "O" }]],
        ["r4c4", [{ owner: "W", rank: "S" }]],
      ],
      "B"
    );

    const moves = generateLegalMoves(s);
    expect(moves.every((m) => m.kind === "capture")).toBe(true);
    expect(moves).toEqual(
      expect.arrayContaining([{ kind: "capture", from: "r3c3", over: "r4c4", to: "r5c5" }])
    );
    // No flying landings beyond.
    expect(moves).not.toEqual(
      expect.arrayContaining([
        { kind: "capture", from: "r3c3", over: "r4c4", to: "r6c6" },
        { kind: "capture", from: "r3c3", over: "r4c4", to: "r7c7" },
      ])
    );
  });

  it("officers still may not reverse 180° in multi-capture", () => {
    const s = mkDamascaClassicState(
      [
        ["r3c3", [{ owner: "B", rank: "O" }]],
        ["r4c4", [{ owner: "W", rank: "S" }]],
        ["r2c2", [{ owner: "W", rank: "S" }]],
      ],
      "B"
    );

    const moves = generateLegalMoves(s, {
      forcedFrom: "r3c3",
      excludedJumpSquares: new Set(),
      lastCaptureDir: { dr: 1, dc: 1 },
    }).filter((m) => m.kind === "capture");

    expect(moves.some((m: any) => m.over === "r4c4")).toBe(true);
    expect(moves.some((m: any) => m.over === "r2c2")).toBe(false);
  });
});
