import type { GameState } from "./state.ts";
import type { Move } from "./moveTypes.ts";
import { promoteIfNeeded } from "./promote.ts";
import { getDamaCaptureRemovalMode } from "./damaCaptureChain.ts";

/**
 * Dama does not use Lasca columns/stacks.
 * Captured pieces are removed from the board (not stacked under the mover).
 */
export function applyMoveDama(
  state: GameState,
  move: Move
): GameState & { didPromote?: boolean } {
  const nextBoard = new Map(state.board);
  const captureRemoval = getDamaCaptureRemovalMode(state);

  if (move.kind === "capture") {
    const moving = nextBoard.get(move.from);
    if (!moving || moving.length === 0) {
      throw new Error(`applyMoveDama: no moving piece at ${move.from}`);
    }
    if (moving.length !== 1) {
      throw new Error(`applyMoveDama: stacks/columns are not allowed in Dama (from=${move.from})`);
    }

    const enemy = nextBoard.get(move.over);
    if (!enemy || enemy.length === 0) {
      throw new Error(`applyMoveDama: no enemy piece to capture at ${move.over}`);
    }
    if (enemy.length !== 1) {
      throw new Error(`applyMoveDama: stacks/columns are not allowed in Dama (over=${move.over})`);
    }

    const dest = nextBoard.get(move.to);
    if (dest && dest.length > 0) {
      throw new Error(`applyMoveDama: landing square ${move.to} is not empty`);
    }

    if (captureRemoval === "immediate") {
      // Remove the captured piece immediately.
      nextBoard.delete(move.over);
    }

    // Move the capturing piece.
    nextBoard.set(move.to, moving);
    nextBoard.delete(move.from);

    // Promote immediately if the landing square is on the promotion row.
    // Whether a capture chain continues after promotion is controlled by RULES.stopCaptureOnPromotion
    // (handled by the controller), but the piece should visually be an Officer right away.
    const tempState = { ...state, board: nextBoard };
    const didPromote = promoteIfNeeded(tempState, move.to);

    return { ...state, board: nextBoard, toMove: state.toMove, phase: "idle", didPromote };
  }

  // Quiet move
  const moving = nextBoard.get(move.from);
  if (!moving || moving.length === 0) return state;
  if (moving.length !== 1) {
    throw new Error(`applyMoveDama: stacks/columns are not allowed in Dama (from=${move.from})`);
  }
  const dest = nextBoard.get(move.to);
  if (dest && dest.length > 0) {
    throw new Error(`applyMoveDama: landing square ${move.to} is not empty`);
  }

  nextBoard.set(move.to, moving);
  nextBoard.delete(move.from);

  const tempState = { ...state, board: nextBoard };
  const didPromote = promoteIfNeeded(tempState, move.to);

  const nextToMove = state.toMove === "B" ? "W" : "B";
  return { ...state, board: nextBoard, toMove: nextToMove, phase: "idle", didPromote };
}
