import type { Player } from "../types.ts";
import type { Move } from "../game/moveTypes.ts";

export type AIDifficulty = "human" | "easy" | "medium" | "advanced";

export interface AISettings {
  white: AIDifficulty;
  black: AIDifficulty;
  delayMs: number;
  paused: boolean;
}

export function difficultyForPlayer(settings: AISettings, p: Player): AIDifficulty {
  return p === "W" ? settings.white : settings.black;
}

export type SerializedGameState = {
  board: [string, any][]; // Stack is serializable; keep as 'any' to avoid import cycles in worker.
  toMove: Player;
  phase: "idle" | "select" | "anim";
};

export type AIWorkerRequest = {
  kind: "chooseMove";
  requestId: number;
  difficulty: Exclude<AIDifficulty, "human">;
  state: SerializedGameState;
  lockedFrom: string | null;
  excludedJumpSquares: string[];
  // Search tuning
  maxDepth?: number;
  timeBudgetMs?: number;
};

export type AIWorkerResponse = {
  kind: "chooseMoveResult";
  requestId: number;
  move: Move | null;
  info?: {
    score?: number;
    depth?: number;
    nodes?: number;
    ms?: number;
  };
};
