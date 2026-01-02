import type { RulesetId, VariantId, VariantSpec } from "./variantTypes";

import lascaBoardSvgUrl from "../assets/lasca_board.svg?url";
import damascaBoardSvgUrl from "../assets/damasca_board.svg?url";

const RULESET_LABEL: Record<RulesetId, string> = {
  lasca: "Lasca",
  dama: "Dama",
  hybrid: "Hybrid",
};

export const VARIANTS: readonly VariantSpec[] = [
  {
    variantId: "lasca_7_classic",
    displayName: "Lasca Classic",
    subtitle: "Rules: Lasca • Board: 7×7 • Pieces: 11/side",
    rulesetId: "lasca",
    boardSize: 7,
    piecesPerSide: 11,
    svgAsset: lascaBoardSvgUrl,
    entryUrl: "./lasca.html",
    defaultSaveName: "lasca_7_classic-save.json",
    available: true,
  },
  {
    variantId: "lasca_8_dama_board",
    displayName: "Lasca 8×8",
    subtitle: "Lasca rules on an 8×8 board (stacking captures).",
    rulesetId: "lasca",
    boardSize: 8,
    piecesPerSide: 12,
    svgAsset: damascaBoardSvgUrl,
    entryUrl: "./lasca8x8.html",
    defaultSaveName: "lasca_8_dama_board-save.json",
    available: true,
  },
  {
    variantId: "dama_8_classic_standard",
    displayName: "Dama Classic (Standard)",
    subtitle: "Rules: Dama • Board: 8×8 • Pieces: 12/side • Capture removal: Immediate",
    rulesetId: "dama",
    boardSize: 8,
    piecesPerSide: 12,
    svgAsset: damascaBoardSvgUrl,
    entryUrl: "./dama.html",
    defaultSaveName: "dama_8_classic_standard-save.json",
    damaCaptureRemoval: "immediate",
    available: true,
  },
  {
    variantId: "dama_8_classic_international",
    displayName: "Dama Classic (International)",
    subtitle: "Rules: Dama • Board: 8×8 • Pieces: 12/side • Capture removal: End-of-sequence",
    rulesetId: "dama",
    boardSize: 8,
    piecesPerSide: 12,
    svgAsset: damascaBoardSvgUrl,
    entryUrl: "./dama.html",
    defaultSaveName: "dama_8_classic_international-save.json",
    damaCaptureRemoval: "end_of_sequence",
    available: true,
  },
  {
    variantId: "hybrid_8_damasca",
    displayName: "Damasca",
    subtitle: "Dama movement + Lasca stacking captures. Mandatory capture. Max-capture rule. Officers fly.",
    rulesetId: "hybrid",
    boardSize: 8,
    piecesPerSide: 12,
    svgAsset: damascaBoardSvgUrl,
    entryUrl: "./hybrid.html",
    defaultSaveName: "hybrid_8_damasca-save.json",
    available: true,
  },
] as const;

// Backward-compatibility aliases for removed/renamed variant IDs.
const VARIANT_ID_ALIASES: Partial<Record<string, VariantId>> = {
  dama_8_classic: "dama_8_classic_standard",
};

export const DEFAULT_VARIANT_ID: VariantId = "lasca_7_classic";

export function getVariantById(id: VariantId): VariantSpec {
  const canonical = (VARIANT_ID_ALIASES[id] ?? id) as VariantId;
  const found = VARIANTS.find((v) => v.variantId === canonical);
  if (!found) throw new Error(`Unknown variantId: ${id}`);
  return found;
}

export function isVariantId(id: string): id is VariantId {
  return (
    (VARIANTS as readonly VariantSpec[]).some((v) => v.variantId === id) ||
    Object.prototype.hasOwnProperty.call(VARIANT_ID_ALIASES, id)
  );
}

export function rulesBoardLine(rulesetId: RulesetId, boardSize: 7 | 8): string {
  const label = RULESET_LABEL[rulesetId] ?? String(rulesetId);
  return `${label} Rules • ${boardSize}×${boardSize} Board`;
}

export function rulesBoardLineForVariant(variantId: VariantId): string {
  const v = getVariantById(variantId);
  return rulesBoardLine(v.rulesetId, v.boardSize);
}
