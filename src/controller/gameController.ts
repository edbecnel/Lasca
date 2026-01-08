import type { GameState } from "../game/state.ts";
import type { Move } from "../game/moveTypes.ts";
import type { createStackInspector } from "../ui/stackInspector";
import { ensureOverlayLayer, clearOverlays, drawSelection, drawTargets, drawHighlightRing } from "../render/overlays.ts";
import { generateLegalMoves } from "../game/movegen.ts";
import { renderGameState } from "../render/renderGameState.ts";
import { RULES } from "../game/ruleset.ts";
import { getWinner, checkCurrentPlayerLost } from "../game/gameOver.ts";
import { HistoryManager } from "../game/historyManager.ts";
import { hashGameState } from "../game/hashState.ts";
import { animateStack } from "../render/animateMove.ts";
import { ensureStackCountsLayer } from "../render/stackCountsLayer.ts";
import { nodeIdToA1 } from "../game/coordFormat.ts";
import { getDamaCaptureRemovalMode } from "../game/damaCaptureChain.ts";
import { parseNodeId } from "../game/coords.ts";
import { ensurePreviewLayer, clearPreviewLayer } from "../render/previewLayer.ts";
import type { GameDriver } from "../driver/gameDriver.ts";
import { LocalDriver } from "../driver/localDriver.ts";
import { RemoteDriver } from "../driver/remoteDriver.ts";

export type HistoryChangeReason = "move" | "undo" | "redo" | "jump" | "newGame" | "loadGame" | "gameOver";

export class GameController {
  private svg: SVGSVGElement;
  private piecesLayer: SVGGElement;
  private inspector: ReturnType<typeof createStackInspector> | null;
  private overlayLayer: SVGGElement;
  private previewLayer: SVGGElement;
  private state: GameState;
  private selected: string | null = null;
  private currentTargets: string[] = [];
  private currentMoves: Move[] = [];
  private mandatoryCapture: boolean = false;
  private lockedCaptureFrom: string | null = null;
  private lockedCaptureDir: { dr: number; dc: number } | null = null;
  private jumpedSquares: Set<string> = new Set();
  private isGameOver: boolean = false;
  private moveHintsEnabled: boolean = false;
  private animationsEnabled: boolean = true;
  private bannerTimer: number | null = null;
  private remainderTimer: number | null = null;
  private history: HistoryManager;
  private driver: GameDriver;
  private historyListeners: Array<(reason: HistoryChangeReason) => void> = [];
  private inputEnabled: boolean = true;
  private currentTurnNodes: string[] = []; // Track node IDs visited in current turn
  private currentTurnHasCapture: boolean = false; // Track if current turn includes captures
  private repetitionCounts: Map<string, number> = new Map();
  private onlinePollTimer: number | null = null;
  private onlineRealtimeEnabled: boolean = false;

  private async copyTextToClipboard(text: string): Promise<boolean> {
    if (!text) return false;

    // Modern async clipboard API (works on https and usually localhost).
    try {
      const anyNav = typeof navigator !== "undefined" ? (navigator as any) : null;
      const clip = anyNav?.clipboard;
      if (clip && typeof clip.writeText === "function") {
        await clip.writeText(text);
        return true;
      }
    } catch {
      // fall through to legacy fallback
    }

    // Legacy fallback.
    if (typeof document === "undefined") return false;
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }

  private bindRoomIdCopyButton(): void {
    const btn = document.getElementById("copyRoomIdBtn") as HTMLButtonElement | null;
    if (!btn) return;

    btn.addEventListener("click", async () => {
      if (!(this.driver instanceof RemoteDriver)) return;
      const roomId = this.driver.getRoomId();
      if (!roomId) return;
      await this.copyTextToClipboard(roomId);
    });
  }

  private isLocalPlayersTurn(): boolean {
    if (!(this.driver instanceof RemoteDriver)) return true;
    const color = this.driver.getPlayerColor();
    if (!color) return false;
    return this.state.toMove === color;
  }

  private startOnlinePolling(): void {
    if (!(this.driver instanceof RemoteDriver)) return;
    const remote = this.driver;
    if (this.onlinePollTimer || this.onlineRealtimeEnabled) return;

    // Prefer realtime server push (SSE). Falls back to polling if unavailable.
    const startedRealtime = remote.startRealtime(() => {
      if (this.isGameOver) return;

      this.state = remote.getState();
      // Any opponent update invalidates local in-progress UI selection/chain.
      this.lockedCaptureFrom = null;
      this.lockedCaptureDir = null;
      this.jumpedSquares.clear();
      this.currentTurnNodes = [];
      this.currentTurnHasCapture = false;
      this.clearSelection();
      this.renderAuthoritative();

      const allLegal = generateLegalMoves(this.state);
      this.mandatoryCapture = allLegal.length > 0 && allLegal[0].kind === "capture";
      this.recomputeRepetitionCounts();
      this.checkAndHandleCurrentPlayerLost();
      this.updatePanel();

      this.fireHistoryChange("move");
    });

    if (startedRealtime) {
      this.onlineRealtimeEnabled = true;
      return;
    }

    // Simple polling keeps both tabs in sync without websockets.
    this.onlinePollTimer = window.setInterval(async () => {
      if (this.isGameOver) return;
      try {
        const updated = await remote.fetchLatest();
        if (!updated) return;

        this.state = remote.getState();
        // Any opponent update invalidates local in-progress UI selection/chain.
        this.lockedCaptureFrom = null;
        this.lockedCaptureDir = null;
        this.jumpedSquares.clear();
        this.currentTurnNodes = [];
        this.currentTurnHasCapture = false;
        this.clearSelection();
        this.renderAuthoritative();

        const allLegal = generateLegalMoves(this.state);
        this.mandatoryCapture = allLegal.length > 0 && allLegal[0].kind === "capture";
        this.recomputeRepetitionCounts();
        this.checkAndHandleCurrentPlayerLost();
        this.updatePanel();

        // Remote snapshots can advance history/notation; notify listeners so UI updates
        // (e.g., move list) without requiring local input.
        this.fireHistoryChange("move");
      } catch {
        // Ignore transient network errors; server is best-effort.
      }
    }, 750);
  }

