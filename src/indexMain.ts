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

  playMode: "lasca.play.mode",
  onlineServerUrl: "lasca.online.serverUrl",
  onlineAction: "lasca.online.action",
  onlineRoomId: "lasca.online.roomId",
} as const;

type Difficulty = "human" | "easy" | "medium" | "advanced";
type PlayMode = "local" | "online";
type OnlineAction = "create" | "join";

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

function readPlayMode(key: string, fallback: PlayMode): PlayMode {
  const raw = localStorage.getItem(key);
  if (raw === "local" || raw === "online") return raw;
  return fallback;
}

function readOnlineAction(key: string, fallback: OnlineAction): OnlineAction {
  const raw = localStorage.getItem(key);
  if (raw === "create" || raw === "join") return raw;
  return fallback;
}

function normalizeServerUrl(raw: string): string {
  const s = (raw || "").trim();
  return s.replace(/\/+$/, "");
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

  const elPlayMode = byId<HTMLSelectElement>("launchPlayMode");
  const elOnlineServerUrl = byId<HTMLInputElement>("launchOnlineServerUrl");
  const elOnlineAction = byId<HTMLSelectElement>("launchOnlineAction");
  const elOnlineRoomIdLabel = byId<HTMLElement>("launchOnlineRoomIdLabel");
  const elOnlineRoomId = byId<HTMLInputElement>("launchOnlineRoomId");

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

  elPlayMode.value = readPlayMode(LS_KEYS.playMode, "local");
  const envServerUrl = (import.meta as any)?.env?.VITE_SERVER_URL as string | undefined;
  elOnlineServerUrl.value =
    localStorage.getItem(LS_KEYS.onlineServerUrl) ??
    (typeof envServerUrl === "string" && envServerUrl.trim() ? envServerUrl.trim() : "http://localhost:8788");
  elOnlineAction.value = readOnlineAction(LS_KEYS.onlineAction, "create");
  elOnlineRoomId.value = localStorage.getItem(LS_KEYS.onlineRoomId) ?? "";

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

    const baseOk = Boolean(v.available && v.entryUrl);

    const playMode = (elPlayMode.value === "online" ? "online" : "local") as PlayMode;
    const onlineAction = (elOnlineAction.value === "join" ? "join" : "create") as OnlineAction;
    const serverUrl = normalizeServerUrl(elOnlineServerUrl.value);
    const roomId = (elOnlineRoomId.value || "").trim();

    let ok = baseOk;
    let warning: string | null = null;

    if (!baseOk) {
      warning = `${v.displayName} is not available yet in this build.`;
    } else if (playMode === "online") {
      if (!serverUrl) {
        ok = false;
        warning = "Online mode needs a server URL.";
      } else if (onlineAction === "join" && !roomId) {
        ok = false;
        warning = "Online Join needs a room ID.";
      }
    }

    elLaunch.disabled = !ok;
    elWarning.textContent = warning ?? "—";
  };

  elGame.addEventListener("change", syncAvailability);
  elPlayMode.addEventListener("change", () => {
    localStorage.setItem(LS_KEYS.playMode, elPlayMode.value);
    syncOnlineVisibility();
    syncAvailability();
  });

  elOnlineServerUrl.addEventListener("input", () => {
    localStorage.setItem(LS_KEYS.onlineServerUrl, elOnlineServerUrl.value);
    syncAvailability();
  });

  elOnlineAction.addEventListener("change", () => {
    localStorage.setItem(LS_KEYS.onlineAction, elOnlineAction.value);
    syncOnlineVisibility();
    syncAvailability();
  });

  elOnlineRoomId.addEventListener("input", () => {
    localStorage.setItem(LS_KEYS.onlineRoomId, elOnlineRoomId.value);
    syncAvailability();
  });

  function syncOnlineVisibility(): void {
    const playMode = (elPlayMode.value === "online" ? "online" : "local") as PlayMode;
    const onlineAction = (elOnlineAction.value === "join" ? "join" : "create") as OnlineAction;

    const showOnline = playMode === "online";
    elOnlineServerUrl.disabled = !showOnline;
    elOnlineAction.disabled = !showOnline;

    const showRoomId = showOnline && onlineAction === "join";
    elOnlineRoomIdLabel.style.display = showRoomId ? "" : "none";
    elOnlineRoomId.style.display = showRoomId ? "" : "none";
    elOnlineRoomId.disabled = !showRoomId;
  }

  syncOnlineVisibility();
  syncAvailability();

  elLaunch.addEventListener("click", async () => {
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

    const playMode = (elPlayMode.value === "online" ? "online" : "local") as PlayMode;
    if (playMode !== "online") {
      window.location.assign(v.entryUrl);
      return;
    }

    const onlineAction = (elOnlineAction.value === "join" ? "join" : "create") as OnlineAction;
    const serverUrl = normalizeServerUrl(elOnlineServerUrl.value);
    const roomId = (elOnlineRoomId.value || "").trim();
    if (!serverUrl) return;
    if (onlineAction === "join" && !roomId) return;

    // If joining, prefer the room's authoritative variant so we don't load the wrong board/rules UI.
    // This prevents cases like: Damasca room joined via Lasca/Dama page (can look like wrong moves).
    let targetVariant = v;
    if (onlineAction === "join") {
      try {
        const res = await fetch(`${serverUrl}/api/room/${encodeURIComponent(roomId)}`);
        const json = (await res.json()) as any;
        const roomVariantId = json?.snapshot?.state?.meta?.variantId as string | undefined;
        if (roomVariantId && isVariantId(roomVariantId)) {
          targetVariant = getVariantById(roomVariantId);
          localStorage.setItem(LS_KEYS.variantId, targetVariant.variantId);
        }
      } catch {
        // If the room lookup fails, fall back to the user's selected variant.
      }
    }

    const url = new URL(targetVariant.entryUrl, window.location.href);
    url.searchParams.set("mode", "online");
    url.searchParams.set("server", serverUrl);
    if (onlineAction === "create") {
      url.searchParams.set("create", "1");
    } else {
      url.searchParams.set("join", "1");
      url.searchParams.set("roomId", roomId);
    }
    window.location.assign(url.toString());
  });
});
