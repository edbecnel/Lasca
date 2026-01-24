const WOODEN_THEME_ID = "wooden";

const WOOD_VARIANTS = 6;

function hashString(s: string): number {
  // djb2
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return h >>> 0;
}

function isPieceHref(href: string): boolean {
  return (
    href === "#W_S" ||
    href === "#B_S" ||
    href === "#W_O" ||
    href === "#B_O" ||
    href === "#W_K" ||
    href === "#B_K"
  );
}

export function maybeVariantWoodenPieceHref(
  svgRoot: SVGSVGElement,
  baseHref: string,
  seedKey: string
): string {
  const themeId = svgRoot.getAttribute("data-theme-id");
  if (themeId !== WOODEN_THEME_ID) return baseHref;
  if (!isPieceHref(baseHref)) return baseHref;

  const idx = hashString(`${seedKey}|${baseHref}`) % WOOD_VARIANTS;
  return `${baseHref}_v${idx}`;
}
