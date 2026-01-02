import type { Stack } from "../types.ts";
import type { GameMeta } from "../variants/variantTypes";

export type WireCaptureChain = {
  promotionEarned?: boolean;
};

export type WireGameState = {
  board: [string, Stack][];
  toMove: "B" | "W";
  phase: "idle" | "select" | "anim";
  meta?: GameMeta;
  captureChain?: WireCaptureChain;
};

export type WireHistory = {
  states: WireGameState[];
  notation: string[];
  currentIndex: number;
};

export type WireSnapshot = {
  state: WireGameState;
  history: WireHistory;
};

export function serializeWireGameState(state: any): WireGameState {
  return {
    board: Array.from(state.board?.entries?.() ?? []),
    toMove: state.toMove,
    phase: state.phase,
    meta: state.meta,
    captureChain: state.captureChain,
  };
}

export function deserializeWireGameState(wire: WireGameState): any {
  return {
    board: new Map(wire.board),
    toMove: wire.toMove,
    phase: wire.phase,
    meta: wire.meta,
    captureChain: wire.captureChain,
  };
}

export function serializeWireHistory(history: { states: any[]; notation: string[]; currentIndex: number }): WireHistory {
  return {
    states: history.states.map(serializeWireGameState),
    notation: [...history.notation],
    currentIndex: history.currentIndex,
  };
}

export function deserializeWireHistory(wire: WireHistory): { states: any[]; notation: string[]; currentIndex: number } {
  return {
    states: wire.states.map(deserializeWireGameState),
    notation: Array.isArray(wire.notation) ? [...wire.notation] : [],
    currentIndex: Number.isInteger(wire.currentIndex) ? wire.currentIndex : wire.states.length - 1,
  };
}
