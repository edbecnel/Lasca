import { describe, it, expect, beforeEach } from "vitest";
import { HistoryManager } from "./historyManager";
import type { GameState } from "./state";

describe("HistoryManager", () => {
  let history: HistoryManager;
  let state1: GameState;
  let state2: GameState;
  let state3: GameState;

  beforeEach(() => {
    history = new HistoryManager();
    
    state1 = {
      board: new Map([["r3c3", [{ owner: "B", rank: "S" }]]]),
      toMove: "B",
      phase: "idle",
    };
    
    state2 = {
      board: new Map([["r4c4", [{ owner: "B", rank: "S" }]]]),
      toMove: "W",
      phase: "idle",
    };
    
    state3 = {
      board: new Map([["r5c5", [{ owner: "W", rank: "S" }]]]),
      toMove: "B",
      phase: "idle",
    };
  });

  it("should start with no history", () => {
    expect(history.size()).toBe(0);
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
    expect(history.getCurrent()).toBeNull();
  });

  it("should record states", () => {
    history.push(state1);
    expect(history.size()).toBe(1);
    expect(history.getCurrentIndex()).toBe(0);
    
    history.push(state2);
    expect(history.size()).toBe(2);
    expect(history.getCurrentIndex()).toBe(1);
  });

  it("should undo to previous state", () => {
    history.push(state1);
    history.push(state2);
    
    expect(history.canUndo()).toBe(true);
    const prev = history.undo();
    expect(prev).not.toBeNull();
    expect(prev!.board.get("r3c3")).toBeDefined();
    expect(history.getCurrentIndex()).toBe(0);
  });

  it("should redo to next state", () => {
    history.push(state1);
    history.push(state2);
    history.undo();
    
    expect(history.canRedo()).toBe(true);
    const next = history.redo();
    expect(next).not.toBeNull();
    expect(next!.toMove).toBe("W");
    expect(history.getCurrentIndex()).toBe(1);
  });

  it("should not undo past the beginning", () => {
    history.push(state1);
    history.undo();
    
    expect(history.canUndo()).toBe(false);
    expect(history.undo()).toBeNull();
  });

  it("should not redo past the end", () => {
    history.push(state1);
    history.push(state2);
    
    expect(history.canRedo()).toBe(false);
    expect(history.redo()).toBeNull();
  });

  it("should clear future history after new move", () => {
    history.push(state1);
    history.push(state2);
    history.push(state3);
    
    // Undo twice, then make a new move
    history.undo();
    history.undo();
    expect(history.size()).toBe(3);
    
    const newState: GameState = {
      board: new Map([["r2c2", [{ owner: "W", rank: "O" }]]]),
      toMove: "B",
      phase: "idle",
    };
    history.push(newState);
    
    // Should have only initial + new state
    expect(history.size()).toBe(2);
    expect(history.canRedo()).toBe(false);
  });

  it("should clone states to prevent mutations", () => {
    const original: GameState = {
      board: new Map([["r3c3", [{ owner: "B", rank: "S" }]]]),
      toMove: "B",
      phase: "idle",
    };
    
    history.push(original);
    
    // Mutate the original
    original.toMove = "W";
    original.board.get("r3c3")![0].rank = "O";
    
    // History should have the original values
    const stored = history.getCurrent();
    expect(stored!.toMove).toBe("B");
    expect(stored!.board.get("r3c3")![0].rank).toBe("S");
  });

  it("should provide history overview", () => {
    history.push(state1);
    history.push(state2);
    history.push(state3);
    
    const overview = history.getHistory();
    expect(overview.length).toBe(3);
    expect(overview[0].toMove).toBe("B");
    expect(overview[1].toMove).toBe("W");
    expect(overview[2].toMove).toBe("B");
    expect(overview[2].isCurrent).toBe(true);
    
    history.undo();
    const overview2 = history.getHistory();
    expect(overview2[1].isCurrent).toBe(true);
    expect(overview2[2].isCurrent).toBe(false);
  });

  it("should clear all history", () => {
    history.push(state1);
    history.push(state2);
    history.clear();
    
    expect(history.size()).toBe(0);
    expect(history.getCurrentIndex()).toBe(-1);
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
  });
});
