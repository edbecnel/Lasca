import type { GameState } from "./state.ts";
import { hashGameState } from "./hashState.ts";

export type RepetitionHistory = {
  states: GameState[];
  /** Optional parallel array of move notation (same length as states). */
  notation?: string[];
  currentIndex: number;
};

/**
 * Returns true if `nextState` would recreate the position that existed
 * immediately before the current position (i.e., position at `currentIndex - 1`).
 *
 * Columns Chess ko rule: only enforced immediately after a capture.
 * If the previous move was not a capture, the ko is considered cleared.
 */
export function wouldRepeatPreviousPosition(args: { history: RepetitionHistory; nextState: GameState }): boolean {
  const { history, nextState } = args;
  const end = history.currentIndex;
  if (!Number.isInteger(end)) return false;
  if (end - 1 < 0) return false;
  if (end >= history.states.length) return false;

  // Only apply ko immediately after a capture. We infer capture-vs-quiet from the
  // stored move notation for the *current* position.
  const note = history.notation?.[end] ?? "";
  const lastWasCapture = note.includes("×") || note.toLowerCase().includes(" x ");
  if (!lastWasCapture) return false;

  const prev = history.states[end - 1];
  return hashGameState(prev) === hashGameState(nextState);
}

/**
 * Returns true if adding `nextState` would make that position occur 3 times
 * in the history prefix `[0..currentIndex]` (i.e., it already occurred twice).
 */
export function wouldCreateThreefoldRepetition(args: { history: RepetitionHistory; nextState: GameState }): boolean {
  const { history, nextState } = args;
  const end = history.currentIndex;
  if (!Number.isInteger(end) || end < 0) return false;

  const target = hashGameState(nextState);
  let count = 0;
  for (let i = 0; i <= end && i < history.states.length; i++) {
    if (hashGameState(history.states[i]) === target) count++;
  }
  return count >= 2;
}
