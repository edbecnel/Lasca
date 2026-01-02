import type { GameState } from "./state.ts";
import type { Move } from "./moveTypes.ts";
import { applyMoveLasca } from "./applyMoveLasca.ts";
import { applyMoveDama } from "./applyMoveDama.ts";
import { applyMoveHybrid } from "./applyMoveHybrid.ts";

function getRulesetId(state: GameState): string {
  return state.meta?.rulesetId ?? "lasca";
}

export function applyMove(
  state: GameState,
  move: Move
): GameState & { didPromote?: boolean } {
  const rulesetId = getRulesetId(state);
  if (rulesetId === "dama") return applyMoveDama(state, move);
  if (rulesetId === "hybrid") return applyMoveHybrid(state, move);
  return applyMoveLasca(state, move);
}
