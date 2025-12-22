import { describe, it, expect } from "vitest";
import { generateLegalMoves } from "./movegen.ts";
import type { GameState } from "./state.ts";
import type { Stack } from "../types";

function mkState(boardEntries: Array<[string, Stack]>, toMove: "B" | "W" = "B"): GameState {
  return {
    board: new Map(boardEntries),
    toMove,
    phase: "idle",
  };
}

describe("movegen quiet moves", () => {
  it("black soldier moves forward diagonally into empty squares", () => {
    const s = mkState([
      ["r3c3", [{ owner: "B", rank: "S" }]],
      // destinations empty by omission
    ], "B");
    const moves = generateLegalMoves(s);
    expect(moves).toEqual(
      expect.arrayContaining([
        { from: "r3c3", to: "r4c2", kind: "move" },
        { from: "r3c3", to: "r4c4", kind: "move" },
      ])
    );
  });

  it("white soldier moves forward diagonally into empty squares", () => {
    const s = mkState([
      ["r3c3", [{ owner: "W", rank: "S" }]],
    ], "W");
    const moves = generateLegalMoves(s);
    expect(moves).toEqual(
      expect.arrayContaining([
        { from: "r3c3", to: "r2c2", kind: "move" },
        { from: "r3c3", to: "r2c4", kind: "move" },
      ])
    );
  });

  it("soldier captures over enemy (mandatory capture)", () => {
    const s = mkState([
      ["r3c3", [{ owner: "B", rank: "S" }]],
      ["r4c2", [{ owner: "W", rank: "S" }]],
      // r5c1 empty by omission; r4c4 also empty but quiet moves should be filtered
    ], "B");
    const moves = generateLegalMoves(s);
    // Must return only the capture, not quiet moves
    expect(moves).toEqual(
      expect.arrayContaining([
        { from: "r3c3", over: "r4c2", to: "r5c1", kind: "capture" },
      ])
    );
    expect(moves).not.toEqual(
      expect.arrayContaining([
        { from: "r3c3", to: "r4c4", kind: "move" },
      ])
    );
  });

  it("officer moves one step in any diagonal if empty", () => {
    const s = mkState([
      ["r3c3", [{ owner: "B", rank: "O" }]],
    ], "B");
    const moves = generateLegalMoves(s).map(m => m.to).sort();
    expect(moves).toEqual(["r2c2", "r2c4", "r4c2", "r4c4"].sort());
  });

  it("filters by toMove", () => {
    const s = mkState([
      ["r3c3", [{ owner: "B", rank: "S" }]],
      ["r2c2", [{ owner: "W", rank: "S" }]],
    ], "W");
    const moves = generateLegalMoves(s);
    // Only white moves should be returned
    expect(moves).toEqual(
      expect.arrayContaining([
        { from: "r2c2", to: "r1c1", kind: "move" },
        { from: "r2c2", to: "r1c3", kind: "move" },
      ])
    );
    // No black moves
    expect(moves).not.toEqual(
      expect.arrayContaining([
        { from: "r3c3", to: "r4c2", kind: "move" },
      ])
    );
  });
});
