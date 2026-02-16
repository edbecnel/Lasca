import type { GameState, NodeId } from "./state.ts";
import type { Move, CaptureMove } from "./moveTypes.ts";
import type { Piece, Player, Stack } from "../types.ts";
import { inBounds, makeNodeId, parseNodeId } from "./coords.ts";
import { applyMove } from "./applyMove.ts";

function getTop(stack: Stack | undefined): Piece | null {
  if (!stack || stack.length === 0) return null;
  return stack[stack.length - 1] ?? null;
}

function topAt(state: GameState, nodeId: NodeId): Piece | null {
  return getTop(state.board.get(nodeId));
}

function isEmpty(state: GameState, nodeId: NodeId): boolean {
  const s = state.board.get(nodeId);
  return !s || s.length === 0;
}

function isEnemyTop(state: GameState, nodeId: NodeId, player: Player): boolean {
  const top = topAt(state, nodeId);
  return Boolean(top && top.owner !== player);
}

function isOwnTop(state: GameState, nodeId: NodeId, player: Player): boolean {
  const top = topAt(state, nodeId);
  return Boolean(top && top.owner === player);
}

function opponentOf(p: Player): Player {
  return p === "W" ? "B" : "W";
}

function canCaptureTopOnSquare(state: GameState, capturer: Player, square: NodeId): boolean {
  const top = topAt(state, square);
  if (!top) return false;
  if (top.owner === capturer) return false;
  if (top.rank === "K") return false;
  return true;
}

function findKingSquare(state: GameState, player: Player): NodeId | null {
  for (const [nodeId, stack] of state.board.entries()) {
    const top = getTop(stack);
    if (top && top.owner === player && top.rank === "K") return nodeId;
  }
  return null;
}

function pawnDir(player: Player): number {
  // White starts on row 6/7 and moves upward (toward row 0).
  return player === "W" ? -1 : 1;
}

function pawnStartRow(player: Player): number {
  return player === "W" ? 6 : 1;
}

function pawnPromotionRow(player: Player): number {
  return player === "W" ? 0 : 7;
}

function addIfInBounds(out: Move[], move: Move, r: number, c: number, boardSize: 7 | 8): void {
  if (!inBounds(r, c, boardSize)) return;
  out.push(move);
}

function generateSlidingMoves(state: GameState, from: NodeId, player: Player, dirs: Array<{ dr: number; dc: number }>): Move[] {
  const boardSize = state.meta?.boardSize ?? 8;
  const { r: r0, c: c0 } = parseNodeId(from);
  const out: Move[] = [];

  for (const { dr, dc } of dirs) {
    let r = r0 + dr;
    let c = c0 + dc;
    while (inBounds(r, c, boardSize)) {
      const to = makeNodeId(r, c);
      if (isEmpty(state, to)) {
        out.push({ kind: "move", from, to });
      } else {
        if (canCaptureTopOnSquare(state, player, to)) out.push({ kind: "capture", from, over: to, to } as CaptureMove);
        break;
      }
      r += dr;
      c += dc;
    }
  }

  return out;
}

function isSquareAttackedByPawn(attacker: Player, from: NodeId, target: NodeId): boolean {
  const { r: fr, c: fc } = parseNodeId(from);
  const { r: tr, c: tc } = parseNodeId(target);
  const dr = pawnDir(attacker);
  return tr === fr + dr && (tc === fc - 1 || tc === fc + 1);
}

function isSquareAttackedByKnight(from: NodeId, target: NodeId): boolean {
  const a = parseNodeId(from);
  const b = parseNodeId(target);
  const dr = Math.abs(b.r - a.r);
  const dc = Math.abs(b.c - a.c);
  return (dr === 1 && dc === 2) || (dr === 2 && dc === 1);
}

function isSquareAttackedByKing(from: NodeId, target: NodeId): boolean {
  const a = parseNodeId(from);
  const b = parseNodeId(target);
  const dr = Math.abs(b.r - a.r);
  const dc = Math.abs(b.c - a.c);
  return dr <= 1 && dc <= 1 && (dr + dc) > 0;
}

function isSquareAttackedBySlider(
  state: GameState,
  from: NodeId,
  target: NodeId,
  dirs: Array<{ dr: number; dc: number }>
): boolean {
  const boardSize = state.meta?.boardSize ?? 8;
  const a = parseNodeId(from);
  const b = parseNodeId(target);

  for (const { dr, dc } of dirs) {
    let r = a.r + dr;
    let c = a.c + dc;
    while (inBounds(r, c, boardSize)) {
      const id = makeNodeId(r, c);
      if (id === target) return true;
      if (!isEmpty(state, id)) break;
      r += dr;
      c += dc;
    }

    // If we walked off board without hitting target, try next dir.
    // (This intentionally doesn't consider multiple paths.)
  }

  // For exact alignment, we also need the target to be reachable along a dir.
  // The loop above only returns true when it reaches target.
  // So returning false is correct here.
  return false;
}

