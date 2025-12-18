export type Player = "W" | "B";
export type Rank = "S" | "O";

export interface Piece { owner: Player; rank: Rank; }
export type Stack = Piece[];
