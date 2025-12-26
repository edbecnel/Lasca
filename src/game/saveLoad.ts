import type { GameState } from "./state.ts";
import type { Stack } from "../types.ts";
import type { HistoryManager } from "./historyManager.ts";

interface SerializedGameState {
  board: [string, Stack][];
  toMove: "B" | "W";
  phase: "idle" | "select" | "anim";
}

interface SerializedHistory {
  states: SerializedGameState[];
  notation: string[];
  currentIndex: number;
}

interface SerializedSaveFileV2 {
  version: 2;
  current: SerializedGameState;
  history: SerializedHistory;
}

type SerializedSaveFile = SerializedGameState | SerializedSaveFileV2;

/**
 * Serialize game state to a JSON-compatible object
 */
export function serializeGameState(state: GameState): SerializedGameState {
  return {
    board: Array.from(state.board.entries()),
    toMove: state.toMove,
    phase: state.phase,
  };
}

/**
 * Deserialize game state from a JSON-compatible object
 */
export function deserializeGameState(data: SerializedGameState): GameState {
  const phase = data.phase === "idle" || data.phase === "select" || data.phase === "anim" ? data.phase : "idle";
  return {
    board: new Map(data.board),
    toMove: data.toMove,
    phase,
  };
}

export function serializeSaveData(state: GameState, history?: HistoryManager): SerializedSaveFile {
  if (!history) {
    return serializeGameState(state);
  }

  const exported = history.exportSnapshots();
  return {
    version: 2,
    current: serializeGameState(state),
    history: {
      states: exported.states.map((s) => serializeGameState(s)),
      notation: exported.notation,
      currentIndex: exported.currentIndex,
    },
  };
}

export function deserializeSaveData(data: SerializedSaveFile): {
  state: GameState;
  history?: { states: GameState[]; notation: string[]; currentIndex: number };
} {
  // v1: state-only
  if (typeof (data as any)?.version !== "number") {
    const state = deserializeGameState(data as SerializedGameState);
    return { state };
  }

  const v2 = data as SerializedSaveFileV2;
  if (v2.version !== 2 || !v2.current || !v2.history) {
    const state = deserializeGameState(v2.current ?? (data as any));
    return { state };
  }

  const states = (v2.history.states || []).map((s) => deserializeGameState(s));
  const notation = Array.isArray(v2.history.notation) ? v2.history.notation : [];
  const currentIndex = Number.isInteger(v2.history.currentIndex) ? v2.history.currentIndex : states.length - 1;

  // Prefer aligning to the history's current state if present.
  const historyCurrent = currentIndex >= 0 && currentIndex < states.length ? states[currentIndex] : null;
  const state = historyCurrent ?? deserializeGameState(v2.current);

  return {
    state,
    history: { states, notation, currentIndex },
  };
}

/**
 * Save game state to a JSON file download
 */
export function saveGameToFile(state: GameState, history?: HistoryManager, filename = "lasca-game.json"): void {
  const serialized = serializeSaveData(state, history);
  const json = JSON.stringify(serialized, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Load game state from a file input
 */
export function loadGameFromFile(file: File): Promise<{
  state: GameState;
  history?: { states: GameState[]; notation: string[]; currentIndex: number };
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const json = e.target?.result as string;
        const data = JSON.parse(json) as SerializedSaveFile;
        const loaded = deserializeSaveData(data);
        resolve(loaded);
      } catch (error) {
        reject(new Error(`Failed to load game: ${error}`));
      }
    };
    
    reader.onerror = () => {
      reject(new Error("Failed to read file"));
    };
    
    reader.readAsText(file);
  });
}
