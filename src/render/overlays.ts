const SVG_NS = "http://www.w3.org/2000/svg";

const SELECTION_STROKE_W = 5;
const TARGET_STROKE_W = 5;
const MIN_HIGHLIGHT_STROKE_W = 6;

const DEFAULT_LAST_MOVE_FROM_FILL = "rgba(102, 204, 255, 0.22)";
const DEFAULT_LAST_MOVE_TO_FILL = "rgba(102, 204, 255, 0.36)";
const DEFAULT_LAST_MOVE_STROKE = "rgba(102, 204, 255, 0.72)";
const DEFAULT_LAST_MOVE_STROKE_W = 3;

type SquareRect = { x: number; y: number; w: number; h: number };

function resolveOverlayRoot(layer: SVGGElement): SVGGElement {
  if (layer.id === "overlays") return layer;
  const root = layer.closest?.("#overlays") as SVGGElement | null;
  return root ?? layer;
}

function ensureOverlaySubLayer(root: SVGGElement, id: string): SVGGElement {
  const existing = root.querySelector(`#${id}`) as SVGGElement | null;
  if (existing) return existing;
  const g = document.createElementNS(SVG_NS, "g") as SVGGElement;
  g.id = id;
  g.setAttribute("pointer-events", "none");
  root.appendChild(g);
  return g;
}

function fxLayerFromAny(layer: SVGGElement): SVGGElement {
  const root = resolveOverlayRoot(layer);
  // Ensure ordering: last-move squares below FX halos.
  ensureOverlaySubLayer(root, "overlaysLastMove");
  const fx = ensureOverlaySubLayer(root, "overlaysFx");
  return fx;
}

function lastMoveLayerFromAny(layer: SVGGElement): SVGGElement {
  const root = resolveOverlayRoot(layer);
  const last = ensureOverlaySubLayer(root, "overlaysLastMove");
  // Ensure FX exists and is on top.
  ensureOverlaySubLayer(root, "overlaysFx");
  // If both exist, enforce order by appending FX last.
  const fx = root.querySelector("#overlaysFx") as SVGGElement | null;
  if (fx) root.appendChild(fx);
  return last;
}

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
  if (existing) {
    // Ensure sublayers exist even if created by older builds.
    ensureOverlaySubLayer(existing, "overlaysLastMove");
    ensureOverlaySubLayer(existing, "overlaysFx");
    // Keep FX on top.
    const fx = existing.querySelector("#overlaysFx") as SVGGElement | null;
    if (fx) existing.appendChild(fx);
    return existing;
  }
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

  // Sublayers: persistent (last move) + transient FX (selection/targets).
  ensureOverlaySubLayer(g, "overlaysLastMove");
  ensureOverlaySubLayer(g, "overlaysFx");

  return g;
}

export function clearOverlays(layer: SVGGElement): void {
  // Clear only interactive FX overlays (selection/targets/highlight rings).
  // Keep the last-move squares persistent across clicks.
  const fx = fxLayerFromAny(layer);
  while (fx.firstChild) fx.removeChild(fx.firstChild);
}

function circleForNode(id: string): SVGCircleElement | null {
  return document.getElementById(id) as SVGCircleElement | null;
}

export function drawSelection(layer: SVGGElement, nodeId: string): void {
  layer = fxLayerFromAny(layer);
  const node = circleForNode(nodeId);
  if (!node) return;
  const cx = parseFloat(node.getAttribute("cx") || "0");
  const cy = parseFloat(node.getAttribute("cy") || "0");
  const r = parseFloat(node.getAttribute("r") || "0");

  makeHalo(layer, { cx, cy, r: r + 8, kind: "selection" });
}

