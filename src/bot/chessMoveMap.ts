import type { GameState } from "../game/state.ts";
import type { Move } from "../game/moveTypes.ts";
import { generateLegalMoves } from "../game/movegen.ts";
import { uciMoveToFromTo, uciSquareToNodeId } from "./fen.ts";

export function uciToLegalMove(state: GameState, uci: string): Move | null {
  const parsed = uciMoveToFromTo(uci);
  const fromId = uciSquareToNodeId(parsed.from);
  const toId = uciSquareToNodeId(parsed.to);

  const legal = generateLegalMoves(state);
  const match = legal.find((m) => m.from === fromId && (m as any).to === toId);
  return match ?? null;
}
