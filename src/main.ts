import { createInitialGameState } from "./game/state.ts";
import type { GameState } from "./game/state.ts";
import { renderGameState } from "./render/renderGameState.ts";
import { createStackInspector } from "./ui/stackInspector";
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

window.addEventListener("DOMContentLoaded", async () => {
  const boardWrap = document.getElementById("boardWrap") as HTMLElement | null;
  if (!boardWrap) throw new Error("Missing board container: #boardWrap");

  const boardUrl = new URL("./assets/lasca_board.svg", import.meta.url);
  const svg = await loadSvgFileInto(boardWrap, boardUrl);

  const boardCoordsToggle = document.getElementById("boardCoordsToggle") as HTMLInputElement | null;
  const applyBoardCoords = () => renderBoardCoords(svg, Boolean(boardCoordsToggle?.checked));
  applyBoardCoords();

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
  
  // Create history manager and record initial state
  const history = new HistoryManager();
  history.push(state);

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
  const controller = new GameController(svg, piecesLayer, inspector, state, history);
  controller.bind();

  // Wire up move hints toggle
  const moveHintsToggle = document.getElementById("moveHintsToggle") as HTMLInputElement | null;
  if (moveHintsToggle) {
    moveHintsToggle.addEventListener("change", () => {
      controller.setMoveHints(moveHintsToggle.checked);
    });
  }

  // Wire up animations toggle
  const animationsToggle = document.getElementById("animationsToggle") as HTMLInputElement | null;
  if (animationsToggle) {
    animationsToggle.addEventListener("change", () => {
      controller.setAnimations(animationsToggle.checked);
    });
  }

  if (boardCoordsToggle) {
    boardCoordsToggle.addEventListener("change", () => applyBoardCoords());
  }

  // Wire up threefold repetition toggle
  const threefoldToggle = document.getElementById("threefoldToggle") as HTMLInputElement | null;
  if (threefoldToggle) {
    threefoldToggle.addEventListener("change", () => {
      RULES.drawByThreefold = threefoldToggle.checked;
    });
  }

  // Wire up new game button
  const newGameBtn = document.getElementById("newGameBtn") as HTMLButtonElement | null;
  if (newGameBtn) {
    newGameBtn.addEventListener("click", () => {
      const confirmed = confirm("Start a new game? This will clear the current game and undo history.");
      if (confirmed) {
        const freshState = createInitialGameState();
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
      const timestamp = new Date().toISOString().replace(/:/g, "-").split(".")[0];
      saveGameToFile(currentState, history, `lasca-game-${timestamp}.json`);
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
      a.download = `lasca-history-${timestamp}.json`;
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
        const loaded = await loadGameFromFile(file);
        controller.loadGame(loaded.state, loaded.history);
      } catch (error) {
        console.error("Failed to load game:", error);
        alert(`Failed to load game: ${error}`);
      }

      // Reset file input so the same file can be loaded again
      loadGameInput.value = "";
    });
  }

  // Wire up undo/redo buttons
  const undoBtn = document.getElementById("undoBtn") as HTMLButtonElement | null;
  const redoBtn = document.getElementById("redoBtn") as HTMLButtonElement | null;
  const moveHistoryEl = document.getElementById("moveHistory") as HTMLElement | null;

  const updateHistoryUI = () => {
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
              const style = entry.isCurrent 
                ? "font-weight: bold; color: rgba(255, 255, 255, 0.95); background: rgba(255, 255, 255, 0.1); padding: 2px 6px; border-radius: 4px;"
                : "";
              return `<div style="${style}">Start</div>`;
            }
            
            // For moves: toMove indicates who's about to move, so invert to get who just moved
            // If toMove is "B", White just moved. If toMove is "W", Black just moved.
            const playerWhoMoved = entry.toMove === "B" ? "White" : "Black";
            const playerIcon = playerWhoMoved === "Black" ? "⚫" : "⚪";
            
            // Calculate move number: each player's move increments the counter
            const moveNum = playerWhoMoved === "Black" 
              ? Math.ceil(idx / 2)  // Black: moves 1, 3, 5... → move# 1, 2, 3...
              : Math.floor((idx + 1) / 2); // White: moves 2, 4, 6... → move# 1, 2, 3...
            
            let label = `${moveNum}. ${playerIcon}`;
            if (entry.notation) {
              label += ` ${entry.notation}`;
            }
            const style = entry.isCurrent 
              ? "font-weight: bold; color: rgba(255, 255, 255, 0.95); background: rgba(255, 255, 255, 0.1); padding: 2px 6px; border-radius: 4px;"
              : "";
            return `<div style="${style}">${label}</div>`;
          })
          .join("");
      }
    }
  };

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

  controller.setHistoryChangeCallback(updateHistoryUI);
  updateHistoryUI(); // Initial update

  // If the SVG is hot-reloaded in dev, re-render coordinate labels.
  if (import.meta.hot) {
    import.meta.hot.accept(() => applyBoardCoords());
  }

  // Wire up collapsible sections
  const collapsibleSections = document.querySelectorAll('[data-toggle]');
  collapsibleSections.forEach((header) => {
    header.addEventListener('click', (e) => {
      const sectionId = header.getAttribute('data-toggle');
      if (!sectionId) return;
      
      const section = document.querySelector(`[data-section="${sectionId}"]`);
      if (!section) return;
      
      section.classList.toggle('collapsed');
      
      // Save collapsed state to localStorage
      const isCollapsed = section.classList.contains('collapsed');
      localStorage.setItem(`section-${sectionId}-collapsed`, isCollapsed.toString());
    });
  });

  // Restore collapsed states from localStorage
  const sectionsWithState = document.querySelectorAll('[data-section]');
  sectionsWithState.forEach((section) => {
    const sectionId = section.getAttribute('data-section');
    if (!sectionId) return;
    
    const savedState = localStorage.getItem(`section-${sectionId}-collapsed`);
    if (savedState === 'true') {
      section.classList.add('collapsed');
    }
  });

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
      const elPhase = document.getElementById("statusPhase");
      const elMsg = document.getElementById("statusMessage");
      if (elTurn) elTurn.textContent = next.toMove === "B" ? "Black" : "White";
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
