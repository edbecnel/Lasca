export type HoldDragOptions = {
  storageKey: string;
  holdDelayMs?: number;
  moveThresholdPx?: number;
  suppressClickMs?: number;
};

export type HoldDragController = {
  wasDraggedRecently: () => boolean;
};

type StoredPos = {
  xFrac: number;
  yFrac: number;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const safeJsonParse = <T>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const computeLeftTopFromFractions = (el: HTMLElement, pos: StoredPos) => {
  const rect = el.getBoundingClientRect();
  const maxLeft = Math.max(0, window.innerWidth - rect.width);
  const maxTop = Math.max(0, window.innerHeight - rect.height);
  return {
    left: clamp(pos.xFrac * maxLeft, 0, maxLeft),
    top: clamp(pos.yFrac * maxTop, 0, maxTop),
  };
};

export const installHoldDrag = (el: HTMLElement, options: HoldDragOptions): HoldDragController => {
  const holdDelayMs = options.holdDelayMs ?? 250;
  const moveThresholdPx = options.moveThresholdPx ?? 10;
  const suppressClickMs = options.suppressClickMs ?? 500;

  let holdTimer: number | null = null;
  let dragActive = false;
  let dragMoved = false;
  let pointerId: number | null = null;

  let startClientX = 0;
  let startClientY = 0;
  let startLeft = 0;
  let startTop = 0;

  let suppressClickUntil = 0;

  const clearHoldTimer = () => {
    if (holdTimer !== null) {
      window.clearTimeout(holdTimer);
      holdTimer = null;
    }
  };

  const startDrag = (ev: PointerEvent) => {
    dragActive = true;
    dragMoved = false;
    pointerId = ev.pointerId;

    // Fix current on-screen position before switching to fixed positioning.
    const rect = el.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;

    startClientX = ev.clientX;
    startClientY = ev.clientY;

    el.style.position = "fixed";
    el.style.left = `${startLeft}px`;
    el.style.top = `${startTop}px`;
    el.style.right = "auto";
    el.style.bottom = "auto";

    try {
      el.setPointerCapture(ev.pointerId);
    } catch {
      // ignore
    }
  };

  const endDrag = () => {
    if (!dragActive) return;

    dragActive = false;
    pointerId = null;

    if (dragMoved) {
      suppressClickUntil = performance.now() + suppressClickMs;

      const rect = el.getBoundingClientRect();
      const maxLeft = Math.max(0, window.innerWidth - rect.width);
      const maxTop = Math.max(0, window.innerHeight - rect.height);

      const left = clamp(rect.left, 0, maxLeft);
      const top = clamp(rect.top, 0, maxTop);

      const xFrac = maxLeft === 0 ? 0 : left / maxLeft;
      const yFrac = maxTop === 0 ? 0 : top / maxTop;

      const stored: StoredPos = { xFrac: clamp01(xFrac), yFrac: clamp01(yFrac) };
      localStorage.setItem(options.storageKey, JSON.stringify(stored));
    }
  };

  // Restore saved position (if any).
  const saved = safeJsonParse<StoredPos>(localStorage.getItem(options.storageKey));
  if (saved && typeof saved.xFrac === "number" && typeof saved.yFrac === "number") {
    const pos: StoredPos = { xFrac: clamp01(saved.xFrac), yFrac: clamp01(saved.yFrac) };
    const { left, top } = computeLeftTopFromFractions(el, pos);

    el.style.position = "fixed";
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.right = "auto";
    el.style.bottom = "auto";
  }

  // Re-apply clamped saved position on viewport changes.
  window.addEventListener("resize", () => {
    const savedNow = safeJsonParse<StoredPos>(localStorage.getItem(options.storageKey));
    if (!savedNow || typeof savedNow.xFrac !== "number" || typeof savedNow.yFrac !== "number") return;

    const pos: StoredPos = { xFrac: clamp01(savedNow.xFrac), yFrac: clamp01(savedNow.yFrac) };
    const { left, top } = computeLeftTopFromFractions(el, pos);

    el.style.position = "fixed";
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.right = "auto";
    el.style.bottom = "auto";
  });

  el.addEventListener("contextmenu", (e) => e.preventDefault());

  el.addEventListener("pointerdown", (ev: PointerEvent) => {
    if (ev.button !== 0) return;

    clearHoldTimer();
    startClientX = ev.clientX;
    startClientY = ev.clientY;

    holdTimer = window.setTimeout(() => {
      holdTimer = null;
      startDrag(ev);
    }, holdDelayMs);
  });

  el.addEventListener("pointermove", (ev: PointerEvent) => {
    if (dragActive) {
      ev.preventDefault();
      const rect = el.getBoundingClientRect();
      const maxLeft = Math.max(0, window.innerWidth - rect.width);
      const maxTop = Math.max(0, window.innerHeight - rect.height);

      const dx = ev.clientX - startClientX;
      const dy = ev.clientY - startClientY;

      const nextLeft = clamp(startLeft + dx, 0, maxLeft);
      const nextTop = clamp(startTop + dy, 0, maxTop);

      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        dragMoved = true;
      }

      el.style.left = `${nextLeft}px`;
      el.style.top = `${nextTop}px`;
      return;
    }

    if (holdTimer !== null) {
      const dx = ev.clientX - startClientX;
      const dy = ev.clientY - startClientY;
      if (Math.hypot(dx, dy) >= moveThresholdPx) {
        clearHoldTimer();
      }
    }
  });

  const cancel = () => {
    clearHoldTimer();
    endDrag();
  };

  el.addEventListener("pointerup", cancel);
  el.addEventListener("pointercancel", cancel);
  el.addEventListener("lostpointercapture", cancel);

  return {
    wasDraggedRecently: () => performance.now() < suppressClickUntil,
  };
};
