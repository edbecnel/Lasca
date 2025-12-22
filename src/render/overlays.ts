const SVG_NS = "http://www.w3.org/2000/svg";

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

  const sel = document.createElementNS(SVG_NS, "circle") as SVGCircleElement;
  sel.setAttribute("cx", String(cx));
  sel.setAttribute("cy", String(cy));
  sel.setAttribute("r", String(r + 6));
  sel.setAttribute("fill", "none");
  sel.setAttribute("stroke", "#66ccff");
  sel.setAttribute("stroke-width", "3");
  sel.setAttribute("pointer-events", "none");
  layer.appendChild(sel);
}

export function drawTargets(layer: SVGGElement, nodeIds: string[]): void {
  for (const id of nodeIds) {
    const node = circleForNode(id);
    if (!node) continue;
    const cx = parseFloat(node.getAttribute("cx") || "0");
    const cy = parseFloat(node.getAttribute("cy") || "0");
    const r = parseFloat(node.getAttribute("r") || "0");

    const ring = document.createElementNS(SVG_NS, "circle") as SVGCircleElement;
    ring.setAttribute("cx", String(cx));
    ring.setAttribute("cy", String(cy));
    ring.setAttribute("r", String(r + 10));
    ring.setAttribute("fill", "none");
    ring.setAttribute("stroke", "#00e676");
    ring.setAttribute("stroke-width", "3");
    ring.setAttribute("stroke-dasharray", "4 3");
    // Visual only; clicks handled on underlying board node circles
    layer.appendChild(ring);
  }
}

export function drawHighlightRing(layer: SVGGElement, nodeId: string, color = "#ff9f40", width = 4): void {
  const node = circleForNode(nodeId);
  if (!node) return;
  const cx = parseFloat(node.getAttribute("cx") || "0");
  const cy = parseFloat(node.getAttribute("cy") || "0");
  const r = parseFloat(node.getAttribute("r") || "0");

  const ring = document.createElementNS(SVG_NS, "circle") as SVGCircleElement;
  ring.setAttribute("cx", String(cx));
  ring.setAttribute("cy", String(cy));
  ring.setAttribute("r", String(r + 12));
  ring.setAttribute("fill", "none");
  ring.setAttribute("stroke", color);
  ring.setAttribute("stroke-width", String(width));
  ring.setAttribute("stroke-dasharray", "6 4");
  ring.setAttribute("pointer-events", "none");
  layer.appendChild(ring);
}
