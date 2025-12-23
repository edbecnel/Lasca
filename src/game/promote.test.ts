import { describe, it, expect } from "vitest";
import { promoteIfNeeded } from "./promote";
import type { GameState } from "./state";

describe("promoteIfNeeded", () => {
  it("should promote Black soldier at row 6 to Officer", () => {
    const state: GameState = {
      board: new Map([
        ["r6c0", [{ owner: "B", rank: "S" }]],
      ]),
      toMove: "B",
      phase: "idle",
    };

    const didPromote = promoteIfNeeded(state, "r6c0");
    expect(didPromote).toBe(true);
    
    const stack = state.board.get("r6c0");
    expect(stack).toBeDefined();
    expect(stack![0].rank).toBe("O");
  });

  it("should promote White soldier at row 0 to Officer", () => {
    const state: GameState = {
      board: new Map([
        ["r0c2", [{ owner: "W", rank: "S" }]],
      ]),
      toMove: "W",
      phase: "idle",
    };

    const didPromote = promoteIfNeeded(state, "r0c2");
    expect(didPromote).toBe(true);
    
    const stack = state.board.get("r0c2");
    expect(stack).toBeDefined();
    expect(stack![0].rank).toBe("O");
  });

  it("should not promote Black soldier before reaching row 6", () => {
    const state: GameState = {
      board: new Map([
        ["r5c1", [{ owner: "B", rank: "S" }]],
      ]),
      toMove: "B",
      phase: "idle",
    };

    const didPromote = promoteIfNeeded(state, "r5c1");
    expect(didPromote).toBe(false);
    
    const stack = state.board.get("r5c1");
    expect(stack).toBeDefined();
    expect(stack![0].rank).toBe("S");
  });

  it("should not promote White soldier before reaching row 0", () => {
    const state: GameState = {
      board: new Map([
        ["r1c1", [{ owner: "W", rank: "S" }]],
      ]),
      toMove: "W",
      phase: "idle",
    };

    const didPromote = promoteIfNeeded(state, "r1c1");
    expect(didPromote).toBe(false);
    
    const stack = state.board.get("r1c1");
    expect(stack).toBeDefined();
    expect(stack![0].rank).toBe("S");
  });

  it("should not promote an Officer", () => {
    const state: GameState = {
      board: new Map([
        ["r6c0", [{ owner: "B", rank: "O" }]],
      ]),
      toMove: "B",
      phase: "idle",
    };

    const didPromote = promoteIfNeeded(state, "r6c0");
    expect(didPromote).toBe(false);
  });

  it("should not promote when no stack exists at node", () => {
    const state: GameState = {
      board: new Map(),
      toMove: "B",
      phase: "idle",
    };

    const didPromote = promoteIfNeeded(state, "r6c0");
    expect(didPromote).toBe(false);
  });

  it("should promote top piece of a stack", () => {
    const state: GameState = {
      board: new Map([
        ["r6c0", [
          { owner: "W", rank: "S" }, // bottom (captured)
          { owner: "B", rank: "S" }, // top
        ]],
      ]),
      toMove: "B",
      phase: "idle",
    };

    const didPromote = promoteIfNeeded(state, "r6c0");
    expect(didPromote).toBe(true);
    
    const stack = state.board.get("r6c0");
    expect(stack).toBeDefined();
    expect(stack![0].rank).toBe("S"); // bottom unchanged
    expect(stack![1].rank).toBe("O"); // top promoted
  });
});
