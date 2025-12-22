import { createInitialGameState } from "./game/state.ts";
import { renderGameState } from "./render/renderGameState.ts";
import { createStackInspector } from "./ui/stackInspector";
import { initSplitLayout } from "./ui/layout/splitLayout";
import { loadSvgFileInto } from "./render/loadSvgFile";
import { createThemeManager } from "./theme/themeManager";
import type { Player } from "./types";
import { GameController } from "./controller/gameController.ts";
import { ensureOverlayLayer } from "./render/overlays.ts";
import { ALL_NODES } from "./game/board.ts";

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

  // PR 4+5: interaction — controller binds selection and applies quiet moves
  ensureOverlayLayer(svg);
  const controller = new GameController(svg, piecesLayer, inspector, state);
  controller.bind();

  // Dev-only: install debug helpers and expose rerender/random that also sync controller state
  if (import.meta.env && import.meta.env.DEV) {
    const mod = await import("./dev/boardDebug.ts");
    let currentState = state;
    mod.installBoardDebug(svg, () => currentState);

    const randomMod = await import("./game/randomState.ts");

    const w = window as any;
    w.__state = currentState;
    w.__rerender = (next: typeof state) => {
      // Clear any dev debug highlights and overlay rings before re-rendering
      if ((w.__board as any)?.clear) {
        try { (w.__board as any).clear(); } catch {}
      }
      try {
        const overlays = ensureOverlayLayer(svg);
        // overlays exists even if empty; clear any lingering rings
        const g = overlays as SVGGElement;
        while (g.firstChild) g.removeChild(g.firstChild);
      } catch {}
      renderGameState(svg, piecesLayer, inspector, next);
      const elTurn = document.getElementById("statusTurn");
      const elPhase = document.getElementById("statusPhase");
      const elMsg = document.getElementById("statusMessage");
      if (elTurn) elTurn.textContent = next.toMove === "B" ? "Black" : "White";
      if (elPhase) elPhase.textContent = next.phase.charAt(0).toUpperCase() + next.phase.slice(1);
      if (elMsg) elMsg.textContent = "—";
      currentState = next;
      controller.setState(currentState);
      w.__state = currentState;
    };
    w.__random = (totalPerSide: number = 11, toMove: Player = "B") => {
      const s = randomMod.createRandomGameState({ totalPerSide, toMove });

      // Add one random white and one random black multi-piece stack at empty nodes
      const empty = ALL_NODES.filter((n) => !s.board.has(n));
      const pickIndex = (max: number) => Math.floor(Math.random() * max);
      const randInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
      const shuffle = <T,>(arr: T[]): T[] => {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      };
      const makeStack = (topOwner: Player) => {
        const total = randInt(2, 5); // 2..5 pieces in the stack
        const other = topOwner === "W" ? "B" : "W";
        const otherOf = (p: Player): Player => (p === "W" ? "B" : "W");
        const bottomOwner: Player = (total % 2 === 1) ? topOwner : other;
        const pieces: Array<{ owner: Player; rank: "S" | "O" }> = [];
        for (let k = 0; k < total; k++) {
          const owner = (k % 2 === 0) ? bottomOwner : otherOf(bottomOwner);
          const rank = (k === total - 1) ? "O" : "S"; // officer at top
          pieces.push({ owner, rank });
        }
        return pieces;
      };

      // Place stacks if there is space
      if (empty.length > 0) {
        const wIdx = pickIndex(empty.length);
        const wNode = empty[wIdx];
        s.board.set(wNode, makeStack("W"));
        empty.splice(wIdx, 1);
      }
      if (empty.length > 0) {
        const bIdx = pickIndex(empty.length);
        const bNode = empty[bIdx];
        s.board.set(bNode, makeStack("B"));
        empty.splice(bIdx, 1);
      }

      w.__rerender(s);
      return s;
    };
  }
});
