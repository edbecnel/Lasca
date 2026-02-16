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
  // Not all boards include a node at r0c0 (e.g. 8×8 playable parity).
  let step = 120;
  const row0Nodes: Array<{ col: number; cx: number; cy: number }> = [];
  for (let col = 0; col < boardSize; col++) {
    const p = readCircle(svg, `r0c${col}`);
    if (p) row0Nodes.push({ col, cx: p.cx, cy: p.cy });
  }
  if (row0Nodes.length >= 2) {
    row0Nodes.sort((a, b) => a.col - b.col);
    const dx = Math.abs(row0Nodes[1].cx - row0Nodes[0].cx);
    const dc = Math.abs(row0Nodes[1].col - row0Nodes[0].col);
    // Some boards include a full node grid (dc=1), while checkers-style boards
    // only include playable parity nodes (often dc=2). Derive spacing from the
    // actual column gap to keep label placement consistent across variants.
    if (dc > 0) step = dx / dc;
  } else {
    // Fall back: try vertical distance between the first two rows that have nodes.
    const p0 = readCircle(svg, "r0c0") ?? readCircle(svg, "r0c1");
    const p2 = readCircle(svg, "r2c0") ?? readCircle(svg, "r2c1");
    if (p0 && p2) step = Math.abs(p2.cy - p0.cy) / 2;
  }

  const minX = findAnyColX(svg, boardSize, 0) ?? 140;
  const maxY = findAnyRowY(svg, boardSize, boardSize - 1) ?? 860;

  const fontSize = step * 0.42;

  // Place column labels below the bottom-row node circles.
  // Keep text fully inside the 1000×1000 viewBox; on some mobile browsers,
  // positioning the baseline too close to the bottom edge causes visible clipping.
  const viewBoxMax = 1000;
  const safeBottomY = viewBoxMax - fontSize * 0.65;
  const colLabelY = Math.min(safeBottomY, maxY + step * 0.75);
  const rowLabelX = minX - step * 0.65; // left of column A, in the board's margin

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