  private drawPendingDamaCapturedMarks(): void {
    const rulesetId = this.state.meta?.rulesetId ?? "lasca";
    if (rulesetId !== "dama") return;
    if (this.jumpedSquares.size === 0) return;

    const mode = getDamaCaptureRemovalMode(this.state);
    if (mode !== "end_of_sequence") return;

    for (const over of this.jumpedSquares) {
      // Mark pieces that have been captured but remain on-board until end-of-sequence.
      drawHighlightRing(this.overlayLayer, over, "#ff6b6b", 5);
    }
  }

  /**
   * Single render pipeline for authoritative state updates.
   *
   * Ordering contract:
   * 1) render board + pieces
   * 2) draw previews last
   * 3) safety belt: re-append preview-related layers so they stay on top
   */
  private renderAuthoritative(): void {
    // 1) board/pieces
    renderGameState(this.svg, this.piecesLayer, this.inspector, this.state);

    // 2) previews (currently none; kept for move/stack preview rendering)
    // 3) keep preview layers on top (board coords / other layers might be appended later)
    const countsLayer = ensureStackCountsLayer(this.svg);
    this.svg.appendChild(countsLayer);
    this.svg.appendChild(this.previewLayer);
  }

  private clearSelectionForInputLock(): void {
    // Clear only the *interactive* selection/targets.
    // Do NOT clear capture-chain constraints like `lockedCaptureFrom`/`jumpedSquares`,
    // otherwise the same piece can become capturable again during a chain.
    this.selected = null;
    this.currentTargets = [];
    this.currentMoves = [];
    clearOverlays(this.overlayLayer);
    clearPreviewLayer(this.previewLayer);
    this.drawPendingDamaCapturedMarks();
    this.updatePanel();
  }

  private captureDir(fromId: string, toId: string): { dr: number; dc: number } {
    const a = parseNodeId(fromId);
    const b = parseNodeId(toId);
    const dr = Math.sign(b.r - a.r);
    const dc = Math.sign(b.c - a.c);
    return { dr, dc };
  }

  constructor(
    svg: SVGSVGElement,
    piecesLayer: SVGGElement,
    inspector: ReturnType<typeof createStackInspector> | null,
    state: GameState,
    history: HistoryManager,
    driver?: GameDriver
  ) {
    this.svg = svg;
    this.piecesLayer = piecesLayer;
    this.inspector = inspector;
    this.overlayLayer = ensureOverlayLayer(svg);
    this.previewLayer = ensurePreviewLayer(svg);
    this.state = state;
    this.history = history;
    this.driver = driver ?? new LocalDriver(state, history);
  }

  bind(): void {
    this.svg.addEventListener("click", (ev) => this.onClick(ev));

    // In online mode, the RemoteDriver may have already applied a server snapshot
    // during startup (create/join/resume). Sync controller state to the driver so
    // the board and history panel are consistent immediately.
    if (this.driver instanceof RemoteDriver) {
      this.state = this.driver.getState();
      this.renderAuthoritative();
    }

    // Check for mandatory captures at game start
    const allLegal = generateLegalMoves(this.state);
    this.mandatoryCapture = allLegal.length > 0 && allLegal[0].kind === "capture";
    this.recomputeRepetitionCounts();
    this.updatePanel();

    this.bindRoomIdCopyButton();

    this.startOnlinePolling();
  }

  setMoveHints(enabled: boolean): void {
    this.moveHintsEnabled = enabled;
    // If we have a selection, refresh it to show/hide hints
    if (this.selected) {
      this.showSelection(this.selected);
    }
  }

  setAnimations(enabled: boolean): void {
    this.animationsEnabled = enabled;
  }

  setHistoryChangeCallback(callback: (reason: HistoryChangeReason) => void): void {
    this.historyListeners = [callback];
  }

  addHistoryChangeCallback(callback: (reason: HistoryChangeReason) => void): void {
    this.historyListeners.push(callback);
  }

  private checkAndHandleCurrentPlayerLost(): boolean {
    const result = checkCurrentPlayerLost(this.state);
    if (result.winner) {
      if (this.isGameOver) return true;
      this.isGameOver = true;
      this.clearSelection();
      this.showBanner(result.reason || "Game Over", 0);
      this.updatePanel();
      this.fireHistoryChange("gameOver");
      return true;
    }
    return false;
  }

  private fireHistoryChange(reason: HistoryChangeReason): void {
    for (const cb of this.historyListeners) {
      try {
        cb(reason);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[controller] history listener error", err);
      }
    }
  }

