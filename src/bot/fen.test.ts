import { describe, expect, test } from "vitest";
import { createInitialGameStateForVariant } from "../game/state.ts";
import { gameStateToFen, uciSquareToNodeId } from "./fen.ts";

describe("fen", () => {
  test("starting position FEN (classic chess)", () => {
    const s = createInitialGameStateForVariant("chess_classic");
    const fen = gameStateToFen(s, { halfmove: 0, fullmove: 1 });
    expect(fen).toBe(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    );
  });

  test("uciSquareToNodeId maps a1 -> r7c0", () => {
    expect(uciSquareToNodeId("a1")).toBe("r7c0");
    expect(uciSquareToNodeId("h8")).toBe("r0c7");
  });
});
