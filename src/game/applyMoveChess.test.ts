import { describe, it, expect } from "vitest";
import { applyMoveChess } from "./applyMoveChess";
import type { GameState } from "./state";
import type { Move } from "./moveTypes";

describe("applyMoveChess", () => {
  it("promotes on last rank without mutating input state", () => {
    const before: GameState = {
      board: new Map([
        ["r6c3", [{ owner: "B", rank: "P" }]], // black pawn on D2
      ]),
      toMove: "B",
      phase: "idle",
      meta: { variantId: "chess_classic", rulesetId: "chess", boardSize: 8 },
      chess: {
        castling: {
          W: { kingSide: false, queenSide: false },
          B: { kingSide: false, queenSide: false },
        },
      },
    };

    const move: Move = { kind: "move", from: "r6c3", to: "r7c3" };

    const after = applyMoveChess(before, move);

    // Input state must not be mutated by applyMoveChess.
    expect(before.board.get("r6c3")?.[0].rank).toBe("P");

    // Output should be promoted.
    expect(after.board.get("r7c3")?.[0].rank).toBe("Q");
    expect(after.didPromote).toBe(true);
  });
});
