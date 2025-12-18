import type { Piece } from "../types";

export function pieceToHref(p: Piece): string {
  if (p.owner === "W" && p.rank === "S") return "#W_S";
  if (p.owner === "W" && p.rank === "O") return "#W_O";
  if (p.owner === "B" && p.rank === "S") return "#B_S";
  return "#B_O";
}