  isOver(): boolean {
    return this.isGameOver;
  }

  setInputEnabled(enabled: boolean): void {
    this.inputEnabled = enabled;
    if (!enabled) {
      // Avoid leaving stale selection overlays when AI is running.
      this.clearSelectionForInputLock();
    }
  }

  getCaptureChainConstraints(): {
    lockedCaptureFrom: string | null;
    lockedCaptureDir: { dr: number; dc: number } | null;
    jumpedSquares: string[];
  } {
    return {
      lockedCaptureFrom: this.lockedCaptureFrom,
      lockedCaptureDir: this.lockedCaptureDir,
      jumpedSquares: Array.from(this.jumpedSquares),
    };
  }

  getLegalMovesForTurn(): Move[] {
    const rulesetId = this.state.meta?.rulesetId ?? "lasca";
    const captureRemoval = rulesetId === "dama" ? getDamaCaptureRemovalMode(this.state) : null;
    // All rulesets with multi-capture chains must prevent re-jumping the same square.
    const chainRules = rulesetId === "lasca" || rulesetId === "dama" || rulesetId === "damasca";
    // Only Dama/Damasca have capture-direction constraints (Officer zigzag).
    const chainHasDir = rulesetId === "dama" || rulesetId === "damasca";
    const constraints = this.lockedCaptureFrom
      ? {
          forcedFrom: this.lockedCaptureFrom,
          ...(chainRules
            ? {
                excludedJumpSquares: this.jumpedSquares,
                ...(chainHasDir ? { lastCaptureDir: this.lockedCaptureDir ?? undefined } : {}),
              }
            : {}),
        }
      : undefined;
    const allLegal = generateLegalMoves(this.state, constraints);

    if (this.lockedCaptureFrom) {
      return allLegal.filter((m) => m.kind === "capture");
    }

    return allLegal;
  }

  async playMove(move: Move): Promise<void> {
    if (this.isGameOver) return;

    // Ensure move is still legal under the current turn constraints.
    const legal = this.getLegalMovesForTurn();
    const same = (a: Move, b: Move) => {
      if (a.kind !== b.kind) return false;
      if (a.from !== (b as any).from || (a as any).to !== (b as any).to) return false;
      if (a.kind === "capture") return (a as any).over === (b as any).over;
      return true;
    };
    if (!legal.some((m) => same(m, move))) return;

    await this.applyChosenMove(move);
  }

  undo(): void {
    const prevState = this.driver.undo();
    if (prevState) {
      // Allow undoing out of terminal states.
      this.isGameOver = false;

      // Cancel any transient UI timers from the previous position.
      if (this.bannerTimer) {
        window.clearTimeout(this.bannerTimer);
        this.bannerTimer = null;
      }
      if (this.remainderTimer) {
        window.clearTimeout(this.remainderTimer);
        this.remainderTimer = null;
      }

      this.state = prevState;
      this.lockedCaptureFrom = null;
      this.lockedCaptureDir = null;
      this.jumpedSquares.clear();
      this.currentTurnNodes = [];
      this.currentTurnHasCapture = false;
      this.clearSelection();
      this.renderAuthoritative();
      const allLegal = generateLegalMoves(this.state);
      this.mandatoryCapture = allLegal.length > 0 && allLegal[0].kind === "capture";
      this.updatePanel();
      this.recomputeRepetitionCounts();
      this.checkAndHandleCurrentPlayerLost();
      this.fireHistoryChange("undo");
    }
  }

  redo(): void {
    const nextState = this.driver.redo();
    if (nextState) {
      // Redo should also work after undoing out of a terminal state.
      this.isGameOver = false;

      if (this.bannerTimer) {
        window.clearTimeout(this.bannerTimer);
        this.bannerTimer = null;
      }
      if (this.remainderTimer) {
        window.clearTimeout(this.remainderTimer);
        this.remainderTimer = null;
      }

      this.state = nextState;
      this.lockedCaptureFrom = null;
      this.lockedCaptureDir = null;
      this.jumpedSquares.clear();
      this.currentTurnNodes = [];
      this.currentTurnHasCapture = false;
      this.clearSelection();
      this.renderAuthoritative();
      const allLegal = generateLegalMoves(this.state);
      this.mandatoryCapture = allLegal.length > 0 && allLegal[0].kind === "capture";
      this.updatePanel();
      this.recomputeRepetitionCounts();
      this.checkAndHandleCurrentPlayerLost();
      this.fireHistoryChange("redo");
    }
  }

  jumpToHistory(index: number): void {
    const target = this.driver.jumpToHistory(index);
    if (!target) return;

    // Allow jumping out of terminal states.
    this.isGameOver = false;

    // Cancel any transient UI timers.
    if (this.bannerTimer) {
      window.clearTimeout(this.bannerTimer);
      this.bannerTimer = null;
    }
    if (this.remainderTimer) {
      window.clearTimeout(this.remainderTimer);
      this.remainderTimer = null;
    }

    this.state = target;
    this.lockedCaptureFrom = null;
    this.lockedCaptureDir = null;
    this.jumpedSquares.clear();
    this.currentTurnNodes = [];
    this.currentTurnHasCapture = false;
    this.clearSelection();
    this.renderAuthoritative();
    const allLegal = generateLegalMoves(this.state);
    this.mandatoryCapture = allLegal.length > 0 && allLegal[0].kind === "capture";
    this.updatePanel();
    this.recomputeRepetitionCounts();
    this.checkAndHandleCurrentPlayerLost();
    this.fireHistoryChange("jump");
  }

