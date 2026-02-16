export type Player = "W" | "B";
// Core game ranks are S (soldier) and O (officer). Columns Chess uses chess ranks.
export type Rank = "S" | "O" | "P" | "N" | "B" | "R" | "Q" | "K";

export interface Piece { owner: Player; rank: Rank; }
export type Stack = Piece[];
