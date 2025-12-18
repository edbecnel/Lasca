// src/ui/layout/splitLayout.js

const LS_PREFIX = "lasca.layout.";
const TAB_W = 22;

const DEFAULTS = {
  leftWidth: 280,
  rightWidth: 320,
  leftCollapsed: false,
  rightCollapsed: false,
};

function clamp(v, lo, hi){
  return Math.max(lo, Math.min(hi, v));
}

function readNumber(key, fallback){
  const raw = localStorage.getItem(key);
  if (raw == null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function readBool(key, fallback){
  const raw = localStorage.getItem(key);
  if (raw == null) return fallback;
  return raw === "1";
}

function writeNumber(key, n){
  localStorage.setItem(key, String(Math.round(n)));
}

function writeBool(key, b){
  localStorage.setItem(key, b ? "1" : "0");
}

/**
 * Initializes the 3-column layout:
 *  [left sidebar] [gutter] [center board] [gutter] [right sidebar]
 *
 * Features:
 * - Drag gutters to resize panels.
 * - Collapse/expand buttons.
 * - Double-click gutter to collapse/expand adjacent panel.
 * - Persists widths/collapsed state to localStorage.
 */
export function initSplitLayout(opts = {}){
  const root = opts.root ?? document.getElementById("appRoot");
  const left = opts.left ?? document.getElementById("leftSidebar");
  const right = opts.right ?? document.getElementById("rightSidebar");
  const gLeft = opts.gutterLeft ?? document.getElementById("gutterLeft");
  const gRight = opts.gutterRight ?? document.getElementById("gutterRight");

  if (!root || !left || !right || !gLeft || !gRight){
    throw new Error("splitLayout: missing root/sidebars/gutters");
  }

  // Buttons
  const btnCollapseLeft = root.querySelector('[data-action="collapse-left"]');
  const btnCollapseRight = root.querySelector('[data-action="collapse-right"]');
  const btnExpandLeft = root.querySelector('[data-action="expand-left"]');
  const btnExpandRight = root.querySelector('[data-action="expand-right"]');

  // Limits
  const MIN_CENTER = 420;
  const MIN_LEFT = 200;
  const MAX_LEFT = 520;
  const MIN_RIGHT = 240;
  const MAX_RIGHT = 560;

  // State
  let leftWidth = readNumber(LS_PREFIX + "leftWidth", DEFAULTS.leftWidth);
  let rightWidth = readNumber(LS_PREFIX + "rightWidth", DEFAULTS.rightWidth);
  let leftCollapsed = readBool(LS_PREFIX + "leftCollapsed", DEFAULTS.leftCollapsed);
  let rightCollapsed = readBool(LS_PREFIX + "rightCollapsed", DEFAULTS.rightCollapsed);

  // Remember last non-collapsed widths in-session
  let lastLeftExpanded = leftWidth;
  let lastRightExpanded = rightWidth;

  function rootW(){
    return root.getBoundingClientRect().width;
  }
  function gutterTotalW(){
    return gLeft.getBoundingClientRect().width + gRight.getBoundingClientRect().width;
  }

  function apply(){
    // When collapsed, sidebar width becomes TAB_W.
    left.style.width = leftCollapsed ? `${TAB_W}px` : `${leftWidth}px`;
    right.style.width = rightCollapsed ? `${TAB_W}px` : `${rightWidth}px`;

    left.classList.toggle("collapsed", leftCollapsed);
    right.classList.toggle("collapsed", rightCollapsed);

    gLeft.classList.toggle("disabled", leftCollapsed);
    gRight.classList.toggle("disabled", rightCollapsed);

    // Persist
    writeNumber(LS_PREFIX + "leftWidth", leftWidth);
    writeNumber(LS_PREFIX + "rightWidth", rightWidth);
    writeBool(LS_PREFIX + "leftCollapsed", leftCollapsed);
    writeBool(LS_PREFIX + "rightCollapsed", rightCollapsed);
  }

  function maxLeftForCenter(){
    const w = rootW();
    const effectiveRight = rightCollapsed ? TAB_W : rightWidth;
    return w - gutterTotalW() - effectiveRight - MIN_CENTER;
  }

  function maxRightForCenter(){
    const w = rootW();
    const effectiveLeft = leftCollapsed ? TAB_W : leftWidth;
    return w - gutterTotalW() - effectiveLeft - MIN_CENTER;
  }

  function setLeftCollapsed(c){
    if (leftCollapsed === c) return;
    if (!c){
      // expand: restore
      leftWidth = clamp(lastLeftExpanded, MIN_LEFT, Math.min(MAX_LEFT, maxLeftForCenter()));
    } else {
      // collapse: remember
      lastLeftExpanded = leftWidth;
    }
    leftCollapsed = c;
    apply();
  }

  function setRightCollapsed(c){
    if (rightCollapsed === c) return;
    if (!c){
      rightWidth = clamp(lastRightExpanded, MIN_RIGHT, Math.min(MAX_RIGHT, maxRightForCenter()));
    } else {
      lastRightExpanded = rightWidth;
    }
    rightCollapsed = c;
    apply();
  }

  function onResize(){
    // Clamp widths to current window size.
    if (!leftCollapsed){
      leftWidth = clamp(leftWidth, MIN_LEFT, Math.min(MAX_LEFT, maxLeftForCenter()));
    }
    if (!rightCollapsed){
      rightWidth = clamp(rightWidth, MIN_RIGHT, Math.min(MAX_RIGHT, maxRightForCenter()));
    }
    apply();
  }

  // ---- Drag logic ----
  function dragLeft(e){
    if (leftCollapsed) return;

    const startX = e.clientX;
    const startLeft = leftWidth;

    const maxForCenter = Math.min(MAX_LEFT, maxLeftForCenter());
    const minForCenter = MIN_LEFT;

    function move(ev){
      const dx = ev.clientX - startX;
      leftWidth = clamp(startLeft + dx, minForCenter, maxForCenter);
      apply();
    }
    function up(){
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      try { gLeft.releasePointerCapture(e.pointerId); } catch {}
    }

    gLeft.setPointerCapture(e.pointerId);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function dragRight(e){
    if (rightCollapsed) return;

    const startX = e.clientX;
    const startRight = rightWidth;

    const maxForCenter = Math.min(MAX_RIGHT, maxRightForCenter());
    const minForCenter = MIN_RIGHT;

    function move(ev){
      const dx = ev.clientX - startX;
      // dragging gutter to the RIGHT makes the right panel narrower
      rightWidth = clamp(startRight - dx, minForCenter, maxForCenter);
      apply();
    }
    function up(){
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      try { gRight.releasePointerCapture(e.pointerId); } catch {}
    }

    gRight.setPointerCapture(e.pointerId);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  gLeft.addEventListener("pointerdown", dragLeft);
  gRight.addEventListener("pointerdown", dragRight);

  // Double-click gutters to collapse/expand adjacent panel
  gLeft.addEventListener("dblclick", () => setLeftCollapsed(!leftCollapsed));
  gRight.addEventListener("dblclick", () => setRightCollapsed(!rightCollapsed));

  // Buttons
  btnCollapseLeft?.addEventListener("click", () => setLeftCollapsed(true));
  btnExpandLeft?.addEventListener("click", () => setLeftCollapsed(false));

  btnCollapseRight?.addEventListener("click", () => setRightCollapsed(true));
  btnExpandRight?.addEventListener("click", () => setRightCollapsed(false));

  // Initial clamp and apply
  onResize();
  window.addEventListener("resize", onResize);

  return {
    getState: () => ({ leftWidth, rightWidth, leftCollapsed, rightCollapsed }),
    setLeftCollapsed,
    setRightCollapsed,
    setLeftWidth: (w) => { leftWidth = w; onResize(); },
    setRightWidth: (w) => { rightWidth = w; onResize(); },
  };
}
