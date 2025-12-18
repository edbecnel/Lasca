// src/render/renderStackAtNode.js

import { pieceToHref } from "../pieces/pieceToHref.js";
import { makeUse } from "./svgUse.js";
import { drawMiniStackSpine } from "./miniSpine.js";

/**
 * Renders a stack at a board node:
 * - Draws only the top piece large.
 * - Adds a mini-spine to indicate stack composition (when stack length > 1).
 * - Hooks hover behavior into the inspector (if provided).
 */
export function renderStackAtNode(svgRoot, piecesLayer, inspector, nodeId, stack, opts = {}){
  const { pieceSize = 86 } = opts;

  const node = document.getElementById(nodeId);
  if (!node || !stack.length) return;

  const cx = parseFloat(node.getAttribute("cx"));
  const cy = parseFloat(node.getAttribute("cy"));

  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.setAttribute("data-node", nodeId);
  g.setAttribute("class", "stack");

  const top = stack[stack.length - 1];
  const half = pieceSize / 2;

  // Top piece only
  g.appendChild(makeUse(pieceToHref(top), cx - half, cy - half, pieceSize));

  // Mini preview spine
  drawMiniStackSpine(svgRoot, g, cx, cy, stack, { pieceSize, miniSize: 18 });

  // Hover: show full stack in inspector panel
  if (inspector && stack.length > 1){
    g.style.cursor = "pointer";
    g.addEventListener("pointerenter", () => { inspector.cancelHide(); inspector.show(nodeId, stack); });
    g.addEventListener("pointerleave", () => { inspector.hideSoon(); });
  }

  piecesLayer.appendChild(g);
}
