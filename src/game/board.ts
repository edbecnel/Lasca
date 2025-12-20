import type { NodeId } from "./state.ts";
import { parseNodeId, makeNodeId, isPlayable, inBounds } from "./coords.ts";

export const ALL_NODES: NodeId[] = (() => {
  const nodes: NodeId[] = [];
  for (let r = 0; r <= 6; r++) {
    for (let c = 0; c <= 6; c++) {
      if (isPlayable(r, c)) nodes.push(makeNodeId(r, c));
    }
  }
  return nodes;
})();

export function diagNeighbors(id: NodeId): NodeId[] {
  const { r, c } = parseNodeId(id);
  const res: NodeId[] = [];
  const deltas = [
    { dr: -1, dc: -1 },
    { dr: -1, dc: +1 },
    { dr: +1, dc: -1 },
    { dr: +1, dc: +1 },
  ];
  for (const { dr, dc } of deltas) {
    const nr = r + dr;
    const nc = c + dc;
    if (isPlayable(nr, nc)) res.push(makeNodeId(nr, nc));
  }
  return res;
}

export function jumpTargets(id: NodeId): Array<{ over: NodeId; land: NodeId }> {
  const { r, c } = parseNodeId(id);
  const res: Array<{ over: NodeId; land: NodeId }> = [];
  const deltas = [
    { dr: -1, dc: -1 },
    { dr: -1, dc: +1 },
    { dr: +1, dc: -1 },
    { dr: +1, dc: +1 },
  ];
  for (const { dr, dc } of deltas) {
    const or = r + dr;
    const oc = c + dc;
    const lr = r + 2 * dr;
    const lc = c + 2 * dc;
    if (inBounds(or, oc) && inBounds(lr, lc) && isPlayable(lr, lc)) {
      res.push({ over: makeNodeId(or, oc), land: makeNodeId(lr, lc) });
    }
  }
  return res;
}
