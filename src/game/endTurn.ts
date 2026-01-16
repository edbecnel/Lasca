import type { GameState } from "./state.ts";
import { maybeApplyDamascaDeadPlayEnd } from "./damascaDeadPlay.ts";

/**
 * End a turn: flip `toMove`, set `phase: idle`, and apply any turn-boundary rules.
 */
export function endTurn(state: GameState): GameState {
  const next: GameState = {
    ...state,
    toMove: state.toMove === "B" ? "W" : "B",
    phase: "idle",
  };

  // Safety: if a save/load or external caller advanced counters to a threshold,
  // ensure Damasca dead-play ends are applied at a turn boundary.
  return maybeApplyDamascaDeadPlayEnd(next);
}
