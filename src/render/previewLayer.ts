const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Dedicated layer for move/stack previews.
 *
 * This layer is intentionally kept at the very end of the SVG so it draws above
 * the main pieces, overlays, board coordinates, etc.
 */
export function ensurePreviewLayer(svg: SVGSVGElement): SVGGElement {
  const existing = svg.querySelector("#previewStacks") as SVGGElement | null;
  if (existing) return existing;

  const g = document.createElementNS(SVG_NS, "g") as SVGGElement;
  g.id = "previewStacks";
  g.setAttribute("pointer-events", "none");
  svg.appendChild(g);
  return g;
}

export function clearPreviewLayer(layer: SVGGElement): void {
  while (layer.firstChild) layer.removeChild(layer.firstChild);
}
