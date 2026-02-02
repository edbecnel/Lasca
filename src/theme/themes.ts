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
  {
    id: "semiprecious",
    label: "Semi-Precious Stones",
    piecesDefs: new URL("../assets/themes/semiprecious/pieces_defs.svg", import.meta.url),
    boardDefs: new URL("../assets/themes/semiprecious/board_defs.svg", import.meta.url),
    css: new URL("../assets/themes/semiprecious/theme.css", import.meta.url),
  },
  {
    id: "glass",
    label: "Glass",
    piecesDefs: new URL("../assets/themes/glass/pieces_defs.svg", import.meta.url),
    boardDefs: new URL("../assets/themes/glass/board_defs.svg", import.meta.url),
    css: new URL("../assets/themes/glass/theme.css", import.meta.url),
  },
  {
    id: "turtle",
    label: "Turtle",
    piecesDefs: new URL("../assets/themes/turtle/pieces_defs.svg", import.meta.url),
    boardDefs: new URL("../assets/themes/turtle/board_defs.svg", import.meta.url),
    css: new URL("../assets/themes/turtle/theme.css", import.meta.url),
  },
  {
    id: "porcelain",
    label: "Porcelain",
    piecesDefs: new URL("../assets/themes/porcelain/pieces_defs.svg", import.meta.url),
    boardDefs: new URL("../assets/themes/porcelain/board_defs.svg", import.meta.url),
    css: new URL("../assets/themes/porcelain/theme.css", import.meta.url),
  },
  {
    id: "luminous",
    label: "Luminous",
    piecesDefs: new URL("../assets/themes/luminous/pieces_defs.svg", import.meta.url),
    boardDefs: new URL("../assets/themes/luminous/board_defs.svg", import.meta.url),
    css: new URL("../assets/themes/luminous/theme.css", import.meta.url),
  },
];

export function getThemeById(id: string): ThemeDef | null {
  return THEMES.find((t) => t.id === id) ?? null;
}
