import type { GameState } from "./state.ts";
import type { Move } from "./moveTypes.ts";
import { promoteIfNeeded } from "./promote.ts";

export function applyMoveLasca(
  state: GameState,
  move: Move
): GameState & { didPromote?: boolean } {
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

    nextBoard.set(move.to, moving);
    moving.unshift(captured);
    nextBoard.delete(move.from);

    const tempState = { ...state, board: nextBoard };
    const didPromote = promoteIfNeeded(tempState, move.to);

    return { ...state, board: nextBoard, toMove: state.toMove, phase: "idle", didPromote };
  }

  const nextBoard = new Map(state.board);
  const fromStack = nextBoard.get(move.from);
  if (!fromStack || fromStack.length === 0) return state;

  nextBoard.set(move.to, fromStack);
  nextBoard.delete(move.from);

  const tempState = { ...state, board: nextBoard };
  const didPromote = promoteIfNeeded(tempState, move.to);

  const nextToMove = state.toMove === "B" ? "W" : "B";
  return { ...state, board: nextBoard, toMove: nextToMove, phase: "idle", didPromote };
}
