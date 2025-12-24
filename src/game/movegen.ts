import type { GameState } from "./state.ts";
import type { Move, CaptureMove } from "./moveTypes.ts";
import { parseNodeId, makeNodeId, isPlayable, inBounds } from "./coords.ts";
import type { NodeId } from "./state.ts";

export function generateCaptureMoves(state: GameState, excludedJumpSquares?: Set<NodeId>): CaptureMove[] {
  const captures: CaptureMove[] = [];

  const isEmpty = (id: string) => !state.board.has(id) || (state.board.get(id) ?? []).length === 0;
  const isEnemyTopAt = (id: string) => {
    const stack = state.board.get(id);
    if (!stack || stack.length === 0) return false;
    const top = stack[stack.length - 1];
    return top.owner !== state.toMove;
  };

  for (const [fromId, stack] of state.board.entries()) {
    if (!stack || stack.length === 0) continue;

    const top = stack[stack.length - 1];
    if (top.owner !== state.toMove) continue;

    const { r, c } = parseNodeId(fromId);

    type Delta = { dr: number; dc: number };
    let deltas: Delta[] = [];

    if (top.rank === "S") {
      const dr2 = top.owner === "B" ? +2 : -2; // Soldiers capture forward only
      deltas = [
        { dr: dr2, dc: -2 },
        { dr: dr2, dc: +2 },
      ];
    } else {
      // Officer: capture two steps diagonally in any direction
      deltas = [
        { dr: -2, dc: -2 },
        { dr: -2, dc: +2 },
        { dr: +2, dc: -2 },
        { dr: +2, dc: +2 },
      ];
    }

    for (const { dr, dc } of deltas) {
      const overR = r + dr / 2;
      const overC = c + dc / 2;
      const toR = r + dr;
      const toC = c + dc;

      if (!inBounds(overR, overC) || !inBounds(toR, toC)) continue;
      if (!isPlayable(toR, toC)) continue; // landing must be on playable square

      const overId = makeNodeId(overR, overC);
      const toId = makeNodeId(toR, toC);

      if (!isEnemyTopAt(overId)) continue; // must jump over enemy
      if (!isEmpty(toId)) continue; // landing must be empty
      
      // Anti-loop rule: cannot jump over the same square twice in one turn
      if (excludedJumpSquares && excludedJumpSquares.has(overId)) continue;

      captures.push({ kind: "capture", from: fromId, over: overId, to: toId });
    }
  }

  return captures;
}

export function generateLegalMoves(state: GameState, excludedJumpSquares?: Set<NodeId>): Move[] {
  const captures = generateCaptureMoves(state, excludedJumpSquares);
  if (captures.length > 0) return captures; // mandatory capture

  const moves: Move[] = [];

  const isEmpty = (id: string) => !state.board.has(id) || (state.board.get(id) ?? []).length === 0;

  for (const [fromId, stack] of state.board.entries()) {
    if (!stack || stack.length === 0) continue;

    const top = stack[stack.length - 1];
    if (top.owner !== state.toMove) continue;

    const { r, c } = parseNodeId(fromId);

    const candidates: string[] = [];

    if (top.rank === "S") {
      const dr = top.owner === "B" ? +1 : -1; // Black forward +1, White forward -1
      for (const dc of [-1, +1]) {
        const nr = r + dr;
        const nc = c + dc;
        if (inBounds(nr, nc) && isPlayable(nr, nc)) {
          const to = makeNodeId(nr, nc);
          if (isEmpty(to)) candidates.push(to);
        }
      }
    } else {
      // Officer: one step diagonally any direction
      const deltas = [
        { dr: -1, dc: -1 },
        { dr: -1, dc: +1 },
        { dr: +1, dc: -1 },
        { dr: +1, dc: +1 },
      ];
      for (const { dr, dc } of deltas) {
        const nr = r + dr;
        const nc = c + dc;
        if (inBounds(nr, nc) && isPlayable(nr, nc)) {
          const to = makeNodeId(nr, nc);
          if (isEmpty(to)) candidates.push(to);
        }
      }
    }

    for (const to of candidates) {
      moves.push({ from: fromId, to, kind: "move" });
    }
  }

  return moves;
}