export function isKingInCheckColumnsChess(state: GameState, player: Player): boolean {
  const kingSq = findKingSquare(state, player);
  if (!kingSq) return true;
  const attacker = opponentOf(player);
  return isSquareAttackedColumnsChess(state, kingSq, attacker);
}

export function isSquareAttackedColumnsChess(state: GameState, square: NodeId, byPlayer: Player): boolean {
  for (const [from, stack] of state.board.entries()) {
    const top = getTop(stack);
    if (!top || top.owner !== byPlayer) continue;

    switch (top.rank) {
      case "P": {
        if (isSquareAttackedByPawn(byPlayer, from, square)) return true;
        break;
      }
      case "N": {
        if (isSquareAttackedByKnight(from, square)) return true;
        break;
      }
      case "B": {
        const diag = [
          { dr: -1, dc: -1 },
          { dr: -1, dc: 1 },
          { dr: 1, dc: -1 },
          { dr: 1, dc: 1 },
        ];
        if (isSquareAttackedBySlider(state, from, square, diag)) return true;
        break;
      }
      case "R": {
        const ortho = [
          { dr: -1, dc: 0 },
          { dr: 1, dc: 0 },
          { dr: 0, dc: -1 },
          { dr: 0, dc: 1 },
        ];
        if (isSquareAttackedBySlider(state, from, square, ortho)) return true;
        break;
      }
      case "Q": {
        const dirs = [
          { dr: -1, dc: -1 },
          { dr: -1, dc: 1 },
          { dr: 1, dc: -1 },
          { dr: 1, dc: 1 },
          { dr: -1, dc: 0 },
          { dr: 1, dc: 0 },
          { dr: 0, dc: -1 },
          { dr: 0, dc: 1 },
        ];
        if (isSquareAttackedBySlider(state, from, square, dirs)) return true;
        break;
      }
      case "K": {
        if (isSquareAttackedByKing(from, square)) return true;
        break;
      }
      default:
        break;
    }
  }

  return false;
}

function canCastle(state: GameState, player: Player, side: "kingSide" | "queenSide"): { from: NodeId; to: NodeId } | null {
  const boardSize = state.meta?.boardSize ?? 8;
  if (boardSize !== 8) return null;

  const rights = state.chess?.castling?.[player]?.[side];
  if (!rights) return null;

  const homeRow = player === "W" ? 7 : 0;
  const kingFrom = makeNodeId(homeRow, 4);
  const kingTop = topAt(state, kingFrom);
  if (!kingTop || kingTop.owner !== player || kingTop.rank !== "K") return null;

  const rookCol = side === "kingSide" ? 7 : 0;
  const rookFrom = makeNodeId(homeRow, rookCol);
  const rookTop = topAt(state, rookFrom);
  if (!rookTop || rookTop.owner !== player || rookTop.rank !== "R") return null;

  const betweenCols = side === "kingSide" ? [5, 6] : [1, 2, 3];
  for (const c of betweenCols) {
    if (!isEmpty(state, makeNodeId(homeRow, c))) return null;
  }

  // King cannot castle out of/through/into check.
  const opp = opponentOf(player);
  if (isKingInCheckColumnsChess(state, player)) return null;

  const passCols = side === "kingSide" ? [5, 6] : [3, 2];
  for (const c of passCols) {
    const sq = makeNodeId(homeRow, c);
    if (isSquareAttackedColumnsChess(state, sq, opp)) return null;
  }

  const kingTo = side === "kingSide" ? makeNodeId(homeRow, 6) : makeNodeId(homeRow, 2);
  return { from: kingFrom, to: kingTo };
}

