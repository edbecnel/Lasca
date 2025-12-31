import type { GameState } from "./state.ts";

/**
 * Manages game history for undo/redo functionality.
 * Stores snapshots at turn boundaries only (after complete moves/capture chains).
 */
export class HistoryManager {
  private history: GameState[] = [];
  private moveNotation: string[] = []; // Parallel array storing move notation
  private currentIndex: number = -1;

  exportSnapshots(): { states: GameState[]; notation: string[]; currentIndex: number } {
    return {
      states: this.history.map((s) => this.cloneState(s)),
      notation: [...this.moveNotation],
      currentIndex: this.currentIndex,
    };
  }

  replaceAll(states: GameState[], notation: string[], currentIndex: number): void {
    const clonedStates = states.map((s) => this.cloneState(s));
    const clonedNotation = [...notation];

    // Keep arrays aligned.
    while (clonedNotation.length < clonedStates.length) clonedNotation.push("");
    if (clonedNotation.length > clonedStates.length) clonedNotation.length = clonedStates.length;

    const nextIndex = Number.isInteger(currentIndex)
      ? Math.max(-1, Math.min(currentIndex, clonedStates.length - 1))
      : clonedStates.length - 1;

    this.history = clonedStates;
    this.moveNotation = clonedNotation;
    this.currentIndex = nextIndex;
  }

  /**
   * Record a new state (called after a complete turn).
   * This clears any future history if we're not at the end.
   */
  push(state: GameState, notation?: string): void {
    // Remove any states after current index (user made a new move after undoing)
    this.history = this.history.slice(0, this.currentIndex + 1);
    this.moveNotation = this.moveNotation.slice(0, this.currentIndex + 1);
    
    // Add the new state and notation
    this.history.push(this.cloneState(state));
    this.moveNotation.push(notation || "");
    this.currentIndex = this.history.length - 1;
  }

  /**
   * Go back one move in history.
   * Returns the previous state, or null if at the beginning.
   */
  undo(): GameState | null {
    if (!this.canUndo()) {
      return null;
    }
    
    this.currentIndex--;
    return this.cloneState(this.history[this.currentIndex]);
  }

  /**
   * Go forward one move in history.
   * Returns the next state, or null if at the end.
   */
  redo(): GameState | null {
    if (!this.canRedo()) {
      return null;
    }
    
    this.currentIndex++;
    return this.cloneState(this.history[this.currentIndex]);
  }

  /**
   * Check if we can undo.
   */
  canUndo(): boolean {
    return this.currentIndex > 0;
  }

  /**
   * Check if we can redo.
   */
  canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  /**
   * Get the current state without modifying history.
   */
  getCurrent(): GameState | null {
    if (this.currentIndex < 0 || this.currentIndex >= this.history.length) {
      return null;
    }
    return this.cloneState(this.history[this.currentIndex]);
  }

  /**
   * Get all history states for display (e.g., move list).
   * Returns array with move information including notation.
   */
  getHistory(): Array<{ index: number; toMove: "B" | "W"; isCurrent: boolean; notation: string }> {
    return this.history.map((state, idx) => ({
      index: idx,
      toMove: state.toMove,
      isCurrent: idx === this.currentIndex,
      notation: this.moveNotation[idx] || "",
    }));
  }

  /**
   * Get the number of moves in history.
   */
  size(): number {
    return this.history.length;
  }

  /**
   * Get the current position in history (0-based).
   */
  getCurrentIndex(): number {
    return this.currentIndex;
  }

  /**
   * Reset history to empty.
   */
  clear(): void {
    this.history = [];
    this.moveNotation = [];
    this.currentIndex = -1;
  }

  /**
   * Deep clone a game state to prevent mutations.
   */
  private cloneState(state: GameState): GameState {
    return {
      board: new Map(
        Array.from(state.board.entries()).map(([nodeId, stack]) => [
          nodeId,
          stack.map((piece) => ({ ...piece })),
        ])
      ),
      toMove: state.toMove,
      phase: state.phase,
      meta: state.meta ? { ...state.meta } : undefined,
    };
  }
}
