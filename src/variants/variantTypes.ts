export type RulesetId = "lasca" | "dama" | "hybrid";

export type VariantId =
  | "lasca_7_classic"
  | "lasca_8_dama_board"
  | "dama_8_classic"
  | "hybrid_8_damasca";

export interface GameMeta {
  variantId: VariantId;
  rulesetId: RulesetId;
  boardSize: 7 | 8;
}

export interface VariantSpec {
  variantId: VariantId;
  displayName: string;
  subtitle: string;
  rulesetId: RulesetId;
  boardSize: 7 | 8;
  piecesPerSide: 11 | 12;
  svgAsset?: string;
  entryUrl?: string;
  defaultSaveName: string;
  available: boolean;
}
