import type { GameState } from "./state.ts";

/**
 * Reproduction position for debugging "queen can't capture bishop" reports.
 *
 * This sets up a classic pin:
 * - White king on e1
 * - Black rook on e8
 * - White queen on e2 is pinned to the king along the e-file
 * - Black bishop on h5 looks capturable by the queen (e2->h5),
 *   but that move would expose check from the rook, so it is illegal.
 */
export function createColumnsChessReproPinnedQueen(): GameState {
  return {
    board: new Map([
      // White
      ["r7c4", [{ owner: "W", rank: "K" }]], // e1
      ["r6c4", [{ owner: "W", rank: "Q" }]], // e2 (pinned)

      // Black
      ["r0c4", [{ owner: "B", rank: "R" }]], // e8 rook pinning the queen
      ["r3c7", [{ owner: "B", rank: "B" }]], // h5 bishop (appears capturable)
      ["r0c0", [{ owner: "B", rank: "K" }]], // a8 king (to make position well-formed)
    ]),
    toMove: "W",
    phase: "select",
    meta: { variantId: "columns_chess", rulesetId: "columns_chess", boardSize: 8 },
    chess: {
      castling: {
        W: { kingSide: false, queenSide: false },
        B: { kingSide: false, queenSide: false },
      },
    },
  };
}
