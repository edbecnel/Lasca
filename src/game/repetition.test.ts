import { describe, it, expect } from "vitest";
import type { GameState } from "./state.ts";
import { wouldCreateThreefoldRepetition, wouldRepeatPreviousPosition } from "./repetition.ts";

function mkState(args: { toMove: "W" | "B"; a: string; b: string }): GameState {
  return {
    board: new Map([
      ["r0c0", [{ owner: "W", rank: args.a as any }]],
      ["r7c7", [{ owner: "B", rank: args.b as any }]],
    ]),
    toMove: args.toMove,
    phase: "idle",
    meta: { variantId: "columns_chess" as any, rulesetId: "columns_chess" as any, boardSize: 8 },
    chess: {
      castling: {
        W: { kingSide: true, queenSide: true },
        B: { kingSide: true, queenSide: true },
      },
    },
  };
}

describe("threefold repetition prohibition helper", () => {
  it("flags a move that would create a 3rd occurrence", () => {
    const posA = mkState({ toMove: "W", a: "K", b: "K" });
    const posB = mkState({ toMove: "B", a: "K", b: "K" });

    // History: A, B, A (current at A)
    const history = { states: [posA, posB, posA], currentIndex: 2 };

    // Next move would return to A again -> would be the 3rd occurrence.
    expect(wouldCreateThreefoldRepetition({ history, nextState: posA })).toBe(true);
  });

  it("does not flag when the position occurred fewer than 2 times", () => {
    const posA = mkState({ toMove: "W", a: "K", b: "K" });
    const posB = mkState({ toMove: "B", a: "K", b: "K" });

    // History: A, B (current at B)
    const history = { states: [posA, posB], currentIndex: 1 };

    // Returning to A would be only the 2nd occurrence.
    expect(wouldCreateThreefoldRepetition({ history, nextState: posA })).toBe(false);
  });
});

describe("immediate repetition (ko) prohibition helper", () => {
  it("flags a move that would recreate the previous position", () => {
    const posA = mkState({ toMove: "W", a: "K", b: "K" });
    const posB = mkState({ toMove: "B", a: "K", b: "K" });

    // History: A, B (current at B). Next move returning to A should be prohibited.
    const history = { states: [posA, posB], notation: ["", "a1 × b2"], currentIndex: 1 };
    expect(wouldRepeatPreviousPosition({ history, nextState: posA })).toBe(true);
  });

  it("does not flag when the previous move was not a capture (ko cleared)", () => {
    const posA = mkState({ toMove: "W", a: "K", b: "K" });
    const posB = mkState({ toMove: "B", a: "K", b: "K" });

    // Same state pattern as above, but last move was quiet.
    const history = { states: [posA, posB], notation: ["", "a1 → b2"], currentIndex: 1 };
    expect(wouldRepeatPreviousPosition({ history, nextState: posA })).toBe(false);
  });

  it("does not flag when there is no previous position", () => {
    const posA = mkState({ toMove: "W", a: "K", b: "K" });
    const history = { states: [posA], notation: [""], currentIndex: 0 };
    expect(wouldRepeatPreviousPosition({ history, nextState: posA })).toBe(false);
  });
});
