import type { Piece } from "../types";

type RulesetIdLike = string | null | undefined;

function ownerLabel(owner: Piece["owner"]): string {
  return owner === "W" ? "Light" : "Dark";
}

function rankLabel(rank: Piece["rank"], rulesetId?: RulesetIdLike): string {
  switch (rank) {
    case "P": return "Pawn";
    case "N": return "Knight";
    case "B": return "Bishop";
    case "R": return "Rook";
    case "Q": return "Queen";
    case "K": return "King";
    case "S": return "Soldier";
    case "O": return (rulesetId === "dama") ? "King" : "Officer";
    default: return "Piece";
  }
}

export function pieceTooltip(p: Piece, opts: { rulesetId?: RulesetIdLike } = {}): string {
  const side = ownerLabel(p.owner);
  const name = rankLabel(p.rank, opts.rulesetId);
  return `${side} ${name}`;
}
