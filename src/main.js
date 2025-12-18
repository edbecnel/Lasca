// src/main.js

import { BLACK_START_NODE_IDS, WHITE_START_NODE_IDS, DEMO_STACK_NODE_ID, DEMO_STACK } from "./game/initialPosition.js";
import { createStackInspector } from "./ui/stackInspector.js";
import { renderStackAtNode } from "./render/renderStackAtNode.js";

window.addEventListener("DOMContentLoaded", () => {
  const svg = document.getElementById("lascaBoard");
  const piecesLayer = document.getElementById("pieces");

  const zoomTitle = document.getElementById("zoomTitle");
  const zoomHint  = document.getElementById("zoomHint");
  const zoomSvg   = document.getElementById("zoomSvg");

  if (!svg) throw new Error('Missing SVG element: #lascaBoard');
  if (!piecesLayer) throw new Error('Missing SVG group: #pieces');
  if (!zoomTitle || !zoomHint || !zoomSvg) throw new Error('Missing inspector DOM nodes (zoomTitle/zoomHint/zoomSvg)');

  const inspector = createStackInspector(zoomTitle, zoomHint, zoomSvg);

  // ---- Initial render ----
  piecesLayer.textContent = "";

  for (const id of BLACK_START_NODE_IDS) renderStackAtNode(svg, piecesLayer, inspector, id, [{ owner:"B", rank:"S" }]);
  for (const id of WHITE_START_NODE_IDS) renderStackAtNode(svg, piecesLayer, inspector, id, [{ owner:"W", rank:"S" }]);

  // Demo stack in the center:
  renderStackAtNode(svg, piecesLayer, inspector, DEMO_STACK_NODE_ID, DEMO_STACK);
});
