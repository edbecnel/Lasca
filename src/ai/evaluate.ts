import type { GameState } from "../game/state.ts";
import type { Player, Piece } from "../types.ts";
import { parseNodeId } from "../game/coords.ts";

function pieceBaseValue(p: Piece): number {
  return p.rank === "O" ? 200 : 100;
}

function depthDiscount(depthFromTop: number): number {
  // Top piece matters most. Deeper pieces still matter, but less.
  // 0 -> 1.00, 1 -> 0.50, 2 -> 0.25, 3 -> 0.125, ...
  return Math.pow(0.50, depthFromTop);
}

// Center squares are more valuable for control
function centerBonus(nodeId: string): number {
  const { r, c } = parseNodeId(nodeId);
  // Center rows (2-4) and center columns are better
  const rowBonus = r >= 2 && r <= 4 ? 10 : 0;
  const colBonus = c >= 1 && c <= 5 ? 5 : 0;
  return rowBonus + colBonus;
}

// Advancement bonus - pieces closer to promotion are more valuable
function advancementBonus(nodeId: string, piece: Piece): number {
  if (piece.rank === "O") return 0; // Officers don't need advancement bonus
  const { r } = parseNodeId(nodeId);
  
  if (piece.owner === "B") {
    // Black advances toward row 6
    return r * 6; // 0-36 bonus based on row
  } else {
    // White advances toward row 0
    return (6 - r) * 6;
  }
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
    if (dist === 1) return 40;
    if (dist === 2) return 20;
    if (dist === 3) return 10;
    return 0;
  }
  // White
  const dist = r - 0;
  if (dist <= 0) return 0;
  if (dist === 1) return 40;
  if (dist === 2) return 20;
  if (dist === 3) return 10;
  return 0;
}

// Back rank protection bonus - pieces on back rank are safer
function backRankBonus(nodeId: string, piece: Piece): number {
  if (piece.rank === "O") return 0; // Officers can move backwards
  const { r } = parseNodeId(nodeId);
  
  if (piece.owner === "B" && r === 0) return 8; // Black's back rank
  if (piece.owner === "W" && r === 6) return 8; // White's back rank
  return 0;
}

export function evaluateState(state: GameState, perspective: Player): number {
  const opp: Player = perspective === "B" ? "W" : "B";
  let score = 0;
  let ownStacks = 0;
  let oppStacks = 0;

  // Material (with depth discount) + control bonus + positional factors.
  for (const [nodeId, stack] of state.board.entries()) {
    if (!stack || stack.length === 0) continue;
    const top = stack[stack.length - 1];

    // Control bonus: stacks you control are valuable.
    const height = stack.length;
    if (top.owner === perspective) {
      ownStacks++;
      score += 35 + 15 * Math.max(0, height - 1);
      score += centerBonus(nodeId);
      
      // Prisoner value - pieces we've captured under our stack
      for (let i = 0; i < stack.length - 1; i++) {
        if (stack[i].owner !== perspective) {
          score += pieceBaseValue(stack[i]) * 0.25;
        }
      }
    } else {
      oppStacks++;
      score -= 35 + 15 * Math.max(0, height - 1);
      score -= centerBonus(nodeId);
      
      // Opponent's prisoners
      for (let i = 0; i < stack.length - 1; i++) {
        if (stack[i].owner === perspective) {
          score -= pieceBaseValue(stack[i]) * 0.25;
        }
      }
    }

    // Piece values (top-weighted) with advancement and back rank
    for (let i = 0; i < stack.length; i++) {
      const piece = stack[stack.length - 1 - i]; // from top down
      const sgn = piece.owner === perspective ? 1 : -1;
      const baseVal = pieceBaseValue(piece) * depthDiscount(i);
      const advBonus = i === 0 ? advancementBonus(nodeId, piece) : 0;
      const backBonus = i === 0 ? backRankBonus(nodeId, piece) : 0;
      score += sgn * (baseVal + advBonus + backBonus);
    }

    score += promotionBonus(state, nodeId, top, perspective);
    score -= promotionBonus(state, nodeId, top, opp);
  }

  // Stack count advantage
  score += 20 * (ownStacks - oppStacks);

  return score;
}
