import type { GameState } from "./state.ts";
import type { Move, CaptureMove } from "./moveTypes.ts";
import { parseNodeId, makeNodeId, isPlayable, inBounds } from "./coords.ts";
import type { NodeId } from "./state.ts";
import type { MovegenConstraints } from "./movegen.ts";

export function generateCaptureMovesLasca(
  state: GameState,
  constraints?: MovegenConstraints
): CaptureMove[] {
  const captures: CaptureMove[] = [];
  const boardSize = state.meta?.boardSize ?? 7;

  const forcedFrom = constraints?.forcedFrom;
  const excludedJumpSquares = constraints?.excludedJumpSquares;

  const isEmpty = (id: string) =>
    !state.board.has(id) || (state.board.get(id) ?? []).length === 0;
  const isEnemyTopAt = (id: string) => {
    const stack = state.board.get(id);
    if (!stack || stack.length === 0) return false;
    const top = stack[stack.length - 1];
    return top.owner !== state.toMove;
  };

  const tryFrom = (fromId: string, stack: any) => {
    if (!stack || stack.length === 0) return;

    const top = stack[stack.length - 1];
    if (top.owner !== state.toMove) return;

    const { r, c } = parseNodeId(fromId);

    type Delta = { dr: number; dc: number };
    let deltas: Delta[] = [];

    if (top.rank === "S") {
      const dr2 = top.owner === "B" ? +2 : -2;
      deltas = [
        { dr: dr2, dc: -2 },
        { dr: dr2, dc: +2 },
      ];
    } else {
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

      if (!inBounds(overR, overC, boardSize) || !inBounds(toR, toC, boardSize)) continue;
      if (!isPlayable(toR, toC, boardSize)) continue;

      const overId = makeNodeId(overR, overC);
      const toId = makeNodeId(toR, toC);

      if (!isEnemyTopAt(overId)) continue;
      if (!isEmpty(toId)) continue;

      if (excludedJumpSquares && excludedJumpSquares.has(overId)) continue;

      captures.push({ kind: "capture", from: fromId, over: overId, to: toId });
    }
  };

  if (forcedFrom) {
    tryFrom(forcedFrom, state.board.get(forcedFrom));
    return captures;
  }

  for (const [fromId, stack] of state.board.entries()) {
    tryFrom(fromId, stack);
  }

  return captures;
}

export function generateLegalMovesLasca(
  state: GameState,
  constraints?: MovegenConstraints
): Move[] {
  const captures = generateCaptureMovesLasca(state, constraints);
  if (captures.length > 0) return captures;

  const moves: Move[] = [];
  const boardSize = state.meta?.boardSize ?? 7;

  const isEmpty = (id: string) =>
    !state.board.has(id) || (state.board.get(id) ?? []).length === 0;

  const forcedFrom = constraints?.forcedFrom;

  const tryFrom = (fromId: string, stack: any) => {
    if (!stack || stack.length === 0) return;

    const top = stack[stack.length - 1];
    if (top.owner !== state.toMove) return;

    const { r, c } = parseNodeId(fromId);

    const candidates: string[] = [];

    if (top.rank === "S") {
      const dr = top.owner === "B" ? +1 : -1;
      for (const dc of [-1, +1]) {
        const nr = r + dr;
        const nc = c + dc;
        if (inBounds(nr, nc, boardSize) && isPlayable(nr, nc, boardSize)) {
          const to = makeNodeId(nr, nc);
          if (isEmpty(to)) candidates.push(to);
        }
      }
    } else {
      const deltas = [
        { dr: -1, dc: -1 },
        { dr: -1, dc: +1 },
        { dr: +1, dc: -1 },
        { dr: +1, dc: +1 },
      ];
      for (const { dr, dc } of deltas) {
        const nr = r + dr;
        const nc = c + dc;
        if (inBounds(nr, nc, boardSize) && isPlayable(nr, nc, boardSize)) {
          const to = makeNodeId(nr, nc);
          if (isEmpty(to)) candidates.push(to);
        }
      }
    }

    for (const to of candidates) {
      moves.push({ from: fromId, to, kind: "move" });
    }
  };

  if (forcedFrom) {
    tryFrom(forcedFrom, state.board.get(forcedFrom));
    return moves;
  }

  for (const [fromId, stack] of state.board.entries()) {
    tryFrom(fromId, stack);
  }

  return moves;
}
