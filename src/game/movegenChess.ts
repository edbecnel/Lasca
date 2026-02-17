import type { GameState } from "./state.ts";
import type { Move, CaptureMove } from "./moveTypes.ts";
import type { Player } from "../types.ts";
import {
  generateCaptureMovesColumnsChess,
  generateLegalMovesColumnsChess,
  isKingInCheckColumnsChess,
  isSquareAttackedColumnsChess,
} from "./movegenColumnsChess.ts";

export function isKingInCheckChess(state: GameState, player: Player): boolean {
  return isKingInCheckColumnsChess(state, player);
}

export function isSquareAttackedChess(state: GameState, square: string, byPlayer: Player): boolean {
  return isSquareAttackedColumnsChess(state, square, byPlayer);
}

export function generateLegalMovesChess(state: GameState): Move[] {
  return generateLegalMovesColumnsChess(state);
}

export function generateCaptureMovesChess(state: GameState): CaptureMove[] {
  return generateCaptureMovesColumnsChess(state);
}
