import { DEFAULT_THEME_ID, getThemeById, THEMES } from "./theme/themes";
import { DEFAULT_VARIANT_ID, VARIANTS, getVariantById, isVariantId } from "./variants/variantRegistry";
import type { VariantId } from "./variants/variantTypes";
import type { GetLobbyResponse, GetRoomMetaResponse, LobbyRoomSummary, RoomVisibility } from "./shared/onlineProtocol.ts";
import { getGuestDisplayName, setGuestDisplayName } from "./shared/guestIdentity.ts";
import { createSfxManager } from "./ui/sfx";

const LS_KEYS = {
  theme: "lasca.theme",
  glassBg: "lasca.theme.glassBg",
  glassPalette: "lasca.theme.glassPalette",
  aiWhite: "lasca.ai.white",
  aiBlack: "lasca.ai.black",
  aiDelayMs: "lasca.ai.delayMs",
  aiPaused: "lasca.ai.paused",

  variantId: "lasca.variantId",

  optMoveHints: "lasca.opt.moveHints",
  optAnimations: "lasca.opt.animations",
  optShowResizeIcon: "lasca.opt.showResizeIcon",
  optBoardCoords: "lasca.opt.boardCoords",
  optThreefold: "lasca.opt.threefold",
  optToasts: "lasca.opt.toasts",
  optSfx: "lasca.opt.sfx",

  playMode: "lasca.play.mode",
  onlineServerUrl: "lasca.online.serverUrl",
  onlineAction: "lasca.online.action",
  onlineRoomId: "lasca.online.roomId",
  onlinePrefColor: "lasca.online.prefColor",
  onlineVisibility: "lasca.online.visibility",

  lobbyMineOnly: "lasca.lobby.mineOnly",
} as const;

type PreferredColor = "auto" | "W" | "B";

type Difficulty = "human" | "easy" | "medium" | "advanced";
type PlayMode = "local" | "online";
type OnlineAction = "create" | "join" | "spectate" | "rejoin";
type GlassBg = "original" | "felt" | "walnut";
type GlassPaletteId =
  | "yellow_blue"
  | "cyan_violet"
  | "mint_magenta"
  | "pearl_smoke"
  | "lavender_sapphire"
  | "aqua_amber";

type OnlineResumeRecord = {
  serverUrl: string;
  roomId: string;
  playerId: string;
  color?: "W" | "B";
  /** Informational: display name used when this seat was created/joined. */
  displayName?: string;
  savedAtMs: number;
};

function sanitizeResumeDisplayName(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const s = raw.trim();
  if (!s) return undefined;
  const cleaned = s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  const capped = cleaned.slice(0, 24);
  return capped || undefined;
}

function sanitizeResumePlayerId(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const s = raw.trim();
  if (!s) return undefined;
  const lower = s.toLowerCase();
  if (lower === "undefined" || lower === "null" || lower === "spectator") return undefined;
  // Player IDs are server-generated hex IDs.
  if (!/^[0-9a-f]+$/i.test(s)) return undefined;
  if (s.length < 4) return undefined;
  return s;
}

function resumeStorageKey(serverUrl: string, roomId: string): string {
  const s = normalizeServerUrl(serverUrl);
  const r = (roomId || "").trim();
  return `lasca.online.resume.${encodeURIComponent(s)}.${encodeURIComponent(r)}`;
}

function findAnyResumeRecordsForRoomId(roomId: string): OnlineResumeRecord[] {
  const r = (roomId || "").trim();
  if (!r) return [];

  const out: OnlineResumeRecord[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("lasca.online.resume.")) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      const rec = JSON.parse(raw) as any;
      if (!rec || typeof rec !== "object") continue;

      const recRoom = (typeof rec.roomId === "string" ? rec.roomId : "").trim();
      if (recRoom !== r) continue;

      const recServer = normalizeServerUrl(typeof rec.serverUrl === "string" ? rec.serverUrl : "");
      if (!recServer) continue;

      const playerId = sanitizeResumePlayerId(rec.playerId);
      if (!playerId) continue;
      const color = rec.color === "W" || rec.color === "B" ? rec.color : undefined;
      const displayName = sanitizeResumeDisplayName(rec.displayName);
      const savedAtMs = Number.isFinite(rec.savedAtMs) ? Number(rec.savedAtMs) : 0;
      out.push({
        serverUrl: recServer,
        roomId: r,
        playerId,
        ...(color ? { color } : {}),
        ...(displayName ? { displayName } : {}),
        savedAtMs,
      });
    }
  } catch {
    // ignore
  }
  return out;
}

function resolveOnlineResumeRecord(serverUrl: string, roomId: string): OnlineResumeRecord | null {
  const direct = readOnlineResumeRecord(serverUrl, roomId);
  if (direct) return direct;
  const matches = findAnyResumeRecordsForRoomId(roomId);
  if (matches.length === 1) return matches[0];
  return null;
}

