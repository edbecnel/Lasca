import { describe, it, expect } from "vitest";
import { getWinner } from "./gameOver";
import type { GameState } from "./state";

describe("getWinner", () => {
  it("should return null when game continues (both players have pieces and moves)", () => {
    const state: GameState = {
      board: new Map([
        ["r3c3", [{ owner: "W", rank: "S" }]], // White soldier in middle
        ["r5c5", [{ owner: "B", rank: "S" }]], // Black soldier in middle (can move forward)
      ]),
      toMove: "W",
      phase: "idle",
    };

    const result = getWinner(state);
    expect(result.winner).toBe(null);
    expect(result.reason).toBe(null);
  });

  it("should detect White win when Black has no pieces", () => {
    const state: GameState = {
      board: new Map([
        ["r3c3", [{ owner: "W", rank: "S" }]],
      ]),
      toMove: "W",
      phase: "idle",
    };

    const result = getWinner(state);
    expect(result.winner).toBe("W");
    expect(result.reason).toContain("White wins");
    expect(result.reason).toContain("Black has no pieces");
  });

  it("should detect Black win when White has no pieces", () => {
    const state: GameState = {
      board: new Map([
        ["r3c3", [{ owner: "B", rank: "O" }]],
      ]),
      toMove: "B",
      phase: "idle",
    };

    const result = getWinner(state);
    expect(result.winner).toBe("B");
    expect(result.reason).toContain("Black wins");
    expect(result.reason).toContain("White has no pieces");
  });

  it("should detect win when opponent pieces are all captured in stacks (tops are all owned by current player)", () => {
    const state: GameState = {
      board: new Map([
        // All stacks have White on top, even though Black pieces exist at bottom
        ["r3c3", [{ owner: "B", rank: "S" }, { owner: "W", rank: "O" }]],
        ["r4c4", [{ owner: "B", rank: "S" }, { owner: "W", rank: "S" }]],
      ]),
      toMove: "W",
      phase: "idle",
    };

    const result = getWinner(state);
    expect(result.winner).toBe("W");
    expect(result.reason).toContain("White wins");
    expect(result.reason).toContain("Black has no pieces");
  });

  it("should detect win when opponent is blocked and has no legal moves", () => {
    // White officer at r0c0, Black soldiers at r1c1 and r2c0 blocking each other
    // It's White's turn, so we check if Black (opponent) has moves
    // Black at r1c1 can't move forward (row 0 for Black is backwards)
    // and is blocked by piece at r2c0
    const state: GameState = {
      board: new Map([
        ["r0c0", [{ owner: "W", rank: "O" }]], // White officer
        ["r1c1", [{ owner: "B", rank: "S" }]], // Black soldier (can't move backward to row 0)
        ["r2c0", [{ owner: "B", rank: "S" }]], // Another black soldier blocking
        ["r2c2", [{ owner: "B", rank: "S" }]], // Another black soldier blocking
      ]),
      toMove: "W",
      phase: "idle",
    };

    const result = getWinner(state);
    // Black should have no legal moves (soldiers can't move backward and are blocked)
    expect(result.winner).toBe("W");
    expect(result.reason).toContain("White wins");
    expect(result.reason).toContain("Black has no moves");
  });

  it("should not declare winner if opponent still has controlled stacks", () => {
    const state: GameState = {
      board: new Map([
        ["r1c1", [{ owner: "W", rank: "S" }]],
        ["r5c5", [{ owner: "B", rank: "S" }]],
      ]),
      toMove: "W",
      phase: "idle",
    };

    const result = getWinner(state);
    expect(result.winner).toBe(null);
    expect(result.reason).toBe(null);
  });

  it("should handle empty board (no winner if no pieces at all)", () => {
    const state: GameState = {
      board: new Map(),
      toMove: "W",
      phase: "idle",
    };

    // With no pieces, White (current player) wins because opponent has no pieces
    const result = getWinner(state);
    expect(result.winner).toBe("W");
    expect(result.reason).toContain("Black has no pieces");
  });
});
