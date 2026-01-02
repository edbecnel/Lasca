import type { GameState, NodeId } from "./state.ts";
import type { Move, CaptureMove } from "./moveTypes.ts";
import { generateCaptureMovesLasca, generateLegalMovesLasca } from "./movegenLasca.ts";
import { generateCaptureMovesDama, generateLegalMovesDama } from "./movegenDama.ts";
import { generateCaptureMovesHybrid, generateLegalMovesHybrid } from "./movegenHybrid.ts";

export type MovegenConstraints = {
  forcedFrom?: NodeId;
  excludedJumpSquares?: Set<NodeId>;
  /**
   * Direction of the previous capture step in a capture chain.
   * Used by rulesets that restrict follow-up captures (e.g., Officers must zigzag).
   */
  lastCaptureDir?: { dr: number; dc: number };
};

function getRulesetId(state: GameState): string {
  return state.meta?.rulesetId ?? "lasca";
}

export function generateCaptureMoves(
  state: GameState,
  constraints?: MovegenConstraints
): CaptureMove[] {
  const rulesetId = getRulesetId(state);
  if (rulesetId === "dama") return generateCaptureMovesDama(state, constraints);
  if (rulesetId === "hybrid") return generateCaptureMovesHybrid(state, constraints);
  return generateCaptureMovesLasca(state, constraints);
}

export function generateLegalMoves(
  state: GameState,
  constraints?: MovegenConstraints
): Move[] {
  const rulesetId = getRulesetId(state);
  if (rulesetId === "dama") return generateLegalMovesDama(state, constraints);
  if (rulesetId === "hybrid") return generateLegalMovesHybrid(state, constraints);
  return generateLegalMovesLasca(state, constraints);
}
