import type { GameState } from "../game/state.ts";
import type { createStackInspector } from "../ui/stackInspector";
import { ensureOverlayLayer, clearOverlays, drawSelection, drawTargets } from "../render/overlays.ts";
import { generateLegalMoves } from "../game/movegen.ts";

export class GameController {
  private svg: SVGSVGElement;
  private piecesLayer: SVGGElement;
  private inspector: ReturnType<typeof createStackInspector> | null;
  private overlayLayer: SVGGElement;
  private state: GameState;
  private selected: string | null = null;
  private currentTargets: string[] = [];

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

  private updatePanel(): void {
    const elTurn = document.getElementById("statusTurn");
    const elPhase = document.getElementById("statusPhase");
    const elMsg = document.getElementById("statusMessage");
    if (elTurn) elTurn.textContent = this.state.toMove === "B" ? "Black" : "White";
    if (elPhase) elPhase.textContent = (this.selected ? "Select" : "Idle");
    if (elMsg) elMsg.textContent = this.selected ? "Choose a destination" : "—";
  }

  private resolveClickedNode(target: EventTarget | null): string | null {
    // If clicking a rendered stack, read data-node from closest g.stack
    if (target && target instanceof Element) {
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

  private isOwnStack(nodeId: string): boolean {
    const stack = this.state.board.get(nodeId);
    if (!stack || stack.length === 0) return false;
    const top = stack[stack.length - 1];
    return top.owner === this.state.toMove;
  }

  private showSelection(nodeId: string): void {
    clearOverlays(this.overlayLayer);
    drawSelection(this.overlayLayer, nodeId);
    const moves = generateLegalMoves(this.state).filter(m => m.from === nodeId);
    this.currentTargets = moves.map(m => m.to);
    drawTargets(this.overlayLayer, this.currentTargets);
    this.updatePanel();
  }

  private clearSelection(): void {
    this.selected = null;
    this.currentTargets = [];
    clearOverlays(this.overlayLayer);
    this.updatePanel();
  }

  private onClick(ev: MouseEvent): void {
    const nodeId = this.resolveClickedNode(ev.target);
    if (!nodeId) {
      this.clearSelection();
      return;
    }

    // Clicking target: in PR 4 we only highlight; move application will come later
    if (this.selected && this.currentTargets.includes(nodeId)) {
      // No-op for now; next PR will apply move
      this.updatePanel();
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
