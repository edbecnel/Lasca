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

export function inBounds(r: number, c: number): boolean {
  return r >= 0 && r <= 6 && c >= 0 && c <= 6;
}

export function isPlayable(r: number, c: number): boolean {
  return inBounds(r, c) && (r + c) % 2 === 0;
}
