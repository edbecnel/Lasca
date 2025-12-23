import type { GameState } from "./state.ts";
import type { Player } from "../types.ts";
import { generateLegalMoves } from "./movegen.ts";

/**
 * Check if the game is over and determine the winner.
 * @param state - The current game state (after a turn has been taken)
 * @returns Object with winner and reason, or nulls if game continues
 */
export function getWinner(state: GameState): { winner: Player | null; reason: string | null } {
  const currentPlayer = state.toMove;
  const opponent: Player = currentPlayer === "B" ? "W" : "B";

  // Rule 1: Check if opponent has no controlled stacks
  // (no stacks whose TOP piece belongs to opponent)
  let opponentHasStacks = false;
  for (const stack of state.board.values()) {
    if (stack.length > 0) {
      const top = stack[stack.length - 1];
      if (top.owner === opponent) {
        opponentHasStacks = true;
        break;
      }
    }
  }

  if (!opponentHasStacks) {
    const winnerName = currentPlayer === "B" ? "Black" : "White";
    const opponentName = opponent === "B" ? "Black" : "White";
    return {
      winner: currentPlayer,
      reason: `${winnerName} wins — ${opponentName} has no pieces`,
    };
  }

  // Rule 2: Check if opponent has no legal moves
  const opponentLegalMoves = generateLegalMoves(state);
  if (opponentLegalMoves.length === 0) {
    const winnerName = currentPlayer === "B" ? "Black" : "White";
    const opponentName = opponent === "B" ? "Black" : "White";
    return {
      winner: currentPlayer,
      reason: `${winnerName} wins — ${opponentName} has no moves`,
    };
  }

  // Game continues
  return { winner: null, reason: null };
}
