import type { GameState } from "../game/state.ts";
import type { Move } from "../game/moveTypes.ts";
import type { createStackInspector } from "../ui/stackInspector";
import { ensureOverlayLayer, clearOverlays, drawSelection, drawTargets, drawHighlightRing } from "../render/overlays.ts";
import { generateLegalMoves } from "../game/movegen.ts";
import { applyMove } from "../game/applyMove.ts";
import { renderGameState } from "../render/renderGameState.ts";
import { RULES } from "../game/ruleset.ts";
import { getWinner, checkCurrentPlayerLost } from "../game/gameOver.ts";
import { HistoryManager } from "../game/historyManager.ts";
import { hashGameState } from "../game/hashState.ts";
import { animateStack } from "../render/animateMove.ts";
import { nodeIdToA1 } from "../game/coordFormat.ts";

export class GameController {
  private svg: SVGSVGElement;
  private piecesLayer: SVGGElement;
  private inspector: ReturnType<typeof createStackInspector> | null;
  private overlayLayer: SVGGElement;
  private state: GameState;
  private selected: string | null = null;
  private currentTargets: string[] = [];
  private currentMoves: Move[] = [];
  private mandatoryCapture: boolean = false;
  private lockedCaptureFrom: string | null = null;
  private jumpedSquares: Set<string> = new Set();
  private isGameOver: boolean = false;
  private moveHintsEnabled: boolean = false;
  private animationsEnabled: boolean = true;
  private bannerTimer: number | null = null;
  private remainderTimer: number | null = null;
  private history: HistoryManager;
  private historyListeners: Array<() => void> = [];
  private inputEnabled: boolean = true;
  private currentTurnNodes: string[] = []; // Track node IDs visited in current turn
  private currentTurnHasCapture: boolean = false; // Track if current turn includes captures
  private repetitionCounts: Map<string, number> = new Map();

  constructor(svg: SVGSVGElement, piecesLayer: SVGGElement, inspector: ReturnType<typeof createStackInspector> | null, state: GameState, history: HistoryManager) {
    this.svg = svg;
    this.piecesLayer = piecesLayer;
    this.inspector = inspector;
    this.overlayLayer = ensureOverlayLayer(svg);
    this.state = state;
    this.history = history;
  }

