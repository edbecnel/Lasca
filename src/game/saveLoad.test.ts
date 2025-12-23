import { describe, it, expect } from "vitest";
import { serializeGameState, deserializeGameState } from "./saveLoad";
import type { GameState } from "./state";

describe("saveLoad", () => {
  it("should serialize and deserialize a simple game state", () => {
    const state: GameState = {
      board: new Map([
        ["r3c3", [{ owner: "W", rank: "S" }]],
        ["r5c5", [{ owner: "B", rank: "O" }]],
      ]),
      toMove: "B",
      phase: "idle",
    };

    const serialized = serializeGameState(state);
    const deserialized = deserializeGameState(serialized);

    expect(deserialized.toMove).toBe("B");
    expect(deserialized.phase).toBe("idle");
    expect(deserialized.board.size).toBe(2);
    expect(deserialized.board.get("r3c3")).toEqual([{ owner: "W", rank: "S" }]);
    expect(deserialized.board.get("r5c5")).toEqual([{ owner: "B", rank: "O" }]);
  });

  it("should handle stacks with multiple pieces", () => {
    const state: GameState = {
      board: new Map([
        ["r4c4", [
          { owner: "B", rank: "S" },
          { owner: "W", rank: "S" },
          { owner: "B", rank: "O" },
        ]],
      ]),
      toMove: "W",
      phase: "select",
    };

    const serialized = serializeGameState(state);
    const deserialized = deserializeGameState(serialized);

    const stack = deserialized.board.get("r4c4");
    expect(stack).toBeDefined();
    expect(stack!.length).toBe(3);
    expect(stack![0]).toEqual({ owner: "B", rank: "S" });
    expect(stack![1]).toEqual({ owner: "W", rank: "S" });
    expect(stack![2]).toEqual({ owner: "B", rank: "O" });
  });

  it("should handle empty board", () => {
    const state: GameState = {
      board: new Map(),
      toMove: "W",
      phase: "idle",
    };

    const serialized = serializeGameState(state);
    const deserialized = deserializeGameState(serialized);

    expect(deserialized.board.size).toBe(0);
    expect(deserialized.toMove).toBe("W");
  });

  it("should preserve all piece properties", () => {
    const state: GameState = {
      board: new Map([
        ["r0c0", [{ owner: "B", rank: "O" }]],
        ["r6c6", [{ owner: "W", rank: "S" }]],
      ]),
      toMove: "B",
      phase: "anim",
    };

    const serialized = serializeGameState(state);
    
    // Verify serialized format is JSON-compatible
    const json = JSON.stringify(serialized);
    const parsed = JSON.parse(json);
    
    const deserialized = deserializeGameState(parsed);

    expect(deserialized.board.get("r0c0")).toEqual([{ owner: "B", rank: "O" }]);
    expect(deserialized.board.get("r6c6")).toEqual([{ owner: "W", rank: "S" }]);
    expect(deserialized.phase).toBe("anim");
  });
});
