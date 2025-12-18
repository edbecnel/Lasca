import { MINI_SPINE_MAX_SHOWN, MINI_SPINE_KEEP_BOTTOM, MINI_SPINE_KEEP_TOP } from "../config/constants";
import { pieceToHref } from "../pieces/pieceToHref";
import { makeUse } from "./svgUse";
import type { Stack } from "../types";

const SVG_NS = "http://www.w3.org/2000/svg";

interface MiniSpineOptions {
  pieceSize: number;
  maxShown: number;
  keepTop: number;
  keepBottom: number;
  miniSize: number;
  miniGap: number;
  spineGap: number;
  spinePad: number;
  crackGap: number;
}

export function drawMiniStackSpine(
  svgRoot: SVGSVGElement,
  g: SVGGElement,
  cx: number,
  cy: number,
  stack: Stack,
  opts: Partial<MiniSpineOptions> = {}
): void {
  const {
    pieceSize = 86,
    maxShown = MINI_SPINE_MAX_SHOWN,
    keepTop = MINI_SPINE_KEEP_TOP,
    keepBottom = MINI_SPINE_KEEP_BOTTOM,
    miniSize = 18,
    miniGap = 3,
    spineGap = 10,
    spinePad = 6,
    crackGap = 12,
  } = opts;

  const n = stack.length;
  if (n <= 1) return;

  let shown = [] as Stack;
  let hasCrack = false;

  if (n <= maxShown) {
    shown = stack.slice();
  } else {
    hasCrack = true;
    const bottom = stack.slice(0, keepBottom);
    const top = stack.slice(n - keepTop);
    shown = bottom.concat(top);
  }

  const countShown = shown.length;
  const stackH = countShown * miniSize + (countShown - 1) * miniGap + (hasCrack ? crackGap : 0);

  const spineW = miniSize + spinePad * 2;
  const spineH = stackH + spinePad * 2;

  const x = cx + pieceSize / 2 + spineGap;
  const y = cy - spineH / 2;

  const bg = document.createElementNS(SVG_NS, "rect");
  bg.setAttribute("x", String(x));
  bg.setAttribute("y", String(y));
  bg.setAttribute("width", String(spineW));
  bg.setAttribute("height", String(spineH));
  bg.setAttribute("rx", "10");
  bg.setAttribute("fill", "rgba(0,0,0,0.28)");
  bg.setAttribute("stroke", "rgba(255,255,255,0.35)");
  bg.setAttribute("stroke-width", "1.4");
  bg.setAttribute("pointer-events", "none");
  g.appendChild(bg);

  const defs = svgRoot.querySelector("defs") as SVGDefsElement | null;
  if (!defs) throw new Error("SVG <defs> not found. miniSpine requires <defs>.");

  const clipId = `clip_${Math.random().toString(16).slice(2)}`;
  const clipPath = document.createElementNS(SVG_NS, "clipPath");
  clipPath.setAttribute("id", clipId);

  const clipRect = document.createElementNS(SVG_NS, "rect");
  clipRect.setAttribute("x", String(x + 1));
  clipRect.setAttribute("y", String(y + 1));
  clipRect.setAttribute("width", String(spineW - 2));
  clipRect.setAttribute("height", String(spineH - 2));
  clipRect.setAttribute("rx", "9");

  clipPath.appendChild(clipRect);
  defs.appendChild(clipPath);

  const minis = document.createElementNS(SVG_NS, "g") as SVGGElement;
  minis.setAttribute("clip-path", `url(#${clipId})`);
  minis.setAttribute("pointer-events", "none");

  const innerLeft = x + spinePad;
  const innerBottom = y + spineH - spinePad;

  const crackAfterIndex = keepBottom - 1;

  for (let i = 0; i < countShown; i++) {
    const p = shown[i];
    const href = pieceToHref(p);

    let yOffset = i * (miniSize + miniGap);
    if (hasCrack && i > crackAfterIndex) {
      yOffset += crackGap;
    }

    const miniY = innerBottom - miniSize - yOffset;
    const miniX = innerLeft;

    minis.appendChild(makeUse(href, miniX, miniY, miniSize));
  }

  g.appendChild(minis);

  if (hasCrack) {
    const crackTopY = innerBottom - miniSize - crackAfterIndex * (miniSize + miniGap) - miniGap;
    const crackMidY = crackTopY - crackGap / 2;

    const left = x + 3;
    const right = x + spineW - 3;
    const midX = (left + right) / 2;

    const d = [
      `M ${left} ${crackMidY - 5}`,
      `L ${midX - 6} ${crackMidY + 2}`,
      `L ${midX} ${crackMidY - 3}`,
      `L ${midX + 6} ${crackMidY + 4}`,
      `L ${right} ${crackMidY - 1}`,
    ].join(" ");

    const crackShadow = document.createElementNS(SVG_NS, "path");
    crackShadow.setAttribute("d", d);
    crackShadow.setAttribute("fill", "none");
    crackShadow.setAttribute("stroke", "rgba(0,0,0,0.45)");
    crackShadow.setAttribute("stroke-width", "4.0");
    crackShadow.setAttribute("stroke-linecap", "round");
    crackShadow.setAttribute("stroke-linejoin", "round");
    crackShadow.setAttribute("pointer-events", "none");

    const crack = document.createElementNS(SVG_NS, "path");
    crack.setAttribute("d", d);
    crack.setAttribute("fill", "none");
    crack.setAttribute("stroke", "rgba(255,255,255,0.75)");
    crack.setAttribute("stroke-width", "2.2");
    crack.setAttribute("stroke-linecap", "round");
    crack.setAttribute("stroke-linejoin", "round");
    crack.setAttribute("pointer-events", "none");

    g.appendChild(crackShadow);
    g.appendChild(crack);
  }

  const bubbleCx = x + spineW / 2;
  const bubbleCy = y - 12;

  const bubble = document.createElementNS(SVG_NS, "circle");
  bubble.setAttribute("cx", String(bubbleCx));
  bubble.setAttribute("cy", String(bubbleCy));
  bubble.setAttribute("r", "10");
  bubble.setAttribute("fill", "rgba(0,0,0,0.78)");
  bubble.setAttribute("stroke", "rgba(255,255,255,0.65)");
  bubble.setAttribute("stroke-width", "1.4");
  bubble.setAttribute("pointer-events", "none");

  const t = document.createElementNS(SVG_NS, "text");
  t.setAttribute("x", String(bubbleCx));
  t.setAttribute("y", String(bubbleCy + 0.5));
  t.setAttribute("text-anchor", "middle");
  t.setAttribute("dominant-baseline", "middle");
  t.setAttribute("fill", "#fff");
  t.setAttribute("font-size", "12");
  t.setAttribute("font-family", "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif");
  t.textContent = String(n);
  t.setAttribute("pointer-events", "none");

  g.appendChild(bubble);
  g.appendChild(t);
}
