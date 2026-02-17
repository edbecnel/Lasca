import { loadSvgFileInto } from "./render/loadSvgFile";
import { createThemeManager } from "./theme/themeManager";
import columnsChessBoardSvgUrl from "./assets/columns_chess_board.svg?url";
import { renderGameState } from "./render/renderGameState";
import { createStackInspector } from "./ui/stackInspector";
import { initSplitLayout } from "./ui/layout/splitLayout";
import { initCollapsibleSections } from "./ui/layout/collapsibleSections";
import { createInitialGameStateForVariant } from "./game/state";
import type { VariantId } from "./variants/variantTypes";
import { getVariantById, rulesBoardLine } from "./variants/variantRegistry";
import { ensureOverlayLayer } from "./render/overlays";
import { HistoryManager } from "./game/historyManager";
import { createDriverAsync } from "./driver/createDriver";
import { GameController } from "./controller/gameController";
import { renderBoardCoords } from "./render/boardCoords";
import { setBoardFlipped } from "./render/boardFlip";
import { saveGameToFile, loadGameFromFile } from "./game/saveLoad";
import { createSfxManager } from "./ui/sfx";
import type { Stack } from "./types";

const ACTIVE_VARIANT_ID: VariantId = "columns_chess";

const LS_OPT_KEYS = {
  showResizeIcon: "lasca.opt.showResizeIcon",
  boardCoords: "lasca.opt.boardCoords",
  flipBoard: "lasca.opt.columnsChess.flipBoard",
  toasts: "lasca.opt.toasts",
  sfx: "lasca.opt.sfx",
} as const;

function readOptionalBoolPref(key: string): boolean | null {
  const raw = localStorage.getItem(key);
  if (raw == null) return null;
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  return null;
}

function writeBoolPref(key: string, value: boolean): void {
  localStorage.setItem(key, value ? "1" : "0");
}