  canUndo(): boolean {
    return this.driver.canUndo();
  }

  canRedo(): boolean {
    return this.driver.canRedo();
  }

  getHistory(): ReturnType<HistoryManager["getHistory"]> {
    return this.driver.getHistory();
  }

  exportMoveHistory(): string {
    const historyData = this.driver.getHistory();
    const moves = historyData
      .filter((entry, idx) => idx > 0 && entry.notation) // Skip "Start" and entries without notation
      .map((entry, idx) => {
        const playerWhoMoved = entry.toMove === "B" ? "White" : "Black";
        const moveNum = playerWhoMoved === "Black" 
          ? Math.ceil((idx + 1) / 2) 
          : Math.floor((idx + 2) / 2);
        return {
          moveNumber: moveNum,
          player: playerWhoMoved,
          notation: entry.notation,
        };
      });

    return JSON.stringify({
      game: "Lasca",
      date: new Date().toISOString(),
      moves: moves,
    }, null, 2);
  }

  setState(next: GameState): void {
    this.state = next;
    this.driver.setState(next);
    
    // When loading a game, check if the current player has already lost
    const currentPlayerResult = checkCurrentPlayerLost(this.state);
    if (currentPlayerResult.winner) {
      this.isGameOver = true;
      this.showBanner(currentPlayerResult.reason || "Game Over", 0);
      this.updatePanel();
      return;
    }
    
    // Game is not over, reset the flag
    this.isGameOver = false;

    // Recompute repetition counts from current history (if any).
    this.recomputeRepetitionCounts();
    
    // Check if captures are available for the current player
    const allLegal = generateLegalMoves(this.state);
    this.mandatoryCapture = allLegal.length > 0 && allLegal[0].kind === "capture";
    this.updatePanel();
  }

  getState(): GameState {
    return this.state;
  }

  resign(): void {
    if (this.isGameOver) return;
    
    // Current player resigns, so the other player wins
    const winner = this.state.toMove === "B" ? "W" : "B";
    const winnerName = winner === "B" ? "Black" : "White";
    const loserName = this.state.toMove === "B" ? "Black" : "White";
    
    this.isGameOver = true;
    this.clearSelection();
    this.showBanner(`${loserName} resigned — ${winnerName} wins!`, 0);
  }

  newGame(initialState: GameState): void {
    // Clear history and start fresh
    this.driver.clearHistory();
    this.driver.pushHistory(initialState);
    
    // Reset game state
    this.state = initialState;
    this.driver.setState(initialState);
    this.isGameOver = false;
    this.clearSelection();

    this.recomputeRepetitionCounts();
    
    // Re-render the board
    this.renderAuthoritative();
    
    // Check for mandatory captures at game start
    const allLegal = generateLegalMoves(this.state);
    this.mandatoryCapture = allLegal.length > 0 && allLegal[0].kind === "capture";
    this.updatePanel();
    
    // Notify history change
    this.fireHistoryChange("newGame");
  }

  loadGame(
    loadedState: GameState,
    historyData?: { states: GameState[]; notation: string[]; currentIndex: number }
  ): void {
    if (historyData && historyData.states && historyData.states.length > 0) {
      this.driver.replaceHistory(historyData);
    } else {
      // Reset history and start fresh with loaded state
      this.driver.clearHistory();
      this.driver.pushHistory(loadedState);
    }
    
    // Reset game state to idle phase; prefer aligning to the restored history's current state.
    const currentFromHistory = this.driver.getHistoryCurrent();
    const baseState = currentFromHistory ?? loadedState;
    this.isGameOver = false;
    this.state = { ...baseState, phase: "idle" };
    this.driver.setState(this.state);
    
    // Clear any selection, overlays, and capture state
    this.clearSelection();
    
    // Re-render the board
    this.renderAuthoritative();
    
    // Recompute mandatory captures
    const allLegal = generateLegalMoves(this.state);
    this.mandatoryCapture = allLegal.length > 0 && allLegal[0].kind === "capture";
    this.updatePanel();

    this.recomputeRepetitionCounts();

    // If the loaded position is already terminal for the player to move, end immediately.
    this.checkAndHandleCurrentPlayerLost();
    
    // Notify history change
    this.fireHistoryChange("loadGame");
  }

