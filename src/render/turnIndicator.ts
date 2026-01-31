const SVG_NS = "http://www.w3.org/2000/svg";

function parseViewBox(svg: SVGSVGElement): { x: number; y: number; w: number; h: number } {
  const raw = svg.getAttribute("viewBox") ?? "";
  const parts = raw
    .trim()
    .split(/\s+/)
    .map((p) => Number(p));
  if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
    const [x, y, w, h] = parts;
    return { x, y, w, h };
  }
  // Default for bundled board assets.
  return { x: 0, y: 0, w: 1000, h: 1000 };
}

export function ensureTurnIndicatorLayer(svg: SVGSVGElement): SVGGElement {
  const existing = svg.querySelector("#turnIndicator") as SVGGElement | null;
  if (existing) return existing;

  const g = document.createElementNS(SVG_NS, "g") as SVGGElement;
  g.id = "turnIndicator";
  g.setAttribute("pointer-events", "none");
  svg.appendChild(g);
  return g;
}

export function renderTurnIndicator(
  svg: SVGSVGElement,
  layer: SVGGElement,
  toMove: "W" | "B",
  opts?: { hidden?: boolean }
): void {
  while (layer.firstChild) layer.removeChild(layer.firstChild);
  if (opts?.hidden) return;

  const vb = parseViewBox(svg);

  // Pieces are rendered at ~86 units; this is ~1/4.
  const iconSize = 33;
  const pad = 18;

  const x = vb.x + pad;
  const y = vb.y + pad;

  // A subtle backing so the icon is readable on any theme.
  const backing = document.createElementNS(SVG_NS, "rect") as SVGRectElement;
  backing.setAttribute("x", String(x - 6));
  backing.setAttribute("y", String(y - 6));
  backing.setAttribute("width", String(iconSize + 12));
  backing.setAttribute("height", String(iconSize + 12));
  backing.setAttribute("rx", "10");
  backing.setAttribute("ry", "10");
  backing.setAttribute("fill", "rgba(0,0,0,0.28)");
  backing.setAttribute("stroke", "rgba(255,255,255,0.22)");
  backing.setAttribute("stroke-width", "2");
  backing.setAttribute("vector-effect", "non-scaling-stroke");
  layer.appendChild(backing);

  const use = document.createElementNS(SVG_NS, "use") as SVGUseElement;
  const href = toMove === "W" ? "#W_S" : "#B_S";
  use.setAttribute("href", href);
  // Fallback for older SVG implementations
  use.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", href);
  use.setAttribute("x", String(x));
  use.setAttribute("y", String(y));
  use.setAttribute("width", String(iconSize));
  use.setAttribute("height", String(iconSize));
  layer.appendChild(use);

  const title = document.createElementNS(SVG_NS, "title");
  title.textContent = toMove === "W" ? "Light to move" : "Dark to move";
  layer.appendChild(title);
}
