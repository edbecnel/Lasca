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

  // Include chess-like auxiliary state when present.
  const chess = (state as any).chess as GameState["chess"] | undefined;
  if (chess) {
    const cw = chess.castling?.W;
    const cb = chess.castling?.B;
    parts.push(`castleW:${cw?.kingSide ? 1 : 0}${cw?.queenSide ? 1 : 0}`);
    parts.push(`castleB:${cb?.kingSide ? 1 : 0}${cb?.queenSide ? 1 : 0}`);
    if (chess.enPassantTarget) parts.push(`epT:${chess.enPassantTarget}`);
    if (chess.enPassantPawn) parts.push(`epP:${chess.enPassantPawn}`);
  }
  
  return parts.join("|");
}
