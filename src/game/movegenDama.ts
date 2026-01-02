import type { GameState, NodeId } from "./state.ts";
import type { Move, CaptureMove } from "./moveTypes.ts";
import { parseNodeId, makeNodeId, isPlayable, inBounds } from "./coords.ts";
import type { MovegenConstraints } from "./movegen.ts";
import { hashGameState } from "./hashState.ts";
import { getDamaCaptureRemovalMode } from "./damaCaptureChain.ts";

type StackLike = Array<{ owner: "B" | "W"; rank: "S" | "O" }>;

type CaptureDir = { dr: number; dc: number };

function sign(n: number): number {
  if (n > 0) return 1;
  if (n < 0) return -1;
  return 0;
}

function captureDir(fromId: NodeId, toId: NodeId): CaptureDir {
  const a = parseNodeId(fromId);
  const b = parseNodeId(toId);
  return { dr: sign(b.r - a.r), dc: sign(b.c - a.c) };
}

function isEmptyAt(state: GameState, id: NodeId): boolean {
  const stack = state.board.get(id);
  return !stack || stack.length === 0;
}

function topAt(state: GameState, id: NodeId): StackLike[number] | null {
  const stack = state.board.get(id) as StackLike | undefined;
  if (!stack || stack.length === 0) return null;
  return stack[stack.length - 1] ?? null;
}

function removeCapturedPieceForDama(board: Map<NodeId, StackLike>, id: NodeId): void {
  const stack = board.get(id);
  if (!stack || stack.length === 0) return;
  // Dama has no stacks/columns: the jumped piece is removed from the board.
  // If somehow a stack exists, treat it as invalid and remove the square.
  board.delete(id);
}

function cloneBoard(board: GameState["board"]): Map<NodeId, StackLike> {
  const next = new Map<NodeId, StackLike>();
  for (const [id, stack] of board.entries()) {
    next.set(id, (stack as StackLike).slice());
  }
  return next;
}

function applyCaptureForSearch(state: GameState, move: CaptureMove): GameState {
  const nextBoard = cloneBoard(state.board);

  const moving = nextBoard.get(move.from);
  if (!moving || moving.length === 0) throw new Error(`movegenDama: no moving stack at ${move.from}`);

  if (!isEmptyAt({ ...state, board: nextBoard }, move.to)) {
    throw new Error(`movegenDama: landing square ${move.to} is not empty`);
  }

  // Move stack.
  nextBoard.set(move.to, moving);
  nextBoard.delete(move.from);

  const captureRemoval = getDamaCaptureRemovalMode(state);
  if (captureRemoval === "immediate") {
    // Remove captured piece during DFS only when the rules say it is removed immediately.
    removeCapturedPieceForDama(nextBoard, move.over);
  }

  return { ...state, board: nextBoard, phase: "idle" };
}

function generateRawCaptureMovesFrom(
  state: GameState,
  fromId: NodeId,
  excludedJumpSquares?: Set<NodeId>,
  lastCaptureDir?: CaptureDir
): CaptureMove[] {
  const top = topAt(state, fromId);
  if (!top || top.owner !== state.toMove) return [];

  const boardSize = state.meta?.boardSize ?? 8;
  const { r, c } = parseNodeId(fromId);

  const out: CaptureMove[] = [];

  const canJumpOver = (overId: NodeId): boolean => {
    if (excludedJumpSquares && excludedJumpSquares.has(overId)) return false;
    const overTop = topAt(state, overId);
    return Boolean(overTop && overTop.owner !== state.toMove);
  };

  if (top.rank === "S") {
    // Men: capture diagonally in any direction (including backwards).
    const deltas = [
      { dr: -2, dc: -2 },
      { dr: -2, dc: +2 },
      { dr: +2, dc: -2 },
      { dr: +2, dc: +2 },
    ];
    for (const { dr, dc } of deltas) {
      const overR = r + dr / 2;
      const overC = c + dc / 2;
      const toR = r + dr;
      const toC = c + dc;
      if (!inBounds(overR, overC, boardSize) || !inBounds(toR, toC, boardSize)) continue;
      if (!isPlayable(toR, toC, boardSize)) continue;

      const overId = makeNodeId(overR, overC);
      const toId = makeNodeId(toR, toC);

      if (!canJumpOver(overId)) continue;
      if (!isEmptyAt(state, toId)) continue;

      out.push({ kind: "capture", from: fromId, over: overId, to: toId });
    }
    return out;
  }

  // Kings (rank "O"): flying captures.
  const dirs = [
    { dr: -1, dc: -1 },
    { dr: -1, dc: +1 },
    { dr: +1, dc: -1 },
    { dr: +1, dc: +1 },
  ];

  for (const { dr, dc } of dirs) {
    // Zigzag rule (Dama + Damasca): during a capture chain, an Officer may not
    // continue capturing along the same line (same direction) or reverse (opposite direction).
    if (
      lastCaptureDir &&
      ((dr === lastCaptureDir.dr && dc === lastCaptureDir.dc) ||
        (dr === -lastCaptureDir.dr && dc === -lastCaptureDir.dc))
    ) {
      continue;
    }

    let rr = r + dr;
    let cc = c + dc;
    let seenEnemy: { id: NodeId; r: number; c: number } | null = null;

    while (inBounds(rr, cc, boardSize)) {
      if (!isPlayable(rr, cc, boardSize)) {
        rr += dr;
        cc += dc;
        continue;
      }

      const id = makeNodeId(rr, cc);
      const occupant = topAt(state, id);

      if (!occupant) {
        // Empty square.
        if (seenEnemy) {
          // After jumping exactly one enemy, you may land on any empty square beyond.
          out.push({ kind: "capture", from: fromId, over: seenEnemy.id, to: id });
        }
        rr += dr;
        cc += dc;
        continue;
      }

      // Occupied square.
      if (seenEnemy) {
        // Two occupied squares along the ray blocks the capture.
        break;
      }

      if (occupant.owner === state.toMove) {
        // Friendly piece blocks.
        break;
      }

      // First enemy encountered.
      if (excludedJumpSquares && excludedJumpSquares.has(id)) {
        // This enemy is not allowed to be jumped again.
        break;
      }

      seenEnemy = { id, r: rr, c: cc };
      rr += dr;
      cc += dc;
    }
  }

  return out;
}