  private updatePanel(): void {
    const elTurn = document.getElementById("statusTurn");
    const elPhase = document.getElementById("statusPhase");
    const elMsg = document.getElementById("statusMessage");
    const elRoomId = document.getElementById("infoRoomId");
    const elCopy = document.getElementById("copyRoomIdBtn") as HTMLButtonElement | null;
    const elNewGame = document.getElementById("newGameBtn") as HTMLButtonElement | null;
    const elLoadGame = document.getElementById("loadGameBtn") as HTMLButtonElement | null;
    const elLoadGameInput = document.getElementById("loadGameInput") as HTMLInputElement | null;
    const isOnline = this.driver instanceof RemoteDriver;

    if (elNewGame) elNewGame.disabled = isOnline;
    if (elLoadGame) elLoadGame.disabled = isOnline;
    if (elLoadGameInput) elLoadGameInput.disabled = isOnline;

    if (elTurn) elTurn.textContent = this.state.toMove === "B" ? "Black" : "White";
    if (elPhase) elPhase.textContent = this.isGameOver ? "Game Over" : (this.selected ? "Select" : "Idle");
    if (elRoomId) {
      if (this.driver instanceof RemoteDriver) {
        const roomId = this.driver.getRoomId();
        elRoomId.textContent = roomId ?? "—";
        if (elCopy) elCopy.disabled = !roomId;
      } else {
        elRoomId.textContent = "—";
        if (elCopy) elCopy.disabled = true;
      }
    } else {
      if (elCopy) elCopy.disabled = true;
    }
    if (elMsg && !this.isGameOver) {
      if (!this.isLocalPlayersTurn()) {
        elMsg.textContent = "Waiting for opponent";
        return;
      }
      if (this.selected) {
        if (this.currentTargets.length > 0) {
          if (this.lockedCaptureFrom) {
            elMsg.textContent = "Continue capturing";
          } else {
            elMsg.textContent = "Choose a destination";
          }
        } else if (this.mandatoryCapture) {
          elMsg.textContent = "Capture required — select a capturing stack";
        } else {
          elMsg.textContent = "No moves";
        }
      } else {
        // No selection - check if captures are mandatory
        if (this.mandatoryCapture) {
          elMsg.textContent = "Capture available — you must capture";
        } else {
          elMsg.textContent = "—";
        }
      }
    }
  }

  private resolveClickedNode(target: EventTarget | null): string | null {
    // If clicking a rendered stack, read data-node from closest g.stack
    if (target && target instanceof Element) {
      // First, if the target (or ancestor) has data-node, prefer that
      const withData = target.closest("[data-node]") as Element | null;
      if (withData) {
        const id = withData.getAttribute("data-node");
        if (id) return id;
      }
      const stack = target.closest("g.stack") as SVGGElement | null;
      if (stack) {
        const id = stack.getAttribute("data-node");
        if (id) return id;
      }
      // Else if clicking a circle node
      if (target instanceof SVGCircleElement) {
        const id = target.getAttribute("id");
        if (id) return id;
      }
    }
    return null;
  }

  private svgPointFromClient(ev: MouseEvent): { x: number; y: number } {
    const pt = (this.svg as any).createSVGPoint ? (this.svg as any).createSVGPoint() : null;
    if (pt && this.svg.getScreenCTM) {
      pt.x = ev.clientX;
      pt.y = ev.clientY;
      const m = this.svg.getScreenCTM();
      if (m && (m as any).inverse) {
        const p = pt.matrixTransform((m as any).inverse());
        return { x: p.x, y: p.y };
      }
    }
    // Fallback: approximate using bounding rect
    const rect = this.svg.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  }

