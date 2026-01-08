import type { GameState } from "./state.ts";
import type { Player } from "../types.ts";
import { generateLegalMoves } from "./movegen.ts";

/**
 * Check if the current player (state.toMove) has lost the game.
 * Useful when loading a saved game to check if the player whose turn it is can actually play.
 * @param state - The current game state
 * @returns Object with winner and reason, or nulls if current player can still play
 */
export function checkCurrentPlayerLost(state: GameState): { winner: Player | null; reason: string | null } {
  if ((state as any).forcedGameOver?.winner && (state as any).forcedGameOver?.message) {
    return { winner: (state as any).forcedGameOver.winner, reason: (state as any).forcedGameOver.message };
  }

  const currentPlayer = state.toMove;
  const opponent: Player = currentPlayer === "B" ? "W" : "B";

  // Check if current player has no controlled stacks
  let currentPlayerHasStacks = false;
  for (const stack of state.board.values()) {
    if (stack.length > 0) {
      const top = stack[stack.length - 1];
      if (top.owner === currentPlayer) {
        currentPlayerHasStacks = true;
        break;
      }
    }
  }

  if (!currentPlayerHasStacks) {
    const winnerName = opponent === "B" ? "Black" : "White";
    const loserName = currentPlayer === "B" ? "Black" : "White";
    return {
      winner: opponent,
      reason: `${winnerName} wins — ${loserName} has no pieces`,
    };
  }

  // Check if current player has no legal moves
  const currentPlayerMoves = generateLegalMoves(state);
  if (currentPlayerMoves.length === 0) {
    const winnerName = opponent === "B" ? "Black" : "White";
    const loserName = currentPlayer === "B" ? "Black" : "White";
    return {
      winner: opponent,
      reason: `${winnerName} wins — ${loserName} has no moves`,
    };
  }

  // Current player can still play
  return { winner: null, reason: null };
}

/**
 * Check if the game is over and determine the winner.
 * @param state - The current game state (after a turn has been taken)
 * @returns Object with winner and reason, or nulls if game continues
 */
export function getWinner(state: GameState): { winner: Player | null; reason: string | null } {
  if ((state as any).forcedGameOver?.winner && (state as any).forcedGameOver?.message) {
    return { winner: (state as any).forcedGameOver.winner, reason: (state as any).forcedGameOver.message };
  }

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
  // Create a temporary state with opponent as the player to move
  const opponentState: GameState = {
    ...state,
    toMove: opponent,
  };
  const opponentLegalMoves = generateLegalMoves(opponentState);
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
