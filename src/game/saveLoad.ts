import type { GameState } from "./state.ts";
import type { Stack } from "../types.ts";

interface SerializedGameState {
  board: [string, Stack][];
  toMove: "B" | "W";
  phase: "idle" | "select" | "anim";
}

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

/**
 * Save game state to a JSON file download
 */
export function saveGameToFile(state: GameState, filename = "lasca-game.json"): void {
  const serialized = serializeGameState(state);
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
export function loadGameFromFile(file: File): Promise<GameState> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const json = e.target?.result as string;
        const data = JSON.parse(json) as SerializedGameState;
        const state = deserializeGameState(data);
        resolve(state);
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
