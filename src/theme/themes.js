// src/theme/themes.js

export const DEFAULT_THEME_ID = "classic";

/**
 * Theme definition notes:
 * - Each theme MUST define the same symbol IDs: #W_S, #B_S, #W_O, #B_O
 * - Each theme MUST define the same board defs IDs used by the board: #mask-connectors (at minimum)
 */
export const THEMES = [
  {
    id: "classic",
    label: "Classic",
    piecesDefs: new URL("../assets/themes/classic/pieces_defs.svg", import.meta.url),
    boardDefs:  new URL("../assets/themes/classic/board_defs.svg", import.meta.url),
    css:        new URL("../assets/themes/classic/theme.css", import.meta.url),
  },
  {
    id: "highContrast",
    label: "High Contrast",
    piecesDefs: new URL("../assets/themes/highContrast/pieces_defs.svg", import.meta.url),
    boardDefs:  new URL("../assets/themes/highContrast/board_defs.svg", import.meta.url),
    css:        new URL("../assets/themes/highContrast/theme.css", import.meta.url),
  },
];

export function getThemeById(id){
  return THEMES.find(t => t.id === id) ?? null;
}
