import { createInitialGameStateForVariant } from "./game/state.ts";
import type { GameState } from "./game/state.ts";
import { renderGameState } from "./render/renderGameState.ts";
import { initSplitLayout } from "./ui/layout/splitLayout";
import { loadSvgFileInto } from "./render/loadSvgFile";
import { createThemeManager } from "./theme/themeManager";
import type { Player } from "./types";
import { GameController } from "./controller/gameController.ts";
import { ensureOverlayLayer } from "./render/overlays.ts";
import { ALL_NODES } from "./game/board.ts";
import { saveGameToFile, loadGameFromFile } from "./game/saveLoad.ts";
import { HistoryManager } from "./game/historyManager.ts";
import { RULES } from "./game/ruleset.ts";
import { renderBoardCoords } from "./render/boardCoords";
import { AIManager } from "./ai/aiManager.ts";
import { bindEvaluationPanel } from "./ui/evaluationPanel";
import { installHoldDrag } from "./ui/holdDrag";
import { getVariantById, isVariantId, rulesBoardLine } from "./variants/variantRegistry";
import type { VariantId } from "./variants/variantTypes";
import { createDriverAsync } from "./driver/createDriver.ts";

const FALLBACK_VARIANT_ID: VariantId = "dama_8_classic_standard";

function getActiveDamaVariantId(): VariantId {
  const raw = window.localStorage.getItem("lasca.variantId");
  if (raw && isVariantId(raw)) {
    const v = getVariantById(raw);
    if (v.rulesetId === "dama") return v.variantId;
  }
  return FALLBACK_VARIANT_ID;
}

const ACTIVE_VARIANT_ID: VariantId = getActiveDamaVariantId();

