import type { GameDriver } from "./gameDriver.ts";
import type { GameState, Move } from "../core/index.ts";
import type { HistorySnapshots } from "./gameDriver.ts";

/**
 * RemoteDriver (stub).
 *
 * This is the multiplayer/online path. For now it is intentionally non-functional
 * (no transport yet). The goal is to establish a clean seam without impacting
 * offline/local play.
 */
export class RemoteDriver implements GameDriver {
  readonly mode = "online" as const;

  private state: GameState;

  // In a real implementation, history will be server-authoritative.
  // We keep minimal shape here to satisfy the interface.
  private history: HistorySnapshots = { states: [], notation: [], currentIndex: -1 };

  constructor(state: GameState) {
    this.state = state;
  }

  getState(): GameState {
    return this.state;
  }

  setState(state: GameState): void {
    this.state = state;
  }

  async submitMove(_move: Move): Promise<GameState & { didPromote?: boolean }> {
    throw new Error("Online multiplayer is not implemented yet (RemoteDriver)");
  }

  finalizeCaptureChain(
    _args:
      | { rulesetId: "dama"; state: GameState; landing: string; jumpedSquares: Set<string> }
      | { rulesetId: "damasca"; state: GameState; landing: string }
  ): GameState & { didPromote?: boolean } {
    // In online mode, chain finalization must come from the server.
    throw new Error("Online multiplayer is not implemented yet (RemoteDriver)");
  }

  canUndo(): boolean {
    return false;
  }

  canRedo(): boolean {
    return false;
  }

  undo(): GameState | null {
    return null;
  }

  redo(): GameState | null {
    return null;
  }

  jumpToHistory(_index: number): GameState | null {
    return null;
  }

  clearHistory(): void {
    this.history = { states: [], notation: [], currentIndex: -1 };
  }

  pushHistory(state: GameState, notation?: string): void {
    this.history.states = [...this.history.states, state];
    this.history.notation = [...this.history.notation, notation ?? ""]; 
    this.history.currentIndex = this.history.states.length - 1;
  }

  replaceHistory(snap: HistorySnapshots): void {
    this.history = {
      states: [...snap.states],
      notation: [...snap.notation],
      currentIndex: snap.currentIndex,
    };
  }

  exportHistorySnapshots(): HistorySnapshots {
    return {
      states: [...this.history.states],
      notation: [...this.history.notation],
      currentIndex: this.history.currentIndex,
    };
  }

  getHistory(): Array<{ index: number; toMove: "B" | "W"; isCurrent: boolean; notation: string }> {
    return this.history.states.map((s, idx) => ({
      index: idx,
      toMove: s.toMove,
      isCurrent: idx === this.history.currentIndex,
      notation: this.history.notation[idx] || "",
    }));
  }

  getHistoryCurrent(): GameState | null {
    if (this.history.currentIndex < 0 || this.history.currentIndex >= this.history.states.length) return null;
    return this.history.states[this.history.currentIndex];
  }
}
