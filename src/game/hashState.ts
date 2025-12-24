import type { GameState } from "./state.ts";

/**
 * Create a hash string representing the game state for repetition detection.
 * Two states with the same hash are considered identical positions.
 */
export function hashGameState(state: GameState): string {
  // Sort node IDs for consistent ordering
  const nodeIds = Array.from(state.board.keys()).sort();
  
  const parts: string[] = [];
  
  // Add each node and its stack contents
  for (const nodeId of nodeIds) {
    const stack = state.board.get(nodeId);
    if (!stack || stack.length === 0) continue;
    
    parts.push(nodeId);
    for (const piece of stack) {
      parts.push(piece.owner + piece.rank);
    }
  }
  
  // Include whose turn it is (same position with different player to move is different)
  parts.push(`toMove:${state.toMove}`);
  
  return parts.join("|");
}
