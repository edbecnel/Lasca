import type { GameState } from "../game/state.ts";
import type { Move } from "../game/moveTypes.ts";
import { createInitialGameStateForVariant } from "../game/state.ts";
import { applyMove } from "../game/applyMove.ts";
import { gameStateToFen } from "./fen.ts";
import { uciToLegalMove } from "./chessMoveMap.ts";
import { createPrng } from "../shared/prng.ts";

function normalizeFenForBook(fen: string): string {
  // Keep only the stable, position-identifying parts.
  // board side castling ep
  return fen.trim().split(/\s+/).slice(0, 4).join(" ");
}

function tryApplyUci(state: GameState, uci: string): GameState | null {
  const mv = uciToLegalMove(state, uci);
  if (!mv) return null;
  try {
    return applyMove(state, mv);
  } catch {
    return null;
  }
}

type BookEntry = {
  line: string[];
  replies: string[];
};

function buildBookMap(): Map<string, string[]> {
  // A tiny curated opening book (Classic Chess only).
  // Represented as: a move line from the start position -> good replies.
  const entries: BookEntry[] = [
    { line: [], replies: ["e2e4", "d2d4", "c2c4", "g1f3"] },

    // Replies to 1st moves
    { line: ["e2e4"], replies: ["e7e5", "c7c5", "e7e6", "c7c6"] },
    { line: ["d2d4"], replies: ["d7d5", "g8f6", "e7e6"] },
    { line: ["c2c4"], replies: ["e7e5", "g8f6", "c7c5"] },
    { line: ["g1f3"], replies: ["d7d5", "g8f6", "c7c5", "e7e5"] },

    // A few mainline continuations
    { line: ["e2e4", "e7e5"], replies: ["g1f3", "f1c4", "d2d4"] },
    { line: ["e2e4", "c7c5"], replies: ["g1f3", "d2d4", "c2c3"] },
    { line: ["e2e4", "e7e6"], replies: ["d2d4", "b1c3", "g1f3"] },
    { line: ["e2e4", "c7c6"], replies: ["d2d4", "b1c3", "g1f3"] },

    { line: ["d2d4", "d7d5"], replies: ["c2c4", "g1f3", "e2e3"] },
    { line: ["d2d4", "g8f6"], replies: ["c2c4", "g1f3", "e2e3"] },

    { line: ["c2c4", "e7e5"], replies: ["b1c3", "g1f3", "d2d3"] },
    { line: ["c2c4", "g8f6"], replies: ["b1c3", "g1f3", "g2g3"] },

    { line: ["g1f3", "d7d5"], replies: ["d2d4", "g2g3", "c2c4"] },
    { line: ["g1f3", "g8f6"], replies: ["d2d4", "g2g3", "c2c4"] },
  ];

  const start = createInitialGameStateForVariant("chess_classic" as any);

  const map = new Map<string, string[]>();
  for (const e of entries) {
    let s: GameState | null = start;
    for (const uci of e.line) {
      if (!s) break;
      s = tryApplyUci(s, uci);
    }
    if (!s) continue;

    const key = normalizeFenForBook(gameStateToFen(s));
    const prev = map.get(key) ?? [];

    // Merge + dedupe in insertion order.
    const merged: string[] = prev.slice();
    for (const r of e.replies) {
      if (!merged.includes(r)) merged.push(r);
    }

    map.set(key, merged);
  }

  return map;
}

const BOOK_BY_FEN = buildBookMap();

export function pickBookMoveChess(state: GameState, opts: { seed: string }): Move | null {
  if (state.meta?.rulesetId !== "chess") return null;

  const key = normalizeFenForBook(gameStateToFen(state));
  const replies = BOOK_BY_FEN.get(key);
  if (!replies || replies.length === 0) return null;

  // Choose a legal reply (some may be illegal due to non-book transpositions).
  const rng = createPrng(opts.seed);
  const shuffled = replies.slice();
  rng.shuffleInPlace(shuffled);

  for (const uci of shuffled) {
    const mv = uciToLegalMove(state, uci);
    if (mv) return mv;
  }

  return null;
}
