import type { NodeId } from "./state.ts";

export function parseNodeId(id: string): { r: number; c: number } {
  const m = /^r(\d+)c(\d+)$/.exec(id);
  if (!m) throw new Error(`Invalid node id: ${id}`);
  const r = Number(m[1]);
  const c = Number(m[2]);
  if (!Number.isInteger(r) || !Number.isInteger(c)) throw new Error(`Invalid node coordinates in id: ${id}`);
  return { r, c };
}

export function makeNodeId(r: number, c: number): NodeId {
  return `r${r}c${c}`;
}

export function inBounds(r: number, c: number, boardSize: 7 | 8 = 7): boolean {
  return r >= 0 && r < boardSize && c >= 0 && c < boardSize;
}

export function isPlayable(r: number, c: number, boardSize: 7 | 8 = 7): boolean {
  if (!inBounds(r, c, boardSize)) return false;
  // For 7×7 (Lasca classic), the historical layout uses even parity.
  // For 8×8 (Dama/Damasca/Lasca-8×8), align with standard chess/checkers
  // board coloring where A1 is dark/playable; that corresponds to odd parity
  // when rows are indexed top-to-bottom (r0 at the top).
  const playableParity = boardSize === 8 ? 1 : 0;
  return (r + c) % 2 === playableParity;
}
