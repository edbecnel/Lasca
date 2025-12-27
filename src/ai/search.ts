import type { GameState } from "../game/state.ts";
import type { Move } from "../game/moveTypes.ts";
import type { Player } from "../types.ts";
import { generateLegalMoves } from "../game/movegen.ts";
import { applyMove } from "../game/applyMove.ts";
import { RULES } from "../game/ruleset.ts";
import { evaluateState } from "./evaluate.ts";

export type SearchContext = {
  state: GameState;
  lockedFrom: string | null;
  excludedJumpSquares: Set<string>;
};

type SearchResult = {
  score: number;
  bestMove: Move | null;
  nodes: number;
  depthReached: number;
};

const INF = 1_000_000_000;

function cloneStateForSearch(state: GameState): GameState {
  const board = new Map<string, any>();
  for (const [nodeId, stack] of state.board.entries()) {
    // Deep clone: applyMove/promoteIfNeeded mutate stack arrays and piece objects.
    board.set(
      nodeId,
      stack.map((p) => ({ owner: p.owner, rank: p.rank }))
    );
  }
  return { board, toMove: state.toMove, phase: state.phase };
}

function hasControlledStacks(state: GameState, p: Player): boolean {
  for (const stack of state.board.values()) {
    if (!stack || stack.length === 0) continue;
    const top = stack[stack.length - 1];
    if (top.owner === p) return true;
  }
  return false;
}

function legalMovesForContext(ctx: SearchContext): Move[] {
  const excluded = ctx.lockedFrom ? ctx.excludedJumpSquares : undefined;
  const all = generateLegalMoves(ctx.state, excluded);

  if (ctx.lockedFrom) {
    // During a capture chain, only the capturing stack may continue, and only via captures.
    return all.filter((m) => m.kind === "capture" && m.from === ctx.lockedFrom);
  }

  return all;
}

function terminalScore(state: GameState, perspective: Player): number | null {
  const opp: Player = perspective === "B" ? "W" : "B";

  const perspectiveHas = hasControlledStacks(state, perspective);
  const oppHas = hasControlledStacks(state, opp);

  if (!oppHas) return +INF;
  if (!perspectiveHas) return -INF;

  // No legal moves for either side is terminal.
  const s1: GameState = { ...state, toMove: perspective };
  const s2: GameState = { ...state, toMove: opp };
  if (generateLegalMoves(s1).length === 0) return -INF;
  if (generateLegalMoves(s2).length === 0) return +INF;

  return null;
}

function cloneCtx(ctx: SearchContext): SearchContext {
  return {
    state: ctx.state,
    lockedFrom: ctx.lockedFrom,
    excludedJumpSquares: new Set(ctx.excludedJumpSquares),
  };
}

function applySearchMove(ctx: SearchContext, move: Move): SearchContext {
  const nextCtx = cloneCtx(ctx);

  if (move.kind === "move") {
    const nextState = applyMove(cloneStateForSearch(nextCtx.state), move);
    nextCtx.state = nextState;
    nextCtx.lockedFrom = null;
    nextCtx.excludedJumpSquares.clear();
    return nextCtx;
  }

  // Capture
  const nextState = applyMove(cloneStateForSearch(nextCtx.state), move);
  nextCtx.state = nextState;
  nextCtx.excludedJumpSquares.add(move.over);

  const didPromote = Boolean((nextState as any).didPromote);

  // Promotion can optionally end the capture chain.
  if (didPromote && RULES.stopCaptureOnPromotion) {
    nextCtx.state = { ...nextCtx.state, toMove: nextCtx.state.toMove === "B" ? "W" : "B" };
    nextCtx.lockedFrom = null;
    nextCtx.excludedJumpSquares.clear();
    return nextCtx;
  }

  // Check for more captures from the landing square.
  const allNext = generateLegalMoves(nextCtx.state, nextCtx.excludedJumpSquares);
  const moreFromDest = allNext.filter((m) => m.kind === "capture" && m.from === move.to);

  if (moreFromDest.length > 0) {
    nextCtx.lockedFrom = move.to;
    return nextCtx;
  }

  // Chain ends: switch turn.
  nextCtx.state = { ...nextCtx.state, toMove: nextCtx.state.toMove === "B" ? "W" : "B" };
  nextCtx.lockedFrom = null;
  nextCtx.excludedJumpSquares.clear();
  return nextCtx;
}

function moveHeuristic(ctx: SearchContext, move: Move, perspective: Player): number {
  // Lightweight ordering: prefer captures, prefer capturing officers, prefer promotions.
  let s = 0;
  if (move.kind === "capture") {
    s += 500;
    const jumped = ctx.state.board.get(move.over);
    if (jumped && jumped.length > 0) {
      const top = jumped[jumped.length - 1];
      if (top.rank === "O") s += 80;
      if (top.owner !== perspective) s += 10;
    }
    // Promotion check: simulate just enough.
    const next = applyMove(cloneStateForSearch(ctx.state), move);
    if (Boolean((next as any).didPromote)) s += 60;
  } else {
    // Quiet move: prefer promoting moves.
    const next = applyMove(cloneStateForSearch(ctx.state), move);
    if (Boolean((next as any).didPromote)) s += 50;
  }
  return s;
}

