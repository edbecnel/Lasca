import { describe, it, expect, beforeEach } from "vitest";
import { GameController } from "./gameController";
import { HistoryManager } from "../game/historyManager";
import type { GameState } from "../game/state";

describe("GameController undo/redo after game over", () => {
  let mockSvg: SVGSVGElement;
  let mockPiecesLayer: SVGGElement;

  beforeEach(() => {
    mockSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
    mockPiecesLayer = document.createElementNS("http://www.w3.org/2000/svg", "g") as SVGGElement;

    // Minimal stubs used by existing controller tests.
    (mockSvg as any).addEventListener = () => {};
    (mockSvg as any).querySelector = () => null;
  });

  it("allows undoing out of a terminal position", () => {
    const history = new HistoryManager();

    const nonTerminal: GameState = {
      board: new Map([
        ["r1c1", [{ owner: "W", rank: "O" }]],
        ["r2c2", [{ owner: "B", rank: "O" }]],
      ]),
      toMove: "W",
      phase: "idle",
    };

    // Terminal because White to move has no pieces.
    const terminal: GameState = {
      board: new Map([["r2c2", [{ owner: "B", rank: "O" }]]]),
      toMove: "W",
      phase: "idle",
    };

    history.push(nonTerminal);
    history.push(terminal);

    const controller = new GameController(mockSvg, mockPiecesLayer, null, terminal, history);
    controller.setState(terminal);

    expect(controller.isOver()).toBe(true);

    controller.undo();

    expect(controller.isOver()).toBe(false);
    expect(controller.getState().board.has("r1c1")).toBe(true);
    expect(controller.getState().toMove).toBe("W");
  });

  it("allows redoing back into a terminal position", () => {
    const history = new HistoryManager();

    const nonTerminal: GameState = {
      board: new Map([
        ["r1c1", [{ owner: "W", rank: "O" }]],
        ["r2c2", [{ owner: "B", rank: "O" }]],
      ]),
      toMove: "W",
      phase: "idle",
    };

    const terminal: GameState = {
      board: new Map([["r2c2", [{ owner: "B", rank: "O" }]]]),
      toMove: "W",
      phase: "idle",
    };

    history.push(nonTerminal);
    history.push(terminal);

    const controller = new GameController(mockSvg, mockPiecesLayer, null, terminal, history);
    controller.setState(terminal);

    controller.undo();
    expect(controller.isOver()).toBe(false);

    controller.redo();
    expect(controller.isOver()).toBe(true);
    expect(controller.getState().board.has("r1c1")).toBe(false);
  });
});
