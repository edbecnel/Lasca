import { BLACK_START_NODE_IDS, WHITE_START_NODE_IDS, DEMO_STACK_NODE_ID, DEMO_STACK } from "./game/initialPosition";
import { createStackInspector } from "./ui/stackInspector";
import { initSplitLayout } from "./ui/layout/splitLayout";
import { renderStackAtNode } from "./render/renderStackAtNode";
import { loadSvgFileInto } from "./render/loadSvgFile";
import { createThemeManager } from "./theme/themeManager";

window.addEventListener("DOMContentLoaded", async () => {
  const boardWrap = document.getElementById("boardWrap") as HTMLElement | null;
  if (!boardWrap) throw new Error("Missing board container: #boardWrap");

  const boardUrl = new URL("./assets/lasca_board.svg", import.meta.url);
  const svg = await loadSvgFileInto(boardWrap, boardUrl);

  const zoomTitle = document.getElementById("zoomTitle") as HTMLElement | null;
  const zoomHint = document.getElementById("zoomHint") as HTMLElement | null;
  const zoomBody = document.getElementById("zoomBody") as HTMLElement | null;
  if (!zoomBody) throw new Error("Missing inspector container: #zoomBody");

  const zoomSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
  zoomSvg.id = "zoomSvg";
  zoomSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  zoomSvg.setAttribute("viewBox", "0 0 120 200");
  zoomSvg.setAttribute("role", "img");
  zoomSvg.setAttribute("aria-label", "Stack column");
  zoomBody.replaceChildren(zoomSvg);

  initSplitLayout();

  const themeDropdown = document.getElementById("themeDropdown") as HTMLElement | null;
  const themeManager = createThemeManager(svg);
  await themeManager.bindThemeDropdown(themeDropdown);

  const piecesLayer = svg.querySelector("#pieces") as SVGGElement | null;
  if (!piecesLayer) throw new Error("Missing SVG group inside board: #pieces");
  if (!zoomTitle || !zoomHint) throw new Error("Missing inspector DOM nodes (zoomTitle/zoomHint)");

  const inspector = createStackInspector(zoomTitle, zoomHint, zoomSvg);

  piecesLayer.textContent = "";

  for (const id of BLACK_START_NODE_IDS) renderStackAtNode(svg, piecesLayer, inspector, id, [{ owner: "B", rank: "S" }]);
  for (const id of WHITE_START_NODE_IDS) renderStackAtNode(svg, piecesLayer, inspector, id, [{ owner: "W", rank: "S" }]);

  renderStackAtNode(svg, piecesLayer, inspector, DEMO_STACK_NODE_ID, DEMO_STACK);
});