export function drawTargets(layer: SVGGElement, nodeIds: string[]): void {
  layer = fxLayerFromAny(layer);
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
  layer = fxLayerFromAny(layer);
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

function parseNodeIdFast(id: string): { r: number; c: number } | null {
  const m = /^r(\d+)c(\d+)$/.exec(id);
  if (!m) return null;
  const r = Number.parseInt(m[1], 10);
  const c = Number.parseInt(m[2], 10);
  if (!Number.isFinite(r) || !Number.isFinite(c)) return null;
  return { r, c };
}

function computeSquareRect(svg: SVGSVGElement, nodeId: string): SquareRect | null {
  const rc = parseNodeIdFast(nodeId);
  if (!rc) return null;

  // Preferred: derive grid geometry from #squares <rect> tiles.
  const squares = svg.querySelector("#squares") as SVGGElement | null;
  if (squares) {
    const rects = Array.from(squares.querySelectorAll("rect")) as SVGRectElement[];
    if (rects.length > 0) {
      const first = rects[0];
      const w = Number.parseFloat(first.getAttribute("width") ?? "0");
      const h = Number.parseFloat(first.getAttribute("height") ?? "0");
      if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
        let minX = Infinity;
        let minY = Infinity;
        for (const r of rects) {
          const x = Number.parseFloat(r.getAttribute("x") ?? "NaN");
          const y = Number.parseFloat(r.getAttribute("y") ?? "NaN");
          if (Number.isFinite(x)) minX = Math.min(minX, x);
          if (Number.isFinite(y)) minY = Math.min(minY, y);
        }
        if (Number.isFinite(minX) && Number.isFinite(minY)) {
          return { x: minX + rc.c * w, y: minY + rc.r * h, w, h };
        }
      }
    }
  }

  // Fallback: infer square from the node circle center (assumes 100px tiles in 0..1000 boards).
  const node = circleForNode(nodeId);
  if (!node) return null;
  const cx = Number.parseFloat(node.getAttribute("cx") ?? "NaN");
  const cy = Number.parseFloat(node.getAttribute("cy") ?? "NaN");
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  return { x: cx - 50, y: cy - 50, w: 100, h: 100 };
}

function applyRectDefaults(el: SVGRectElement): void {
  el.setAttribute("vector-effect", "non-scaling-stroke");
  el.setAttribute("shape-rendering", "crispEdges");
}

export function clearLastMoveSquares(layer: SVGGElement): void {
  const last = lastMoveLayerFromAny(layer);
  while (last.firstChild) last.removeChild(last.firstChild);
}

export function drawLastMoveSquares(layer: SVGGElement, fromNodeId: string, toNodeId: string): void {
  const root = resolveOverlayRoot(layer);
  const svg = (root.ownerSVGElement ?? root.closest?.("svg")) as SVGSVGElement | null;
  if (!svg) return;

  const last = lastMoveLayerFromAny(root);
  while (last.firstChild) last.removeChild(last.firstChild);

  const fromRect = computeSquareRect(svg, fromNodeId);
  const toRect = computeSquareRect(svg, toNodeId);
  if (!fromRect || !toRect) return;

  const fromEl = document.createElementNS(SVG_NS, "rect") as SVGRectElement;
  fromEl.setAttribute("class", "last-move-square last-move-square--from");
  fromEl.setAttribute("x", String(fromRect.x));
  fromEl.setAttribute("y", String(fromRect.y));
  fromEl.setAttribute("width", String(fromRect.w));
  fromEl.setAttribute("height", String(fromRect.h));
  fromEl.setAttribute("fill", `var(--lastMoveFromFill, ${DEFAULT_LAST_MOVE_FROM_FILL})`);
  fromEl.setAttribute("stroke", `var(--lastMoveStroke, ${DEFAULT_LAST_MOVE_STROKE})`);
  fromEl.setAttribute("stroke-width", `var(--lastMoveStrokeWidth, ${DEFAULT_LAST_MOVE_STROKE_W})`);
  applyRectDefaults(fromEl);
  last.appendChild(fromEl);

  const toEl = document.createElementNS(SVG_NS, "rect") as SVGRectElement;
  toEl.setAttribute("class", "last-move-square last-move-square--to");
  toEl.setAttribute("x", String(toRect.x));
  toEl.setAttribute("y", String(toRect.y));
  toEl.setAttribute("width", String(toRect.w));
  toEl.setAttribute("height", String(toRect.h));
  toEl.setAttribute("fill", `var(--lastMoveToFill, ${DEFAULT_LAST_MOVE_TO_FILL})`);
  toEl.setAttribute("stroke", `var(--lastMoveStroke, ${DEFAULT_LAST_MOVE_STROKE})`);
  toEl.setAttribute("stroke-width", `var(--lastMoveStrokeWidth, ${DEFAULT_LAST_MOVE_STROKE_W})`);
  applyRectDefaults(toEl);
  last.appendChild(toEl);
}
