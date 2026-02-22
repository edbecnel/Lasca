type BoardLoadingOverlay = {
  show: () => void;
  hide: () => void;
  remove: () => void;
};

const CSS_ID = "lascaBoardLoadingOverlayCss";

function ensureCss(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(CSS_ID)) return;

  const style = document.createElement("style");
  style.id = CSS_ID;
  style.textContent = `
.lascaBoardLoadingOverlay{
  position:absolute;
  inset:0;
  display:none;
  align-items:center;
  justify-content:center;
  z-index:50;
  pointer-events:none;
}
.lascaBoardLoadingOverlay.isVisible{ display:flex; }

.lascaBoardLoadingOverlay ._scrim{
  position:absolute;
  inset:0;
  background: radial-gradient(circle at 50% 40%, rgba(0,0,0,0.22), rgba(0,0,0,0.55));
}

.lascaBoardLoadingOverlay ._content{
  position:relative;
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:10px;
  padding:14px 16px;
  border-radius:14px;
  background: rgba(0,0,0,0.35);
  border: 1px solid rgba(255,255,255,0.14);
  backdrop-filter: blur(6px);
}

.lascaBoardLoadingSpinner{
  width:44px;
  height:44px;
  border-radius:50%;
  border: 4px solid rgba(255,255,255,0.18);
  border-top-color: rgba(255,255,255,0.85);
  animation: lascaSpin 0.9s linear infinite;
}

.lascaBoardLoadingLabel{
  font: 600 12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  color: rgba(255,255,255,0.85);
  letter-spacing: 0.2px;
}

@keyframes lascaSpin{ to{ transform: rotate(360deg); } }
  `.trim();

  document.head.appendChild(style);
}

export function createBoardLoadingOverlay(boardWrap: HTMLElement, opts?: { label?: string }): BoardLoadingOverlay {
  if (!boardWrap) throw new Error("createBoardLoadingOverlay: boardWrap is required");
  ensureCss();

  // Ensure the overlay can be positioned relative to the board area.
  const computed = typeof window !== "undefined" ? window.getComputedStyle(boardWrap) : null;
  if (!computed || computed.position === "static") {
    boardWrap.style.position = "relative";
  }

  const overlay = document.createElement("div");
  overlay.className = "lascaBoardLoadingOverlay";
  overlay.setAttribute("aria-hidden", "true");

  const scrim = document.createElement("div");
  scrim.className = "_scrim";

  const content = document.createElement("div");
  content.className = "_content";

  const spinner = document.createElement("div");
  spinner.className = "lascaBoardLoadingSpinner";
  spinner.setAttribute("role", "img");
  spinner.setAttribute("aria-label", "Loading");

  const label = document.createElement("div");
  label.className = "lascaBoardLoadingLabel";
  label.textContent = (opts?.label ?? "Loading board…").trim();

  content.appendChild(spinner);
  content.appendChild(label);
  overlay.appendChild(scrim);
  overlay.appendChild(content);

  boardWrap.appendChild(overlay);

  const api: BoardLoadingOverlay = {
    show: () => overlay.classList.add("isVisible"),
    hide: () => overlay.classList.remove("isVisible"),
    remove: () => overlay.remove(),
  };

  return api;
}
