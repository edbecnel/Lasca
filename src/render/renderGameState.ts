import { renderStackAtNode } from "./renderStackAtNode.ts";
import type { GameState } from "../game/state.ts";
import type { createStackInspector } from "../ui/stackInspector";

export function renderGameState(
  svgRoot: SVGSVGElement,
  piecesLayer: SVGGElement,
  inspector: ReturnType<typeof createStackInspector> | null,
  state: GameState
): void {
  piecesLayer.textContent = "";

  for (const [nodeId, stack] of state.board.entries()) {
    renderStackAtNode(svgRoot, piecesLayer, inspector, nodeId, stack);
  }
}