function bestRemainingCapturesFrom(
  state: GameState,
  fromId: NodeId,
  excludedJumpSquares: Set<NodeId>,
  memo: Map<string, number>,
  lastDir: CaptureDir | null
): number {
  const key = `${hashGameState(state)}|from:${fromId}|ex:${Array.from(excludedJumpSquares).sort().join(",")}|dir:${
    lastDir ? `${lastDir.dr},${lastDir.dc}` : "none"
  }`;
  const cached = memo.get(key);
  if (cached !== undefined) return cached;

  const nextCaps = generateRawCaptureMovesFrom(state, fromId, excludedJumpSquares, lastDir ?? undefined);
  if (nextCaps.length === 0) {
    memo.set(key, 0);
    return 0;
  }

  let best = 0;
  for (const m of nextCaps) {
    const nextExcluded = new Set(excludedJumpSquares);
    nextExcluded.add(m.over);
    const nextState = applyCaptureForSearch(state, m);
    const score = 1 + bestRemainingCapturesFrom(nextState, m.to, nextExcluded, memo, captureDir(m.from, m.to));
    if (score > best) best = score;
  }

  memo.set(key, best);
  return best;
}

function generateSelectableCaptureMoves(
  state: GameState,
  constraints?: MovegenConstraints
): CaptureMove[] {
  const forcedFrom = constraints?.forcedFrom;
  const excludedJumpSquares = constraints?.excludedJumpSquares ?? new Set<NodeId>();
  const lastCaptureDir = constraints?.lastCaptureDir as CaptureDir | undefined;

  const memo = new Map<string, number>();

  const candidates: CaptureMove[] = [];
  const origins: NodeId[] = [];

  if (forcedFrom) {
    origins.push(forcedFrom);
  } else {
    for (const [id] of state.board.entries()) origins.push(id);
  }

  for (const fromId of origins) {
    const top = topAt(state, fromId);
    if (!top || top.owner !== state.toMove) continue;
    candidates.push(...generateRawCaptureMovesFrom(state, fromId, excludedJumpSquares, lastCaptureDir));
  }

  if (candidates.length === 0) return [];

  // Maximum-capture rule: only allow capture steps that can still achieve
  // a full line with the highest total number of captured pieces.
  let globalBest = -Infinity;
  const scored: Array<{ move: CaptureMove; score: number }> = [];
  for (const m of candidates) {
    const nextExcluded = new Set(excludedJumpSquares);
    nextExcluded.add(m.over);
    const nextState = applyCaptureForSearch(state, m);
    const score = 1 + bestRemainingCapturesFrom(nextState, m.to, nextExcluded, memo, captureDir(m.from, m.to));
    scored.push({ move: m, score });
    if (score > globalBest) globalBest = score;
  }

  return scored.filter((x) => x.score === globalBest).map((x) => x.move);
}

export function generateCaptureMovesDama(
  state: GameState,
  constraints?: MovegenConstraints
): CaptureMove[] {
  return generateSelectableCaptureMoves(state, constraints);
}

export function generateLegalMovesDama(
  state: GameState,
  constraints?: MovegenConstraints
): Move[] {
  const captures = generateSelectableCaptureMoves(state, constraints);
  if (captures.length > 0) return captures;

  const boardSize = state.meta?.boardSize ?? 8;
  const forcedFrom = constraints?.forcedFrom;

  const out: Move[] = [];
  const origins: NodeId[] = [];
  if (forcedFrom) {
    origins.push(forcedFrom);
  } else {
    for (const [id] of state.board.entries()) origins.push(id);
  }

  for (const fromId of origins) {
    const top = topAt(state, fromId);
    if (!top || top.owner !== state.toMove) continue;

    const { r, c } = parseNodeId(fromId);

    if (top.rank === "S") {
      // Men: move forward only.
      const dr = top.owner === "B" ? +1 : -1;
      for (const dc of [-1, +1]) {
        const nr = r + dr;
        const nc = c + dc;
        if (!inBounds(nr, nc, boardSize) || !isPlayable(nr, nc, boardSize)) continue;
        const toId = makeNodeId(nr, nc);
        if (!isEmptyAt(state, toId)) continue;
        out.push({ kind: "move", from: fromId, to: toId });
      }
      continue;
    }

    // Kings: flying quiet moves (slide diagonally any distance until blocked).
    const dirs = [
      { dr: -1, dc: -1 },
      { dr: -1, dc: +1 },
      { dr: +1, dc: -1 },
      { dr: +1, dc: +1 },
    ];
    for (const { dr, dc } of dirs) {
      let rr = r + dr;
      let cc = c + dc;

      while (inBounds(rr, cc, boardSize)) {
        if (!isPlayable(rr, cc, boardSize)) {
          rr += dr;
          cc += dc;
          continue;
        }

        const toId = makeNodeId(rr, cc);
        if (!isEmptyAt(state, toId)) break;
        out.push({ kind: "move", from: fromId, to: toId });
        rr += dr;
        cc += dc;
      }
    }
  }

  return out;
}
