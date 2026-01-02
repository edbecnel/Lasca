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

describe("GameController input lock preserves capture chain", () => {
  let mockSvg: SVGSVGElement;
  let mockPiecesLayer: SVGGElement;

  beforeEach(() => {
    mockSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
    mockPiecesLayer = document.createElementNS("http://www.w3.org/2000/svg", "g") as SVGGElement;

    (mockSvg as any).addEventListener = () => {};
    (mockSvg as any).querySelector = () => null;
  });

  it("does not clear jumpedSquares/lockedCaptureFrom when disabling input", () => {
    const history = new HistoryManager();
    const s: GameState = {
      board: new Map([
        ["r2c2", [{ owner: "B", rank: "S" }]],
        ["r3c3", [{ owner: "W", rank: "S" }]],
      ]),
      toMove: "B",
      phase: "idle",
      meta: {
        variantId: "dama_8_classic_international" as any,
        rulesetId: "dama" as any,
        boardSize: 8 as any,
        damaCaptureRemoval: "end_of_sequence" as any,
      },
    };
    history.push(s);

    const controller = new GameController(mockSvg, mockPiecesLayer, null, s, history);
    (controller as any).lockedCaptureFrom = "r4c4";
    (controller as any).jumpedSquares.add("r3c3");

    controller.setInputEnabled(false);

    const constraints = controller.getCaptureChainConstraints();
    expect(constraints.lockedCaptureFrom).toBe("r4c4");
    expect(constraints.jumpedSquares).toEqual(["r3c3"]);
  });

  it("Lasca: does not allow re-jumping the same square during a capture chain", () => {
    const history = new HistoryManager();
    const s: GameState = {
      // Position represents a post-capture continuation where the only possible
      // follow-up capture would be re-jumping the same square back.
      board: new Map([
        ["r5c3", [{ owner: "B", rank: "O" }]],
        ["r4c2", [{ owner: "W", rank: "S" }]],
      ]),
      toMove: "B",
      phase: "idle",
      meta: {
        variantId: "lasca_8_dama_board" as any,
        rulesetId: "lasca" as any,
        boardSize: 8 as any,
      },
    };
    history.push(s);

    const controller = new GameController(mockSvg, mockPiecesLayer, null, s, history);
    controller.setState(s);
    (controller as any).lockedCaptureFrom = "r5c3";
    (controller as any).jumpedSquares.add("r4c2");

    // Without anti-loop constraints, Lasca would allow: r5c3 x r4c2 -> r3c1.
    // With anti-loop, no further capture is legal.
    const legal = controller.getLegalMovesForTurn();
    expect(legal).toEqual([]);
  });
});
