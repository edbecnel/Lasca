import { MINI_SPINE_MAX_SHOWN, MINI_SPINE_KEEP_BOTTOM, MINI_SPINE_KEEP_TOP } from "../config/constants";
import { nodeIdToA1 } from "../game/coordFormat";
import { pieceToHref } from "../pieces/pieceToHref";
import { makeUse } from "../render/svgUse";
import type { Stack } from "../types";

const SVG_NS = "http://www.w3.org/2000/svg";

export function createStackInspector(
  zoomTitle: HTMLElement,
  zoomHint: HTMLElement,
  zoomSvg: SVGSVGElement
) {
  let hideTimer: number | null = null;

  function clearZoom(): void {
    while (zoomSvg.firstChild) zoomSvg.removeChild(zoomSvg.firstChild);
    zoomSvg.setAttribute("viewBox", "0 0 120 200");
    zoomSvg.removeAttribute("height");
  }

  function show(nodeId: string, stack: Stack): void {
    const n = stack.length;

    zoomTitle.textContent = `Stack @ ${nodeIdToA1(nodeId)} (×${n})`;
    zoomHint.textContent = n > MINI_SPINE_MAX_SHOWN
      ? "Full column order (bottom → top). Brackets mark pieces omitted in the mini preview spine."
      : "Full column order (bottom → top).";

    while (zoomSvg.firstChild) zoomSvg.removeChild(zoomSvg.firstChild);

    const miniSize = 22;
    const gap = 4;
    const padTop = 26;
    const padBottom = 24;
    const W = 120;

    const columnH = n * miniSize + (n - 1) * gap;
    const H = padTop + columnH + padBottom;

    zoomSvg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    zoomSvg.setAttribute("height", String(H));

    const columnX = W / 2 - miniSize / 2;
    const columnY = padTop;

    const bg = document.createElementNS(SVG_NS, "rect");
    bg.setAttribute("x", String(columnX - 8));
    bg.setAttribute("y", String(columnY - 10));
    bg.setAttribute("width", String(miniSize + 16));
    bg.setAttribute("height", String(columnH + 20));
    bg.setAttribute("rx", "12");
    bg.setAttribute("fill", "rgba(0,0,0,0.28)");
    bg.setAttribute("stroke", "rgba(255,255,255,0.18)");
    bg.setAttribute("stroke-width", "1.4");
    zoomSvg.appendChild(bg);

    const topLbl = document.createElementNS(SVG_NS, "text");
    topLbl.setAttribute("x", String(W / 2));
    topLbl.setAttribute("y", String(columnY - 12));
    topLbl.setAttribute("text-anchor", "middle");
    topLbl.setAttribute("fill", "rgba(255,255,255,0.85)");
    topLbl.setAttribute("font-size", "12");
    topLbl.setAttribute("font-family", "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif");
    topLbl.textContent = "TOP";
    zoomSvg.appendChild(topLbl);

    const botLbl = document.createElementNS(SVG_NS, "text");
    botLbl.setAttribute("x", String(W / 2));
    botLbl.setAttribute("y", String(columnY + columnH + 18));
    botLbl.setAttribute("text-anchor", "middle");
    botLbl.setAttribute("fill", "rgba(255,255,255,0.85)");
    botLbl.setAttribute("font-size", "12");
    botLbl.setAttribute("font-family", "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif");
    botLbl.textContent = "BOTTOM";
    zoomSvg.appendChild(botLbl);

    for (let i = 0; i < n; i++) {
      const p = stack[i];
      const href = pieceToHref(p);
      const y = columnY + (n - 1 - i) * (miniSize + gap);
      zoomSvg.appendChild(makeUse(href, columnX, y, miniSize));
    }

    if (n > MINI_SPINE_MAX_SHOWN) {
      const keepBottom = MINI_SPINE_KEEP_BOTTOM;
      const keepTop = MINI_SPINE_KEEP_TOP;

      const missingStart = keepBottom;
      const missingEnd = n - keepTop - 1;

      if (missingEnd >= missingStart) {
        const yTop = columnY + (n - 1 - missingEnd) * (miniSize + gap);
        const yBottom = columnY + (n - 1 - missingStart) * (miniSize + gap) + miniSize;

        const leftX = columnX - 18;
        const rightX = columnX + miniSize + 18;
        const tick = 10;

        const left = document.createElementNS(SVG_NS, "path");
        left.setAttribute(
          "d",
          `M ${leftX + tick} ${yTop} L ${leftX} ${yTop} L ${leftX} ${yBottom} L ${leftX + tick} ${yBottom}`
        );
        left.setAttribute("fill", "none");
        left.setAttribute("stroke", "rgba(255,255,255,0.90)");
        left.setAttribute("stroke-width", "2.2");
        left.setAttribute("stroke-linecap", "round");
        left.setAttribute("stroke-linejoin", "round");
        zoomSvg.appendChild(left);

        const right = document.createElementNS(SVG_NS, "path");
        right.setAttribute(
          "d",
          `M ${rightX - tick} ${yTop} L ${rightX} ${yTop} L ${rightX} ${yBottom} L ${rightX - tick} ${yBottom}`
        );
        right.setAttribute("fill", "none");
        right.setAttribute("stroke", "rgba(255,255,255,0.90)");
        right.setAttribute("stroke-width", "2.2");
        right.setAttribute("stroke-linecap", "round");
        right.setAttribute("stroke-linejoin", "round");
        zoomSvg.appendChild(right);
      }
    }
  }

  function cancelHide(): void {
    if (hideTimer) window.clearTimeout(hideTimer);
    hideTimer = null;
  }

  function hideSoon(): void {
    if (hideTimer) window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      zoomTitle.textContent = "Lasca Stack Inspector";
      zoomHint.textContent =
        "Hover a stacked piece to see the full column order (bottom → top). If a crack appears on the mini spine, brackets mark the omitted middle here.";
      clearZoom();
    }, 80);
  }

  return { show, hideSoon, cancelHide, clearZoom };
}
