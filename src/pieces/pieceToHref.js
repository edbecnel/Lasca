// src/pieces/pieceToHref.js

/**
 * Converts a logical piece {owner:'W'|'B', rank:'S'|'O'} to an SVG <symbol> href.
 * - White Soldier: #W_S
 * - Black Soldier: #B_S
 * - White Officer: #W_O (green)
 * - Black Officer: #B_O (red)
 */
export function pieceToHref(p){
  if (p.owner === "W" && p.rank === "S") return "#W_S";
  if (p.owner === "W" && p.rank === "O") return "#W_O";
  if (p.owner === "B" && p.rank === "S") return "#B_S";
  return "#B_O";
}
