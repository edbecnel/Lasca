import type { GameState } from "./state.ts";
import type { Move } from "./moveTypes.ts";
import { promoteIfNeeded } from "./promote.ts";

/**
 * Damasca uses Lasca-style stacking capture transfer with Dama-style movement.
 * - Quiet moves switch the turn and may promote (end-of-turn).
 * - Captures do NOT switch the turn (controller/AI handles multi-capture chains).
 * - Captures do NOT promote mid-chain; promotion is applied when the chain finalizes.
 */
export function applyMoveDamasca(
  state: GameState,
  move: Move
): GameState & { didPromote?: boolean } {
  if (move.kind === "capture") {
    const nextBoard = new Map(state.board);

    const moving = nextBoard.get(move.from);
    if (!moving || moving.length === 0) {
      throw new Error(`applyMoveDamasca: no moving stack at ${move.from}`);
    }

    const enemy = nextBoard.get(move.over);
    if (!enemy || enemy.length === 0) {
      throw new Error(`applyMoveDamasca: no enemy stack to capture at ${move.over}`);
    }

    const dest = nextBoard.get(move.to);
    if (dest && dest.length > 0) {
      throw new Error(`applyMoveDamasca: landing square ${move.to} is not empty`);
    }

    // Damasca stacking capture: capture only the top piece of the jumped stack
    // and insert it at the bottom of the capturing stack.
    const captured = enemy.pop()!;
    if (enemy.length === 0) nextBoard.delete(move.over);
    else nextBoard.set(move.over, enemy);

    nextBoard.set(move.to, moving);
    moving.unshift(captured);
    nextBoard.delete(move.from);

    // No promotion during capture chains.
    return { ...state, board: nextBoard, toMove: state.toMove, phase: "idle" };
  }

  // Quiet move
  const nextBoard = new Map(state.board);
  const fromStack = nextBoard.get(move.from);
  if (!fromStack || fromStack.length === 0) return state;

  const dest = nextBoard.get(move.to);
  if (dest && dest.length > 0) {
    throw new Error(`applyMoveDamasca: landing square ${move.to} is not empty`);
  }

  nextBoard.set(move.to, fromStack);
  nextBoard.delete(move.from);

  const tempState = { ...state, board: nextBoard };
  const didPromote = promoteIfNeeded(tempState, move.to);

  const nextToMove = state.toMove === "B" ? "W" : "B";
  return { ...state, board: nextBoard, toMove: nextToMove, phase: "idle", didPromote };
}