const LS_OPT_KEYS = {
  moveHints: "lasca.opt.moveHints",
  animations: "lasca.opt.animations",
  boardCoords: "lasca.opt.boardCoords",
  threefold: "lasca.opt.threefold",
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
  const activeVariant = getVariantById(ACTIVE_VARIANT_ID);

  const gameTitleEl = document.getElementById("gameTitle");
  if (gameTitleEl) gameTitleEl.textContent = activeVariant.displayName;

  const boardWrap = document.getElementById("boardWrap") as HTMLElement | null;
  if (!boardWrap) throw new Error("Missing board container: #boardWrap");

  const svgAsset = activeVariant.svgAsset ?? "./assets/damasca_board.svg";
  const svg = await loadSvgFileInto(boardWrap, svgAsset);

  const boardCoordsToggle = document.getElementById("boardCoordsToggle") as HTMLInputElement | null;
  const savedBoardCoords = readOptionalBoolPref(LS_OPT_KEYS.boardCoords);
  if (boardCoordsToggle && savedBoardCoords !== null) {
    boardCoordsToggle.checked = savedBoardCoords;
  }
  const applyBoardCoords = () =>
    renderBoardCoords(svg, Boolean(boardCoordsToggle?.checked), activeVariant.boardSize);
  applyBoardCoords();

  initSplitLayout();

  const themeDropdown = document.getElementById("themeDropdown") as HTMLElement | null;
  const themeManager = createThemeManager(svg);
  await themeManager.bindThemeDropdown(themeDropdown);

  const piecesLayer = svg.querySelector("#pieces") as SVGGElement | null;
  if (!piecesLayer) throw new Error("Missing SVG group inside board: #pieces");

  // Dama has no stacks, so there is no stack inspector.
  const inspector = null;

  // Create initial game state and render once
  const state = createInitialGameStateForVariant(ACTIVE_VARIANT_ID);

  // Create history manager and record initial state
  const history = new HistoryManager();
  history.push(state);

  // Update left panel status
  const elTurn = document.getElementById("statusTurn");
  const elRulesBoard = document.getElementById("statusRulesBoard");
  const elPhase = document.getElementById("statusPhase");
  const elMsg = document.getElementById("statusMessage");
  if (elTurn) elTurn.textContent = state.toMove === "B" ? "Black" : "White";
  if (elRulesBoard) elRulesBoard.textContent = rulesBoardLine(activeVariant.rulesetId, activeVariant.boardSize);
  if (elPhase) elPhase.textContent = state.phase.charAt(0).toUpperCase() + state.phase.slice(1);
  if (elMsg) elMsg.textContent = "—";

  renderGameState(svg, piecesLayer, inspector, state);

  // In dev, force a full reload when modules (like state) change
  if (import.meta.hot) {
    import.meta.hot.accept(() => window.location.reload());
  }

  // PR 4+5: interaction — controller binds selection and applies quiet moves
  ensureOverlayLayer(svg);
  const driver = await createDriverAsync({
    state,
    history,
    search: window.location.search,
    envMode: import.meta.env.VITE_PLAY_MODE,
    envServerUrl: import.meta.env.VITE_SERVER_URL,
  });
  const controller = new GameController(svg, piecesLayer, inspector, state, history, driver);
  controller.bind();

  // Apply startup preferences (if present) without changing defaults.
  const savedMoveHints = readOptionalBoolPref(LS_OPT_KEYS.moveHints);
  const moveHintsToggle = document.getElementById("moveHintsToggle") as HTMLInputElement | null;
  if (moveHintsToggle && savedMoveHints !== null) {
    moveHintsToggle.checked = savedMoveHints;
  }
  if (moveHintsToggle) {
    controller.setMoveHints(Boolean(moveHintsToggle.checked));
  }

  const savedAnimations = readOptionalBoolPref(LS_OPT_KEYS.animations);
  const animationsToggle = document.getElementById("animationsToggle") as HTMLInputElement | null;
  if (animationsToggle && savedAnimations !== null) {
    animationsToggle.checked = savedAnimations;
  }
  if (animationsToggle) {
    controller.setAnimations(Boolean(animationsToggle.checked));
  }

  const savedThreefold = readOptionalBoolPref(LS_OPT_KEYS.threefold);
  const threefoldToggle = document.getElementById("threefoldToggle") as HTMLInputElement | null;
  if (threefoldToggle && savedThreefold !== null) {
    threefoldToggle.checked = savedThreefold;
  }
  if (threefoldToggle) {
    RULES.drawByThreefold = Boolean(threefoldToggle.checked);
  }

  bindEvaluationPanel(controller);

  // AI (human vs AI / AI vs AI)
  const aiManager = new AIManager(controller);
  aiManager.bind();

  // Wire up move hints toggle
  if (moveHintsToggle) {
    moveHintsToggle.addEventListener("change", () => {
      controller.setMoveHints(moveHintsToggle.checked);
      writeBoolPref(LS_OPT_KEYS.moveHints, moveHintsToggle.checked);
    });
  }

  // Wire up animations toggle
  if (animationsToggle) {
    animationsToggle.addEventListener("change", () => {
      controller.setAnimations(animationsToggle.checked);
      writeBoolPref(LS_OPT_KEYS.animations, animationsToggle.checked);
    });
  }

  if (boardCoordsToggle) {
    boardCoordsToggle.addEventListener("change", () => {
      applyBoardCoords();
      writeBoolPref(LS_OPT_KEYS.boardCoords, boardCoordsToggle.checked);
    });
  }

  // Wire up threefold repetition toggle
  if (threefoldToggle) {
    threefoldToggle.addEventListener("change", () => {
      RULES.drawByThreefold = threefoldToggle.checked;
      writeBoolPref(LS_OPT_KEYS.threefold, threefoldToggle.checked);
    });
  }

  // Wire up new game button
  const newGameBtn = document.getElementById("newGameBtn") as HTMLButtonElement | null;
  if (newGameBtn) {
    newGameBtn.addEventListener("click", () => {
      const confirmed = confirm("Start a new game? This will clear the current game and undo history.");
      if (confirmed) {
        const freshState = createInitialGameStateForVariant(ACTIVE_VARIANT_ID);
        controller.newGame(freshState);
      }
    });
  }

  // Wire up save/load game buttons
  const saveGameBtn = document.getElementById("saveGameBtn") as HTMLButtonElement | null;
  const loadGameBtn = document.getElementById("loadGameBtn") as HTMLButtonElement | null;
  const loadGameInput = document.getElementById("loadGameInput") as HTMLInputElement | null;
  const exportHistoryBtn = document.getElementById("exportHistoryBtn") as HTMLButtonElement | null;

  if (saveGameBtn) {
    saveGameBtn.addEventListener("click", () => {
      const currentState = controller.getState();
      saveGameToFile(currentState, history, activeVariant.defaultSaveName);
    });
  }

  if (exportHistoryBtn) {
    exportHistoryBtn.addEventListener("click", () => {
      const historyJson = controller.exportMoveHistory();
      const timestamp = new Date().toISOString().replace(/:/g, "-").split(".")[0];
      const blob = new Blob([historyJson], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${ACTIVE_VARIANT_ID}-history-${timestamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  if (loadGameBtn && loadGameInput) {
    loadGameBtn.addEventListener("click", () => {
      loadGameInput.click();
    });

    loadGameInput.addEventListener("change", async () => {
      const file = loadGameInput.files?.[0];
      if (!file) return;

      try {
        const loaded = await loadGameFromFile(file, {
          variantId: activeVariant.variantId,
          rulesetId: activeVariant.rulesetId,
          boardSize: activeVariant.boardSize,
        });
        controller.loadGame(loaded.state, loaded.history);
      } catch (error) {
        console.error("Failed to load game:", error);
        const msg = error instanceof Error ? error.message : String(error);
        alert(`Failed to load game: ${msg}`);
      }

      // Reset file input so the same file can be loaded again
      loadGameInput.value = "";
    });
  }

  // Wire up undo/redo buttons
  const undoBtn = document.getElementById("undoBtn") as HTMLButtonElement | null;
  const redoBtn = document.getElementById("redoBtn") as HTMLButtonElement | null;
  const moveHistoryEl = document.getElementById("moveHistory") as HTMLElement | null;

  const updateHistoryUI = (reason?: import("./controller/gameController.ts").HistoryChangeReason) => {
    if (undoBtn) undoBtn.disabled = !controller.canUndo();
    if (redoBtn) redoBtn.disabled = !controller.canRedo();

    if (moveHistoryEl) {
      const historyData = controller.getHistory();
      if (historyData.length === 0) {
        moveHistoryEl.textContent = "No moves yet";
      } else {
        moveHistoryEl.innerHTML = historyData
          .map((entry, idx) => {
            if (idx === 0) {
              const baseStyle = entry.isCurrent
                ? "font-weight: bold; color: rgba(255, 255, 255, 0.95); background: rgba(255, 255, 255, 0.1); padding: 2px 6px; border-radius: 4px;"
                : "";
              const style = `${baseStyle}${baseStyle ? " " : ""}cursor: pointer;`;
              const currentAttr = entry.isCurrent ? ' data-is-current="1"' : "";
              return `<div data-history-index="${entry.index}"${currentAttr} style="${style}">Start</div>`;
            }

            // For moves: toMove indicates who's about to move, so invert to get who just moved
            // If toMove is "B", White just moved. If toMove is "W", Black just moved.
            const playerWhoMoved = entry.toMove === "B" ? "White" : "Black";
            const playerIcon = playerWhoMoved === "Black" ? "⚫" : "⚪";

            // Calculate move number: each player's move increments the counter
            const moveNum = playerWhoMoved === "Black"
              ? Math.ceil(idx / 2) // Black: moves 1, 3, 5... → move# 1, 2, 3...
              : Math.floor((idx + 1) / 2); // White: moves 2, 4, 6... → move# 1, 2, 3...

            let label = `${moveNum}. ${playerIcon}`;
            if (entry.notation) {
              label += ` ${entry.notation}`;
            }
            const baseStyle = entry.isCurrent
              ? "font-weight: bold; color: rgba(255, 255, 255, 0.95); background: rgba(255, 255, 255, 0.1); padding: 2px 6px; border-radius: 4px;"
              : "";
            const style = `${baseStyle}${baseStyle ? " " : ""}cursor: pointer;`;
            const currentAttr = entry.isCurrent ? ' data-is-current="1"' : "";
            return `<div data-history-index="${entry.index}"${currentAttr} style="${style}">${label}</div>`;
          })
          .join("");
      }

      // Keep the latest move visible.
      // Use rAF so layout reflects the updated HTML before scrolling.
      requestAnimationFrame(() => {
        if (reason === "jump" || reason === "undo" || reason === "redo") {
          const currentEl = moveHistoryEl.querySelector('[data-is-current="1"]') as HTMLElement | null;
          if (currentEl) currentEl.scrollIntoView({ block: "nearest" });
          return;
        }
        moveHistoryEl.scrollTop = moveHistoryEl.scrollHeight;
      });
    }
  };

  if (moveHistoryEl) {
    moveHistoryEl.addEventListener("click", (ev) => {
      const target = ev.target as HTMLElement;
      const entryEl = target.closest("[data-history-index]") as HTMLElement | null;
      if (!entryEl) return;
      const index = Number(entryEl.dataset.historyIndex);
      if (!Number.isFinite(index)) return;
      controller.jumpToHistory(index);
    });
  }

  if (undoBtn) {
    undoBtn.addEventListener("click", () => {
      controller.undo();
    });
  }

  if (redoBtn) {
    redoBtn.addEventListener("click", () => {
      controller.redo();
    });
  }

  // Wire up resign button
  const resignBtn = document.getElementById("resignBtn") as HTMLButtonElement | null;
  if (resignBtn) {
    resignBtn.addEventListener("click", () => {
      const currentPlayer = controller.getState().toMove === "B" ? "Black" : "White";
      const confirmed = confirm(`Are you sure you want to resign as ${currentPlayer}?`);
      if (confirmed) {
        controller.resign();
      }
    });
  }

  controller.addHistoryChangeCallback(updateHistoryUI);
  updateHistoryUI(); // Initial update

  // If the SVG is hot-reloaded in dev, re-render coordinate labels.
  if (import.meta.hot) {
    import.meta.hot.accept(() => applyBoardCoords());
  }

  // Wire up collapsible sections
  const collapsibleSections = document.querySelectorAll("[data-toggle]");
  collapsibleSections.forEach((header) => {
    header.addEventListener("click", () => {
      const sectionId = header.getAttribute("data-toggle");
      if (!sectionId) return;

      const section = document.querySelector(`[data-section=\"${sectionId}\"]`);
      if (!section) return;

      section.classList.toggle("collapsed");

      // Save collapsed state to localStorage
      const isCollapsed = section.classList.contains("collapsed");
      localStorage.setItem(`section-${sectionId}-collapsed`, isCollapsed.toString());
    });
  });

  // Restore collapsed states from localStorage
  const sectionsWithState = document.querySelectorAll("[data-section]");
  sectionsWithState.forEach((section) => {
    const sectionId = section.getAttribute("data-section");
    if (!sectionId) return;

    const savedState = localStorage.getItem(`section-${sectionId}-collapsed`);
    if (savedState === "true") {
      section.classList.add("collapsed");
    }
  });

  // Board height adjustment toggle (for Android tablets with bottom nav bar)
  const boardHeightToggle = document.getElementById("boardHeightToggle") as HTMLButtonElement | null;
  const centerArea = document.getElementById("centerArea") as HTMLElement | null;

  if (boardHeightToggle && centerArea) {
    const STORAGE_KEY = "lasca.boardHeightReduced";
    const POS_KEY = "lasca.boardHeightTogglePos";

    const isToggleVisible = () => window.getComputedStyle(boardHeightToggle).display !== "none";

    const drag = installHoldDrag(boardHeightToggle, {
      storageKey: POS_KEY,
      holdDelayMs: 250,
    });

    // Restore saved state
    const savedReduced = localStorage.getItem(STORAGE_KEY) === "true";
    if (isToggleVisible() && savedReduced) {
      centerArea.classList.add("reduced-height");
      boardHeightToggle.textContent = "⬆️";
      boardHeightToggle.title = "Restore full board height";
    } else {
      centerArea.classList.remove("reduced-height");
      boardHeightToggle.textContent = "↕️";
      boardHeightToggle.title = "Adjust board height for bottom navigation bar";
    }

    boardHeightToggle.addEventListener("click", (e) => {
      if (drag.wasDraggedRecently()) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const isReduced = centerArea.classList.toggle("reduced-height");

      // Update button appearance
      if (isReduced) {
        boardHeightToggle.textContent = "⬆️";
        boardHeightToggle.title = "Restore full board height";
      } else {
        boardHeightToggle.textContent = "↕️";
        boardHeightToggle.title = "Adjust board height for bottom navigation bar";
      }

      // Save state
      localStorage.setItem(STORAGE_KEY, isReduced.toString());
    });

    // Dev helper: expose to console for testing on desktop
    (window as any).toggleBoardHeightButtonVisibility = () => {
      const currentDisplay = window.getComputedStyle(boardHeightToggle).display;
      if (currentDisplay === "none") {
        boardHeightToggle.style.display = "flex";
        console.log("Board height button is now visible");
      } else {
        boardHeightToggle.style.display = "";
        console.log("Board height button visibility reset to CSS default");
      }

      if (window.getComputedStyle(boardHeightToggle).display === "none") {
        centerArea.classList.remove("reduced-height");
      }
    };
  }

  // Dev-only: expose rerender/random that also sync controller state
  // Note: boardDebug is disabled since we now have the move hints feature
  if (import.meta.env && import.meta.env.DEV) {
    // const mod = await import("./dev/boardDebug.ts");
    let currentState = state;
    // mod.installBoardDebug(svg, () => currentState);

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
      const elRulesBoard = document.getElementById("statusRulesBoard");
      const elPhase = document.getElementById("statusPhase");
      const elMsg = document.getElementById("statusMessage");
      if (elTurn) elTurn.textContent = next.toMove === "B" ? "Black" : "White";
      if (elRulesBoard) elRulesBoard.textContent = rulesBoardLine(activeVariant.rulesetId, activeVariant.boardSize);
      if (elPhase) elPhase.textContent = next.phase.charAt(0).toUpperCase() + next.phase.slice(1);
      if (elMsg) elMsg.textContent = "—";
      currentState = next;
      controller.setState(currentState);
      w.__state = currentState;
    };
    w.__random = (totalPerSide: number = 11, toMove: Player = "B", testMode?: string) => {
      // Special test mode for repeat-capture rule
      if (testMode === "R") {
        // Create a scenario where a White officer can potentially loop
        // Multiple Black stacks with Black pieces underneath (same color)
        // Arranged to create potential capture loops
        const s: GameState = {
          board: new Map([
            // White officer starting position
            ["r1c1", [{ owner: "W", rank: "O" }]],

            // Black stacks with Black pieces underneath (same color stacks)
            // Arranged to create potential capture loops
            ["r2c2", [{ owner: "B", rank: "S" }, { owner: "B", rank: "S" }, { owner: "B", rank: "O" }]], // Black-Black-Black officer
            ["r2c4", [{ owner: "B", rank: "S" }, { owner: "B", rank: "O" }]], // Black-Black officer
            ["r4c2", [{ owner: "B", rank: "S" }, { owner: "B", rank: "S" }, { owner: "B", rank: "S" }]], // Black-Black-Black soldier
            ["r4c4", [{ owner: "B", rank: "S" }, { owner: "B", rank: "O" }]], // Black-Black officer
            ["r3c5", [{ owner: "B", rank: "S" }, { owner: "B", rank: "S" }]], // Black-Black soldier

            // Additional pieces to prevent immediate game over
            ["r5c0", [{ owner: "B", rank: "S" }]],
            ["r6c6", [{ owner: "B", rank: "O" }]], // Officer on promotion row is OK
            ["r5c1", [{ owner: "B", rank: "S" }]],
          ]),
          toMove: "W",
          phase: "idle",
        };
        w.__rerender(s);
        return s;
      }

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
