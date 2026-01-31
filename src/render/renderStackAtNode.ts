import { pieceToHref } from "../pieces/pieceToHref";
import { makeUse } from "./svgUse";
import { drawMiniStackSpine } from "./miniSpine";
import { maybeVariantStonePieceHref } from "./stonePieceVariant";
import { maybeVariantWoodenPieceHref } from "./woodenPieceVariant";
import type { Stack } from "../types";

type Inspector = {
  cancelHide: () => void;
  show: (nodeId: string, stack: Stack) => void;
  hideSoon: () => void;
};

export function renderStackAtNode(
  svgRoot: SVGSVGElement,
  piecesLayer: SVGGElement,
  inspector: Inspector | null,
  nodeId: string,
  stack: Stack,
  opts: { pieceSize?: number; rulesetId?: string; countsLayer?: SVGGElement | null } = {}
): void {
  const { pieceSize = 86, rulesetId, countsLayer } = opts;

  const node = document.getElementById(nodeId) as SVGCircleElement | null;
  if (!node || !stack.length) return;

  const cx = parseFloat(node.getAttribute("cx") || "0");
  const cy = parseFloat(node.getAttribute("cy") || "0");

  const g = document.createElementNS("http://www.w3.org/2000/svg", "g") as SVGGElement;
  g.setAttribute("data-node", nodeId);
  g.setAttribute("class", "stack");

  const top = stack[stack.length - 1];
  const half = pieceSize / 2;

  const baseHref = pieceToHref(top, { rulesetId });
  const href = maybeVariantStonePieceHref(svgRoot, maybeVariantWoodenPieceHref(svgRoot, baseHref, nodeId), nodeId);
  g.appendChild(makeUse(href, cx - half, cy - half, pieceSize));

  drawMiniStackSpine(svgRoot, g, cx, cy, stack, {
    pieceSize,
    miniSize: 18,
    rulesetId,
    seedKey: nodeId,
    countLayer: countsLayer ?? undefined,
  });

  if (inspector && stack.length > 1) {
    g.style.cursor = "pointer";
    g.addEventListener("pointerenter", () => {
      inspector.cancelHide();
      inspector.show(nodeId, stack);
    });
    g.addEventListener("pointerleave", () => {
      inspector.hideSoon();
    });
  }

  piecesLayer.appendChild(g);
}
