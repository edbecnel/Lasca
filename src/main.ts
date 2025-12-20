import { createInitialGameState } from "./game/state.ts";
import { renderGameState } from "./render/renderGameState.ts";
import { createStackInspector } from "./ui/stackInspector";
import { initSplitLayout } from "./ui/layout/splitLayout";
import { loadSvgFileInto } from "./render/loadSvgFile";
import { createThemeManager } from "./theme/themeManager";
import type { Player } from "./types";
import { GameController } from "./controller/gameController.ts";
import { ensureOverlayLayer } from "./render/overlays.ts";

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

  // Create initial game state and render once
  const state = createInitialGameState();

  // Update left panel status
  const elTurn = document.getElementById("statusTurn");
  const elPhase = document.getElementById("statusPhase");
  const elMsg = document.getElementById("statusMessage");
  if (elTurn) elTurn.textContent = state.toMove === "B" ? "Black" : "White";
  if (elPhase) elPhase.textContent = state.phase.charAt(0).toUpperCase() + state.phase.slice(1);
  if (elMsg) elMsg.textContent = "—";

  renderGameState(svg, piecesLayer, inspector, state);

  // In dev, force a full reload when modules (like state) change
  if (import.meta.hot) {
    import.meta.hot.accept(() => window.location.reload());
  }

  // Dev-only: install debug helpers to inspect neighbors/jumps on click
  if (import.meta.env && import.meta.env.DEV) {
    const mod = await import("./dev/boardDebug.ts");
    let currentState = state;
    mod.installBoardDebug(svg, () => currentState);

    const randomMod = await import("./game/randomState.ts");

    const w = window as any;
    w.__state = currentState;
    w.__rerender = (next: typeof state) => {
      renderGameState(svg, piecesLayer, inspector, next);
      const elTurn = document.getElementById("statusTurn");
      const elPhase = document.getElementById("statusPhase");
      const elMsg = document.getElementById("statusMessage");
      if (elTurn) elTurn.textContent = next.toMove === "B" ? "Black" : "White";
      if (elPhase) elPhase.textContent = next.phase.charAt(0).toUpperCase() + next.phase.slice(1);
      if (elMsg) elMsg.textContent = "—";
      currentState = next;
      w.__state = currentState;
    };
    w.__random = (totalPerSide: number = 11, toMove: Player = "B") => {
      const s = randomMod.createRandomGameState({ totalPerSide, toMove });
      w.__rerender(s);
      return s;
    };
  }

  // PR 4: minimal interaction — click to select your stack and highlight quiet move destinations
  ensureOverlayLayer(svg);
  const controller = new GameController(svg, piecesLayer, inspector, state);
  controller.bind();
});
