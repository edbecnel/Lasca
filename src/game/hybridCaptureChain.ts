import type { GameState, NodeId } from "./state.ts";
import { promoteIfNeeded } from "./promote.ts";

/**
 * Finalize a Hybrid (Damasca) capture chain.
 * Hybrid captures remove jumped pieces immediately, so the only end-of-chain
 * work is applying end-of-turn promotion on the last landing square.
 */
export function finalizeHybridCaptureChain(
  state: GameState,
  lastLanding: NodeId
): GameState & { didPromote?: boolean } {
  const tempState: GameState = { ...state, board: state.board };
  const didPromote = promoteIfNeeded(tempState, lastLanding);
  return { ...tempState, didPromote };
}