function readOnlineResumeRecord(serverUrl: string, roomId: string): OnlineResumeRecord | null {
  try {
    const s = normalizeServerUrl(serverUrl);
    const r = (roomId || "").trim();

    // Try preferred key first, then legacy key patterns.
    const keysToTry = [
      resumeStorageKey(s, r),
      `lasca.online.resume.${encodeURIComponent(serverUrl)}.${encodeURIComponent(r)}`,
      `lasca.online.resume.${encodeURIComponent(serverUrl)}.${encodeURIComponent(roomId)}`,
      `lasca.online.resume.${encodeURIComponent(`${s}/`)}.${encodeURIComponent(r)}`,
    ];

    for (const key of keysToTry) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const rec = JSON.parse(raw) as any;
      if (!rec || typeof rec !== "object") continue;

      const recServer = normalizeServerUrl(typeof rec.serverUrl === "string" ? rec.serverUrl : "");
      const recRoom = (typeof rec.roomId === "string" ? rec.roomId : "").trim();
      if (recServer !== s) continue;
      if (recRoom !== r) continue;

      const playerId = sanitizeResumePlayerId(rec.playerId);
      if (!playerId) continue;
      const color = rec.color === "W" || rec.color === "B" ? rec.color : undefined;
      const displayName = sanitizeResumeDisplayName(rec.displayName);
      const savedAtMs = Number.isFinite(rec.savedAtMs) ? Number(rec.savedAtMs) : 0;
      return {
        serverUrl: s,
        roomId: r,
        playerId,
        ...(color ? { color } : {}),
        ...(displayName ? { displayName } : {}),
        savedAtMs,
      };
    }

    return null;
  } catch {
    return null;
  }
}

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

function readVisibility(key: string, fallback: RoomVisibility): RoomVisibility {
  const raw = localStorage.getItem(key);
  if (raw === "public" || raw === "private") return raw;
  return fallback;
}

