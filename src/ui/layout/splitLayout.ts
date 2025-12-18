const LS_PREFIX = "lasca.layout.";
const TAB_W = 22;

const DEFAULTS = {
  leftWidth: 280,
  rightWidth: 320,
  leftCollapsed: false,
  rightCollapsed: false,
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function readNumber(key: string, fallback: number): number {
  const raw = localStorage.getItem(key);
  if (raw == null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function readBool(key: string, fallback: boolean): boolean {
  const raw = localStorage.getItem(key);
  if (raw == null) return fallback;
  return raw === "1";
}

function writeNumber(key: string, n: number): void {
  localStorage.setItem(key, String(Math.round(n)));
}

function writeBool(key: string, b: boolean): void {
  localStorage.setItem(key, b ? "1" : "0");
}

interface SplitLayoutOptions {
  root?: HTMLElement | null;
  left?: HTMLElement | null;
  right?: HTMLElement | null;
  gutterLeft?: HTMLElement | null;
  gutterRight?: HTMLElement | null;
}

export function initSplitLayout(opts: SplitLayoutOptions = {}) {
  const root = opts.root ?? (document.getElementById("appRoot") as HTMLElement | null);
  const left = opts.left ?? (document.getElementById("leftSidebar") as HTMLElement | null);
  const right = opts.right ?? (document.getElementById("rightSidebar") as HTMLElement | null);
  const gLeft = opts.gutterLeft ?? (document.getElementById("gutterLeft") as HTMLElement | null);
  const gRight = opts.gutterRight ?? (document.getElementById("gutterRight") as HTMLElement | null);

  if (!root || !left || !right || !gLeft || !gRight) {
    throw new Error("splitLayout: missing root/sidebars/gutters");
  }

  const rootEl = root as HTMLElement;
  const leftEl = left as HTMLElement;
  const rightEl = right as HTMLElement;
  const gLeftEl = gLeft as HTMLElement;
  const gRightEl = gRight as HTMLElement;

  const btnCollapseLeft = rootEl.querySelector('[data-action="collapse-left"]') as HTMLButtonElement | null;
  const btnCollapseRight = rootEl.querySelector('[data-action="collapse-right"]') as HTMLButtonElement | null;
  const btnExpandLeft = rootEl.querySelector('[data-action="expand-left"]') as HTMLButtonElement | null;
  const btnExpandRight = rootEl.querySelector('[data-action="expand-right"]') as HTMLButtonElement | null;

  const MIN_CENTER = 420;
  const MIN_LEFT = 200;
  const MAX_LEFT = 520;
  const MIN_RIGHT = 240;
  const MAX_RIGHT = 560;

  let leftWidth = readNumber(LS_PREFIX + "leftWidth", DEFAULTS.leftWidth);
  let rightWidth = readNumber(LS_PREFIX + "rightWidth", DEFAULTS.rightWidth);
  let leftCollapsed = readBool(LS_PREFIX + "leftCollapsed", DEFAULTS.leftCollapsed);
  let rightCollapsed = readBool(LS_PREFIX + "rightCollapsed", DEFAULTS.rightCollapsed);

  let lastLeftExpanded = leftWidth;
  let lastRightExpanded = rightWidth;

  function rootW(): number {
    return rootEl.getBoundingClientRect().width;
  }
  function gutterTotalW(): number {
    return gLeftEl.getBoundingClientRect().width + gRightEl.getBoundingClientRect().width;
  }

  function apply(): void {
    leftEl.style.width = leftCollapsed ? `${TAB_W}px` : `${leftWidth}px`;
    rightEl.style.width = rightCollapsed ? `${TAB_W}px` : `${rightWidth}px`;

    leftEl.classList.toggle("collapsed", leftCollapsed);
    rightEl.classList.toggle("collapsed", rightCollapsed);

    gLeftEl.classList.toggle("disabled", leftCollapsed);
    gRightEl.classList.toggle("disabled", rightCollapsed);

    writeNumber(LS_PREFIX + "leftWidth", leftWidth);
    writeNumber(LS_PREFIX + "rightWidth", rightWidth);
    writeBool(LS_PREFIX + "leftCollapsed", leftCollapsed);
    writeBool(LS_PREFIX + "rightCollapsed", rightCollapsed);
  }

  function maxLeftForCenter(): number {
    const w = rootW();
    const effectiveRight = rightCollapsed ? TAB_W : rightWidth;
    return w - gutterTotalW() - effectiveRight - MIN_CENTER;
  }

  function maxRightForCenter(): number {
    const w = rootW();
    const effectiveLeft = leftCollapsed ? TAB_W : leftWidth;
    return w - gutterTotalW() - effectiveLeft - MIN_CENTER;
  }

  function setLeftCollapsed(c: boolean): void {
    if (leftCollapsed === c) return;
    if (!c) {
      leftWidth = clamp(lastLeftExpanded, MIN_LEFT, Math.min(MAX_LEFT, maxLeftForCenter()));
    } else {
      lastLeftExpanded = leftWidth;
    }
    leftCollapsed = c;
    apply();
  }

  function setRightCollapsed(c: boolean): void {
    if (rightCollapsed === c) return;
    if (!c) {
      rightWidth = clamp(lastRightExpanded, MIN_RIGHT, Math.min(MAX_RIGHT, maxRightForCenter()));
    } else {
      lastRightExpanded = rightWidth;
    }
    rightCollapsed = c;
    apply();
  }

  function onResize(): void {
    if (!leftCollapsed) {
      leftWidth = clamp(leftWidth, MIN_LEFT, Math.min(MAX_LEFT, maxLeftForCenter()));
    }
    if (!rightCollapsed) {
      rightWidth = clamp(rightWidth, MIN_RIGHT, Math.min(MAX_RIGHT, maxRightForCenter()));
    }
    apply();
  }

  function dragLeft(e: PointerEvent): void {
    if (leftCollapsed) return;

    const startX = e.clientX;
    const startLeft = leftWidth;

    const maxForCenter = Math.min(MAX_LEFT, maxLeftForCenter());
    const minForCenter = MIN_LEFT;

    function move(ev: PointerEvent) {
      const dx = ev.clientX - startX;
      leftWidth = clamp(startLeft + dx, minForCenter, maxForCenter);
      apply();
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      try {
        gLeftEl.releasePointerCapture(e.pointerId);
      } catch {}
    }

    gLeftEl.setPointerCapture(e.pointerId);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function dragRight(e: PointerEvent): void {
    if (rightCollapsed) return;

    const startX = e.clientX;
    const startRight = rightWidth;

    const maxForCenter = Math.min(MAX_RIGHT, maxRightForCenter());
    const minForCenter = MIN_RIGHT;

    function move(ev: PointerEvent) {
      const dx = ev.clientX - startX;
      rightWidth = clamp(startRight - dx, minForCenter, maxForCenter);
      apply();
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      try {
        gRightEl.releasePointerCapture(e.pointerId);
      } catch {}
    }

    gRightEl.setPointerCapture(e.pointerId);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  gLeftEl.addEventListener("pointerdown", dragLeft);
  gRightEl.addEventListener("pointerdown", dragRight);

  gLeftEl.addEventListener("dblclick", () => setLeftCollapsed(!leftCollapsed));
  gRightEl.addEventListener("dblclick", () => setRightCollapsed(!rightCollapsed));

  btnCollapseLeft?.addEventListener("click", () => setLeftCollapsed(true));
  btnExpandLeft?.addEventListener("click", () => setLeftCollapsed(false));
  btnCollapseRight?.addEventListener("click", () => setRightCollapsed(true));
  btnExpandRight?.addEventListener("click", () => setRightCollapsed(false));

  onResize();
  window.addEventListener("resize", onResize);

  return {
    getState: () => ({ leftWidth, rightWidth, leftCollapsed, rightCollapsed }),
    setLeftCollapsed,
    setRightCollapsed,
    setLeftWidth: (w: number) => {
      leftWidth = w;
      onResize();
    },
    setRightWidth: (w: number) => {
      rightWidth = w;
      onResize();
    },
  };
}
