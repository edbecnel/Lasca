const SVG_NS = "http://www.w3.org/2000/svg";

function ensureBoardCoordsLayer(svg: SVGSVGElement): SVGGElement {
  const existing = svg.querySelector("#boardCoords") as SVGGElement | null;
  if (existing) return existing;

  const g = document.createElementNS(SVG_NS, "g") as SVGGElement;
  g.id = "boardCoords";
  g.setAttribute("pointer-events", "none");

  const pieces = svg.querySelector("#pieces") as SVGGElement | null;
  if (pieces && pieces.parentNode) {
    pieces.parentNode.insertBefore(g, pieces);
  } else {
    svg.appendChild(g);
  }

  return g;
}

function readCircle(svg: SVGSVGElement, id: string): { cx: number; cy: number } | null {
  // Node IDs are simple (e.g., r0c0), so we can safely query without CSS.escape.
  // Avoid relying on CSS.escape for broader browser compatibility.
  const el = svg.querySelector(`#${id}`) as SVGCircleElement | null;
  if (!el) return null;
  const cx = Number(el.getAttribute("cx"));
  const cy = Number(el.getAttribute("cy"));
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  return { cx, cy };
}

function findAnyColX(svg: SVGSVGElement, boardSize: number, col: number): number | null {
  for (let row = 0; row < boardSize; row++) {
    const p = readCircle(svg, `r${row}c${col}`);
    if (p) return p.cx;
  }
  return null;
}

function findAnyRowY(svg: SVGSVGElement, boardSize: number, row: number): number | null {
  for (let col = 0; col < boardSize; col++) {
    const p = readCircle(svg, `r${row}c${col}`);
    if (p) return p.cy;
  }
  return null;
}

function clearLayer(layer: SVGGElement): void {
  while (layer.firstChild) layer.removeChild(layer.firstChild);
}

export function renderBoardCoords(svg: SVGSVGElement, enabled: boolean, boardSize: 7 | 8 = 7): void {
  const layer = ensureBoardCoordsLayer(svg);
  if (!enabled) {
    clearLayer(layer);
    return;
  }

  // Derive a reasonable step from the node grid.
  const p00 = readCircle(svg, "r0c0");
  const p02 = readCircle(svg, "r0c2");
  const p20 = readCircle(svg, "r2c0");
  const stepX = p00 && p02 ? Math.abs(p02.cx - p00.cx) / 2 : 120;
  const stepY = p00 && p20 ? Math.abs(p20.cy - p00.cy) / 2 : 120;
  const step = Math.min(stepX, stepY);

  const minX = findAnyColX(svg, boardSize, 0) ?? 140;
  const maxY = findAnyRowY(svg, boardSize, boardSize - 1) ?? 860;

  // Place column labels below the bottom-row node circles.
  // Clamp so we don't render past the 1000×1000 viewBox.
  const colLabelY = Math.min(990, maxY + step * 0.75);
  const rowLabelX = minX - step * 0.65; // left of column A, in the board's margin

  const fontSize = step * 0.42;

  clearLayer(layer);

  // Column labels: A..(A+boardSize-1)
  for (let col = 0; col < boardSize; col++) {
    const x = findAnyColX(svg, boardSize, col);
    if (x == null) continue;

    const t = document.createElementNS(SVG_NS, "text") as SVGTextElement;
    t.textContent = String.fromCharCode("A".charCodeAt(0) + col);
    t.setAttribute("x", String(x));
    t.setAttribute("y", String(colLabelY));
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("dominant-baseline", "middle");
    t.setAttribute("font-size", String(fontSize));
    t.setAttribute("font-weight", "650");
    // Dark charcoal (not pure black) to match the board's built-in linework.
    // Uses an existing board SVG color family (connectors default to #404040).
    t.setAttribute("fill", "#404040");
    t.setAttribute("opacity", "0.75");
    layer.appendChild(t);
  }

  // Row labels: boardSize..1 (since 1 starts at bottom)
  for (let row = 0; row < boardSize; row++) {
    const y = findAnyRowY(svg, boardSize, row);
    if (y == null) continue;

    const t = document.createElementNS(SVG_NS, "text") as SVGTextElement;
    t.textContent = String(boardSize - row);
    t.setAttribute("x", String(rowLabelX));
    t.setAttribute("y", String(y));
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("dominant-baseline", "middle");
    t.setAttribute("font-size", String(fontSize));
    t.setAttribute("font-weight", "650");
    t.setAttribute("fill", "#404040");
    t.setAttribute("opacity", "0.75");
    layer.appendChild(t);
  }
}
