import { describe, expect, it } from "vitest";
import type { GameState } from "../game/state.ts";
import { pickFallbackMoveChess } from "./chessFallback.ts";
import { createInitialGameStateForVariant } from "../game/state.ts";
import { applyMove } from "../game/applyMove.ts";
import { uciToLegalMove } from "./chessMoveMap.ts";

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
  it("uses opening book for the first move", () => {
    const s = createInitialGameStateForVariant("chess_classic" as any);
    const m = pickFallbackMoveChess(s, { tier: "beginner", seed: "book" });
    expect(m).toBeTruthy();
    const uci = `${(m as any).from}->${(m as any).to}`;
    // Should be one of: e2e4, d2d4, c2c4, g1f3
    expect([
      "r6c4->r4c4", // e2 -> e4
      "r6c3->r4c3", // d2 -> d4
      "r6c2->r4c2", // c2 -> c4
      "r7c6->r5c5", // g1 -> f3
    ]).toContain(uci);
  });

  it("responds sensibly after 1.e4", () => {
    let s = createInitialGameStateForVariant("chess_classic" as any);
    const e4 = uciToLegalMove(s, "e2e4");
    expect(e4).toBeTruthy();
    s = applyMove(s, e4!);
    const m = pickFallbackMoveChess(s, { tier: "beginner", seed: "book-e4" });
    expect(m).toBeTruthy();
    const uci = `${(m as any).from}->${(m as any).to}`;
    // One of: e7e5, c7c5, e7e6, c7c6
    expect([
      "r1c4->r3c4", // e7 -> e5
      "r1c2->r3c2", // c7 -> c5
      "r1c4->r2c4", // e7 -> e6
      "r1c2->r2c2", // c7 -> c6
    ]).toContain(uci);
  });

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
