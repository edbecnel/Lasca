import type { GameState, NodeId } from "./state.ts";
import type { Move } from "./moveTypes.ts";
import type { Piece, Player, Stack } from "../types.ts";
import { parseNodeId, makeNodeId } from "./coords.ts";

function cloneStackDeep(s: Stack): Stack {
  return s.map((p) => ({ ...p }));
}

function getTop(stack: Stack | undefined): Piece | null {
  if (!stack || stack.length === 0) return null;
  return stack[stack.length - 1] ?? null;
}

function opponentOf(p: Player): Player {
  return p === "W" ? "B" : "W";
}

function isHomeRow(player: Player, r: number): boolean {
  return (player === "W" && r === 7) || (player === "B" && r === 0);
}

function rookStartSquare(player: Player, side: "kingSide" | "queenSide"): NodeId {
  const r = player === "W" ? 7 : 0;
  const c = side === "kingSide" ? 7 : 0;
  return makeNodeId(r, c);
}

function updateCastlingRightsAfterMove(args: {
  nextChess: NonNullable<GameState["chess"]>;
  mover: Player;
  movedTop: Piece;
  move: Move;
  capturedTop: Piece | null;
  capturedSquare: NodeId | null;
}): void {
  const { nextChess, mover, movedTop, move, capturedTop, capturedSquare } = args;

  // King move disables both sides.
  if (movedTop.rank === "K") {
    nextChess.castling[mover].kingSide = false;
    nextChess.castling[mover].queenSide = false;
  }

  // Rook move from its start square disables that side.
  if (movedTop.rank === "R") {
    if (move.from === rookStartSquare(mover, "kingSide")) nextChess.castling[mover].kingSide = false;
    if (move.from === rookStartSquare(mover, "queenSide")) nextChess.castling[mover].queenSide = false;
  }

  // Capturing a rook on its start square disables opponent's rights for that side.
  if (capturedTop && capturedTop.rank === "R" && capturedSquare) {
    const opp = opponentOf(mover);
    if (capturedSquare === rookStartSquare(opp, "kingSide")) nextChess.castling[opp].kingSide = false;
    if (capturedSquare === rookStartSquare(opp, "queenSide")) nextChess.castling[opp].queenSide = false;
  }
}

function maybePromotePawn(piece: Piece, player: Player, to: NodeId): boolean {
  if (piece.owner !== player || piece.rank !== "P") return false;
  const { r } = parseNodeId(to);
  const promoRow = player === "W" ? 0 : 7;
  if (r !== promoRow) return false;

  // Auto-queen for now.
  piece.rank = "Q";
  return true;
}

