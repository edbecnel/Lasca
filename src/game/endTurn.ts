import type { GameState } from "./state.ts";
import type { Player, Piece } from "../types.ts";

const DAMASCA_LONE_KING_TIMEOUT_PLIES = 10;

function pieceValue(p: Piece): number {
  return p.rank === "O" ? 1.6 : 1.0;
}

function sumMaterial(state: GameState, p: Player): number {
  let total = 0;
  for (const stack of state.board.values()) {
    if (!stack || stack.length === 0) continue;
    // Damasca uses Lasca-style stacks; count all pieces owned by p.
    for (const piece of stack) {
      if (piece.owner === p) total += pieceValue(piece);
    }
  }
  return total;
}

function countPiecesAndKings(state: GameState): {
  W: { pieces: number; kings: number };
  B: { pieces: number; kings: number };
} {
  const out = {
    W: { pieces: 0, kings: 0 },
    B: { pieces: 0, kings: 0 },
  };

  for (const stack of state.board.values()) {
    if (!stack || stack.length === 0) continue;
    for (const piece of stack) {
      out[piece.owner].pieces += 1;
      if (piece.rank === "O") out[piece.owner].kings += 1;
    }
  }

  return out;
}

function getDamascaLoneKingSide(state: GameState): Player | null {
  if ((state.meta?.rulesetId ?? "lasca") !== "damasca") return null;

  const counts = countPiecesAndKings(state);

  const whiteIsLoneKing = counts.W.pieces === 1 && counts.W.kings === 1;
  const blackIsLoneKing = counts.B.pieces === 1 && counts.B.kings === 1;

  // Require exactly one side to be the lone king.
  if (whiteIsLoneKing === blackIsLoneKing) return null;

  if (whiteIsLoneKing) {
    // Opponent must have one or more kings.
    if (counts.B.kings < 1) return null;
    return "W";
  }

  if (counts.W.kings < 1) return null;
  return "B";
}

function applyDamascaLoneKingVsKingsTimeoutAtTurnBoundary(state: GameState): GameState {
  if ((state.meta?.rulesetId ?? "lasca") !== "damasca") return state;
  if (state.forcedGameOver) return state;

  const loneKingSide = getDamascaLoneKingSide(state);
  if (!loneKingSide) {
    if (!state.damascaLoneKingVsKings) return state;
    return { ...state, damascaLoneKingVsKings: undefined };
  }

  const prev = state.damascaLoneKingVsKings;
  const plies = prev && prev.loneKingSide === loneKingSide ? prev.plies + 1 : 1;

  if (plies < DAMASCA_LONE_KING_TIMEOUT_PLIES) {
    return { ...state, damascaLoneKingVsKings: { loneKingSide, plies } };
  }

  // Timeout: decide winner by material.
  const w = sumMaterial(state, "W");
  const b = sumMaterial(state, "B");
  const winner: Player = w >= b ? "W" : "B";
  const winnerName = winner === "W" ? "White" : "Black";
  const message =
    `${winnerName} wins — lone king not captured in ${DAMASCA_LONE_KING_TIMEOUT_PLIES} moves ` +
    `(material: White ${w.toFixed(1)} / Black ${b.toFixed(1)})`;

  return {
    ...state,
    damascaLoneKingVsKings: { loneKingSide, plies },
    forcedGameOver: {
      winner,
      reasonCode: "DAMASCA_LONE_KING_TIMEOUT",
      message,
    },
  };
}

/**
 * End a turn: flip `toMove`, set `phase: idle`, and apply any turn-boundary rules.
 */
export function endTurn(state: GameState): GameState {
  const next: GameState = {
    ...state,
    toMove: state.toMove === "B" ? "W" : "B",
    phase: "idle",
  };

  return applyDamascaLoneKingVsKingsTimeoutAtTurnBoundary(next);
}
