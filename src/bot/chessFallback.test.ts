import { describe, expect, it } from "vitest";
import type { GameState } from "../game/state.ts";
import { pickFallbackMoveChess } from "./chessFallback.ts";

function mkEmptyChessState(toMove: "W" | "B"): GameState {
  return {
    board: new Map(),
    toMove,
    phase: "select",
    meta: {
      variantId: "chess_classic" as any,
      rulesetId: "chess",
      boardSize: 8,
    },
    chess: {
      castling: {
        W: { kingSide: false, queenSide: false },
        B: { kingSide: false, queenSide: false },
      },
    },
  };
}

describe("chess fallback", () => {
  it("prefers winning a queen when available", () => {
    const s = mkEmptyChessState("W");

    // Kings are required for legal-move generation.
    s.board.set("r7c4", [{ owner: "W", rank: "K" }]);
    s.board.set("r0c4", [{ owner: "B", rank: "K" }]);

    // White rook can capture black queen.
    s.board.set("r7c0", [{ owner: "W", rank: "R" }]);
    s.board.set("r0c0", [{ owner: "B", rank: "Q" }]);

    const m = pickFallbackMoveChess(s, { tier: "beginner", seed: "t" });
    expect(m).toBeTruthy();
    expect((m as any).from).toBe("r7c0");
    expect((m as any).to).toBe("r0c0");
    expect(m!.kind).toBe("capture");
  });

  it("avoids hanging the queen for a pawn", () => {
    const s = mkEmptyChessState("W");

    // Kings are required for legal-move generation.
    s.board.set("r7c4", [{ owner: "W", rank: "K" }]);
    s.board.set("r0c4", [{ owner: "B", rank: "K" }]);

    // Trap: Qxd2?? (here: Q takes pawn on the same file) loses immediately to Rxd2.
    // White queen is on r7c3, black rook on r0c3, black pawn on r6c3.
    s.board.set("r7c3", [{ owner: "W", rank: "Q" }]);
    s.board.set("r0c3", [{ owner: "B", rank: "R" }]);
    s.board.set("r6c3", [{ owner: "B", rank: "P" }]);

    const m = pickFallbackMoveChess(s, { tier: "beginner", seed: "avoid-hang" });
    expect(m).toBeTruthy();
    // The blunder would be capturing the pawn with the queen.
    expect((m as any).from === "r7c3" && (m as any).to === "r6c3" && m!.kind === "capture").toBe(false);
  });
});
