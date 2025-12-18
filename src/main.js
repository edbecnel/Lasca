// src/main.js

import { BLACK_START_NODE_IDS, WHITE_START_NODE_IDS, DEMO_STACK_NODE_ID, DEMO_STACK } from "./game/initialPosition.js";
import { createStackInspector } from "./ui/stackInspector.js";
import { initSplitLayout } from "./ui/layout/splitLayout.js";
import { renderStackAtNode } from "./render/renderStackAtNode.js";
import { loadSvgFileInto } from "./render/loadSvgFile.js";
import { createThemeManager } from "./theme/themeManager.js";

window.addEventListener("DOMContentLoaded", async () => {  const boardWrap = document.getElementById("boardWrap");
  if (!boardWrap) throw new Error('Missing board container: #boardWrap');

  // Load board SVG (no inline <svg> in HTML)
  const boardUrl = new URL("./assets/lasca_board.svg", import.meta.url);
  const svg = await loadSvgFileInto(boardWrap, boardUrl);

  const zoomTitle = document.getElementById("zoomTitle");
  const zoomHint  = document.getElementById("zoomHint");  const zoomBody = document.getElementById("zoomBody");
  if (!zoomBody) throw new Error('Missing inspector container: #zoomBody');

  // Create zoom SVG dynamically (no inline <svg> in HTML)
  const zoomSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  zoomSvg.id = "zoomSvg";
  zoomSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  zoomSvg.setAttribute("viewBox", "0 0 120 200");
  zoomSvg.setAttribute("role", "img");
  zoomSvg.setAttribute("aria-label", "Stack column");
  zoomBody.replaceChildren(zoomSvg);

  // Layout: resizable / collapsible sidebars
  initSplitLayout();

  // Theme manager: hot-swappable piece/board defs + optional CSS
  const themeDropdown = document.getElementById("themeDropdown");
  const themeManager = createThemeManager(svg);
  await themeManager.bindThemeDropdown(themeDropdown);

  // Layout: resizable / collapsible sidebars
  initSplitLayout();  const piecesLayer = svg.querySelector("#pieces");
  if (!piecesLayer) throw new Error('Missing SVG group inside board: #pieces');
    if (!zoomTitle || !zoomHint) throw new Error('Missing inspector DOM nodes (zoomTitle/zoomHint)' );

  const inspector = createStackInspector(zoomTitle, zoomHint, zoomSvg);

  // ---- Initial render ----
  piecesLayer.textContent = "";

  for (const id of BLACK_START_NODE_IDS) renderStackAtNode(svg, piecesLayer, inspector, id, [{ owner:"B", rank:"S" }]);
  for (const id of WHITE_START_NODE_IDS) renderStackAtNode(svg, piecesLayer, inspector, id, [{ owner:"W", rank:"S" }]);

  // Demo stack in the center:
  renderStackAtNode(svg, piecesLayer, inspector, DEMO_STACK_NODE_ID, DEMO_STACK);
});