window.addEventListener("DOMContentLoaded", async () => {
  const variant = getVariantById(ACTIVE_VARIANT_ID);

  initSplitLayout();
  initCollapsibleSections();

  const gameTitleEl = document.getElementById("gameTitle");
  if (gameTitleEl) {
    gameTitleEl.textContent = `${variant.displayName}`;
    gameTitleEl.title = rulesBoardLine(variant.rulesetId, variant.boardSize);
  }

  const boardWrap = document.getElementById("boardWrap") as HTMLElement | null;
  if (!boardWrap) throw new Error("Missing board container: #boardWrap");

  const svg = await loadSvgFileInto(boardWrap, columnsChessBoardSvgUrl);

  const flipBoardToggle = document.getElementById("flipBoardToggle") as HTMLInputElement | null;
  const savedFlip = readOptionalBoolPref(LS_OPT_KEYS.flipBoard);
  if (flipBoardToggle && savedFlip !== null) {
    flipBoardToggle.checked = savedFlip;
  }
  const isFlipped = () => Boolean(flipBoardToggle?.checked);

  // Apply flip early so any subsequently-created layers end up in the rotated view.
  setBoardFlipped(svg, isFlipped());

  const boardCoordsToggle = document.getElementById("boardCoordsToggle") as HTMLInputElement | null;
  const savedBoardCoords = readOptionalBoolPref(LS_OPT_KEYS.boardCoords);
  if (boardCoordsToggle && savedBoardCoords !== null) {
    boardCoordsToggle.checked = savedBoardCoords;
  }
  const applyBoardCoords = () =>
    renderBoardCoords(svg, Boolean(boardCoordsToggle?.checked), variant.boardSize, { flipped: isFlipped() });
  applyBoardCoords();

  const themeManager = createThemeManager(svg);
  const THEME_KEY = "lasca.columnsChess.theme";
  const themeFromQueryRaw = new URLSearchParams(window.location.search).get("theme")?.trim();
  const themeFromQuery = themeFromQueryRaw && themeFromQueryRaw.length > 0 ? themeFromQueryRaw : null;

  const normalizeColumnsTheme = (raw: string | null | undefined): "columns_classic" | "raster3d" => {
    const v = (raw ?? "").toLowerCase().trim();
    if (v === "raster3d" || v === "3d") return "raster3d";
    if (v === "columns_classic" || v === "classic" || v === "discs" || v === "disc") return "columns_classic";
    return "columns_classic";
  };

  const savedTheme = (() => {
    try {
      return localStorage.getItem(THEME_KEY);
    } catch {
      return null;
    }
  })();

  const initialThemeId = normalizeColumnsTheme(themeFromQuery ?? savedTheme);
  await themeManager.setTheme(initialThemeId);

  const themeSelect = document.getElementById("columnsThemeSelect") as HTMLSelectElement | null;
  const setSelectValueForThemeId = (themeId: "columns_classic" | "raster3d") => {
    if (!themeSelect) return;
    themeSelect.value = themeId === "raster3d" ? "3d" : "discs";
  };
  setSelectValueForThemeId(initialThemeId);

  if (themeSelect) {
    themeSelect.addEventListener("change", async () => {
      const picked = themeSelect.value === "3d" ? "raster3d" : "columns_classic";
      await themeManager.setTheme(picked);
      try {
        localStorage.setItem(THEME_KEY, picked);
      } catch {
        // ignore
      }
    });
  }

  const piecesLayer = svg.querySelector("#pieces") as SVGGElement | null;
  if (!piecesLayer) throw new Error("Missing SVG group inside board: #pieces");

  const zoomTitle = document.getElementById("zoomTitle") as HTMLElement | null;
  const zoomHint = document.getElementById("zoomHint") as HTMLElement | null;
  const zoomBody = document.getElementById("zoomBody") as HTMLElement | null;
  if (!zoomTitle || !zoomHint || !zoomBody) throw new Error("Missing inspector DOM nodes (zoomTitle/zoomHint/zoomBody)");

  const zoomSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
  zoomSvg.id = "zoomSvg";
  zoomSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  zoomSvg.setAttribute("viewBox", "0 0 120 200");
  zoomSvg.setAttribute("role", "img");
  zoomSvg.setAttribute("aria-label", "Stack column");
  zoomBody.replaceChildren(zoomSvg);

  const inspector = createStackInspector(zoomTitle, zoomHint, zoomSvg);

  // Wrap the inspector so it can display coords matching the current board orientation.
  const orientedInspector = {
    ...inspector,
    show: (nodeId: string, stack: Stack, opts: { rulesetId?: string; boardSize?: number } = {}) =>
      inspector.show(nodeId, stack, { ...opts, flipCoords: isFlipped() }),
  };

  const state = createInitialGameStateForVariant(ACTIVE_VARIANT_ID);
  const history = new HistoryManager();
  history.push(state);

  renderGameState(svg, piecesLayer, orientedInspector as any, state);

  ensureOverlayLayer(svg);
  const driver = await createDriverAsync({
    state,
    history,
    search: window.location.search,
    envMode: import.meta.env.VITE_PLAY_MODE,
    envServerUrl: import.meta.env.VITE_SERVER_URL,
  });

  const controller = new GameController(svg, piecesLayer, orientedInspector as any, state, history, driver);
  controller.bind();

  // Left panel status (rules/board is static per variant)
  const elRulesBoard = document.getElementById("statusRulesBoard") as HTMLElement | null;
  if (elRulesBoard) elRulesBoard.textContent = rulesBoardLine(variant.rulesetId, variant.boardSize);

  // Options: toasts
  const toastToggle = document.getElementById("toastToggle") as HTMLInputElement | null;
  const savedToasts = readOptionalBoolPref(LS_OPT_KEYS.toasts);
  if (toastToggle && savedToasts !== null) toastToggle.checked = savedToasts;
  if (toastToggle) {
    toastToggle.addEventListener("change", () => {
      writeBoolPref(LS_OPT_KEYS.toasts, toastToggle.checked);
    });
  }

  // Options: sound effects
  const sfx = createSfxManager();
  controller.setSfxManager(sfx);
  const soundToggle = document.getElementById("soundToggle") as HTMLInputElement | null;
  const savedSfx = readOptionalBoolPref(LS_OPT_KEYS.sfx);
  if (soundToggle && savedSfx !== null) soundToggle.checked = savedSfx;
  sfx.setEnabled(Boolean(soundToggle?.checked ?? false));
  if (soundToggle) {
    soundToggle.addEventListener("change", () => {
      writeBoolPref(LS_OPT_KEYS.sfx, soundToggle.checked);
      sfx.setEnabled(soundToggle.checked);
      sfx.play(soundToggle.checked ? "uiOn" : "uiOff");
    });
  }

  // Options: board coords
  if (boardCoordsToggle) {
    boardCoordsToggle.addEventListener("change", () => {
      applyBoardCoords();
      writeBoolPref(LS_OPT_KEYS.boardCoords, boardCoordsToggle.checked);
    });
  }

  // Options: flip board
  if (flipBoardToggle) {
    flipBoardToggle.addEventListener("change", () => {
      writeBoolPref(LS_OPT_KEYS.flipBoard, flipBoardToggle.checked);
      setBoardFlipped(svg, flipBoardToggle.checked);
      applyBoardCoords();
      controller.refreshView();
    });
  }

  // Options: resize icon + board-height toggle
  const showResizeIconToggle = document.getElementById("showResizeIconToggle") as HTMLInputElement | null;
  const savedShowResizeIcon = readOptionalBoolPref(LS_OPT_KEYS.showResizeIcon);
  if (showResizeIconToggle && savedShowResizeIcon !== null) showResizeIconToggle.checked = savedShowResizeIcon;

  const boardHeightToggle = document.getElementById("boardHeightToggle") as HTMLButtonElement | null;
  const centerArea = document.getElementById("centerArea") as HTMLElement | null;
  const HEIGHT_KEY = "lasca.boardHeightReduced";

  const applyResizeIconVisibility = () => {
    if (!boardHeightToggle) return;
    const showResizeIcon = showResizeIconToggle?.checked ?? (readOptionalBoolPref(LS_OPT_KEYS.showResizeIcon) ?? false);
    boardHeightToggle.style.display = showResizeIcon ? "flex" : "none";
    if (!showResizeIcon && centerArea) {
      centerArea.classList.remove("reduced-height");
      localStorage.setItem(HEIGHT_KEY, "false");
      boardHeightToggle.textContent = "↕️";
      boardHeightToggle.title = "Adjust board height for bottom navigation bar";
    }
  };

  applyResizeIconVisibility();

  if (centerArea && boardHeightToggle) {
    const savedReduced = localStorage.getItem(HEIGHT_KEY) === "true";
    if (boardHeightToggle.style.display !== "none" && savedReduced) {
      centerArea.classList.add("reduced-height");
      boardHeightToggle.textContent = "⬆️";
      boardHeightToggle.title = "Restore full board height";
    }

    boardHeightToggle.addEventListener("click", () => {
      const isReduced = centerArea.classList.toggle("reduced-height");
      if (isReduced) {
        boardHeightToggle.textContent = "⬆️";
        boardHeightToggle.title = "Restore full board height";
      } else {
        boardHeightToggle.textContent = "↕️";
        boardHeightToggle.title = "Adjust board height for bottom navigation bar";
      }
      localStorage.setItem(HEIGHT_KEY, isReduced.toString());
    });
  }

  if (showResizeIconToggle) {
    showResizeIconToggle.addEventListener("change", () => {
      writeBoolPref(LS_OPT_KEYS.showResizeIcon, showResizeIconToggle.checked);
      applyResizeIconVisibility();
    });
  }

  // Option Actions
  const newGameBtn = document.getElementById("newGameBtn") as HTMLButtonElement | null;
  if (newGameBtn) {
    newGameBtn.addEventListener("click", () => {
      const ok = confirm("Start a new Columns Chess game? Current game will be lost.");
      if (!ok) return;
      controller.newGame(createInitialGameStateForVariant(ACTIVE_VARIANT_ID));
    });
  }

  const resignBtn = document.getElementById("resignBtn") as HTMLButtonElement | null;
  if (resignBtn) {
    resignBtn.addEventListener("click", async () => {
      const ok = confirm("Resign the current game?");
      if (!ok) return;
      await controller.resign();
    });
  }

  // Save / Load (offline only for Columns Chess today, but works regardless).
  const saveGameBtn = document.getElementById("saveGameBtn") as HTMLButtonElement | null;
  const loadGameBtn = document.getElementById("loadGameBtn") as HTMLButtonElement | null;
  const loadGameInput = document.getElementById("loadGameInput") as HTMLInputElement | null;
  if (saveGameBtn) {
    saveGameBtn.addEventListener("click", () => {
      const currentState = controller.getState();
      saveGameToFile(currentState, history, "columns_chess-save.json");
    });
  }
  if (loadGameBtn && loadGameInput) {
    loadGameBtn.addEventListener("click", () => loadGameInput.click());
    loadGameInput.addEventListener("change", async () => {
      const file = loadGameInput.files?.[0];
      if (!file) return;
      try {
        const loaded = await loadGameFromFile(file, {
          variantId: "columns_chess",
          rulesetId: "columns_chess",
          boardSize: 8,
        });
        controller.loadGame(loaded.state, loaded.history);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Failed to load game:", error);
        const msg = error instanceof Error ? error.message : String(error);
        alert(`Failed to load game: ${msg}`);
      }
      loadGameInput.value = "";
    });
  }

  if (import.meta.hot) {
    import.meta.hot.accept(() => {
      applyBoardCoords();
      window.location.reload();
    });
  }
});
