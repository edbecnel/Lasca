import type { GameState, NodeId } from "./state.ts";
import type { Move } from "./moveTypes.ts";
import type { Piece, Player, Stack } from "../types.ts";
import { parseNodeId, makeNodeId } from "./coords.ts";
import { hashGameStateForKo } from "./hashState.ts";

function cloneStack(s: Stack): Stack {
  return s.slice();
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
  prev: GameState;
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

function maybePromotePawn(stack: Stack, player: Player, to: NodeId): boolean {
  const top = getTop(stack);
  if (!top || top.owner !== player || top.rank !== "P") return false;
  const { r } = parseNodeId(to);
  const promoRow = player === "W" ? 0 : 7;
  if (r !== promoRow) return false;

  // Auto-queen for now.
  top.rank = "Q";
  return true;
}

export function applyMoveColumnsChess(state: GameState, move: Move): GameState & { didPromote?: boolean } {
  const boardSize = state.meta?.boardSize ?? 8;
  if (boardSize !== 8) throw new Error("Columns Chess requires an 8×8 board");

  const koProhibitHash = typeof state.chess?.koProhibitHash === "string" ? state.chess.koProhibitHash : undefined;

  const finalize = (next: GameState & { didPromote?: boolean }): GameState & { didPromote?: boolean } => {
    // If the previous move was a capture, prohibit recreating the pre-capture position.
    if (koProhibitHash && hashGameStateForKo(next) === koProhibitHash) {
      throw new Error("applyMoveColumnsChess: ko (immediate recapture prohibited)");
    }

    // After any capture, set a new ko target for the opponent: the (ko-normalized) hash
    // of the position before this capture. After any non-capture, ko is cleared.
    if (move.kind === "capture") {
      if (next.chess) next.chess.koProhibitHash = hashGameStateForKo(state);
    } else {
      if (next.chess && typeof (next.chess as any).koProhibitHash !== "undefined") {
        delete (next.chess as any).koProhibitHash;
      }
    }

    return next;
  };

  const moving0 = state.board.get(move.from);
  if (!moving0 || moving0.length === 0) throw new Error(`applyMoveColumnsChess: no moving stack at ${move.from}`);

  const moving = cloneStack(moving0);
  const movedTop = getTop(moving);
  if (!movedTop) throw new Error(`applyMoveColumnsChess: no top piece at ${move.from}`);
  if (movedTop.owner !== state.toMove) throw new Error("applyMoveColumnsChess: not your piece");

  // Clone board shallowly, but clone only touched stacks.
  const nextBoard = new Map(state.board);
  nextBoard.set(move.from, moving);

  const nextChess: NonNullable<GameState["chess"]> = {
    castling: {
      W: { kingSide: Boolean(state.chess?.castling?.W?.kingSide), queenSide: Boolean(state.chess?.castling?.W?.queenSide) },
      B: { kingSide: Boolean(state.chess?.castling?.B?.kingSide), queenSide: Boolean(state.chess?.castling?.B?.queenSide) },
    },
  };

  let didPromote = false;

  // Clear en passant by default; re-set it only on a fresh pawn double-step.
  // (This matches standard chess.)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const prevEpTarget = state.chess?.enPassantTarget;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const prevEpPawn = state.chess?.enPassantPawn;

  const clearEnPassant = (): void => {
    // Leave as undefined to keep save files small.
  };
  clearEnPassant();

  const { r: fr, c: fc } = parseNodeId(move.from);
  const { r: tr, c: tc } = parseNodeId(move.to);

  // Castling: king moves two squares on home rank.
  if (move.kind === "move" && movedTop.rank === "K" && fr === tr && isHomeRow(movedTop.owner, fr) && Math.abs(tc - fc) === 2) {
    const side: "kingSide" | "queenSide" = tc > fc ? "kingSide" : "queenSide";
    const rookFrom = rookStartSquare(movedTop.owner, side);
    const rookStack0 = nextBoard.get(rookFrom);
    if (!rookStack0 || rookStack0.length === 0) throw new Error("applyMoveColumnsChess: missing rook for castling");

    const rookStack = cloneStack(rookStack0);
    const rookTop = getTop(rookStack);
    if (!rookTop || rookTop.owner !== movedTop.owner || rookTop.rank !== "R") throw new Error("applyMoveColumnsChess: invalid rook for castling");

    const rookTo = side === "kingSide" ? makeNodeId(fr, 5) : makeNodeId(fr, 3);

    if (nextBoard.get(move.to)?.length) throw new Error("applyMoveColumnsChess: castling destination not empty");
    if (nextBoard.get(rookTo)?.length) throw new Error("applyMoveColumnsChess: castling rook destination not empty");

    nextBoard.delete(move.from);
    nextBoard.set(move.to, moving);

    nextBoard.delete(rookFrom);
    nextBoard.set(rookTo, rookStack);

    // Castling always consumes both rights.
    nextChess.castling[movedTop.owner].kingSide = false;
    nextChess.castling[movedTop.owner].queenSide = false;

    return finalize({
      ...state,
      board: nextBoard,
      toMove: opponentOf(state.toMove),
      phase: "idle",
      chess: nextChess,
      didPromote: false,
    });
  }

  if (move.kind === "move") {
    // Quiet move must land on empty square.
    const dest = nextBoard.get(move.to);
    if (dest && dest.length > 0) throw new Error(`applyMoveColumnsChess: destination ${move.to} is occupied`);

    nextBoard.delete(move.from);
    nextBoard.set(move.to, moving);

    // En passant: only set when a pawn moves two squares.
    if (movedTop.rank === "P" && Math.abs(tr - fr) === 2 && fc === tc) {
      const dir = movedTop.owner === "W" ? -1 : 1;
      const passedOver = makeNodeId(fr + dir, fc);
      nextChess.enPassantTarget = passedOver;
      nextChess.enPassantPawn = move.to;
    }

    didPromote = maybePromotePawn(moving, movedTop.owner, move.to);

    updateCastlingRightsAfterMove({
      prev: state,
      nextChess,
      mover: movedTop.owner,
      movedTop,
      move,
      capturedTop: null,
      capturedSquare: null,
    });

    return finalize({
      ...state,
      board: nextBoard,
      toMove: opponentOf(state.toMove),
      phase: "idle",
      chess: nextChess,
      didPromote,
    });
  }

  // Capture
  const captureSquare = move.over;
  const targetStack0 = nextBoard.get(captureSquare);
  if (!targetStack0 || targetStack0.length === 0) throw new Error(`applyMoveColumnsChess: no target to capture at ${captureSquare}`);

  const targetStack = cloneStack(targetStack0);
  const capturedTop = getTop(targetStack);
  if (!capturedTop) throw new Error("applyMoveColumnsChess: invalid capture target");
  if (capturedTop.owner === movedTop.owner) throw new Error("applyMoveColumnsChess: cannot capture own piece");
  if (capturedTop.rank === "K") throw new Error("applyMoveColumnsChess: cannot capture the king");

  // Remove captured piece from the target square (top-only capture).
  const capturedPiece = targetStack.pop()!;

  // Columns Chess capture semantics:
  // - Only the *top* piece is captured.
  // - The remainder of the captured stack moves back onto the origin square (move.from).
  // - The capture square itself becomes empty (so the capturing stack can occupy move.to).
  nextBoard.delete(captureSquare);

  // Destination square must be empty after we remove the captured stack.
  // (Normal capture lands on the captured square; en passant lands on an empty square.)
  const destStack0 = nextBoard.get(move.to);
  if (destStack0 && destStack0.length > 0) throw new Error("applyMoveColumnsChess: capture destination occupied");

  // Captured piece stacks under the mover.
  moving.unshift(capturedPiece);

  // Origin square receives remainder of the captured stack (if any).
  if (targetStack.length > 0) nextBoard.set(move.from, targetStack);
  else nextBoard.delete(move.from);

  nextBoard.set(move.to, moving);

  // Clear en passant after any capture.

  didPromote = maybePromotePawn(moving, movedTop.owner, move.to);

  updateCastlingRightsAfterMove({
    prev: state,
    nextChess,
    mover: movedTop.owner,
    movedTop,
    move,
    capturedTop,
    capturedSquare: captureSquare,
  });

  return finalize({
    ...state,
    board: nextBoard,
    toMove: opponentOf(state.toMove),
    phase: "idle",
    chess: nextChess,
    didPromote,
  });
}
