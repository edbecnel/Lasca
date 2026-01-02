import { DEFAULT_THEME_ID, getThemeById, THEMES } from "./theme/themes";
import { DEFAULT_VARIANT_ID, VARIANTS, getVariantById, isVariantId } from "./variants/variantRegistry";
import type { VariantId } from "./variants/variantTypes";

const LS_KEYS = {
  theme: "lasca.theme",
  aiWhite: "lasca.ai.white",
  aiBlack: "lasca.ai.black",
  aiDelayMs: "lasca.ai.delayMs",
  aiPaused: "lasca.ai.paused",

  variantId: "lasca.variantId",

  optMoveHints: "lasca.opt.moveHints",
  optAnimations: "lasca.opt.animations",
  optBoardCoords: "lasca.opt.boardCoords",
  optThreefold: "lasca.opt.threefold",
} as const;

type Difficulty = "human" | "easy" | "medium" | "advanced";

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: #${id}`);
  return el as T;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function readBool(key: string, fallback: boolean): boolean {
  const raw = localStorage.getItem(key);
  if (raw == null) return fallback;
  if (raw === "1") return true;
  if (raw === "0") return false;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return fallback;
}

function writeBool(key: string, v: boolean): void {
  localStorage.setItem(key, v ? "1" : "0");
}

function readDifficulty(key: string, fallback: Difficulty): Difficulty {
  const raw = localStorage.getItem(key);
  if (raw === "human" || raw === "easy" || raw === "medium" || raw === "advanced") return raw;
  return fallback;
}

function readDelayMs(key: string, fallback: number): number {
  const raw = localStorage.getItem(key);
  const n = raw == null ? NaN : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return clamp(Math.round(n), 0, 3000);
}

function parseDelayMs(raw: string, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return clamp(Math.round(n), 0, 3000);
}


function readVariantId(key: string, fallback: VariantId): VariantId {
  const raw = localStorage.getItem(key);
  if (raw && isVariantId(raw)) return raw;
  return fallback;
}

window.addEventListener("DOMContentLoaded", () => {
  const elGame = byId<HTMLSelectElement>("launchGame");
  const elGameNote = byId<HTMLElement>("launchGameNote");
  const elTheme = byId<HTMLSelectElement>("launchTheme");

  const elMoveHints = byId<HTMLInputElement>("launchMoveHints");
  const elAnimations = byId<HTMLInputElement>("launchAnimations");
  const elBoardCoords = byId<HTMLInputElement>("launchBoardCoords");
  const elThreefold = byId<HTMLInputElement>("launchThreefold");

  const elAiWhite = byId<HTMLSelectElement>("launchAiWhite");
  const elAiBlack = byId<HTMLSelectElement>("launchAiBlack");
  const elAiDelay = byId<HTMLInputElement>("launchAiDelay");
  const elAiDelayReset = byId<HTMLButtonElement>("launchAiDelayReset");
  const elAiDelayLabel = byId<HTMLElement>("launchAiDelayLabel");

  const elWarning = byId<HTMLElement>("launchWarning");
  const elLaunch = byId<HTMLButtonElement>("launchBtn");

  // Populate variant select
  elGame.textContent = "";
  for (const v of VARIANTS) {
    const opt = document.createElement("option");
    opt.value = v.variantId;
    opt.textContent = v.displayName;
    if (!v.available) opt.disabled = true;
    elGame.appendChild(opt);
  }

  // Populate theme select
  elTheme.textContent = "";
  for (const t of THEMES) {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.label;
    elTheme.appendChild(opt);
  }

  // Read saved settings (or defaults matching lasca.html)
  const savedTheme = localStorage.getItem(LS_KEYS.theme);
  const initialTheme = (savedTheme && getThemeById(savedTheme)) ? savedTheme : DEFAULT_THEME_ID;
  elTheme.value = initialTheme;

  const initialVariantId = readVariantId(LS_KEYS.variantId, DEFAULT_VARIANT_ID);
  elGame.value = initialVariantId;

  elMoveHints.checked = readBool(LS_KEYS.optMoveHints, false);
  elAnimations.checked = readBool(LS_KEYS.optAnimations, true);
  elBoardCoords.checked = readBool(LS_KEYS.optBoardCoords, false);
  elThreefold.checked = readBool(LS_KEYS.optThreefold, true);

  elAiWhite.value = readDifficulty(LS_KEYS.aiWhite, "human");
  elAiBlack.value = readDifficulty(LS_KEYS.aiBlack, "human");

  const delay = readDelayMs(LS_KEYS.aiDelayMs, 500);
  elAiDelay.value = String(delay);
  elAiDelayLabel.textContent = `${delay} ms`;

  const syncDelayLabel = () => {
    const v = parseDelayMs(elAiDelay.value || "500", 500);
    elAiDelayLabel.textContent = `${v} ms`;
  };

  elAiDelay.addEventListener("input", syncDelayLabel);
  elAiDelayReset.addEventListener("click", () => {
    elAiDelay.value = "500";
    syncDelayLabel();
  });

  const syncAvailability = () => {
    const vId = (isVariantId(elGame.value) ? elGame.value : DEFAULT_VARIANT_ID) as VariantId;
    const v = getVariantById(vId);

    elGameNote.textContent = v.subtitle;
    localStorage.setItem(LS_KEYS.variantId, v.variantId);

    const ok = Boolean(v.available && v.entryUrl);
    elLaunch.disabled = !ok;
    elWarning.textContent = ok ? "—" : `${v.displayName} is not available yet in this build.`;
  };

  elGame.addEventListener("change", syncAvailability);
  syncAvailability();

  elLaunch.addEventListener("click", () => {
    const vId = (isVariantId(elGame.value) ? elGame.value : DEFAULT_VARIANT_ID) as VariantId;
    const v = getVariantById(vId);
    if (!v.available || !v.entryUrl) return;

    localStorage.setItem(LS_KEYS.theme, elTheme.value);

    writeBool(LS_KEYS.optMoveHints, elMoveHints.checked);
    writeBool(LS_KEYS.optAnimations, elAnimations.checked);
    writeBool(LS_KEYS.optBoardCoords, elBoardCoords.checked);
    writeBool(LS_KEYS.optThreefold, elThreefold.checked);

    localStorage.setItem(LS_KEYS.aiWhite, elAiWhite.value);
    localStorage.setItem(LS_KEYS.aiBlack, elAiBlack.value);

    const delayMs = parseDelayMs(elAiDelay.value || "500", 500);
    localStorage.setItem(LS_KEYS.aiDelayMs, String(delayMs));

    // Startup should not force paused; let AIManager decide (it auto-pauses when both sides are AI).
    localStorage.setItem(LS_KEYS.aiPaused, "false");

    window.location.assign(v.entryUrl);
  });
});
