import type { GameState } from "./state.ts";
import type { Stack } from "../types.ts";
import type { HistoryManager } from "./historyManager.ts";
import type { GameMeta, RulesetId, VariantId } from "../variants/variantTypes";
import { DEFAULT_VARIANT_ID, getVariantById, isVariantId } from "../variants/variantRegistry";

interface SerializedGameState {
  board: [string, Stack][];
  toMove: "B" | "W";
  phase: "idle" | "select" | "anim";
  meta?: GameMeta;
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

interface SerializedSaveFileV3 {
  saveVersion: 3;
  variantId: VariantId;
  rulesetId: RulesetId;
  boardSize: 7 | 8;
  current: SerializedGameState;
  history?: SerializedHistory;
}

type SerializedSaveFile = SerializedGameState | SerializedSaveFileV2 | SerializedSaveFileV3;

function isRulesetId(raw: unknown): raw is RulesetId {
  return raw === "lasca" || raw === "dama" || raw === "hybrid";
}

function isBoardSize(raw: unknown): raw is 7 | 8 {
  return raw === 7 || raw === 8;
}

function defaultMeta(): GameMeta {
  const v = getVariantById(DEFAULT_VARIANT_ID);
  return { variantId: v.variantId, rulesetId: v.rulesetId, boardSize: v.boardSize };
}

function coerceMeta(raw: unknown): GameMeta | null {
  const m = raw as any;
  const variantId = typeof m?.variantId === "string" && isVariantId(m.variantId) ? (m.variantId as VariantId) : null;
  const rulesetId = isRulesetId(m?.rulesetId) ? (m.rulesetId as RulesetId) : null;
  const boardSize = isBoardSize(m?.boardSize) ? (m.boardSize as 7 | 8) : null;
  if (!variantId || !rulesetId || !boardSize) return null;
  return { variantId, rulesetId, boardSize };
}

function getMetaForState(state: GameState): GameMeta {
  const m = coerceMeta(state.meta);
  return m ?? defaultMeta();
}

function formatVariantForMessage(variantId: VariantId): string {
  const v = getVariantById(variantId);
  return `${v.displayName} (${v.rulesetId} rules, ${v.boardSize}×${v.boardSize})`;
}

/**
 * Serialize game state to a JSON-compatible object
 */
export function serializeGameState(state: GameState): SerializedGameState {
  return {
    board: Array.from(state.board.entries()),
    toMove: state.toMove,
    phase: state.phase,
    meta: coerceMeta(state.meta) ?? undefined,
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
    meta: coerceMeta((data as any).meta) ?? undefined,
  };
}

export function serializeSaveData(state: GameState, history?: HistoryManager): SerializedSaveFile {
  const meta = getMetaForState(state);

  const base: SerializedSaveFileV3 = {
    saveVersion: 3,
    variantId: meta.variantId,
    rulesetId: meta.rulesetId,
    boardSize: meta.boardSize,
    current: serializeGameState({ ...state, meta }),
  };

  if (!history) return base;

  const exported = history.exportSnapshots();
  return {
    ...base,
    history: {
      states: exported.states.map((s) => serializeGameState({ ...s, meta })),
      notation: exported.notation,
      currentIndex: exported.currentIndex,
    },
  };
}

export function deserializeSaveData(
  data: SerializedSaveFile,
  expected?: GameMeta
): {
  state: GameState;
  history?: { states: GameState[]; notation: string[]; currentIndex: number };
} {
  const expectedMeta = expected ? (coerceMeta(expected) ?? defaultMeta()) : null;

  // v3: metadata wrapper (preferred)
  if ((data as any)?.saveVersion === 3) {
    const v3 = data as any;
    if (!isVariantId(String(v3.variantId)) || !isRulesetId(v3.rulesetId) || !isBoardSize(v3.boardSize)) {
      throw new Error("Invalid save file: missing or invalid variant metadata");
    }

    const meta: GameMeta = {
      variantId: v3.variantId as VariantId,
      rulesetId: v3.rulesetId as RulesetId,
      boardSize: v3.boardSize as 7 | 8,
    };

    if (
      expectedMeta &&
      (meta.variantId !== expectedMeta.variantId ||
        meta.rulesetId !== expectedMeta.rulesetId ||
        meta.boardSize !== expectedMeta.boardSize)
    ) {
      throw new Error(
        `Save variant mismatch. This file is for ${formatVariantForMessage(meta.variantId)}, but this page is ${formatVariantForMessage(expectedMeta.variantId)}.`
      );
    }

    const current = deserializeGameState(v3.current as SerializedGameState);
    const state: GameState = { ...current, meta };

    if (!v3.history) return { state };

    const states = (v3.history.states || []).map((s) => ({ ...deserializeGameState(s), meta }));
    const notation = Array.isArray(v3.history.notation) ? v3.history.notation : [];
    const currentIndex = Number.isInteger(v3.history.currentIndex) ? v3.history.currentIndex : states.length - 1;

    const historyCurrent = currentIndex >= 0 && currentIndex < states.length ? states[currentIndex] : null;
    const aligned = historyCurrent ?? state;

    return {
      state: aligned,
      history: { states, notation, currentIndex },
    };
  }

  // v2: history wrapper without metadata
  if (typeof (data as any)?.version === "number") {
    const v2 = data as SerializedSaveFileV2;
    if (v2.version !== 2 || !v2.current || !v2.history) {
      const state = deserializeGameState(v2.current ?? (data as any));
      const meta = defaultMeta();
      const merged: GameState = { ...state, meta };
      if (
        expectedMeta &&
        (meta.variantId !== expectedMeta.variantId ||
          meta.rulesetId !== expectedMeta.rulesetId ||
          meta.boardSize !== expectedMeta.boardSize)
      ) {
        throw new Error(
          `Save variant mismatch. This file is for ${formatVariantForMessage(meta.variantId)}, but this page is ${formatVariantForMessage(expectedMeta.variantId)}.`
        );
      }
      return { state: merged };
    }

    const meta = defaultMeta();
    if (
      expectedMeta &&
      (meta.variantId !== expectedMeta.variantId ||
        meta.rulesetId !== expectedMeta.rulesetId ||
        meta.boardSize !== expectedMeta.boardSize)
    ) {
      throw new Error(
        `Save variant mismatch. This file is for ${formatVariantForMessage(meta.variantId)}, but this page is ${formatVariantForMessage(expectedMeta.variantId)}.`
      );
    }

    const states = (v2.history.states || []).map((s) => ({ ...deserializeGameState(s), meta }));
    const notation = Array.isArray(v2.history.notation) ? v2.history.notation : [];
    const currentIndex = Number.isInteger(v2.history.currentIndex) ? v2.history.currentIndex : states.length - 1;

    const historyCurrent = currentIndex >= 0 && currentIndex < states.length ? states[currentIndex] : null;
    const state = historyCurrent ?? { ...deserializeGameState(v2.current), meta };

    return {
      state,
      history: { states, notation, currentIndex },
    };
  }

  // v1: state-only
  {
    const state = deserializeGameState(data as SerializedGameState);
    const meta = coerceMeta((data as any)?.meta) ?? defaultMeta();
    if (
      expectedMeta &&
      (meta.variantId !== expectedMeta.variantId ||
        meta.rulesetId !== expectedMeta.rulesetId ||
        meta.boardSize !== expectedMeta.boardSize)
    ) {
      throw new Error(
        `Save variant mismatch. This file is for ${formatVariantForMessage(meta.variantId)}, but this page is ${formatVariantForMessage(expectedMeta.variantId)}.`
      );
    }
    return { state: { ...state, meta } };
  }
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
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Load game state from a file input
 */
export function loadGameFromFile(
  file: File,
  expected?: GameMeta
): Promise<{
  state: GameState;
  history?: { states: GameState[]; notation: string[]; currentIndex: number };
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const json = e.target?.result as string;
        const data = JSON.parse(json) as SerializedSaveFile;
        const loaded = deserializeSaveData(data, expected);
        resolve(loaded);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        reject(new Error(msg));
      }
    };
    
    reader.onerror = () => {
      reject(new Error("Failed to read file"));
    };
    
    reader.readAsText(file);
  });
}
