import type { GameState } from "../core/index.ts";
import type { Move } from "../core/index.ts";

export type DriverMode = "local" | "online";

export interface HistorySnapshots {
  states: GameState[];
  notation: string[];
  currentIndex: number;
}

export interface GameDriver {
  readonly mode: DriverMode;

  getState(): GameState;
  setState(state: GameState): void;

  submitMove(move: Move): Promise<GameState & { didPromote?: boolean }>;

  finalizeCaptureChain(args:
    | { rulesetId: "dama"; state: GameState; landing: string; jumpedSquares: Set<string> }
    | { rulesetId: "damasca"; state: GameState; landing: string }
  ): GameState & { didPromote?: boolean };

  canUndo(): boolean;
  canRedo(): boolean;
  undo(): GameState | null;
  redo(): GameState | null;
  jumpToHistory(index: number): GameState | null;

  clearHistory(): void;
  pushHistory(state: GameState, notation?: string): void;
  replaceHistory(snap: HistorySnapshots): void;
  exportHistorySnapshots(): HistorySnapshots;
  getHistory(): Array<{ index: number; toMove: "B" | "W"; isCurrent: boolean; notation: string }>;
  getHistoryCurrent(): GameState | null;
}
