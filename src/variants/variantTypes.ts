export type RulesetId = "lasca" | "dama" | "hybrid";

export type DamaCaptureRemoval = "immediate" | "end_of_sequence";

export type VariantId =
  | "lasca_7_classic"
  | "lasca_8_dama_board"
  | "dama_8_classic"
  | "dama_8_classic_standard"
  | "dama_8_classic_international"
  | "hybrid_8_damasca";

export interface GameMeta {
  variantId: VariantId;
  rulesetId: RulesetId;
  boardSize: 7 | 8;
  /** Dama-only. Defaults to "immediate" when missing. */
  damaCaptureRemoval?: DamaCaptureRemoval;
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
  /** Dama-only default; copied into GameMeta on new game. */
  damaCaptureRemoval?: DamaCaptureRemoval;
}
