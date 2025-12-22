import type { GameState } from "../game/state.ts";
import type { Move } from "../game/moveTypes.ts";
import type { createStackInspector } from "../ui/stackInspector";
import { ensureOverlayLayer, clearOverlays, drawSelection, drawTargets, drawHighlightRing } from "../render/overlays.ts";
import { generateLegalMoves } from "../game/movegen.ts";
import { applyMove } from "../game/applyMove.ts";
import { renderGameState } from "../render/renderGameState.ts";

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
  private bannerTimer: number | null = null;
  private remainderTimer: number | null = null;

  constructor(svg: SVGSVGElement, piecesLayer: SVGGElement, inspector: ReturnType<typeof createStackInspector> | null, state: GameState) {
    this.svg = svg;
    this.piecesLayer = piecesLayer;
    this.inspector = inspector;
    this.overlayLayer = ensureOverlayLayer(svg);
    this.state = state;
  }

  bind(): void {
    this.svg.addEventListener("click", (ev) => this.onClick(ev));
  }

  setState(next: GameState): void {
    this.state = next;
    this.updatePanel();
  }

  private updatePanel(): void {
    const elTurn = document.getElementById("statusTurn");
    const elPhase = document.getElementById("statusPhase");
    const elMsg = document.getElementById("statusMessage");
    if (elTurn) elTurn.textContent = this.state.toMove === "B" ? "Black" : "White";
    if (elPhase) elPhase.textContent = (this.selected ? "Select" : "Idle");
    if (elMsg) {
      if (this.selected) {
        if (this.currentTargets.length > 0) {
          elMsg.textContent = "Choose a destination";
        } else if (this.mandatoryCapture) {
          elMsg.textContent = "Capture required — select a capturing stack";
        } else {
          elMsg.textContent = "No moves";
        }
      } else {
        elMsg.textContent = "—";
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

  private showSelection(nodeId: string): void {
    clearOverlays(this.overlayLayer);
    drawSelection(this.overlayLayer, nodeId);
    const allLegal = generateLegalMoves(this.state);
    this.mandatoryCapture = allLegal.length > 0 && allLegal[0].kind === "capture";
    this.currentMoves = allLegal.filter(m => m.from === nodeId);
    this.currentTargets = this.currentMoves.map(m => m.to);
    drawTargets(this.overlayLayer, this.currentTargets);
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
    this.mandatoryCapture = false;
    clearOverlays(this.overlayLayer);
    this.updatePanel();
  }

  private showBanner(text: string, durationMs: number = 1500): void {
    const elMsg = document.getElementById("statusMessage");
    if (elMsg) elMsg.textContent = text;
    if (this.bannerTimer) window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => {
      this.bannerTimer = null;
      this.updatePanel();
    }, durationMs);
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

  private onClick(ev: MouseEvent): void {
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
      const next = applyMove(this.state, move);
      if (import.meta.env && import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log("[controller] apply", move);
      }
      this.state = next;
      renderGameState(this.svg, this.piecesLayer, this.inspector, this.state);
      this.clearSelection();
      if (move.kind === "capture") {
        this.showBanner("Turn changed");
        // Indicate remainder at the jumped square (if any remained, ring still useful as feedback)
        this.showRemainderHint((move as any).over);
      }
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
