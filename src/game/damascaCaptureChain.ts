import type { GameState, NodeId } from "./state.ts";
import { promoteIfNeeded, promoteTopSoldierIfOwnedByToMove } from "./promote.ts";

/**
 * Finalize a Damasca capture chain.
 * Damasca captures remove jumped pieces immediately, so the only end-of-chain
 * work is applying end-of-turn promotion on the last landing square.
 */
export function finalizeDamascaCaptureChain(
  state: GameState,
  lastLanding: NodeId
): GameState & { didPromote?: boolean } {
  const tempState: GameState = { ...state, board: state.board };

  // If the mover reached the promotion row at any point in the chain, apply promotion
  // now on the final landing square (even if that square is not on the promotion row).
  const didPromote = tempState.captureChain?.promotionEarned
    ? promoteTopSoldierIfOwnedByToMove(tempState, lastLanding)
    : promoteIfNeeded(tempState, lastLanding);

  return { ...tempState, didPromote, captureChain: undefined };
}
