import { describe, expect, it } from "vitest";
import type { GameState } from "./state.ts";
import { endTurn } from "./endTurn.ts";

function makeState(board: GameState["board"], toMove: "W" | "B" = "W"): GameState {
  return {
    board,
    toMove,
    phase: "idle",
    meta: { variantId: "damasca" as any, rulesetId: "damasca", boardSize: 7 },
  };
}

describe("Damasca lone king timeout", () => {
  it("forces game over after 10 moves when lone king not captured", () => {
    const board = new Map<string, any>();
    // White has exactly one piece and it is a king.
    board.set("r0c0", [{ owner: "W", rank: "O" }]);

    // Black has at least one king and at least one other piece.
    board.set("r6c6", [{ owner: "B", rank: "O" }]);
    board.set("r4c4", [{ owner: "B", rank: "S" }]);

    let state = makeState(board, "W");

    for (let i = 0; i < 9; i++) {
      state = endTurn(state);
      expect((state as any).forcedGameOver).toBeUndefined();
    }

    state = endTurn(state);
    expect((state as any).forcedGameOver?.reasonCode).toBe("DAMASCA_LONE_KING_TIMEOUT");
    expect((state as any).forcedGameOver?.winner).toBe("B");
    expect(String((state as any).forcedGameOver?.message ?? "").toLowerCase()).toContain("lone king");
  });

  it("does not activate when both sides are lone kings", () => {
    const board = new Map<string, any>();
    board.set("r0c0", [{ owner: "W", rank: "O" }]);
    board.set("r6c6", [{ owner: "B", rank: "O" }]);

    let state = makeState(board, "W");
    for (let i = 0; i < 20; i++) state = endTurn(state);

    expect((state as any).damascaLoneKingVsKings).toBeUndefined();
    expect((state as any).forcedGameOver).toBeUndefined();
  });
});
