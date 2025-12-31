import type { Piece } from "../types";

export type PieceToHrefOptions = {
  rulesetId?: string;
};

export function pieceToHref(p: Piece, opts: PieceToHrefOptions = {}): string {
  const isDama = opts.rulesetId === "dama";

  if (p.owner === "W" && p.rank === "S") return "#W_S";
  if (p.owner === "W" && p.rank === "O") return isDama ? "#W_K" : "#W_O";
  if (p.owner === "B" && p.rank === "S") return "#B_S";
  return isDama ? "#B_K" : "#B_O";
}
