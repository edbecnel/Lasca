import type { GameState } from "./state.ts";
import type { Move } from "./moveTypes.ts";
import { applyMoveLasca } from "./applyMoveLasca.ts";
import { applyMoveDama } from "./applyMoveDama.ts";
import { applyMoveDamasca } from "./applyMoveDamasca.ts";
import { applyMoveColumnsChess } from "./applyMoveColumnsChess.ts";
import { applyMoveChess } from "./applyMoveChess.ts";

function getRulesetId(state: GameState): string {
  return state.meta?.rulesetId ?? "lasca";
}

export function applyMove(
  state: GameState,
  move: Move
): GameState & { didPromote?: boolean } {
  const rulesetId = getRulesetId(state);
  if (rulesetId === "columns_chess") return applyMoveColumnsChess(state, move);
  if (rulesetId === "chess") return applyMoveChess(state, move);
  if (rulesetId === "dama") return applyMoveDama(state, move);
  if (rulesetId === "damasca" || rulesetId === "damasca_classic") return applyMoveDamasca(state, move);
  return applyMoveLasca(state, move);
}
