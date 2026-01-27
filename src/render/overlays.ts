const SVG_NS = "http://www.w3.org/2000/svg";

const SELECTION_STROKE_W = 5;
const TARGET_STROKE_W = 5;
const MIN_HIGHLIGHT_STROKE_W = 6;

function makeHalo(layer: SVGGElement, args: { cx: number; cy: number; r: number; kind: "selection" | "target" | "highlight" }): SVGGElement {
  const g = document.createElementNS(SVG_NS, "g") as SVGGElement;
  g.setAttribute("class", `halo halo--${args.kind}`);
  g.setAttribute("pointer-events", "none");

  const glow = document.createElementNS(SVG_NS, "circle") as SVGCircleElement;
  glow.setAttribute("class", "halo-glow");
  glow.setAttribute("cx", String(args.cx));
  glow.setAttribute("cy", String(args.cy));
  glow.setAttribute("r", String(args.r));
  glow.setAttribute("fill", "none");
  glow.setAttribute("stroke", args.kind === "target" ? "#00e676" : args.kind === "highlight" ? "#ff9f40" : "#66ccff");
  glow.setAttribute("stroke-width", String(Math.max(SELECTION_STROKE_W, TARGET_STROKE_W) + 4));
  applyStrokeDefaults(glow);
  g.appendChild(glow);

  const core = document.createElementNS(SVG_NS, "circle") as SVGCircleElement;
  core.setAttribute("class", "halo-core");
  core.setAttribute("cx", String(args.cx));
  core.setAttribute("cy", String(args.cy));
  core.setAttribute("r", String(args.r));
  core.setAttribute("fill", "none");
  core.setAttribute("stroke", args.kind === "target" ? "#00e676" : args.kind === "highlight" ? "#ff9f40" : "#66ccff");
  core.setAttribute("stroke-width", String(args.kind === "highlight" ? Math.max(MIN_HIGHLIGHT_STROKE_W, 6) : SELECTION_STROKE_W));
  applyStrokeDefaults(core);
  g.appendChild(core);

  const sparks = document.createElementNS(SVG_NS, "circle") as SVGCircleElement;
  sparks.setAttribute("class", "halo-sparks");
  sparks.setAttribute("cx", String(args.cx));
  sparks.setAttribute("cy", String(args.cy));
  sparks.setAttribute("r", String(args.r));
  sparks.setAttribute("fill", "none");
  sparks.setAttribute("stroke", "rgba(255,255,255,0.92)");
  sparks.setAttribute("stroke-width", "2.5");
  applyStrokeDefaults(sparks);
  g.appendChild(sparks);

  layer.appendChild(g);
  return g;
}

function applyStrokeDefaults(el: SVGElement): void {
  // Keep overlay strokes readable even when the board SVG is scaled.
  el.setAttribute("vector-effect", "non-scaling-stroke");
  el.setAttribute("stroke-linecap", "round");
  el.setAttribute("stroke-linejoin", "round");
}

export function ensureOverlayLayer(svg: SVGSVGElement): SVGGElement {
  const existing = svg.querySelector("#overlays") as SVGGElement | null;
  if (existing) return existing;
  const g = document.createElementNS(SVG_NS, "g") as SVGGElement;
  g.id = "overlays";
  // Make overlays purely visual; clicks pass through to underlying nodes
  g.setAttribute("pointer-events", "none");
  const pieces = svg.querySelector("#pieces") as SVGGElement | null;
  if (pieces && pieces.parentNode) {
    // Place overlays ABOVE the pieces layer for visibility and clicks
    if (pieces.nextSibling) {
      pieces.parentNode.insertBefore(g, pieces.nextSibling);
    } else {
      pieces.parentNode.appendChild(g);
    }
  } else {
    svg.appendChild(g);
  }
  return g;
}

export function clearOverlays(layer: SVGGElement): void {
  while (layer.firstChild) layer.removeChild(layer.firstChild);
}

function circleForNode(id: string): SVGCircleElement | null {
  return document.getElementById(id) as SVGCircleElement | null;
}

export function drawSelection(layer: SVGGElement, nodeId: string): void {
  const node = circleForNode(nodeId);
  if (!node) return;
  const cx = parseFloat(node.getAttribute("cx") || "0");
  const cy = parseFloat(node.getAttribute("cy") || "0");
  const r = parseFloat(node.getAttribute("r") || "0");

  makeHalo(layer, { cx, cy, r: r + 8, kind: "selection" });
}

export function drawTargets(layer: SVGGElement, nodeIds: string[]): void {
  for (const id of nodeIds) {
    const node = circleForNode(id);
    if (!node) continue;
    const cx = parseFloat(node.getAttribute("cx") || "0");
    const cy = parseFloat(node.getAttribute("cy") || "0");
    const r = parseFloat(node.getAttribute("r") || "0");

    makeHalo(layer, { cx, cy, r: r + 12, kind: "target" });
  }
}

export function drawHighlightRing(layer: SVGGElement, nodeId: string, color = "#ff9f40", width = 4): void {
  const node = circleForNode(nodeId);
  if (!node) return;
  const cx = parseFloat(node.getAttribute("cx") || "0");
  const cy = parseFloat(node.getAttribute("cy") || "0");
  const r = parseFloat(node.getAttribute("r") || "0");

  const g = makeHalo(layer, { cx, cy, r: r + 14, kind: "highlight" });
  // Preserve caller-supplied color/width as a fallback; CSS can still override.
  try {
    const glow = g.querySelector(".halo-glow") as SVGCircleElement | null;
    const core = g.querySelector(".halo-core") as SVGCircleElement | null;
    if (glow) glow.setAttribute("stroke", color);
    if (core) core.setAttribute("stroke", color);
    if (core) core.setAttribute("stroke-width", String(Math.max(width, MIN_HIGHLIGHT_STROKE_W)));
  } catch {
    // ignore
  }
}