function orderMoves(ctx: SearchContext, moves: Move[], perspective: Player): Move[] {
  return moves
    .slice()
    .sort((a, b) => moveHeuristic(ctx, b, perspective) - moveHeuristic(ctx, a, perspective));
}

function alphabeta(
  ctx: SearchContext,
  depth: number,
  alpha: number,
  beta: number,
  perspective: Player,
  deadlineMs: number | null,
  stats: { nodes: number }
): number {
  stats.nodes++;

  if (deadlineMs !== null && performance.now() >= deadlineMs) {
    // Time cutoff: return a static eval.
    return evaluateState(ctx.state, perspective);
  }

  const term = terminalScore(ctx.state, perspective);
  if (term !== null) return term;

  if (depth <= 0) return evaluateState(ctx.state, perspective);

  const moves = legalMovesForContext(ctx);
  if (moves.length === 0) {
    // No moves for side-to-move. If it's perspective's turn, that's bad; otherwise good.
    return ctx.state.toMove === perspective ? -INF : +INF;
  }

  const isMax = ctx.state.toMove === perspective;
  let best = isMax ? -INF : +INF;

  const ordered = orderMoves(ctx, moves, perspective);

  for (const m of ordered) {
    const child = applySearchMove(ctx, m);
    const val = alphabeta(child, depth - 1, alpha, beta, perspective, deadlineMs, stats);

    if (isMax) {
      if (val > best) best = val;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    } else {
      if (val < best) best = val;
      if (best < beta) beta = best;
      if (alpha >= beta) break;
    }
  }

  return best;
}

export function chooseGreedyMove(ctx: SearchContext, perspective: Player): Move | null {
  const moves = legalMovesForContext(ctx);
  if (moves.length === 0) return null;

  // Evaluate 1-ply and choose best; add small randomness among near-ties.
  let bestScore = -INF;
  let best: Move[] = [];

  for (const m of moves) {
    const child = applySearchMove(ctx, m);
    const s = evaluateState(child.state, perspective);
    if (s > bestScore) {
      bestScore = s;
      best = [m];
    } else if (Math.abs(s - bestScore) <= 5) {
      best.push(m);
    }
  }

  const pick = best[Math.floor(Math.random() * best.length)];
  return pick ?? moves[0];
}

export function chooseSearchMove(
  ctx: SearchContext,
  perspective: Player,
  maxDepth: number,
  timeBudgetMs: number | null
): SearchResult {
  const start = performance.now();
  const deadline = timeBudgetMs !== null ? start + timeBudgetMs : null;

  const moves = legalMovesForContext(ctx);
  if (moves.length === 0) {
    return { score: 0, bestMove: null, nodes: 0, depthReached: 0 };
  }

  let bestMove: Move | null = null;
  let bestScore = -INF;
  let depthReached = 0;
  let nodes = 0;

  // Iterative deepening if we have a time budget, otherwise single depth.
  const depths = timeBudgetMs !== null ? Array.from({ length: maxDepth }, (_, i) => i + 1) : [maxDepth];

  for (const depth of depths) {
    const stats = { nodes: 0 };
    let localBestMove: Move | null = null;
    let localBestScore = -INF;

    const ordered = orderMoves(ctx, moves, perspective);

    for (const m of ordered) {
      const child = applySearchMove(ctx, m);
      const s = alphabeta(child, depth - 1, -INF, +INF, perspective, deadline, stats);

      if (timeBudgetMs !== null && deadline !== null && performance.now() >= deadline) {
        break;
      }

      if (s > localBestScore) {
        localBestScore = s;
        localBestMove = m;
      }
    }

    nodes += stats.nodes;
    if (localBestMove) {
      bestMove = localBestMove;
      bestScore = localBestScore;
      depthReached = depth;
    }

    if (timeBudgetMs !== null && deadline !== null && performance.now() >= deadline) {
      break;
    }
  }

  return { score: bestScore, bestMove, nodes, depthReached };
}

export function chooseMoveByDifficulty(
  ctx: SearchContext,
  difficulty: "easy" | "medium" | "advanced"
): { move: Move | null; info?: { depth?: number; nodes?: number; ms?: number } } {
  const perspective: Player = ctx.state.toMove;

  if (difficulty === "easy") {
    return { move: chooseGreedyMove(ctx, perspective) };
  }

  if (difficulty === "medium") {
    const start = performance.now();
    const res = chooseSearchMove(ctx, perspective, 4, null);
    const ms = Math.round(performance.now() - start);
    return { move: res.bestMove, info: { depth: res.depthReached, nodes: res.nodes, ms } };
  }

  // advanced
  const start = performance.now();
  const res = chooseSearchMove(ctx, perspective, 10, 450);
  const ms = Math.round(performance.now() - start);
  return { move: res.bestMove, info: { depth: res.depthReached, nodes: res.nodes, ms } };
}