function generatePseudoMovesForPiece(state: GameState, from: NodeId, piece: Piece): Move[] {
  const boardSize = state.meta?.boardSize ?? 8;
  const player = piece.owner;
  const { r, c } = parseNodeId(from);
  const out: Move[] = [];

  if (piece.rank === "P") {
    const dr = pawnDir(player);

    // Forward 1
    const r1 = r + dr;
    if (inBounds(r1, c, boardSize)) {
      const to1 = makeNodeId(r1, c);
      if (isEmpty(state, to1)) {
        out.push({ kind: "move", from, to: to1 });

        // Forward 2 from start
        const startRow = pawnStartRow(player);
        const r2 = r + 2 * dr;
        if (r === startRow && inBounds(r2, c, boardSize)) {
          const to2 = makeNodeId(r2, c);
          if (isEmpty(state, to2)) {
            out.push({ kind: "move", from, to: to2 });
          }
        }
      }
    }

    // Captures
    for (const dc of [-1, 1]) {
      const rr = r + dr;
      const cc = c + dc;
      if (!inBounds(rr, cc, boardSize)) continue;
      const to = makeNodeId(rr, cc);
      const targetTop = topAt(state, to);
      if (targetTop && targetTop.owner !== player && targetTop.rank !== "K") {
        out.push({ kind: "capture", from, over: to, to } as CaptureMove);
      }
    }

    // En passant
    const epTarget = state.chess?.enPassantTarget;
    const epPawn = state.chess?.enPassantPawn;
    if (epTarget && epPawn) {
      const t = parseNodeId(epTarget);
      const isDiagToTarget = t.r === r + dr && (t.c === c - 1 || t.c === c + 1);
      if (isDiagToTarget && isEmpty(state, epTarget)) {
        const pawnTop = topAt(state, epPawn);
        if (pawnTop && pawnTop.owner !== player && pawnTop.rank === "P") {
          out.push({ kind: "capture", from, over: epPawn, to: epTarget } as CaptureMove);
        }
      }
    }

    return out;
  }

  if (piece.rank === "N") {
    const jumps = [
      { dr: -2, dc: -1 },
      { dr: -2, dc: 1 },
      { dr: -1, dc: -2 },
      { dr: -1, dc: 2 },
      { dr: 1, dc: -2 },
      { dr: 1, dc: 2 },
      { dr: 2, dc: -1 },
      { dr: 2, dc: 1 },
    ];
    for (const j of jumps) {
      const rr = r + j.dr;
      const cc = c + j.dc;
      if (!inBounds(rr, cc, boardSize)) continue;
      const to = makeNodeId(rr, cc);
      const top = topAt(state, to);
      if (!top) {
        out.push({ kind: "move", from, to });
      } else if (top.owner !== player && top.rank !== "K") {
        out.push({ kind: "capture", from, over: to, to } as CaptureMove);
      }
    }
    return out;
  }

  if (piece.rank === "B") {
    return generateSlidingMoves(state, from, player, [
      { dr: -1, dc: -1 },
      { dr: -1, dc: 1 },
      { dr: 1, dc: -1 },
      { dr: 1, dc: 1 },
    ]);
  }

  if (piece.rank === "R") {
    return generateSlidingMoves(state, from, player, [
      { dr: -1, dc: 0 },
      { dr: 1, dc: 0 },
      { dr: 0, dc: -1 },
      { dr: 0, dc: 1 },
    ]);
  }

  if (piece.rank === "Q") {
    return generateSlidingMoves(state, from, player, [
      { dr: -1, dc: -1 },
      { dr: -1, dc: 1 },
      { dr: 1, dc: -1 },
      { dr: 1, dc: 1 },
      { dr: -1, dc: 0 },
      { dr: 1, dc: 0 },
      { dr: 0, dc: -1 },
      { dr: 0, dc: 1 },
    ]);
  }

  if (piece.rank === "K") {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const rr = r + dr;
        const cc = c + dc;
        if (!inBounds(rr, cc, boardSize)) continue;
        const to = makeNodeId(rr, cc);
        const top = topAt(state, to);
        if (!top) {
          out.push({ kind: "move", from, to });
        } else if (top.owner !== player && top.rank !== "K") {
          out.push({ kind: "capture", from, over: to, to } as CaptureMove);
        }
      }
    }

    const ks = canCastle(state, player, "kingSide");
    if (ks && ks.from === from) out.push({ kind: "move", from: ks.from, to: ks.to });

    const qs = canCastle(state, player, "queenSide");
    if (qs && qs.from === from) out.push({ kind: "move", from: qs.from, to: qs.to });

    return out;
  }

  // Unknown rank under this ruleset; no moves.
  return out;
}

export function generateLegalMovesColumnsChess(state: GameState): Move[] {
  const player = state.toMove;

  const pseudo: Move[] = [];
  for (const [from, stack] of state.board.entries()) {
    const top = getTop(stack);
    if (!top || top.owner !== player) continue;
    pseudo.push(...generatePseudoMovesForPiece(state, from, top));
  }

  // Filter out moves that leave our king in check.
  const legal: Move[] = [];
  for (const m of pseudo) {
    try {
      const next = applyMove(state, m);
      if (!isKingInCheckColumnsChess(next, player)) {
        legal.push(m);
      }
    } catch {
      // Illegal move application => not legal.
    }
  }

  // Prefer consistent ordering: quiet moves first, then captures.
  // (Chess has no mandatory capture; this helps UI avoid accidental mandatory-capture mode.)
  legal.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "move" ? -1 : 1));

  return legal;
}

export function generateCaptureMovesColumnsChess(state: GameState): CaptureMove[] {
  return generateLegalMovesColumnsChess(state).filter((m): m is CaptureMove => m.kind === "capture");
}
