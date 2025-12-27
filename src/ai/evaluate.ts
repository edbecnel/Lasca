import type { GameState } from "../game/state.ts";
import type { Player, Piece } from "../types.ts";
import { generateLegalMoves } from "../game/movegen.ts";
import { parseNodeId } from "../game/coords.ts";

function pieceBaseValue(p: Piece): number {
  return p.rank === "O" ? 160 : 100;
}

function depthDiscount(depthFromTop: number): number {
  // Top piece matters most. Deeper pieces still matter, but less.
  // 0 -> 1.00, 1 -> 0.55, 2 -> 0.30, 3 -> 0.17, ...
  return Math.pow(0.55, depthFromTop);
}

function promotionBonus(state: GameState, nodeId: string, top: Piece, perspective: Player): number {
  if (top.owner !== perspective) return 0;
  if (top.rank !== "S") return 0;
  const { r } = parseNodeId(nodeId);
  // Black promotes at r=6; White promotes at r=0.
  if (top.owner === "B") {
    // Closer to row 6 is better.
    const dist = 6 - r; // 1 means next move to promote.
    if (dist <= 0) return 0;
    if (dist === 1) return 22;
    if (dist === 2) return 10;
    return 0;
  }
  // White
  const dist = r - 0;
  if (dist <= 0) return 0;
  if (dist === 1) return 22;
  if (dist === 2) return 10;
  return 0;
}

function countTopControlledStacks(state: GameState, p: Player): number {
  let n = 0;
  for (const stack of state.board.values()) {
    if (!stack || stack.length === 0) continue;
    const top = stack[stack.length - 1];
    if (top.owner === p) n++;
  }
  return n;
}

function mobilityScore(state: GameState, p: Player): number {
  const s: GameState = { ...state, toMove: p };
  const moves = generateLegalMoves(s);
  return moves.length;
}

export function evaluateState(state: GameState, perspective: Player): number {
  const opp: Player = perspective === "B" ? "W" : "B";
  let score = 0;

  // Material (with depth discount) + control bonus.
  for (const [nodeId, stack] of state.board.entries()) {
    if (!stack || stack.length === 0) continue;
    const top = stack[stack.length - 1];

    // Control bonus: stacks you control are valuable.
    const height = stack.length;
    if (top.owner === perspective) score += 25 + 8 * Math.max(0, height - 1);
    else score -= 25 + 8 * Math.max(0, height - 1);

    // Piece values (top-weighted)
    for (let i = 0; i < stack.length; i++) {
      const piece = stack[stack.length - 1 - i]; // from top down
      const sgn = piece.owner === perspective ? 1 : -1;
      score += sgn * pieceBaseValue(piece) * depthDiscount(i);
    }

    score += promotionBonus(state, nodeId, top, perspective);
    score -= promotionBonus(state, nodeId, top, opp);
  }

  // Mobility / initiative
  const ownMoves = mobilityScore(state, perspective);
  const oppMoves = mobilityScore(state, opp);
  score += 2 * (ownMoves - oppMoves);

  // Slight preference for having more controllable stacks.
  score += 12 * (countTopControlledStacks(state, perspective) - countTopControlledStacks(state, opp));

  return score;
}
