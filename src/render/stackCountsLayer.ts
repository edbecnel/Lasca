const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * A dedicated layer for stack-count bubbles/text.
 * Placed at the very end of the SVG so it draws above board lines and node circles.
 */
export function ensureStackCountsLayer(svg: SVGSVGElement): SVGGElement {
  const existing = svg.querySelector("#stackCounts") as SVGGElement | null;
  if (existing) return existing;

  const g = document.createElementNS(SVG_NS, "g") as SVGGElement;
  g.id = "stackCounts";
  g.setAttribute("pointer-events", "none");

  // Ensure we're above everything (nodes/overlays/etc) by appending last.
  svg.appendChild(g);
  return g;
}

export function clearStackCounts(layer: SVGGElement): void {
  while (layer.firstChild) layer.removeChild(layer.firstChild);
}
