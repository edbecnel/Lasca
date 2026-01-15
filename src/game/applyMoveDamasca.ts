import type { GameState } from "./state.ts";
import type { Move } from "./moveTypes.ts";
import { promoteIfNeeded } from "./promote.ts";
import { parseNodeId } from "./coords.ts";
import { endTurn } from "./endTurn.ts";

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

    // Damasca: if a Soldier reaches the promotion row at any point during a capture chain,
    // it becomes eligible to promote once the chain ends (even if it later moves away).
    const boardSize = state.meta?.boardSize ?? 7;
    const lastRow = boardSize - 1;
    const { r } = parseNodeId(move.to);
    const reachedPromotionRow =
      (state.toMove === "B" && r === lastRow) || (state.toMove === "W" && r === 0);
    const promotionEarned = Boolean(state.captureChain?.promotionEarned) || reachedPromotionRow;
    const captureChain = promotionEarned
      ? { ...(state.captureChain ?? {}), promotionEarned: true }
      : state.captureChain;

    // No promotion during capture chains.
    return { ...state, board: nextBoard, toMove: state.toMove, phase: "idle", captureChain };
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

  const beforeTurnEnd: GameState = {
    ...state,
    board: nextBoard,
    toMove: state.toMove,
    phase: "idle",
    captureChain: undefined,
  };
  const afterTurnEnd = endTurn(beforeTurnEnd);
  return { ...afterTurnEnd, didPromote };
}