export function applyMoveChess(state: GameState, move: Move): GameState & { didPromote?: boolean } {
  const boardSize = state.meta?.boardSize ?? 8;
  if (boardSize !== 8) throw new Error("Chess requires an 8×8 board");

  const moving0 = state.board.get(move.from);
  if (!moving0 || moving0.length === 0) throw new Error(`applyMoveChess: no piece at ${move.from}`);
  if (moving0.length !== 1) throw new Error("applyMoveChess: invalid stack in classic chess");

  // IMPORTANT: deep-clone the moving stack so promotion (rank mutation)
  // cannot mutate the input state's piece objects.
  const moving = cloneStackDeep(moving0);
  const movedTop = getTop(moving);
  if (!movedTop) throw new Error(`applyMoveChess: no piece at ${move.from}`);
  if (movedTop.owner !== state.toMove) throw new Error("applyMoveChess: not your piece");

  // Clone board shallowly, but clone only touched stacks.
  const nextBoard = new Map(state.board);

  const nextChess: NonNullable<GameState["chess"]> = {
    castling: {
      W: { kingSide: Boolean(state.chess?.castling?.W?.kingSide), queenSide: Boolean(state.chess?.castling?.W?.queenSide) },
      B: { kingSide: Boolean(state.chess?.castling?.B?.kingSide), queenSide: Boolean(state.chess?.castling?.B?.queenSide) },
    },
  };

  let didPromote = false;

  // Clear en passant by default; re-set it only on a fresh pawn double-step.
  const { r: fr, c: fc } = parseNodeId(move.from);
  const { r: tr, c: tc } = parseNodeId(move.to);

  // Castling: king moves two squares on home rank.
  if (move.kind === "move" && movedTop.rank === "K" && fr === tr && isHomeRow(movedTop.owner, fr) && Math.abs(tc - fc) === 2) {
    const side: "kingSide" | "queenSide" = tc > fc ? "kingSide" : "queenSide";
    const rookFrom = rookStartSquare(movedTop.owner, side);
    const rookStack0 = nextBoard.get(rookFrom);
    if (!rookStack0 || rookStack0.length !== 1) throw new Error("applyMoveChess: missing rook for castling");

    const rookStack = cloneStackDeep(rookStack0);
    const rookTop = getTop(rookStack);
    if (!rookTop || rookTop.owner !== movedTop.owner || rookTop.rank !== "R") throw new Error("applyMoveChess: invalid rook for castling");

    const rookTo = side === "kingSide" ? makeNodeId(fr, 5) : makeNodeId(fr, 3);

    if (nextBoard.get(move.to)?.length) throw new Error("applyMoveChess: castling destination not empty");
    if (nextBoard.get(rookTo)?.length) throw new Error("applyMoveChess: castling rook destination not empty");

    nextBoard.delete(move.from);
    nextBoard.set(move.to, moving);

    nextBoard.delete(rookFrom);
    nextBoard.set(rookTo, rookStack);

    // Castling always consumes both rights.
    nextChess.castling[movedTop.owner].kingSide = false;
    nextChess.castling[movedTop.owner].queenSide = false;

    return {
      ...state,
      board: nextBoard,
      toMove: opponentOf(state.toMove),
      phase: "idle",
      chess: nextChess,
      didPromote: false,
    };
  }

  if (move.kind === "move") {
    // Quiet move must land on empty square.
    const dest = nextBoard.get(move.to);
    if (dest && dest.length > 0) throw new Error(`applyMoveChess: destination ${move.to} is occupied`);

    nextBoard.delete(move.from);
    nextBoard.set(move.to, moving);

    // En passant: only set when a pawn moves two squares.
    if (movedTop.rank === "P" && Math.abs(tr - fr) === 2 && fc === tc) {
      const dir = movedTop.owner === "W" ? -1 : 1;
      const passedOver = makeNodeId(fr + dir, fc);
      nextChess.enPassantTarget = passedOver;
      nextChess.enPassantPawn = move.to;
    }

    didPromote = maybePromotePawn(movedTop, movedTop.owner, move.to);

    updateCastlingRightsAfterMove({
      nextChess,
      mover: movedTop.owner,
      movedTop,
      move,
      capturedTop: null,
      capturedSquare: null,
    });

    return {
      ...state,
      board: nextBoard,
      toMove: opponentOf(state.toMove),
      phase: "idle",
      chess: nextChess,
      didPromote,
    };
  }

  // Capture
  const captureSquare = move.over;
  const targetStack0 = nextBoard.get(captureSquare);
  if (!targetStack0 || targetStack0.length !== 1) throw new Error(`applyMoveChess: no capture target at ${captureSquare}`);

  const targetStack = cloneStackDeep(targetStack0);
  const capturedTop = getTop(targetStack);
  if (!capturedTop) throw new Error("applyMoveChess: invalid capture target");
  if (capturedTop.owner === movedTop.owner) throw new Error("applyMoveChess: cannot capture own piece");
  if (capturedTop.rank === "K") throw new Error("applyMoveChess: cannot capture the king");

  // En passant capture: destination is empty and capture square is the pawn.
  const isEnPassant = move.to !== captureSquare;
  if (isEnPassant) {
    const epT = state.chess?.enPassantTarget;
    const epP = state.chess?.enPassantPawn;
    if (!epT || !epP) throw new Error("applyMoveChess: en passant not available");
    if (epT !== move.to || epP !== captureSquare) throw new Error("applyMoveChess: invalid en passant capture");

    const destStack0 = nextBoard.get(move.to);
    if (destStack0 && destStack0.length > 0) throw new Error("applyMoveChess: en passant destination occupied");
  } else {
    // Normal capture must land on the captured square.
    if (move.to !== captureSquare) throw new Error("applyMoveChess: invalid capture destination");
  }

  // Remove captured piece.
  nextBoard.delete(captureSquare);

  // Move the capturing piece.
  nextBoard.delete(move.from);
  nextBoard.set(move.to, moving);

  didPromote = maybePromotePawn(movedTop, movedTop.owner, move.to);

  updateCastlingRightsAfterMove({
    nextChess,
    mover: movedTop.owner,
    movedTop,
    move,
    capturedTop,
    capturedSquare: captureSquare,
  });

  return {
    ...state,
    board: nextBoard,
    toMove: opponentOf(state.toMove),
    phase: "idle",
    chess: nextChess,
    didPromote,
  };
}
