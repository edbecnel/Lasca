import { describe, it, expect } from "vitest";
import { hashGameState } from "./hashState";
import type { GameState } from "./state";

describe("hashGameState", () => {
  it("should generate same hash for identical positions", () => {
    const state1: GameState = {
      board: new Map([
        ["r0c0", [{ owner: "W", rank: "S" }]],
        ["r1c1", [{ owner: "B", rank: "S" }]],
      ]),
      toMove: "W",
      phase: "idle",
    };

    const state2: GameState = {
      board: new Map([
        ["r0c0", [{ owner: "W", rank: "S" }]],
        ["r1c1", [{ owner: "B", rank: "S" }]],
      ]),
      toMove: "W",
      phase: "idle",
    };

    expect(hashGameState(state1)).toBe(hashGameState(state2));
  });

  it("should generate different hashes for different piece positions", () => {
    const state1: GameState = {
      board: new Map([
        ["r0c0", [{ owner: "W", rank: "S" }]],
        ["r1c1", [{ owner: "B", rank: "S" }]],
      ]),
      toMove: "W",
      phase: "idle",
    };

    const state2: GameState = {
      board: new Map([
        ["r0c0", [{ owner: "W", rank: "S" }]],
        ["r2c2", [{ owner: "B", rank: "S" }]], // Different position
      ]),
      toMove: "W",
      phase: "idle",
    };

    expect(hashGameState(state1)).not.toBe(hashGameState(state2));
  });

  it("should generate different hashes for different player to move", () => {
    const state1: GameState = {
      board: new Map([
        ["r0c0", [{ owner: "W", rank: "S" }]],
        ["r1c1", [{ owner: "B", rank: "S" }]],
      ]),
      toMove: "W",
      phase: "idle",
    };

    const state2: GameState = {
      board: new Map([
        ["r0c0", [{ owner: "W", rank: "S" }]],
        ["r1c1", [{ owner: "B", rank: "S" }]],
      ]),
      toMove: "B", // Different player
      phase: "idle",
    };

    expect(hashGameState(state1)).not.toBe(hashGameState(state2));
  });

  it("should generate different hashes for different stack contents", () => {
    const state1: GameState = {
      board: new Map([
        ["r0c0", [{ owner: "W", rank: "S" }]],
      ]),
      toMove: "W",
      phase: "idle",
    };

    const state2: GameState = {
      board: new Map([
        ["r0c0", [{ owner: "W", rank: "O" }]], // Officer instead of Soldier
      ]),
      toMove: "W",
      phase: "idle",
    };

    expect(hashGameState(state1)).not.toBe(hashGameState(state2));
  });

  it("should generate different hashes for different stack depths", () => {
    const state1: GameState = {
      board: new Map([
        ["r0c0", [{ owner: "W", rank: "S" }]],
      ]),
      toMove: "W",
      phase: "idle",
    };

    const state2: GameState = {
      board: new Map([
        ["r0c0", [{ owner: "B", rank: "S" }, { owner: "W", rank: "S" }]], // Stack with captured piece
      ]),
      toMove: "W",
      phase: "idle",
    };

    expect(hashGameState(state1)).not.toBe(hashGameState(state2));
  });

  it("should ignore phase in hash (only position matters)", () => {
    const state1: GameState = {
      board: new Map([
        ["r0c0", [{ owner: "W", rank: "S" }]],
      ]),
      toMove: "W",
      phase: "idle",
    };

    const state2: GameState = {
      board: new Map([
        ["r0c0", [{ owner: "W", rank: "S" }]],
      ]),
      toMove: "W",
      phase: "selecting", // Different phase
    };

    expect(hashGameState(state1)).toBe(hashGameState(state2));
  });

  it("should handle empty board", () => {
    const state: GameState = {
      board: new Map(),
      toMove: "W",
      phase: "idle",
    };

    const hash = hashGameState(state);
    expect(hash).toBe("toMove:W");
  });

  it("should generate consistent hashes regardless of board insertion order", () => {
    const state1: GameState = {
      board: new Map([
        ["r0c0", [{ owner: "W", rank: "S" }]],
        ["r1c1", [{ owner: "B", rank: "S" }]],
        ["r2c2", [{ owner: "W", rank: "O" }]],
      ]),
      toMove: "W",
      phase: "idle",
    };

    const state2: GameState = {
      board: new Map([
        ["r2c2", [{ owner: "W", rank: "O" }]],
        ["r0c0", [{ owner: "W", rank: "S" }]],
        ["r1c1", [{ owner: "B", rank: "S" }]],
      ]),
      toMove: "W",
      phase: "idle",
    };

    expect(hashGameState(state1)).toBe(hashGameState(state2));
  });
});
