import type { GameState } from "./state.ts";
import type { Move } from "./moveTypes.ts";

export function applyMove(state: GameState, move: Move): GameState {
  if (move.kind !== "move") {
    // Only quiet moves are supported in PR 5
    return state;
  }

  const nextBoard = new Map(state.board);
  const fromStack = nextBoard.get(move.from);
  // If there's no stack to move, return unchanged
  if (!fromStack || fromStack.length === 0) return state;

  // Destination should be empty for quiet moves; overwrite just in case
  nextBoard.set(move.to, fromStack);
  nextBoard.delete(move.from);

  const nextToMove = state.toMove === "B" ? "W" : "B";
  return { board: nextBoard, toMove: nextToMove, phase: "idle" };
}
