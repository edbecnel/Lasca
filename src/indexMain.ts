import { DEFAULT_THEME_ID, getThemeById, THEMES } from "./theme/themes";
import { DEFAULT_VARIANT_ID, VARIANTS, getVariantById, isVariantId } from "./variants/variantRegistry";
import type { VariantId } from "./variants/variantTypes";
import type { GetLobbyResponse, GetRoomMetaResponse, LobbyRoomSummary, RoomVisibility } from "./shared/onlineProtocol.ts";

const LS_KEYS = {
  theme: "lasca.theme",
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

  playMode: "lasca.play.mode",
  onlineServerUrl: "lasca.online.serverUrl",
  onlineAction: "lasca.online.action",
  onlineRoomId: "lasca.online.roomId",
  onlinePrefColor: "lasca.online.prefColor",
  onlineVisibility: "lasca.online.visibility",
} as const;

type PreferredColor = "auto" | "W" | "B";

type Difficulty = "human" | "easy" | "medium" | "advanced";
type PlayMode = "local" | "online";
type OnlineAction = "create" | "join" | "spectate" | "rejoin";

type OnlineResumeRecord = {
  serverUrl: string;
  roomId: string;
  playerId: string;
  color?: "W" | "B";
  savedAtMs: number;
};

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

      if (typeof rec.playerId !== "string" || !rec.playerId) continue;
      const color = rec.color === "W" || rec.color === "B" ? rec.color : undefined;
      const savedAtMs = Number.isFinite(rec.savedAtMs) ? Number(rec.savedAtMs) : 0;
      out.push({ serverUrl: recServer, roomId: r, playerId: rec.playerId, ...(color ? { color } : {}), savedAtMs });
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

      if (typeof rec.playerId !== "string" || !rec.playerId) continue;
      const color = rec.color === "W" || rec.color === "B" ? rec.color : undefined;
      const savedAtMs = Number.isFinite(rec.savedAtMs) ? Number(rec.savedAtMs) : 0;
      return { serverUrl: s, roomId: r, playerId: rec.playerId, ...(color ? { color } : {}), savedAtMs };
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