  private hitTestTargets(ev: MouseEvent): string | null {
    if (!this.selected || this.currentTargets.length === 0) return null;
    const { x, y } = this.svgPointFromClient(ev);
    for (const id of this.currentTargets) {
      const circle = document.getElementById(id) as SVGCircleElement | null;
      if (!circle) continue;
      const cx = parseFloat(circle.getAttribute("cx") || "0");
      const cy = parseFloat(circle.getAttribute("cy") || "0");
      const r = parseFloat(circle.getAttribute("r") || "0");
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= r + 12) return id; // within target ring radius
    }
    return null;
  }

  private isOwnStack(nodeId: string): boolean {
    const stack = this.state.board.get(nodeId);
    if (!stack || stack.length === 0) return false;
    const top = stack[stack.length - 1];
    return top.owner === this.state.toMove;
  }

  private recomputeRepetitionCounts(): void {
    this.repetitionCounts.clear();
    if (!RULES.drawByThreefold) return;

    const snap = this.driver.exportHistorySnapshots();
    const states = snap.states;
    const end = snap.currentIndex;
    for (let i = 0; i <= end && i < states.length; i++) {
      const h = hashGameState(states[i]);
      this.repetitionCounts.set(h, (this.repetitionCounts.get(h) || 0) + 1);
    }
  }

  private recordRepetitionForCurrentState(): boolean {
    if (!RULES.drawByThreefold) return false;
    const h = hashGameState(this.state);
    const next = (this.repetitionCounts.get(h) || 0) + 1;
    this.repetitionCounts.set(h, next);
    return next >= 3;
  }

  private checkThreefoldRepetition(): boolean {
    if (!RULES.drawByThreefold) return false;
    const h = hashGameState(this.state);
    return (this.repetitionCounts.get(h) || 0) >= 3;
  }

  private showSelection(nodeId: string): void {
    clearOverlays(this.overlayLayer);
    drawSelection(this.overlayLayer, nodeId);
    const allLegal = generateLegalMoves(
      this.state,
      this.lockedCaptureFrom
        ? { forcedFrom: this.lockedCaptureFrom, excludedJumpSquares: this.jumpedSquares }
        : undefined
    );
    this.mandatoryCapture = allLegal.length > 0 && allLegal[0].kind === "capture";
    
    // If in a capture chain, only allow moves from the locked position
    let movesForNode = allLegal.filter(m => m.from === nodeId);
    if (this.lockedCaptureFrom && this.lockedCaptureFrom !== nodeId) {
      movesForNode = [];
    }
    
    this.currentMoves = movesForNode;
    this.currentTargets = this.currentMoves.map(m => m.to);
    drawTargets(this.overlayLayer, this.currentTargets);

    // Dama International (end-of-sequence capture removal): visually mark already-captured pieces
    // that are pending removal so the player understands they cannot be jumped again.
    this.drawPendingDamaCapturedMarks();
    
    // Draw move hints if enabled
    if (this.moveHintsEnabled) {
      for (const move of this.currentMoves) {
        if (move.kind === "capture") {
          // Red circle for the piece being jumped over
          drawHighlightRing(this.overlayLayer, move.over, "#ff6b6b", 3);
          // Orange circle for the landing square (target)
          drawHighlightRing(this.overlayLayer, move.to, "#ff9f40", 4);
        }
      }
    }
    
    this.updatePanel();
    if (import.meta.env && import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log("[controller] select", nodeId, { targets: this.currentTargets });
    }
  }

  private clearSelection(): void {
    this.selected = null;
    this.currentTargets = [];
    this.currentMoves = [];
    // Recalculate mandatory capture based on current state, don't just set to false
    const allLegal = generateLegalMoves(this.state);
    this.mandatoryCapture = allLegal.length > 0 && allLegal[0].kind === "capture";
    this.lockedCaptureFrom = null;
    this.lockedCaptureDir = null;
    this.jumpedSquares.clear();
    clearOverlays(this.overlayLayer);
    clearPreviewLayer(this.previewLayer);
    this.updatePanel();
  }

  private showBanner(text: string, durationMs: number = 1500): void {
    const elMsg = document.getElementById("statusMessage");
    if (elMsg) elMsg.textContent = text;
    if (this.bannerTimer) window.clearTimeout(this.bannerTimer);
    
    // If durationMs is 0 or less, keep the banner permanently (for game over)
    if (durationMs > 0) {
      this.bannerTimer = window.setTimeout(() => {
        this.bannerTimer = null;
        this.updatePanel();
      }, durationMs);
    }
  }

  private showRemainderHint(nodeId: string, durationMs: number = 1200): void {
    // Draw a transient ring where remainder stays after capture
    drawHighlightRing(this.overlayLayer, nodeId, "#ff9f40", 4);
    if (this.remainderTimer) window.clearTimeout(this.remainderTimer);
    this.remainderTimer = window.setTimeout(() => {
      this.remainderTimer = null;
      clearOverlays(this.overlayLayer);
      this.updatePanel();
    }, durationMs);
  }

  private async applyChosenMove(move: Move): Promise<void> {
    // Track node path for notation
    if (this.currentTurnNodes.length === 0) {
      this.currentTurnNodes.push(move.from);
    }
    this.currentTurnNodes.push(move.to);
    if (move.kind === "capture") {
      this.currentTurnHasCapture = true;
    }
    
    let next: GameState & { didPromote?: boolean };
    try {
      next = await this.driver.submitMove(move);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[controller] driver submitMove failed", err);
      const msg = err instanceof Error ? err.message : "Move failed";
      this.showBanner(msg, 2500);
      return;
    }
    if (import.meta.env && import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log("[controller] apply", move);
    }
    this.state = next;
    
    // Animate the move before rendering (both quiet moves and captures)
    if (this.animationsEnabled) {
      const movingGroup = this.piecesLayer.querySelector(`g.stack[data-node="${move.from}"]`) as SVGGElement | null;
      if (movingGroup) {
        const countsLayer = ensureStackCountsLayer(this.svg);
        const movingCount = countsLayer.querySelector(`g.stackCount[data-node="${move.from}"]`) as SVGGElement | null;
        await animateStack(this.svg, this.overlayLayer, move.from, move.to, movingGroup, 300, movingCount ? [movingCount] : []);
      }
    }
    
    // Now render the new state after animation
    this.renderAuthoritative();
    
    // Clear overlays immediately after move is rendered
    // Also cancel any pending remainder hint timers
    if (this.remainderTimer) {
      window.clearTimeout(this.remainderTimer);
      this.remainderTimer = null;
    }
    clearOverlays(this.overlayLayer);
    
    if (move.kind === "capture") {
      // Track the jumped-over square to prevent re-jumping it
      this.jumpedSquares.add(move.over);

      const lastDir = this.captureDir(move.from, move.to);

      const rulesetId = this.state.meta?.rulesetId ?? "lasca";
      const isDama = rulesetId === "dama";
      const isDamasca = rulesetId === "damasca";
      const isLasca = rulesetId === "lasca";
      const damaCaptureRemoval = isDama ? getDamaCaptureRemovalMode(this.state) : null;
      
      // Check if promotion happened
      const didPromote = next.didPromote || false;
      
      // Check if there are more captures available from the destination
      const allCaptures = generateLegalMoves(this.state, {
        forcedFrom: move.to,
        ...((isLasca || isDama || isDamasca)
          ? { excludedJumpSquares: this.jumpedSquares, ...(isDama || isDamasca ? { lastCaptureDir: lastDir } : {}) }
          : {}),
      }).filter((m) => m.kind === "capture");
      const moreCapturesFromDest = allCaptures;
      
      // If promoted and rule says stop on promotion, end the chain
      if (didPromote && RULES.stopCaptureOnPromotion) {
        if (isDama) {
          // Dama promotes only at the end of the sequence; if we ever get here,
          // still finalize the chain correctly.
          if (this.driver.mode === "online" && this.driver instanceof RemoteDriver) {
            this.state = await this.driver.finalizeCaptureChainRemote({
              rulesetId: "dama",
              state: this.state,
              landing: move.to,
              jumpedSquares: this.jumpedSquares,
            });
          } else {
            this.state = this.driver.finalizeCaptureChain({
              rulesetId: "dama",
              state: this.state,
              landing: move.to,
              jumpedSquares: this.jumpedSquares,
            });
          }
        } else if (isDamasca) {
          // Damasca should not promote mid-chain, but finalize defensively.
          if (this.driver.mode === "online" && this.driver instanceof RemoteDriver) {
            this.state = await this.driver.finalizeCaptureChainRemote({
              rulesetId: "damasca",
              state: this.state,
              landing: move.to,
            });
          } else {
            this.state = this.driver.finalizeCaptureChain({
              rulesetId: "damasca",
              state: this.state,
              landing: move.to,
            });
          }
        }
        // Switch turn now
        if (this.driver.mode === "online" && this.driver instanceof RemoteDriver) {
          const separator = this.currentTurnHasCapture ? " × " : " → ";
          const boardSize = this.state.meta?.boardSize ?? 7;
          const notation = this.currentTurnNodes.map((id) => nodeIdToA1(id, boardSize)).join(separator);
          try {
            this.state = await this.driver.endTurnRemote(notation);
          } catch (err) {
            const msg = err instanceof Error ? err.message : "End turn failed";
            this.showBanner(msg, 2500);
            return;
          }
        } else {
          this.state = { ...this.state, toMove: this.state.toMove === "B" ? "W" : "B" };
        }

        // In Dama, finalization may remove jumped pieces and/or promote.
        // We already rendered after applyMove, so re-render now to reflect finalization.
        if (
          (isDama && (damaCaptureRemoval === "end_of_sequence" || Boolean((this.state as any).didPromote))) ||
          (isDamasca && Boolean((this.state as any).didPromote))
        ) {
          this.renderAuthoritative();
        }

        this.lockedCaptureFrom = null;
        this.jumpedSquares.clear();
        this.clearSelection();
        
        // Record state in history at turn boundary
        if (!(this.driver.mode === "online" && this.driver instanceof RemoteDriver)) {
          const separator = this.currentTurnHasCapture ? " × " : " → ";
          const boardSize = this.state.meta?.boardSize ?? 7;
          const notation = this.currentTurnNodes.map((id) => nodeIdToA1(id, boardSize)).join(separator);
          this.driver.pushHistory(this.state, notation);
        }
        this.currentTurnNodes = [];
        this.currentTurnHasCapture = false;
        this.fireHistoryChange("move");
        
        // Check for threefold repetition draw
        if (this.recordRepetitionForCurrentState()) {
          this.isGameOver = true;
          this.clearSelection();
          this.showBanner("Draw by threefold repetition", 0);
          this.fireHistoryChange("gameOver");
          return;
        }
        
        // Update mandatory capture for new turn
        const allLegal = generateLegalMoves(this.state);
        this.mandatoryCapture = allLegal.length > 0 && allLegal[0].kind === "capture";
        
        // Check for game over - check if the player who now has the turn can play
        const gameResult = checkCurrentPlayerLost(this.state);
        if (gameResult.winner) {
          this.isGameOver = true;
          this.showBanner(gameResult.reason || "Game Over", 0);
          this.fireHistoryChange("gameOver");
          return;
        }
        
        this.showBanner("Promoted — capture turn ends");
        // Don't show remainder hint - it will interfere with next turn's overlays
        return;
      }
      
      // If more captures available from destination, chain the capture
      if (moreCapturesFromDest.length > 0) {
        this.lockedCaptureFrom = move.to;
        this.lockedCaptureDir = lastDir;
        this.selected = move.to;
        this.showSelection(move.to);
        this.showBanner("Continue capture");
        // Don't show remainder hint during chain - it will be cleared when selection is shown
        return;
      }
      
      // No more captures, switch turn and end
      if (isDama) {
        if (this.driver.mode === "online" && this.driver instanceof RemoteDriver) {
          this.state = await this.driver.finalizeCaptureChainRemote({
            rulesetId: "dama",
            state: this.state,
            landing: move.to,
            jumpedSquares: this.jumpedSquares,
          });
        } else {
          this.state = this.driver.finalizeCaptureChain({
            rulesetId: "dama",
            state: this.state,
            landing: move.to,
            jumpedSquares: this.jumpedSquares,
          });
        }
      } else if (isDamasca) {
        if (this.driver.mode === "online" && this.driver instanceof RemoteDriver) {
          this.state = await this.driver.finalizeCaptureChainRemote({
            rulesetId: "damasca",
            state: this.state,
            landing: move.to,
          });
        } else {
          this.state = this.driver.finalizeCaptureChain({
            rulesetId: "damasca",
            state: this.state,
            landing: move.to,
          });
        }
      }
      if (this.driver.mode === "online" && this.driver instanceof RemoteDriver) {
        const separator = this.currentTurnHasCapture ? " × " : " → ";
        const boardSize = this.state.meta?.boardSize ?? 7;
        const notation = this.currentTurnNodes.map((id) => nodeIdToA1(id, boardSize)).join(separator);
        try {
          this.state = await this.driver.endTurnRemote(notation);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "End turn failed";
          this.showBanner(msg, 2500);
          return;
        }
      } else {
        this.state = { ...this.state, toMove: this.state.toMove === "B" ? "W" : "B" };
      }

      // Dama may promote during finalization even in immediate-removal mode.
      // Re-render so the promotion is visible before the opponent starts their turn.
      if (
        (isDama && (damaCaptureRemoval === "end_of_sequence" || Boolean((this.state as any).didPromote))) ||
        (isDamasca && Boolean((this.state as any).didPromote))
      ) {
        this.renderAuthoritative();
      }

      this.lockedCaptureFrom = null;
      this.lockedCaptureDir = null;
      this.jumpedSquares.clear();
      this.clearSelection();
      
      // Record state in history at turn boundary
      if (!(this.driver.mode === "online" && this.driver instanceof RemoteDriver)) {
        const separator = this.currentTurnHasCapture ? " × " : " → ";
        const boardSize = this.state.meta?.boardSize ?? 7;
        const notation = this.currentTurnNodes.map((id) => nodeIdToA1(id, boardSize)).join(separator);
        this.driver.pushHistory(this.state, notation);
      }
      this.currentTurnNodes = [];
      this.currentTurnHasCapture = false;
      this.fireHistoryChange("move");
      
      // Check for threefold repetition draw
      if (this.recordRepetitionForCurrentState()) {
        this.isGameOver = true;
        this.clearSelection();
        this.showBanner("Draw by threefold repetition", 0);
        this.fireHistoryChange("gameOver");
        return;
      }
      
      // Update mandatory capture for new turn
      const allLegal = generateLegalMoves(this.state);
      this.mandatoryCapture = allLegal.length > 0 && allLegal[0].kind === "capture";
      
      // Check for game over - check if the player who now has the turn can play
      const gameResult = checkCurrentPlayerLost(this.state);
      if (gameResult.winner) {
        this.isGameOver = true;
        this.showBanner(gameResult.reason || "Game Over", 0);
        this.fireHistoryChange("gameOver");
        return;
      }
      
      this.showBanner("Turn changed");
      // Don't show remainder hint - it will interfere with next turn's overlays
    } else {
      // Quiet move - turn already switched in applyMove
      this.clearSelection();
      
      // Record state in history at turn boundary
      const separator = this.currentTurnHasCapture ? " × " : " → ";
      const boardSize = this.state.meta?.boardSize ?? 7;
      const notation = this.currentTurnNodes.map((id) => nodeIdToA1(id, boardSize)).join(separator);
      this.driver.pushHistory(this.state, notation);
      this.currentTurnNodes = [];
      this.currentTurnHasCapture = false;
      this.fireHistoryChange("move");
      
      // Check for threefold repetition draw
      if (this.recordRepetitionForCurrentState()) {
        this.isGameOver = true;
        this.clearSelection();
        this.showBanner("Draw by threefold repetition", 0);
        this.fireHistoryChange("gameOver");
        return;
      }
      
      // Update mandatory capture for new turn
      const allLegal = generateLegalMoves(this.state);
      this.mandatoryCapture = allLegal.length > 0 && allLegal[0].kind === "capture";
      
      // Check for game over after quiet move - check if current player can play
      const gameResult = checkCurrentPlayerLost(this.state);
      if (gameResult.winner) {
        this.isGameOver = true;
        this.showBanner(gameResult.reason || "Game Over", 0);
        this.fireHistoryChange("gameOver");
        return;
      }
      
      // Update panel to show capture message if needed
      this.updatePanel();
    }
  }

  private async onClick(ev: MouseEvent): Promise<void> {
    // Ignore clicks if game is over
    if (this.isGameOver) {
      return;
    }

    // Ignore human input when AI has locked input
    if (!this.inputEnabled) {
      return;
    }

    // In online mode, ignore input when it's not your turn.
    if (!this.isLocalPlayersTurn()) {
      this.clearSelection();
      return;
    }

    let nodeId = this.resolveClickedNode(ev.target);
    if (import.meta.env && import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log("[controller] click", { target: ev.target, resolved: nodeId, selected: this.selected, targets: this.currentTargets });
    }
    if (!nodeId) {
      // Try geometric hit-test against current target circles
      nodeId = this.hitTestTargets(ev);
    }
    if (!nodeId) {
      this.clearSelection();
      return;
    }

    if (this.selected && this.currentTargets.includes(nodeId)) {
      const move = this.currentMoves.find(m => m.to === nodeId && m.from === this.selected);
      if (!move) {
        this.clearSelection();
        return;
      }
      
      
      await this.applyChosenMove(move);
      return;
    }

    // If we're in a capture chain, only allow clicking the locked piece or its targets
    if (this.lockedCaptureFrom) {
      if (nodeId === this.lockedCaptureFrom) {
        // Clicked the piece that must continue capturing - reselect it
        this.selected = nodeId;
        this.showSelection(nodeId);
        return;
      }
      // Otherwise, clicking anything else during a locked chain does nothing
      return;
    }

    // Select only your own stack; clicking empty node clears selection
    if (this.isOwnStack(nodeId)) {
      this.selected = nodeId;
      this.showSelection(nodeId);
    } else {
      this.clearSelection();
    }
  }
}
