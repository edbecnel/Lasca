export type CheckerboardThemeId = "classic" | "green";

export type CheckerboardThemeDef = {
  id: CheckerboardThemeId;
  label: string;
  light: string;
  dark: string;
  bg?: string;
};

export const DEFAULT_CHECKERBOARD_THEME_ID: CheckerboardThemeId = "classic";

export const CHECKERBOARD_THEMES: readonly CheckerboardThemeDef[] = [
  {
    id: "classic",
    label: "Classic",
    // Matches src/assets/chess_board.svg + src/assets/columns_chess_board.svg
    light: "#f0d9b5",
    dark: "#b58863",
    bg: "#e8ddcc",
  },
  {
    id: "green",
    label: "Green",
    // Lichess-style green board (approx)
    light: "#e7edd4",
    dark: "#6d8a3e",
    bg: "#dfe6c2",
  },
] as const;

export function normalizeCheckerboardThemeId(raw: string | null | undefined): CheckerboardThemeId {
  if (raw === "green") return "green";
  return "classic";
}

function getCheckerboardThemeById(id: CheckerboardThemeId): CheckerboardThemeDef {
  return CHECKERBOARD_THEMES.find((t) => t.id === id) ?? CHECKERBOARD_THEMES[0];
}

function parseNum(value: string | null): number | null {
  if (!value) return null;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Apply a checkerboard theme to an SVG board with a `#squares` group of 8×8 <rect> tiles.
 * Safe no-op if the expected structure is missing.
 */
export function applyCheckerboardTheme(svgRoot: SVGSVGElement, themeId: CheckerboardThemeId): void {
  if (!svgRoot) return;

  const theme = getCheckerboardThemeById(themeId);

  // Optional: tint the background fill to match.
  const bgFill = svgRoot.querySelector("#bgFill") as SVGGElement | null;
  if (bgFill && theme.bg) {
    const bgRects = Array.from(bgFill.querySelectorAll("rect")) as SVGRectElement[];
    for (const rect of bgRects) {
      rect.setAttribute("fill", theme.bg);
    }
  }

  const squares = svgRoot.querySelector("#squares") as SVGGElement | null;
  if (!squares) return;

  const rects = Array.from(squares.querySelectorAll("rect")) as SVGRectElement[];
  if (rects.length === 0) return;

  // Boards in this repo use x/y starting at 100 with 100px tiles (viewBox 0..1000).
  const start = 100;
  const step = 100;

  for (const rect of rects) {
    const x = parseNum(rect.getAttribute("x"));
    const y = parseNum(rect.getAttribute("y"));
    if (x == null || y == null) continue;

    const col = Math.round((x - start) / step);
    const row = Math.round((y - start) / step);
    if (!Number.isFinite(col) || !Number.isFinite(row)) continue;

    const isLight = (row + col) % 2 === 0;
    rect.setAttribute("fill", isLight ? theme.light : theme.dark);
  }
}