function readOnlineAction(key: string, fallback: OnlineAction): OnlineAction {
  const raw = localStorage.getItem(key);
  if (raw === "create" || raw === "join" || raw === "spectate" || raw === "rejoin") return raw;
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
  const elOnlineServerUrlLabel =
    (document.querySelector('label[for="launchOnlineServerUrl"]') as HTMLElement | null) ?? null;
  const elOnlineActionLabel =
    (document.querySelector('label[for="launchOnlineAction"]') as HTMLElement | null) ?? null;
  const elOnlineAction = byId<HTMLSelectElement>("launchOnlineAction");
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

  const elShowResizeIcon = byId<HTMLInputElement>("launchShowResizeIcon");
  const elBoardCoords = byId<HTMLInputElement>("launchBoardCoords");
  const elThreefold = byId<HTMLInputElement>("launchThreefold");
  const elToasts = byId<HTMLInputElement>("launchToasts");

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

  const renderLobby = (rooms: LobbyRoomSummary[]): void => {
    if (!elLobbyList) return;
    elLobbyList.textContent = "";

    if (!rooms.length) {
      const el = document.createElement("div");
      el.className = "hint";
      el.style.marginLeft = "0";
      el.textContent = "No public rooms.";
      elLobbyList.appendChild(el);
      return;
    }

    for (const r of rooms) {
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
      sub.textContent = `${open} · ${taken} · ${r.visibility === "public" ? "Public" : "Private"}`;

      left.appendChild(title);
      left.appendChild(sub);

      const right = document.createElement("div");
      right.style.display = "flex";
      right.style.gap = "8px";
      right.style.alignItems = "center";

      const joinBtn = document.createElement("button");
      joinBtn.type = "button";
      joinBtn.className = "panelBtn";
      joinBtn.textContent = "Join";
      joinBtn.disabled = r.seatsOpen.length === 0;
      joinBtn.addEventListener("click", () => {
        // Fill the existing Join fields.
        elPlayMode.value = "online";
        localStorage.setItem(LS_KEYS.playMode, "online");

        elOnlineAction.value = "join";
        localStorage.setItem(LS_KEYS.onlineAction, "join");

        elOnlineRoomId.value = r.roomId;
        localStorage.setItem(LS_KEYS.onlineRoomId, r.roomId);

        // Clear any existing error styling and re-evaluate Launch availability.
        setRoomIdError(false);
        syncOnlineVisibility();
        syncAvailability();

        // Convenience: immediately run the normal Launch flow.
        // This preserves all existing checks (room variant probe, rejoin logic, etc).
        if (!elLaunch.disabled) {
          elLaunch.click();
        }
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

        elOnlineAction.value = "spectate";
        localStorage.setItem(LS_KEYS.onlineAction, "spectate");

        elOnlineRoomId.value = r.roomId;
        localStorage.setItem(LS_KEYS.onlineRoomId, r.roomId);

        setRoomIdError(false);
        syncOnlineVisibility();
        syncAvailability();

        if (!elLaunch.disabled) {
          elLaunch.click();
        }
      });

      right.appendChild(spectateBtn);

      item.appendChild(left);
      item.appendChild(right);
      elLobbyList.appendChild(item);
    }
  };

  let lobbyFetchInFlight = false;
  let lobbyLastKey = "";

  const fetchLobby = async (): Promise<void> => {
    if (!elLobbySection || !elLobbySection.offsetParent) return; // hidden
    const serverUrl = normalizeServerUrl(elOnlineServerUrl.value);
    if (!serverUrl) {
      setLobbyStatus("Lobby: enter a server URL.");
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
        renderLobby([]);
        return;
      }

      const rooms = Array.isArray((json as any)?.rooms) ? (((json as any).rooms as any[]) as LobbyRoomSummary[]) : [];
      renderLobby(rooms);
      setLobbyStatus(`Lobby: ${rooms.length} room${rooms.length === 1 ? "" : "s"}.`);
      lobbyLastKey = key;
    } catch {
      setLobbyStatus(`Lobby: network error — server: ${serverUrl}`);
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

  const initialVariantId = readVariantId(LS_KEYS.variantId, DEFAULT_VARIANT_ID);
  elGame.value = initialVariantId;

  elPlayMode.value = readPlayMode(LS_KEYS.playMode, "local");
  const envServerUrl = (import.meta as any)?.env?.VITE_SERVER_URL as string | undefined;
  elOnlineServerUrl.value =
    localStorage.getItem(LS_KEYS.onlineServerUrl) ??
    (typeof envServerUrl === "string" && envServerUrl.trim() ? envServerUrl.trim() : "http://localhost:8788");
  elOnlineAction.value = readOnlineAction(LS_KEYS.onlineAction, "create");
  elOnlineVisibility.value = readVisibility(LS_KEYS.onlineVisibility, "public");
  elOnlineRoomId.value = localStorage.getItem(LS_KEYS.onlineRoomId) ?? "";
  elOnlinePrefColor.value = readPreferredColor(LS_KEYS.onlinePrefColor, "auto");

  elShowResizeIcon.checked = readBool(LS_KEYS.optShowResizeIcon, false);
  elBoardCoords.checked = readBool(LS_KEYS.optBoardCoords, false);
  elThreefold.checked = readBool(LS_KEYS.optThreefold, true);
  elToasts.checked = readBool(LS_KEYS.optToasts, true);

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
    const onlineAction =
      elOnlineAction.value === "rejoin"
        ? "rejoin"
        : (elOnlineAction.value === "join" ? "join" : (elOnlineAction.value === "spectate" ? "spectate" : "create"));
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
      } else if ((onlineAction === "join" || onlineAction === "spectate" || onlineAction === "rejoin") && !roomId) {
        ok = false;
        warning =
          onlineAction === "rejoin"
            ? "Online Rejoin needs a room ID."
            : (onlineAction === "spectate" ? "Online Spectate needs a room ID." : "Online Join needs a room ID.");
      } else if (onlineAction === "rejoin") {
        const resume = resolveOnlineResumeRecord(serverUrl, roomId);
        if (!resume) {
          ok = false;
          const anyMatches = findAnyResumeRecordsForRoomId(roomId);
          warning =
            anyMatches.length > 1
              ? "Multiple saved seats found for this room. Set the correct server URL, then Rejoin."
              : "No saved seat for this room on this browser. Use Join instead.";
        } else if (resume.serverUrl !== serverUrl) {
          // If roomId uniquely identifies a saved seat but the server URL field doesn't match,
          // auto-correct it so Rejoin works without guessing ports/hosts.
          elOnlineServerUrl.value = resume.serverUrl;
          localStorage.setItem(LS_KEYS.onlineServerUrl, resume.serverUrl);
        }
      }
    }

    // Player ID field is informational; it should not influence ok/warning.
    if (playMode === "online" && onlineAction === "rejoin") {
      const resume = resolveOnlineResumeRecord(serverUrl, roomId);
      elOnlinePlayerId.value = resume?.playerId ?? "";
    } else {
      elOnlinePlayerId.value = "";
    }

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
      elOnlineAction.value = readOnlineAction(LS_KEYS.onlineAction, (elOnlineAction.value as any) ?? "create");
      elOnlineVisibility.value = readVisibility(LS_KEYS.onlineVisibility, (elOnlineVisibility.value as any) ?? "public");
      elOnlineRoomId.value = localStorage.getItem(LS_KEYS.onlineRoomId) ?? "";
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
    const onlineAction =
      elOnlineAction.value === "rejoin"
        ? "rejoin"
        : (elOnlineAction.value === "join" ? "join" : (elOnlineAction.value === "spectate" ? "spectate" : "create"));

    const showOnline = playMode === "online";
    // When local/offline, hide the online controls entirely to avoid confusion.
    elOnlineServerUrlLabel && (elOnlineServerUrlLabel.style.display = showOnline ? "" : "none");
    elOnlineServerUrl.style.display = showOnline ? "" : "none";
    elOnlineServerUrl.disabled = !showOnline;

    elOnlineActionLabel && (elOnlineActionLabel.style.display = showOnline ? "" : "none");
    elOnlineAction.style.display = showOnline ? "" : "none";
    elOnlineAction.disabled = !showOnline;

    if (elOnlineHint) elOnlineHint.style.display = showOnline ? "" : "none";

    // Online color preference:
    // - Only meaningful for Create (first player chooses their seat).
    // - For Join/Rejoin, force "Auto" and disable other options.
    const showPrefColor = showOnline;
    const allowNonAuto = showOnline && onlineAction === "create";

    elOnlinePrefColorLabel.style.display = showPrefColor ? "" : "none";
    elOnlinePrefColor.style.display = showPrefColor ? "" : "none";
    elOnlinePrefColor.disabled = !allowNonAuto;

    // Disable White/Black options when joining/rejoining.
    for (const opt of Array.from(elOnlinePrefColor.options)) {
      const v = opt.value;
      if (v === "W" || v === "B") {
        opt.disabled = !allowNonAuto;
      }
    }

    if (!allowNonAuto) {
      // Don't persist this to localStorage; it's action-dependent.
      elOnlinePrefColor.value = "auto";
    } else {
      // Restore user's saved preference when returning to Create.
      elOnlinePrefColor.value = readPreferredColor(LS_KEYS.onlinePrefColor, "auto");
    }

    const showPlayerId = showOnline && onlineAction === "rejoin";
    elOnlinePlayerIdLabel.style.display = showPlayerId ? "" : "none";
    elOnlinePlayerId.style.display = showPlayerId ? "" : "none";
    elOnlinePlayerId.disabled = !showPlayerId;

    const showRoomId = showOnline && (onlineAction === "join" || onlineAction === "spectate" || onlineAction === "rejoin");
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

  elLaunch.addEventListener("click", async () => {
    const vId = (isVariantId(elGame.value) ? elGame.value : DEFAULT_VARIANT_ID) as VariantId;
    const v = getVariantById(vId);
    if (!v.available || !v.entryUrl) return;

    localStorage.setItem(LS_KEYS.theme, elTheme.value);

    // Force these UI prefs.
    writeBool(LS_KEYS.optMoveHints, false);
    writeBool(LS_KEYS.optAnimations, true);
    writeBool(LS_KEYS.optShowResizeIcon, elShowResizeIcon.checked);
    writeBool(LS_KEYS.optBoardCoords, elBoardCoords.checked);
    writeBool(LS_KEYS.optThreefold, elThreefold.checked);
    writeBool(LS_KEYS.optToasts, elToasts.checked);

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

    const onlineAction =
      elOnlineAction.value === "rejoin"
        ? "rejoin"
        : (elOnlineAction.value === "join" ? "join" : (elOnlineAction.value === "spectate" ? "spectate" : "create"));
    const serverUrl = normalizeServerUrl(elOnlineServerUrl.value);
    const roomId = (elOnlineRoomId.value || "").trim();
    const prefColor = (elOnlinePrefColor.value === "W" || elOnlinePrefColor.value === "B") ? elOnlinePrefColor.value : "auto";
    const visibility = (elOnlineVisibility.value === "private" ? "private" : "public") as RoomVisibility;
    if (!serverUrl) {
      setServerError(true);
      setWarning("Invalid Server: (empty)", { isError: true });
      return;
    }

    // Basic sanity check: must parse as an absolute URL.
    try {
      // eslint-disable-next-line no-new
      new URL(serverUrl);
    } catch {
      setServerError(true);
      setWarning(`Invalid Server: ${serverUrl}`, { isError: true });
      return;
    }

    if ((onlineAction === "join" || onlineAction === "spectate" || onlineAction === "rejoin") && !roomId) return;

    if ((onlineAction === "join" || onlineAction === "spectate" || onlineAction === "rejoin") && !isPlausibleRoomId(roomId)) {
      setRoomIdError(true);
      setWarning(`Invalid Room ID: ${roomId} (must be hex).`, { isError: true });
      return;
    }

    const resume = onlineAction === "rejoin" ? resolveOnlineResumeRecord(serverUrl, roomId) : null;
    if (onlineAction === "rejoin" && !resume) return;

    // If joining/rejoining, prefer the room's authoritative variant so we don't load the wrong board/rules UI.
    // This prevents cases like: Damasca room joined via Lasca/Dama page (can look like wrong moves).
    let targetVariant = v;
    if (onlineAction === "join" || onlineAction === "rejoin" || onlineAction === "spectate") {
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

          if (isRoomError) {
            setRoomIdError(true);
          } else {
            setServerError(true);
          }

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

    const url = new URL(targetVariant.entryUrl, window.location.href);
    url.searchParams.set("mode", "online");
    url.searchParams.set("server", serverUrl);
    if (onlineAction === "create") {
      url.searchParams.set("create", "1");
      if (prefColor !== "auto") url.searchParams.set("prefColor", prefColor);
      url.searchParams.set("visibility", visibility);
    } else if (onlineAction === "join") {
      url.searchParams.set("join", "1");
      url.searchParams.set("roomId", roomId);
      if (prefColor !== "auto") url.searchParams.set("prefColor", prefColor);
    } else if (onlineAction === "spectate") {
      url.searchParams.set("roomId", roomId);
    } else {
      url.searchParams.set("roomId", roomId);
      url.searchParams.set("playerId", (resume as OnlineResumeRecord).playerId);
      if ((resume as OnlineResumeRecord).color) url.searchParams.set("color", (resume as OnlineResumeRecord).color as any);
    }
    window.location.assign(url.toString());
  });
});