function readPreferredColor(key: string, fallback: PreferredColor): PreferredColor {
  const raw = localStorage.getItem(key);
  if (raw === "auto" || raw === "W" || raw === "B") return raw;
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

function isPlausibleRoomId(roomId: string): boolean {
  const r = (roomId || "").trim();
  if (!r) return false;
  if (!/^[0-9a-f]+$/i.test(r)) return false;
  if (r.length < 4) return false;
  return true;
}

function formatAgeShort(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}


function readVariantId(key: string, fallback: VariantId): VariantId {
  const raw = localStorage.getItem(key);
  if (raw && isVariantId(raw)) return raw;
  return fallback;
}

function readGlassBg(key: string, fallback: GlassBg): GlassBg {
  const raw = localStorage.getItem(key);
  if (raw === "original" || raw === "felt" || raw === "walnut") return raw;
  return fallback;
}

function readGlassPaletteId(key: string, fallback: GlassPaletteId): GlassPaletteId {
  const raw = localStorage.getItem(key);
  if (
    raw === "yellow_blue" ||
    raw === "cyan_violet" ||
    raw === "mint_magenta" ||
    raw === "pearl_smoke" ||
    raw === "lavender_sapphire" ||
    raw === "aqua_amber"
  ) {
    return raw;
  }
  return fallback;
}

function isGlassPaletteId(v: unknown): v is GlassPaletteId {
  return (
    v === "yellow_blue" ||
    v === "cyan_violet" ||
    v === "mint_magenta" ||
    v === "pearl_smoke" ||
    v === "lavender_sapphire" ||
    v === "aqua_amber"
  );
}

window.addEventListener("DOMContentLoaded", () => {
  const elGame = byId<HTMLSelectElement>("launchGame");
  const elGameNote = byId<HTMLElement>("launchGameNote");
  const elTheme = byId<HTMLSelectElement>("launchTheme");

  const elGlassColorsRow = (document.getElementById("launchGlassColorsRow") as HTMLElement | null) ?? null;
  const elGlassColors = (document.getElementById("launchGlassColorsSelect") as HTMLSelectElement | null) ?? null;

  const elGlassBgRow = (document.getElementById("launchGlassBgRow") as HTMLElement | null) ?? null;
  const elGlassBg = (document.getElementById("launchGlassBgSelect") as HTMLSelectElement | null) ?? null;

  const elPlayMode = byId<HTMLSelectElement>("launchPlayMode");
  const elOnlineServerUrl = byId<HTMLInputElement>("launchOnlineServerUrl");
  const elOnlineServerUrlLabel =
    (document.querySelector('label[for="launchOnlineServerUrl"]') as HTMLElement | null) ?? null;
  const elOnlineActionLabel =
    (document.querySelector('label[for="launchOnlineAction"]') as HTMLElement | null) ?? null;
  const elOnlineAction = byId<HTMLSelectElement>("launchOnlineAction");
  const elOnlineNameLabel = byId<HTMLElement>("launchOnlineNameLabel");
  const elOnlineName = byId<HTMLInputElement>("launchOnlineName");
  const elOnlineVisibilityLabel = byId<HTMLElement>("launchOnlineVisibilityLabel");
  const elOnlineVisibility = byId<HTMLSelectElement>("launchOnlineVisibility");
  const elOnlineHint = (document.getElementById("launchOnlineHint") as HTMLElement | null) ?? null;
  const elOnlinePrefColorLabel = byId<HTMLElement>("launchOnlinePrefColorLabel");
  const elOnlinePrefColor = byId<HTMLSelectElement>("launchOnlinePrefColor");
  const elOnlinePlayerIdLabel = byId<HTMLElement>("launchOnlinePlayerIdLabel");
  const elOnlinePlayerId = byId<HTMLInputElement>("launchOnlinePlayerId");
  const elOnlineRoomIdLabel = byId<HTMLElement>("launchOnlineRoomIdLabel");
  const elOnlineRoomId = byId<HTMLInputElement>("launchOnlineRoomId");

  const elLobbySection = (document.getElementById("launchLobbySection") as HTMLElement | null) ?? null;
  const elLobbyStatus = (document.getElementById("launchLobbyStatus") as HTMLElement | null) ?? null;
  const elLobbyRefresh = (document.getElementById("launchLobbyRefresh") as HTMLButtonElement | null) ?? null;
  const elLobbyList = (document.getElementById("launchLobbyList") as HTMLElement | null) ?? null;
  const elLobbyMineOnly = (document.getElementById("launchLobbyMineOnly") as HTMLInputElement | null) ?? null;

  const elShowResizeIcon = byId<HTMLInputElement>("launchShowResizeIcon");
  const elBoardCoords = byId<HTMLInputElement>("launchBoardCoords");
  const elThreefold = byId<HTMLInputElement>("launchThreefold");
  const elToasts = byId<HTMLInputElement>("launchToasts");
  const elSfx = byId<HTMLInputElement>("launchSfx");

  const elAiWhite = byId<HTMLSelectElement>("launchAiWhite");
  const elAiBlack = byId<HTMLSelectElement>("launchAiBlack");
  const elAiDelay = byId<HTMLInputElement>("launchAiDelay");
  const elAiDelayReset = byId<HTMLButtonElement>("launchAiDelayReset");
  const elAiDelayLabel = byId<HTMLElement>("launchAiDelayLabel");

  const elWarning = byId<HTMLElement>("launchWarning");
  const elLaunch = byId<HTMLButtonElement>("launchBtn");

  const setWarning = (text: string, opts?: { isError?: boolean }): void => {
    const msg = (text || "").trim();
    elWarning.textContent = msg || "—";
    elWarning.classList.toggle("isError", Boolean(opts?.isError));
  };

  const setRoomIdError = (isError: boolean): void => {
    elOnlineRoomId.classList.toggle("isError", isError);
    elOnlineRoomIdLabel.classList.toggle("isError", isError);
  };

  const setLobbyStatus = (text: string): void => {
    if (!elLobbyStatus) return;
    elLobbyStatus.textContent = (text || "").trim() || "—";
  };

  const roomCreatedAtMs = (r: LobbyRoomSummary): number => {
    const ms = typeof r.createdAt === "string" ? Date.parse(r.createdAt) : NaN;
    return Number.isFinite(ms) ? ms : 0;
  };

  const persistStartPageLaunchPrefs = (): void => {
    localStorage.setItem(LS_KEYS.theme, elTheme.value);

    if (elTheme.value === "glass" && elGlassColors) {
      const raw = elGlassColors.value;
      const next: GlassPaletteId = isGlassPaletteId(raw) ? raw : "yellow_blue";
      localStorage.setItem(LS_KEYS.glassPalette, next);
      elGlassColors.value = next;
    }

    if (elTheme.value === "glass" && elGlassBg) {
      const v = (elGlassBg.value === "felt" || elGlassBg.value === "walnut") ? elGlassBg.value : "original";
      localStorage.setItem(LS_KEYS.glassBg, v);
    }

    // Force these UI prefs.
    writeBool(LS_KEYS.optMoveHints, false);
    writeBool(LS_KEYS.optAnimations, true);
    writeBool(LS_KEYS.optShowResizeIcon, elShowResizeIcon.checked);
    writeBool(LS_KEYS.optBoardCoords, elBoardCoords.checked);
    writeBool(LS_KEYS.optThreefold, elThreefold.checked);
    writeBool(LS_KEYS.optToasts, elToasts.checked);
    writeBool(LS_KEYS.optSfx, elSfx.checked);

    localStorage.setItem(LS_KEYS.aiWhite, elAiWhite.value);
    localStorage.setItem(LS_KEYS.aiBlack, elAiBlack.value);

    const delayMs = parseDelayMs(elAiDelay.value || "500", 500);
    localStorage.setItem(LS_KEYS.aiDelayMs, String(delayMs));

    // Startup should not force paused; let AIManager decide (it auto-pauses when both sides are AI).
    localStorage.setItem(LS_KEYS.aiPaused, "false");
  };

  const launchOnline = async (args: {
    action: OnlineAction;
    serverUrl: string;
    roomId?: string;
    prefColor?: PreferredColor;
    visibility?: RoomVisibility;
    fallbackVariantId: VariantId;
  }): Promise<void> => {
    const fallbackVariant = getVariantById(args.fallbackVariantId);
    if (!fallbackVariant.available || !fallbackVariant.entryUrl) return;

    const serverUrl = normalizeServerUrl(args.serverUrl);
    const roomId = (args.roomId || "").trim();
    const prefColor = (args.prefColor === "W" || args.prefColor === "B") ? args.prefColor : "auto";
    const visibility = (args.visibility === "private" ? "private" : "public") as RoomVisibility;

    if (!serverUrl) {
      setServerError(true);
      setWarning("Invalid Server: (empty)", { isError: true });
      return;
    }

    try {
      // eslint-disable-next-line no-new
      new URL(serverUrl);
    } catch {
      setServerError(true);
      setWarning(`Invalid Server: ${serverUrl}`, { isError: true });
      return;
    }

    if ((args.action === "join" || args.action === "spectate" || args.action === "rejoin") && !roomId) {
      setRoomIdError(true);
      setWarning("Missing Room ID", { isError: true });
      return;
    }

    if ((args.action === "join" || args.action === "spectate" || args.action === "rejoin") && !isPlausibleRoomId(roomId)) {
      setRoomIdError(true);
      setWarning(`Invalid Room ID: ${roomId} (must be hex).`, { isError: true });
      return;
    }

    const resume = args.action === "rejoin" ? resolveOnlineResumeRecord(serverUrl, roomId) : null;
    if (args.action === "rejoin" && !resume) {
      setWarning("No saved seat for this room on this browser.", { isError: true });
      return;
    }

    // If joining/rejoining/spectating, prefer the room's authoritative variant.
    let targetVariant = fallbackVariant;
    if (args.action === "join" || args.action === "rejoin" || args.action === "spectate") {
      try {
        const res = await fetch(`${serverUrl}/api/room/${encodeURIComponent(roomId)}/meta`);
        const json = (await res.json()) as any;

        if (!res.ok || json?.error) {
          const msg = typeof json?.error === "string" ? json.error : `HTTP ${res.status}`;
          const lower = String(msg).toLowerCase();
          const isRoomError =
            lower.includes("room not found") ||
            lower.includes("no such room") ||
            lower.includes("invalid room") ||
            lower.includes("invalid room id");

          if (isRoomError) setRoomIdError(true);
          else setServerError(true);

          setWarning(`Online room check failed: ${msg}`, { isError: true });
          return;
        }

        const roomVariantId = json?.variantId as string | undefined;
        if (roomVariantId && isVariantId(roomVariantId)) {
          targetVariant = getVariantById(roomVariantId);
          localStorage.setItem(LS_KEYS.variantId, targetVariant.variantId);
        }
      } catch {
        setServerError(true);
        setWarning(`Online room check failed (network error) — server: ${serverUrl}`, { isError: true });
        return;
      }
    }

    if (!targetVariant.available || !targetVariant.entryUrl) {
      setWarning(`${targetVariant.displayName} is not available yet in this build.`, { isError: true });
      return;
    }

    const url = new URL(targetVariant.entryUrl, window.location.href);
    url.searchParams.set("mode", "online");
    url.searchParams.set("server", serverUrl);
    if (args.action === "create") {
      url.searchParams.set("create", "1");
      if (prefColor !== "auto") url.searchParams.set("prefColor", prefColor);
      url.searchParams.set("visibility", visibility);
    } else if (args.action === "join") {
      url.searchParams.set("join", "1");
      url.searchParams.set("roomId", roomId);
    } else if (args.action === "spectate") {
      url.searchParams.set("roomId", roomId);
    } else {
      url.searchParams.set("roomId", roomId);
      url.searchParams.set("playerId", (resume as OnlineResumeRecord).playerId);
      if ((resume as OnlineResumeRecord).color) url.searchParams.set("color", (resume as OnlineResumeRecord).color as any);
    }

    window.location.assign(url.toString());
  };

  const renderLobby = (rooms: LobbyRoomSummary[], serverUrlForRejoin?: string): { shown: number; total: number } => {
    const total = rooms.length;
    if (!elLobbyList) return { shown: 0, total };
    elLobbyList.textContent = "";

    const serverUrl = normalizeServerUrl(serverUrlForRejoin ?? "");

    const mineOnly = Boolean(elLobbyMineOnly?.checked);
    const filtered = mineOnly && serverUrl
      ? rooms.filter((r) => Boolean(readOnlineResumeRecord(serverUrl, r.roomId)))
      : rooms;

    const sorted = filtered
      .slice()
      .sort((a, b) => roomCreatedAtMs(b) - roomCreatedAtMs(a));

    if (!sorted.length) {
      const el = document.createElement("div");
      el.className = "hint";
      el.style.marginLeft = "0";
      el.textContent = mineOnly ? "No rooms with a saved seat in this browser." : "No public rooms.";
      elLobbyList.appendChild(el);
      return { shown: 0, total };
    }

    for (const r of sorted) {
      const v = getVariantById(r.variantId);

      const item = document.createElement("div");
      item.className = "lobbyItem";

      const left = document.createElement("div");
      left.className = "lobbyItemLeft";

      const title = document.createElement("div");
      title.className = "lobbyItemTitle";
      title.textContent = `${v.displayName} — `;
      const rid = document.createElement("span");
      rid.className = "mono";
      rid.textContent = r.roomId;
      title.appendChild(rid);

      const sub = document.createElement("div");
      sub.className = "lobbyItemSub";
      const open = r.seatsOpen.length ? `Open: ${r.seatsOpen.join("/")}` : "Open: —";
      const taken = r.seatsTaken.length ? `Taken: ${r.seatsTaken.join("/")}` : "Taken: —";

      const status = r.status === "in_game" ? "Status: In game" : r.status === "waiting" ? "Status: Waiting" : "";
      const createdAtMs = typeof r.createdAt === "string" ? Date.parse(r.createdAt) : NaN;
      const age = Number.isFinite(createdAtMs) ? `Age: ${formatAgeShort(Date.now() - createdAtMs)}` : "";

      const hostDisplayName = typeof (r as any)?.hostDisplayName === "string" ? String((r as any).hostDisplayName).trim() : "";
      const host = hostDisplayName ? `Host: ${hostDisplayName}` : "";

      const byColor = r.displayNameByColor as Partial<Record<"W" | "B", string>> | undefined;
      const lightName = typeof byColor?.W === "string" ? byColor.W.trim() : "";
      const darkName = typeof byColor?.B === "string" ? byColor.B.trim() : "";
      const players = lightName || darkName ? `Players: ${lightName ? `Light=${lightName}` : "Light=—"} · ${darkName ? `Dark=${darkName}` : "Dark=—"}` : "";

      sub.textContent = [status, age, host, open, taken, players, r.visibility === "public" ? "Public" : "Private"]
        .filter(Boolean)
        .join(" · ");

      left.appendChild(title);
      left.appendChild(sub);

      const right = document.createElement("div");
      right.style.display = "flex";
      right.style.gap = "8px";
      right.style.alignItems = "center";

      const joinBtn = document.createElement("button");
      joinBtn.type = "button";
      joinBtn.className = "panelBtn";
      const resume = serverUrl ? readOnlineResumeRecord(serverUrl, r.roomId) : null;
      const canRejoin = Boolean(resume);
      joinBtn.textContent = canRejoin ? "Rejoin" : "Join";
      // Rejoin should be available even if the room is full.
      joinBtn.disabled = canRejoin ? false : r.seatsOpen.length === 0;
      joinBtn.addEventListener("click", () => {
        elPlayMode.value = "online";
        localStorage.setItem(LS_KEYS.playMode, "online");

        if (serverUrl) {
          elOnlineServerUrl.value = serverUrl;
          localStorage.setItem(LS_KEYS.onlineServerUrl, serverUrl);
        }

        // Persist current prefs (theme/options/AI) and launch directly.
        persistStartPageLaunchPrefs();
        void launchOnline({
          action: canRejoin ? "rejoin" : "join",
          serverUrl: serverUrl,
          roomId: r.roomId,
          fallbackVariantId: (isVariantId(elGame.value) ? elGame.value : DEFAULT_VARIANT_ID) as VariantId,
        });
      });

      right.appendChild(joinBtn);

      const spectateBtn = document.createElement("button");
      spectateBtn.type = "button";
      spectateBtn.className = "panelBtn";
      spectateBtn.textContent = "Spectate";
      if (r.visibility === "private") {
        spectateBtn.disabled = true;
        spectateBtn.title = "Private rooms require a secret watch link/token to spectate.";
      }
      spectateBtn.addEventListener("click", () => {
        if (r.visibility === "private") return;
        elPlayMode.value = "online";
        localStorage.setItem(LS_KEYS.playMode, "online");

        if (serverUrl) {
          elOnlineServerUrl.value = serverUrl;
          localStorage.setItem(LS_KEYS.onlineServerUrl, serverUrl);
        }

        persistStartPageLaunchPrefs();
        void launchOnline({
          action: "spectate",
          serverUrl: serverUrl,
          roomId: r.roomId,
          fallbackVariantId: (isVariantId(elGame.value) ? elGame.value : DEFAULT_VARIANT_ID) as VariantId,
        });
      });

      right.appendChild(spectateBtn);

      item.appendChild(left);
      item.appendChild(right);
      elLobbyList.appendChild(item);
    }

    return { shown: sorted.length, total };
  };


  let lobbyFetchInFlight = false;
  let lobbyLastKey = "";
  let lobbyLastRooms: LobbyRoomSummary[] = [];
  let lobbyLastServerUrl = "";

  const fetchLobby = async (): Promise<void> => {
    if (!elLobbySection || !elLobbySection.offsetParent) return; // hidden
    const serverUrl = normalizeServerUrl(elOnlineServerUrl.value);
    if (!serverUrl) {
      setLobbyStatus("Lobby: enter a server URL.");
      lobbyLastRooms = [];
      lobbyLastServerUrl = "";
      renderLobby([]);
      return;
    }

    const key = serverUrl;
    if (lobbyFetchInFlight) return;

    lobbyFetchInFlight = true;
    elLobbyRefresh && (elLobbyRefresh.disabled = true);
    setLobbyStatus("Lobby: loading…");

    try {
      const res = await fetch(`${serverUrl}/api/lobby?limit=200&includeFull=1`);
      const raw = await res.text();
      let json: GetLobbyResponse | null = null;
      try {
        json = (raw ? JSON.parse(raw) : null) as any;
      } catch {
        json = null;
      }

      if (!res.ok || (json as any)?.error) {
        const msg =
          typeof (json as any)?.error === "string"
            ? (json as any).error
            : raw && raw.trim()
              ? raw.trim().slice(0, 120)
              : `HTTP ${res.status}`;
        setLobbyStatus(`Lobby: failed (${msg})`);
        lobbyLastRooms = [];
        lobbyLastServerUrl = "";
        renderLobby([]);
        return;
      }

      const rooms = Array.isArray((json as any)?.rooms) ? (((json as any).rooms as any[]) as LobbyRoomSummary[]) : [];
      lobbyLastRooms = rooms;
      lobbyLastServerUrl = serverUrl;
      const { shown, total } = renderLobby(rooms, serverUrl);
      setLobbyStatus(`Lobby: ${shown}/${total} room${total === 1 ? "" : "s"}.`);
      lobbyLastKey = key;
    } catch {
      setLobbyStatus(`Lobby: network error — server: ${serverUrl}`);
      lobbyLastRooms = [];
      lobbyLastServerUrl = "";
      renderLobby([]);
    } finally {
      lobbyFetchInFlight = false;
      elLobbyRefresh && (elLobbyRefresh.disabled = false);
    }
  };

  const setServerError = (isError: boolean): void => {
    elOnlineServerUrl.classList.toggle("isError", isError);
    elOnlineServerUrlLabel?.classList.toggle("isError", isError);
  };

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

  if (elGlassBg) {
    elGlassBg.value = readGlassBg(LS_KEYS.glassBg, "original");
  }

  if (elGlassColors) {
    elGlassColors.value = readGlassPaletteId(LS_KEYS.glassPalette, "yellow_blue");
  }

  const syncGlassThemeOptions = () => {
    const isGlass = elTheme.value === "glass";
    if (elGlassColorsRow) elGlassColorsRow.style.display = isGlass ? "" : "none";
    if (elGlassColors) elGlassColors.disabled = !isGlass;
    if (elGlassBgRow) elGlassBgRow.style.display = isGlass ? "" : "none";
    if (elGlassBg) elGlassBg.disabled = !isGlass;
  };

  syncGlassThemeOptions();

  elTheme.addEventListener("change", () => {
    syncGlassThemeOptions();
  });

  elGlassColors?.addEventListener("change", () => {
    if (elTheme.value !== "glass") return;
    const raw = elGlassColors.value;
    const next: GlassPaletteId = isGlassPaletteId(raw) ? raw : "yellow_blue";
    localStorage.setItem(LS_KEYS.glassPalette, next);
    elGlassColors.value = next;
  });

  elGlassBg?.addEventListener("change", () => {
    if (elTheme.value !== "glass") return;
    const v = (elGlassBg.value === "felt" || elGlassBg.value === "walnut") ? elGlassBg.value : "original";
    localStorage.setItem(LS_KEYS.glassBg, v);
    // Keep the control sanitized in case the DOM was modified.
    elGlassBg.value = v;
  });

  const initialVariantId = readVariantId(LS_KEYS.variantId, DEFAULT_VARIANT_ID);
  elGame.value = initialVariantId;

  elPlayMode.value = readPlayMode(LS_KEYS.playMode, "local");
  const envServerUrl = (import.meta as any)?.env?.VITE_SERVER_URL as string | undefined;
  const defaultServerUrl = (() => {
    if (typeof envServerUrl === "string" && envServerUrl.trim()) return envServerUrl.trim();
    try {
      const proto = window.location.protocol || "http:";
      const host = window.location.hostname;
      if (host) return `${proto}//${host}:8788`;
    } catch {
      // ignore
    }
    return "http://localhost:8788";
  })();
  elOnlineServerUrl.value = localStorage.getItem(LS_KEYS.onlineServerUrl) ?? defaultServerUrl;
  elOnlineAction.value = "create";
  localStorage.setItem(LS_KEYS.onlineAction, "create");
  elOnlineVisibility.value = readVisibility(LS_KEYS.onlineVisibility, "public");
  elOnlineRoomId.value = localStorage.getItem(LS_KEYS.onlineRoomId) ?? "";
  elOnlinePrefColor.value = readPreferredColor(LS_KEYS.onlinePrefColor, "auto");
  elOnlineName.value = getGuestDisplayName() ?? "";

  elShowResizeIcon.checked = readBool(LS_KEYS.optShowResizeIcon, false);
  elBoardCoords.checked = readBool(LS_KEYS.optBoardCoords, false);
  elThreefold.checked = readBool(LS_KEYS.optThreefold, true);
  elToasts.checked = readBool(LS_KEYS.optToasts, true);
  elSfx.checked = readBool(LS_KEYS.optSfx, false);

  const sfx = createSfxManager();
  sfx.setEnabled(elSfx.checked);

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

    const isAiGame = elAiWhite.value !== "human" || elAiBlack.value !== "human";

    // Online (2 players) requires both sides Human.
    const onlineOpt = Array.from(elPlayMode.options).find((o) => o.value === "online") ?? null;
    if (onlineOpt) onlineOpt.disabled = isAiGame;
    if (isAiGame && elPlayMode.value === "online") {
      elPlayMode.value = "local";
    }
    elPlayMode.disabled = isAiGame;

    const playMode = (elPlayMode.value === "online" ? "online" : "local") as PlayMode;
    const serverUrl = normalizeServerUrl(elOnlineServerUrl.value);

    let ok = baseOk;
    let warning: string | null = null;

    if (!baseOk) {
      warning = `${v.displayName} is not available yet in this build.`;
    } else if (playMode === "online") {
      if (!serverUrl) {
        ok = false;
        warning = "Online mode needs a server URL.";
      }
    }

    // Player ID field is not used from the Start Page anymore.
    elOnlinePlayerId.value = "";

    elLaunch.disabled = !ok;
    setWarning(warning ?? "—", { isError: false });
    setRoomIdError(false);
    setServerError(false);

    // If we are in online mode and the server URL changed, auto-refresh lobby once.
    if (playMode === "online") {
      const serverUrlNow = normalizeServerUrl(elOnlineServerUrl.value);
      if (serverUrlNow && serverUrlNow !== lobbyLastKey) {
        void fetchLobby();
      }
    }
  };

  // When navigating back to the Start Page from a game tab, browsers may restore
  // this page from the back/forward cache without re-running DOMContentLoaded.
  // Re-hydrate online fields from localStorage so newly-created Room IDs appear.
  window.addEventListener("pageshow", () => {
    try {
      elPlayMode.value = readPlayMode(LS_KEYS.playMode, (elPlayMode.value === "online" ? "online" : "local") as PlayMode);
      elOnlineServerUrl.value = localStorage.getItem(LS_KEYS.onlineServerUrl) ?? elOnlineServerUrl.value;
      elOnlineAction.value = "create";
      localStorage.setItem(LS_KEYS.onlineAction, "create");
      elOnlineVisibility.value = readVisibility(LS_KEYS.onlineVisibility, (elOnlineVisibility.value as any) ?? "public");
      elOnlineRoomId.value = localStorage.getItem(LS_KEYS.onlineRoomId) ?? "";
      elOnlineName.value = getGuestDisplayName() ?? "";
    } catch {
      // ignore
    }
    syncOnlineVisibility();
    syncAvailability();
  });

  elGame.addEventListener("change", syncAvailability);
  elPlayMode.addEventListener("change", () => {
    localStorage.setItem(LS_KEYS.playMode, elPlayMode.value);
    syncOnlineVisibility();
    syncAvailability();
  });

  elOnlineServerUrl.addEventListener("input", () => {
    localStorage.setItem(LS_KEYS.onlineServerUrl, elOnlineServerUrl.value);
    setServerError(false);
    syncAvailability();
  });

  elOnlineAction.addEventListener("change", () => {
    localStorage.setItem(LS_KEYS.onlineAction, elOnlineAction.value);
    syncOnlineVisibility();
    syncAvailability();
  });

  elOnlineName.addEventListener("input", () => {
    setGuestDisplayName(elOnlineName.value);
  });

  elOnlineVisibility.addEventListener("change", () => {
    localStorage.setItem(LS_KEYS.onlineVisibility, elOnlineVisibility.value);
    syncAvailability();
  });

  elOnlinePrefColor.addEventListener("change", () => {
    localStorage.setItem(LS_KEYS.onlinePrefColor, elOnlinePrefColor.value);
    syncAvailability();
  });

  elShowResizeIcon.addEventListener("change", () => {
    writeBool(LS_KEYS.optShowResizeIcon, elShowResizeIcon.checked);
  });

  elToasts.addEventListener("change", () => {
    writeBool(LS_KEYS.optToasts, elToasts.checked);
  });

  elSfx.addEventListener("change", () => {
    writeBool(LS_KEYS.optSfx, elSfx.checked);
    sfx.setEnabled(elSfx.checked);
    sfx.play(elSfx.checked ? "uiOn" : "uiOff");
  });

  elOnlineRoomId.addEventListener("input", () => {
    localStorage.setItem(LS_KEYS.onlineRoomId, elOnlineRoomId.value);
    setRoomIdError(false);
    syncAvailability();
  });

  elAiWhite.addEventListener("change", () => {
    localStorage.setItem(LS_KEYS.aiWhite, elAiWhite.value);
    syncOnlineVisibility();
    syncAvailability();
  });

  elAiBlack.addEventListener("change", () => {
    localStorage.setItem(LS_KEYS.aiBlack, elAiBlack.value);
    syncOnlineVisibility();
    syncAvailability();
  });

  function syncOnlineVisibility(): void {
    const isAiGame = elAiWhite.value !== "human" || elAiBlack.value !== "human";

    // Online (2 players) requires both sides Human.
    const onlineOpt = Array.from(elPlayMode.options).find((o) => o.value === "online") ?? null;
    if (onlineOpt) onlineOpt.disabled = isAiGame;
    if (isAiGame && elPlayMode.value === "online") {
      elPlayMode.value = "local";
    }
    elPlayMode.disabled = isAiGame;

    const playMode = (elPlayMode.value === "online" ? "online" : "local") as PlayMode;
    const onlineAction: OnlineAction = "create";

    const showOnline = playMode === "online";
    // When local/offline, hide the online controls entirely to avoid confusion.
    elOnlineServerUrlLabel && (elOnlineServerUrlLabel.style.display = showOnline ? "" : "none");
    elOnlineServerUrl.style.display = showOnline ? "" : "none";
    elOnlineServerUrl.disabled = !showOnline;

    elOnlineActionLabel && (elOnlineActionLabel.style.display = showOnline ? "" : "none");
    elOnlineAction.style.display = showOnline ? "" : "none";
    elOnlineAction.disabled = !showOnline;

    elOnlineNameLabel.style.display = showOnline ? "" : "none";
    elOnlineName.style.display = showOnline ? "" : "none";
    if (!showOnline) {
      elOnlineName.disabled = true;
    } else {
      elOnlineName.disabled = false;
      // Ensure the field reflects the currently saved guest name.
      elOnlineName.value = getGuestDisplayName() ?? "";
    }

    if (elOnlineHint) elOnlineHint.style.display = showOnline ? "" : "none";

    // Online color preference is only meaningful for Create.
    const showPrefColor = showOnline;
    const allowNonAuto = showOnline && onlineAction === "create";

    elOnlinePrefColorLabel.style.display = showPrefColor ? "" : "none";
    elOnlinePrefColor.style.display = showPrefColor ? "" : "none";
    elOnlinePrefColor.disabled = !allowNonAuto;

    // Only allow Light/Dark options for Create.
    for (const opt of Array.from(elOnlinePrefColor.options)) {
      const v = opt.value;
      if (v === "W" || v === "B") opt.disabled = !allowNonAuto;
    }

    if (!allowNonAuto) {
      // Don't persist this to localStorage; it's action-dependent.
      elOnlinePrefColor.value = "auto";
    } else {
      // Restore user's saved preference when returning to Create.
      elOnlinePrefColor.value = readPreferredColor(LS_KEYS.onlinePrefColor, "auto");
    }

    const showPlayerId = false;
    elOnlinePlayerIdLabel.style.display = showPlayerId ? "" : "none";
    elOnlinePlayerId.style.display = showPlayerId ? "" : "none";
    elOnlinePlayerId.disabled = !showPlayerId;

    const showRoomId = false;
    elOnlineRoomIdLabel.style.display = showRoomId ? "" : "none";
    elOnlineRoomId.style.display = showRoomId ? "" : "none";
    elOnlineRoomId.disabled = !showRoomId;

    const showVisibility = showOnline && onlineAction === "create";
    elOnlineVisibilityLabel.style.display = showVisibility ? "" : "none";
    elOnlineVisibility.style.display = showVisibility ? "" : "none";
    elOnlineVisibility.disabled = !showVisibility;

    if (elLobbySection) {
      elLobbySection.style.display = showOnline ? "" : "none";
      if (!showOnline) {
        setLobbyStatus("—");
        renderLobby([]);
      }
    }
  }

  syncOnlineVisibility();
  syncAvailability();

  elLobbyRefresh?.addEventListener("click", () => {
    void fetchLobby();
  });

  elLobbyMineOnly && (elLobbyMineOnly.checked = readBool(LS_KEYS.lobbyMineOnly, false));
  elLobbyMineOnly?.addEventListener("change", () => {
    writeBool(LS_KEYS.lobbyMineOnly, elLobbyMineOnly.checked);
    const { shown, total } = renderLobby(lobbyLastRooms, lobbyLastServerUrl);
    if (lobbyLastServerUrl) setLobbyStatus(`Lobby: ${shown}/${total} room${total === 1 ? "" : "s"}.`);
  });

  elLaunch.addEventListener("click", async () => {
    const vId = (isVariantId(elGame.value) ? elGame.value : DEFAULT_VARIANT_ID) as VariantId;
    const v = getVariantById(vId);
    if (!v.available || !v.entryUrl) return;

    persistStartPageLaunchPrefs();

    const playMode = (elPlayMode.value === "online" ? "online" : "local") as PlayMode;
    if (playMode !== "online") {
      window.location.assign(v.entryUrl);
      return;
    }

    const serverUrl = normalizeServerUrl(elOnlineServerUrl.value);
    const prefColor = (elOnlinePrefColor.value === "W" || elOnlinePrefColor.value === "B") ? elOnlinePrefColor.value : "auto";
    const visibility = (elOnlineVisibility.value === "private" ? "private" : "public") as RoomVisibility;

    await launchOnline({
      action: "create",
      serverUrl,
      prefColor,
      visibility,
      fallbackVariantId: v.variantId,
    });
  });
});
