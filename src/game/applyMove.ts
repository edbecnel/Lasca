import type { GameState } from "./state.ts";
import type { Move } from "./moveTypes.ts";

export function applyMove(state: GameState, move: Move): GameState {
  if (move.kind === "capture") {
    const nextBoard = new Map(state.board);

    const moving = nextBoard.get(move.from);
    if (!moving || moving.length === 0) {
      throw new Error(`applyMove: no moving stack at ${move.from}`);
    }

    const enemy = nextBoard.get(move.over);
    if (!enemy || enemy.length === 0) {
      throw new Error(`applyMove: no enemy stack to capture at ${move.over}`);
    }

    const dest = nextBoard.get(move.to);
    if (dest && dest.length > 0) {
      throw new Error(`applyMove: landing square ${move.to} is not empty`);
    }

    const captured = enemy.pop()!;
    if (enemy.length === 0) nextBoard.delete(move.over);
    else nextBoard.set(move.over, enemy);

    // Move full moving stack to landing square
    nextBoard.set(move.to, moving);
    // Place captured piece at the bottom of the moving stack
    moving.unshift(captured);
    // Clear origin square
    nextBoard.delete(move.from);

    const nextToMove = state.toMove === "B" ? "W" : "B";
    return { board: nextBoard, toMove: nextToMove, phase: "idle" };
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
