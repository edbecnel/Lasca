import type { GameState } from "../game/state.ts";
import { nodeIdToA1 } from "../game/coordFormat.ts";

function nodeIdToAlgebraicLower(nodeId: string): string {
  // nodeIdToA1 uses A..H + 1..8; FEN wants lowercase file.
  return nodeIdToA1(nodeId, 8).toLowerCase();
}

function pieceToFenChar(owner: "W" | "B", rank: string): string {
  // For chess-like rulesets ranks are standard chess pieces.
  const upper = String(rank).toUpperCase();
  const ch = owner === "W" ? upper : upper.toLowerCase();
  return ch;
}

export function gameStateToFen(state: GameState, opts?: { fullmove?: number; halfmove?: number }): string {
  const rulesetId = state.meta?.rulesetId ?? "lasca";
  if (rulesetId !== "chess" && rulesetId !== "columns_chess") {
    throw new Error(`FEN is only supported for chess-like rulesets (got: ${rulesetId})`);
  }

  const boardSize = 8;
  const rows: string[] = [];

  for (let r = 0; r < boardSize; r++) {
    let empties = 0;
    let row = "";
    for (let c = 0; c < boardSize; c++) {
      const id = `r${r}c${c}`;
      const stack = state.board.get(id);
      const piece = stack?.[0];
      if (!piece) {
        empties++;
        continue;
      }
      if (empties > 0) {
        row += String(empties);
        empties = 0;
      }
      row += pieceToFenChar(piece.owner, piece.rank);
    }
    if (empties > 0) row += String(empties);
    rows.push(row);
  }

  const side = state.toMove === "W" ? "w" : "b";

  const castling = (() => {
    const c = state.chess?.castling;
    if (!c) return "-";
    let s = "";
    if (c.W.kingSide) s += "K";
    if (c.W.queenSide) s += "Q";
    if (c.B.kingSide) s += "k";
    if (c.B.queenSide) s += "q";
    return s.length > 0 ? s : "-";
  })();

  const ep = state.chess?.enPassantTarget ? nodeIdToAlgebraicLower(state.chess.enPassantTarget) : "-";

  const halfmove = Number.isFinite(opts?.halfmove) ? Math.max(0, Math.round(opts!.halfmove!)) : 0;
  const fullmove = Number.isFinite(opts?.fullmove) ? Math.max(1, Math.round(opts!.fullmove!)) : 1;

  return `${rows.join("/")} ${side} ${castling} ${ep} ${halfmove} ${fullmove}`;
}

export function uciSquareToNodeId(sq: string): string {
  const s = String(sq).trim().toLowerCase();
  if (!/^[a-h][1-8]$/.test(s)) throw new Error(`Invalid UCI square: ${sq}`);
  const file = s.charCodeAt(0) - "a".charCodeAt(0);
  const rank = Number(s[1]);
  const row = 8 - rank;
  const col = file;
  return `r${row}c${col}`;
}

export function uciMoveToFromTo(uci: string): { from: string; to: string; promo?: string } {
  const s = String(uci).trim().toLowerCase();
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(s)) {
    throw new Error(`Invalid UCI move: ${uci}`);
  }
  const from = s.slice(0, 2);
  const to = s.slice(2, 4);
  const promo = s.length === 5 ? s.slice(4, 5) : undefined;
  return { from, to, promo };
}
