import { diagNeighbors, jumpTargets } from "../game/board.ts";
import type { GameState } from "../game/state.ts";

function isNodeId(id: string | null): id is string {
  return !!id && /^r\d+c\d+$/.test(id);
}

function restoreAttr(el: SVGElement, name: string) {
  const prev = el.getAttribute(`data-prev-${name}`);
  if (prev !== null) {
    el.setAttribute(name, prev);
    el.removeAttribute(`data-prev-${name}`);
  } else {
    el.removeAttribute(name);
  }
}

function setAttrWithBackup(el: SVGElement, name: string, value: string) {
  if (!el.hasAttribute(`data-prev-${name}`)) {
    const prev = el.getAttribute(name);
    if (prev !== null) el.setAttribute(`data-prev-${name}`, prev);
    else el.setAttribute(`data-prev-${name}`, "");
  }
  el.setAttribute(name, value);
}

function ensureLegendPanel(): void {
  const existing = document.getElementById("devLegendPanel");
  if (existing) return;

  const sidebarBody = document.querySelector("#rightSidebar .sidebarBody") as HTMLElement | null;
  if (!sidebarBody) return;

  const section = document.createElement("div");
  section.className = "panelSection";
  section.id = "devLegendPanel";

  const title = document.createElement("h3");
  title.textContent = "Dev Legend";
  section.appendChild(title);

  const item = (color: string, label: string) => {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "8px";
    row.style.fontSize = "12px";

    const sw = document.createElement("span");
    sw.style.display = "inline-block";
    sw.style.width = "12px";
    sw.style.height = "12px";
    sw.style.borderRadius = "6px";
    sw.style.background = color;
    sw.style.border = "1px solid rgba(0,0,0,0.35)";

    const text = document.createElement("span");
    text.textContent = label;

    row.appendChild(sw);
    row.appendChild(text);
    section.appendChild(row);
  };

  item("#ffd54a", "Empty neighbors (±1, ±1)");
  item("#ff6b6b", "Jump: over (opponent)");
  item("#ff9f40", "Jump: land (empty)");
  item("#66ccff", "Manual highlight (__board.highlight)");

  const hint = document.createElement("div");
  hint.style.marginTop = "8px";
  hint.style.fontSize = "12px";
  hint.style.color = "rgba(255,255,255,0.65)";
  hint.textContent = "Click a node to highlight. Console: window.__board.*";
  section.appendChild(hint);

  sidebarBody.appendChild(section);
}

export function installBoardDebug(svgRoot: SVGSVGElement, getState: () => GameState): void {
  const highlighted = new Set<SVGCircleElement>();

  function clearHighlights() {
    for (const el of highlighted) {
      restoreAttr(el, "stroke");
      restoreAttr(el, "stroke-width");
      el.removeAttribute("data-debug");
    }
    highlighted.clear();
  }

  function highlightNode(id: string, color: string, width = 3) {
    const el = document.getElementById(id) as SVGCircleElement | null;
    if (!el) return;
    setAttrWithBackup(el, "stroke", color);
    setAttrWithBackup(el, "stroke-width", String(width));
    el.setAttribute("data-debug", "1");
    highlighted.add(el);
  }

  function resolveNodeIdFromTarget(target: EventTarget | null): string | null {
    // Prefer circle id if clicked directly
    if (target instanceof SVGCircleElement) {
      const id = target.getAttribute("id");
      return isNodeId(id) ? id : null;
    }
    // Otherwise, walk up to find a parent with data-node (stack group or child)
    let el = target as (Element | null);
    while (el && el instanceof Element) {
      const dataNode = el.getAttribute("data-node");
      if (isNodeId(dataNode)) return dataNode;
      el = el.parentElement;
    }
    return null;
  }

  function handleClick(target: EventTarget | null) {
    const id = resolveNodeIdFromTarget(target);
    if (!isNodeId(id)) return;

    clearHighlights();

    const ns = diagNeighbors(id);
    const js = jumpTargets(id);
    const state = getState();

    const isEmpty = (nid: string) => !state.board.has(nid) || (state.board.get(nid) ?? []).length === 0;
    const isOccupied = (nid: string) => !isEmpty(nid);

    const emptyNeighbors = ns.filter(isEmpty);
    for (const nid of emptyNeighbors) highlightNode(nid, "#ffd54a", 3);

    // Only show jump-over if the over square's top piece is opponent-owned
    const clickedStack = state.board.get(id) ?? [];
    const moverTop = clickedStack[clickedStack.length - 1] ?? null;
    const overTopOwner = (nid: string): string | null => {
      const s = state.board.get(nid);
      if (!s || s.length === 0) return null;
      const top = s[s.length - 1];
      return top.owner as string;
    };

    const validJumps = js.filter(j => {
      if (!isOccupied(j.over) || !isEmpty(j.land)) return false;
      if (!moverTop) return false; // only show jump hints when clicking a stack
      const overOwner = overTopOwner(j.over);
      return overOwner !== null && overOwner !== moverTop.owner;
    });
    for (const j of validJumps) {
      highlightNode(j.over, "#ff6b6b", 3);
      highlightNode(j.land, "#ff9f40", 4);
    }

    // Also log to console for quick inspection
    // eslint-disable-next-line no-console
    console.log("[boardDebug] click", id, { neighbors: ns, emptyNeighbors, jumps: js, validJumps });
  }

  svgRoot.addEventListener("click", (ev) => handleClick(ev.target));

  // Expose simple console hooks
  const w = window as any;
  w.__board = {
    diagNeighbors,
    jumpTargets,
    clear: clearHighlights,
    highlight: (id: string) => highlightNode(id, "#66ccff", 4),
  };

  // Add a small legend panel into the right sidebar (dev only styling)
  ensureLegendPanel();
}
