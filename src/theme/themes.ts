export interface ThemeDef {
  id: string;
  label: string;
  piecesDefs: URL;
  boardDefs: URL;
  css: URL;
}

export const DEFAULT_THEME_ID = "classic" as const;

export const THEMES: ThemeDef[] = [
  {
    id: "classic",
    label: "Classic",
    piecesDefs: new URL("../assets/themes/classic/pieces_defs.svg", import.meta.url),
    boardDefs: new URL("../assets/themes/classic/board_defs.svg", import.meta.url),
    css: new URL("../assets/themes/classic/theme.css", import.meta.url),
  },
  {
    id: "highContrast",
    label: "High Contrast",
    piecesDefs: new URL("../assets/themes/highContrast/pieces_defs.svg", import.meta.url),
    boardDefs: new URL("../assets/themes/highContrast/board_defs.svg", import.meta.url),
    css: new URL("../assets/themes/highContrast/theme.css", import.meta.url),
  },
  {
    id: "wooden",
    label: "Wooden",
    piecesDefs: new URL("../assets/themes/wooden/pieces_defs.svg", import.meta.url),
    boardDefs: new URL("../assets/themes/wooden/board_defs.svg", import.meta.url),
    css: new URL("../assets/themes/wooden/theme.css", import.meta.url),
  },
  {
    id: "metal",
    label: "Copper & Steel",
    piecesDefs: new URL("../assets/themes/metal/pieces_defs.svg", import.meta.url),
    boardDefs: new URL("../assets/themes/metal/board_defs.svg", import.meta.url),
    css: new URL("../assets/themes/metal/theme.css", import.meta.url),
  },
  {
    id: "stone",
    label: "Granite & Marble",
    piecesDefs: new URL("../assets/themes/stone/pieces_defs.svg", import.meta.url),
    boardDefs: new URL("../assets/themes/stone/board_defs.svg", import.meta.url),
    css: new URL("../assets/themes/stone/theme.css", import.meta.url),
  },
];

export function getThemeById(id: string): ThemeDef | null {
  return THEMES.find((t) => t.id === id) ?? null;
}
