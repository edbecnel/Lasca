import type { GameState } from "./state.ts";
import { parseNodeId } from "./coords.ts";

/**
 * Check if a piece at the given node should be promoted to Officer,
 * and if so, promote it in place.
 * @param state - The current game state
 * @param nodeId - The node ID to check for promotion
 * @returns true if promotion occurred, false otherwise
 */
export function promoteIfNeeded(state: GameState, nodeId: string): boolean {
  const stack = state.board.get(nodeId);
  if (!stack || stack.length === 0) return false;

  const top = stack[stack.length - 1];
  
  // Only Soldiers can be promoted
  if (top.rank !== "S") return false;

  const { r } = parseNodeId(nodeId);

  const boardSize = state.meta?.boardSize ?? 7;
  const lastRow = boardSize - 1;

  // Black promotes at the bottom row; White promotes at the top row.
  let shouldPromote = false;
  if (top.owner === "B" && r === lastRow) {
    shouldPromote = true;
  } else if (top.owner === "W" && r === 0) {
    shouldPromote = true;
  }

  if (shouldPromote) {
    // Promote the top piece to Officer
    top.rank = "O";
    return true;
  }

  return false;
}

/**
 * Promote the top piece at the given node if it is a Soldier owned by the side to move.
 * Used for rulesets where promotion can be "earned" earlier in a capture sequence.
 */
export function promoteTopSoldierIfOwnedByToMove(state: GameState, nodeId: string): boolean {
  const stack = state.board.get(nodeId);
  if (!stack || stack.length === 0) return false;

  const top = stack[stack.length - 1];
  if (top.owner !== state.toMove) return false;
  if (top.rank !== "S") return false;

  top.rank = "O";
  return true;
}