  bind(): void {
    this.svg.addEventListener("click", (ev) => this.onClick(ev));
    // Check for mandatory captures at game start
    const allLegal = generateLegalMoves(this.state);
    this.mandatoryCapture = allLegal.length > 0 && allLegal[0].kind === "capture";
    this.recomputeRepetitionCounts();
    this.updatePanel();
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

  setHistoryChangeCallback(callback: () => void): void {
    this.historyListeners = [callback];
  }

  addHistoryChangeCallback(callback: () => void): void {
    this.historyListeners.push(callback);
  }

  private checkAndHandleCurrentPlayerLost(): boolean {
    const result = checkCurrentPlayerLost(this.state);
    if (result.winner) {
      this.isGameOver = true;
      this.clearSelection();
      this.showBanner(result.reason || "Game Over", 0);
      this.updatePanel();
      return true;
    }
    return false;
  }

  private fireHistoryChange(): void {
    for (const cb of this.historyListeners) {
      try {
        cb();
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
      this.clearSelection();
    }
  }

  getCaptureChainConstraints(): { lockedCaptureFrom: string | null; jumpedSquares: string[] } {
    return {
      lockedCaptureFrom: this.lockedCaptureFrom,
      jumpedSquares: Array.from(this.jumpedSquares),
    };
  }

  getLegalMovesForTurn(): Move[] {
    const excluded = this.lockedCaptureFrom ? this.jumpedSquares : undefined;
    const allLegal = generateLegalMoves(this.state, excluded);

    if (this.lockedCaptureFrom) {
      return allLegal.filter((m) => m.kind === "capture" && m.from === this.lockedCaptureFrom);
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
    if (this.isGameOver) return;
    const prevState = this.history.undo();
    if (prevState) {
      this.state = prevState;
      this.lockedCaptureFrom = null;
      this.clearSelection();
      renderGameState(this.svg, this.piecesLayer, this.inspector, this.state);
      const allLegal = generateLegalMoves(this.state);
      this.mandatoryCapture = allLegal.length > 0 && allLegal[0].kind === "capture";
      this.updatePanel();
      this.recomputeRepetitionCounts();
      this.checkAndHandleCurrentPlayerLost();
      this.fireHistoryChange();
    }
  }

  redo(): void {
    if (this.isGameOver) return;
    const nextState = this.history.redo();
    if (nextState) {
      this.state = nextState;
      this.lockedCaptureFrom = null;
      this.clearSelection();
      renderGameState(this.svg, this.piecesLayer, this.inspector, this.state);
      const allLegal = generateLegalMoves(this.state);
      this.mandatoryCapture = allLegal.length > 0 && allLegal[0].kind === "capture";
      this.updatePanel();
      this.recomputeRepetitionCounts();
      this.checkAndHandleCurrentPlayerLost();
      this.fireHistoryChange();
    }
  }

  canUndo(): boolean {
    return this.history.canUndo();
  }

  canRedo(): boolean {
    return this.history.canRedo();
  }

  getHistory(): ReturnType<HistoryManager["getHistory"]> {
    return this.history.getHistory();
  }

  exportMoveHistory(): string {
    const historyData = this.history.getHistory();
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
    this.history.clear();
    this.history.push(initialState);
    
    // Reset game state
    this.state = initialState;
    this.isGameOver = false;
    this.clearSelection();

    this.recomputeRepetitionCounts();
    
    // Re-render the board
    renderGameState(this.svg, this.piecesLayer, this.inspector, this.state);
    
    // Check for mandatory captures at game start
    const allLegal = generateLegalMoves(this.state);
    this.mandatoryCapture = allLegal.length > 0 && allLegal[0].kind === "capture";
    this.updatePanel();
    
    // Notify history change
    this.fireHistoryChange();
  }

  loadGame(
    loadedState: GameState,
    historyData?: { states: GameState[]; notation: string[]; currentIndex: number }
  ): void {
    if (historyData && historyData.states && historyData.states.length > 0) {
      this.history.replaceAll(historyData.states, historyData.notation, historyData.currentIndex);
    } else {
      // Reset history and start fresh with loaded state
      this.history.clear();
      this.history.push(loadedState);
    }
    
    // Reset game state to idle phase; prefer aligning to the restored history's current state.
    const currentFromHistory = this.history.getCurrent();
    const baseState = currentFromHistory ?? loadedState;
    this.isGameOver = false;
    this.state = { ...baseState, phase: "idle" };
    
    // Clear any selection, overlays, and capture state
    this.clearSelection();
    
    // Re-render the board
    renderGameState(this.svg, this.piecesLayer, this.inspector, this.state);
    
    // Recompute mandatory captures
    const allLegal = generateLegalMoves(this.state);
    this.mandatoryCapture = allLegal.length > 0 && allLegal[0].kind === "capture";
    this.updatePanel();

    this.recomputeRepetitionCounts();

    // If the loaded position is already terminal for the player to move, end immediately.
    this.checkAndHandleCurrentPlayerLost();
    
    // Notify history change
    this.fireHistoryChange();
  }

  private updatePanel(): void {
    const elTurn = document.getElementById("statusTurn");
    const elPhase = document.getElementById("statusPhase");
    const elMsg = document.getElementById("statusMessage");
    if (elTurn) elTurn.textContent = this.state.toMove === "B" ? "Black" : "White";
    if (elPhase) elPhase.textContent = this.isGameOver ? "Game Over" : (this.selected ? "Select" : "Idle");
    if (elMsg && !this.isGameOver) {
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

    const snap = this.history.exportSnapshots();
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
    const allLegal = generateLegalMoves(this.state, this.lockedCaptureFrom ? this.jumpedSquares : undefined);
    this.mandatoryCapture = allLegal.length > 0 && allLegal[0].kind === "capture";
    
    // If in a capture chain, only allow moves from the locked position
    let movesForNode = allLegal.filter(m => m.from === nodeId);
    if (this.lockedCaptureFrom && this.lockedCaptureFrom !== nodeId) {
      movesForNode = [];
    }
    
    this.currentMoves = movesForNode;
    this.currentTargets = this.currentMoves.map(m => m.to);
    drawTargets(this.overlayLayer, this.currentTargets);
    
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
    this.jumpedSquares.clear();
    clearOverlays(this.overlayLayer);
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
    
    const next = applyMove(this.state, move);
    if (import.meta.env && import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log("[controller] apply", move);
    }
    this.state = next;
    
    // Animate the move before rendering (both quiet moves and captures)
    if (this.animationsEnabled) {
      const movingGroup = this.piecesLayer.querySelector(`g.stack[data-node="${move.from}"]`) as SVGGElement | null;
      if (movingGroup) {
        await animateStack(this.svg, this.overlayLayer, move.from, move.to, movingGroup, 300);
      }
    }
    
    // Now render the new state after animation
    renderGameState(this.svg, this.piecesLayer, this.inspector, this.state);
    
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
      
      // Check if promotion happened
      const didPromote = next.didPromote || false;
      
      // Check if there are more captures available from the destination
      const allCaptures = generateLegalMoves(this.state, this.jumpedSquares).filter(m => m.kind === "capture");
      const moreCapturesFromDest = allCaptures.filter(m => m.from === move.to);
      
      // If promoted and rule says stop on promotion, end the chain
      if (didPromote && RULES.stopCaptureOnPromotion) {
        // Switch turn now
        this.state = { ...this.state, toMove: this.state.toMove === "B" ? "W" : "B" };
        this.lockedCaptureFrom = null;
        this.jumpedSquares.clear();
        this.clearSelection();
        
        // Record state in history at turn boundary
        const separator = this.currentTurnHasCapture ? " × " : " → ";
        const notation = this.currentTurnNodes.map((id) => nodeIdToA1(id)).join(separator);
        this.history.push(this.state, notation);
        this.currentTurnNodes = [];
        this.currentTurnHasCapture = false;
        this.fireHistoryChange();
        
        // Check for threefold repetition draw
        if (this.recordRepetitionForCurrentState()) {
          this.isGameOver = true;
          this.clearSelection();
          this.showBanner("Draw by threefold repetition", 0);
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
          return;
        }
        
        this.showBanner("Promoted — capture turn ends");
        // Don't show remainder hint - it will interfere with next turn's overlays
        return;
      }
      
      // If more captures available from destination, chain the capture
      if (moreCapturesFromDest.length > 0) {
        this.lockedCaptureFrom = move.to;
        this.selected = move.to;
        this.showSelection(move.to);
        this.showBanner("Continue capture");
        // Don't show remainder hint during chain - it will be cleared when selection is shown
        return;
      }
      
      // No more captures, switch turn and end
      this.state = { ...this.state, toMove: this.state.toMove === "B" ? "W" : "B" };
      this.lockedCaptureFrom = null;
      this.jumpedSquares.clear();
      this.clearSelection();
      
      // Record state in history at turn boundary
      const separator = this.currentTurnHasCapture ? " × " : " → ";
      const notation = this.currentTurnNodes.map((id) => nodeIdToA1(id)).join(separator);
      this.history.push(this.state, notation);
      this.currentTurnNodes = [];
      this.currentTurnHasCapture = false;
      this.fireHistoryChange();
      
      // Check for threefold repetition draw
      if (this.recordRepetitionForCurrentState()) {
        this.isGameOver = true;
        this.clearSelection();
        this.showBanner("Draw by threefold repetition", 0);
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
        return;
      }
      
      this.showBanner("Turn changed");
      // Don't show remainder hint - it will interfere with next turn's overlays
    } else {
      // Quiet move - turn already switched in applyMove
      this.clearSelection();
      
      // Record state in history at turn boundary
      const separator = this.currentTurnHasCapture ? " × " : " → ";
      const notation = this.currentTurnNodes.map((id) => nodeIdToA1(id)).join(separator);
      this.history.push(this.state, notation);
      this.currentTurnNodes = [];
      this.currentTurnHasCapture = false;
      this.fireHistoryChange();
      
      // Check for threefold repetition draw
      if (this.recordRepetitionForCurrentState()) {
        this.isGameOver = true;
        this.clearSelection();
        this.showBanner("Draw by threefold repetition", 0);
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
