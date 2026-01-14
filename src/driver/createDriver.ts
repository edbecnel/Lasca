import type { GameState } from "../core/index.ts";
import { HistoryManager } from "../game/historyManager.ts";
import type { DriverMode, GameDriver } from "./gameDriver.ts";
import { LocalDriver } from "./localDriver.ts";
import { RemoteDriver } from "./remoteDriver.ts";
import { serializeWireGameState, serializeWireHistory, type WireSnapshot } from "../shared/wireState.ts";
import type {
  CreateRoomResponse,
  JoinRoomResponse,
  GetRoomSnapshotResponse,
} from "../shared/onlineProtocol.ts";

export function selectDriverMode(args: { search: string; envMode?: string | undefined }): DriverMode {
  const params = new URLSearchParams(args.search.startsWith("?") ? args.search : `?${args.search}`);
  const qsMode = params.get("mode");
  if (qsMode === "online") return "online";
  if (qsMode === "local") return "local";

  const env = (args.envMode ?? "").toLowerCase();
  if (env === "online") return "online";
  return "local";
}

export function createDriver(args: {
  state: GameState;
  history: HistoryManager;
  search: string;
  envMode?: string | undefined;
}): GameDriver {
  const mode = selectDriverMode({ search: args.search, envMode: args.envMode });
  if (mode === "online") return new RemoteDriver(args.state);
  return new LocalDriver(args.state, args.history);
}

type OnlineQuery = {
  serverUrl: string;
  create: boolean;
  join: boolean;
  roomId: string | null;
  playerId: string | null;
  color: "W" | "B" | null;
  prefColor: "W" | "B" | null;
};

type OnlineResumeRecord = {
  serverUrl: string;
  roomId: string;
  playerId: string;
  color?: "W" | "B";
  savedAtMs: number;
};

function normalizeServerUrlForStorage(raw: string): string {
  return (raw || "").trim().replace(/\/+$/, "");
}

function normalizeRoomIdForStorage(raw: string): string {
  return (raw || "").trim();
}

function resumeStorageKey(serverUrl: string, roomId: string): string {
  // Namespaced per server so multiple dev servers don't collide.
  // encodeURIComponent keeps the key safe for localStorage.
  const s = normalizeServerUrlForStorage(serverUrl);
  const r = normalizeRoomIdForStorage(roomId);
  return `lasca.online.resume.${encodeURIComponent(s)}.${encodeURIComponent(r)}`;
}

function saveOnlineResumeRecord(args: { serverUrl: string; roomId: string; playerId: string; color?: "W" | "B" }): void {
  if (typeof window === "undefined") return;
  try {
    if (!args.serverUrl || !args.roomId || !args.playerId) return;
    // Avoid persisting spectator pseudo-identity.
    if (args.playerId === "spectator") return;

    const serverUrl = normalizeServerUrlForStorage(args.serverUrl);
    const roomId = normalizeRoomIdForStorage(args.roomId);

    const record: OnlineResumeRecord = {
      serverUrl,
      roomId,
      playerId: args.playerId,
      ...(args.color ? { color: args.color } : {}),
      savedAtMs: Date.now(),
    };

    // Preferred key format (normalized).
    window.localStorage.setItem(resumeStorageKey(serverUrl, roomId), JSON.stringify(record));

    // Back-compat: if the URL had different formatting (e.g., trailing slash),
    // also store under the legacy key so older builds/tabs can still find it.
    const legacyKey = `lasca.online.resume.${encodeURIComponent(args.serverUrl)}.${encodeURIComponent(args.roomId)}`;
    const preferredKey = resumeStorageKey(serverUrl, roomId);
    if (legacyKey !== preferredKey) {
      window.localStorage.setItem(legacyKey, JSON.stringify(record));
    }

    // Also persist the last-used online connection details so the Start Page
    // defaults match the session that just loaded.
    window.localStorage.setItem("lasca.online.serverUrl", serverUrl);
    window.localStorage.setItem("lasca.online.roomId", roomId);
  } catch {
    // ignore
  }
}

function updateBrowserUrlForOnline(args: {
  serverUrl: string;
  roomId: string;
  playerId: string;
  color?: "W" | "B";
}): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("mode", "online");
    url.searchParams.set("server", args.serverUrl);
    url.searchParams.set("roomId", args.roomId);
    url.searchParams.set("playerId", args.playerId);
    if (args.color) url.searchParams.set("color", args.color);
    url.searchParams.delete("create");
    url.searchParams.delete("join");
    window.history.replaceState(null, "", url.toString());

    // Also persist a resume token so the Start Page can resume without requiring
    // the user to manually copy the playerId.
    saveOnlineResumeRecord(args);
  } catch {
    // ignore
  }
}

function logJoinUrl(args: { serverUrl: string; roomId: string }): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("mode", "online");
    url.searchParams.set("server", args.serverUrl);
    url.searchParams.set("roomId", args.roomId);
    url.searchParams.set("join", "1");
    url.searchParams.delete("create");
    url.searchParams.delete("playerId");
    url.searchParams.delete("color");
    // eslint-disable-next-line no-console
    console.info("[online] Share this join link with Player 2:", url.toString());
  } catch {
    // ignore
  }
}

function parseOnlineQuery(search: string, envServerUrl?: string | undefined): OnlineQuery {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const serverUrl = params.get("server") ?? envServerUrl ?? "http://localhost:8787";
  const create = params.get("create") === "1" || params.get("create") === "true";
  const join = params.get("join") === "1" || params.get("join") === "true";
  const roomId = params.get("roomId");
  const playerId = params.get("playerId");
  const c = params.get("color");
  const color = c === "W" || c === "B" ? c : null;
  const p = params.get("prefColor");
  const prefColor = p === "W" || p === "B" ? p : null;
  return { serverUrl, create, join, roomId, playerId, color, prefColor };
}

async function postJson<TReq, TRes>(serverUrl: string, path: string, body: TReq): Promise<TRes> {
  const res = await fetch(`${serverUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  let json: any = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const msg =
      typeof json?.error === "string"
        ? json.error
        : raw && raw.trim()
          ? raw.trim().slice(0, 200)
          : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  if (json == null) throw new Error("Invalid JSON response");
  if (json?.error) throw new Error(String(json.error));
  return json as TRes;
}

async function getJson<TRes>(serverUrl: string, path: string): Promise<TRes> {
  const res = await fetch(`${serverUrl}${path}`);
  const raw = await res.text();
  let json: any = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const msg =
      typeof json?.error === "string"
        ? json.error
        : raw && raw.trim()
          ? raw.trim().slice(0, 200)
          : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  if (json == null) throw new Error("Invalid JSON response");
  if (json?.error) throw new Error(String(json.error));
  return json as TRes;
}

export async function createDriverAsync(args: {
  state: GameState;
  history: HistoryManager;
  search: string;
  envMode?: string | undefined;
  envServerUrl?: string | undefined;
}): Promise<GameDriver> {
  const mode = selectDriverMode({ search: args.search, envMode: args.envMode });
  if (mode !== "online") return new LocalDriver(args.state, args.history);

  const q0 = parseOnlineQuery(args.search, args.envServerUrl);
  // Guard against accidental reloads / hand-edited URLs:
  // If a roomId is already present, never create a new room.
  // (Keeping create=1 while swapping roomId is a common footgun.)
  const q: OnlineQuery = q0.roomId ? { ...q0, create: false } : q0;
  const driver = new RemoteDriver(args.state);

  const wireSnapshot: WireSnapshot = {
    state: serializeWireGameState(args.state),
    history: serializeWireHistory(args.history.exportSnapshots()),
    stateVersion: 0,
  };

  // Create room
  if (q.create) {
    const variantId = args.state.meta?.variantId;
    if (!variantId) throw new Error("Cannot create online room: missing state.meta.variantId");
    const res = await postJson<{ variantId: any; snapshot: WireSnapshot; preferredColor?: "W" | "B" }, CreateRoomResponse>(
      q.serverUrl,
      "/api/create",
      { variantId, snapshot: wireSnapshot, ...(q.prefColor ? { preferredColor: q.prefColor } : {}) }
    );
    const anyRes: any = res;

    if ((import.meta as any)?.env?.DEV) {
      // eslint-disable-next-line no-console
      console.info("[online] create", {
        serverUrl: q.serverUrl,
        preferredColor: q.prefColor,
        roomId: anyRes.roomId,
        playerId: anyRes.playerId,
        assignedColor: anyRes.color,
      });
    }

    if (anyRes.roomId && anyRes.playerId) {
      driver.setRemoteIds({ serverUrl: q.serverUrl, roomId: anyRes.roomId, playerId: anyRes.playerId });
    }
    if (anyRes.color === "W" || anyRes.color === "B") driver.setPlayerColor(anyRes.color);
    await driver.connectFromSnapshot(
      { serverUrl: q.serverUrl, roomId: anyRes.roomId, playerId: anyRes.playerId },
      anyRes.snapshot
    );

    updateBrowserUrlForOnline({
      serverUrl: q.serverUrl,
      roomId: anyRes.roomId,
      playerId: anyRes.playerId,
      color: anyRes.color === "W" || anyRes.color === "B" ? anyRes.color : undefined,
    });
    logJoinUrl({ serverUrl: q.serverUrl, roomId: anyRes.roomId });
    return driver;
  }

  // Join room
  if (q.join) {
    if (!q.roomId) throw new Error("Cannot join online room: missing roomId");
    const res = await postJson<{ roomId: string; preferredColor?: "W" | "B" }, JoinRoomResponse>(
      q.serverUrl,
      "/api/join",
      { roomId: q.roomId, ...(q.prefColor ? { preferredColor: q.prefColor } : {}) }
    );
    const anyRes: any = res;

    if ((import.meta as any)?.env?.DEV) {
      // eslint-disable-next-line no-console
      console.info("[online] join", {
        serverUrl: q.serverUrl,
        roomId: q.roomId,
        preferredColor: q.prefColor,
        playerId: anyRes.playerId,
        assignedColor: anyRes.color,
      });
    }

    if (anyRes.roomId && anyRes.playerId) {
      driver.setRemoteIds({ serverUrl: q.serverUrl, roomId: anyRes.roomId, playerId: anyRes.playerId });
    }
    if (anyRes.color === "W" || anyRes.color === "B") driver.setPlayerColor(anyRes.color);
    await driver.connectFromSnapshot(
      { serverUrl: q.serverUrl, roomId: anyRes.roomId, playerId: anyRes.playerId },
      anyRes.snapshot
    );

    updateBrowserUrlForOnline({
      serverUrl: q.serverUrl,
      roomId: anyRes.roomId,
      playerId: anyRes.playerId,
      color: anyRes.color === "W" || anyRes.color === "B" ? anyRes.color : undefined,
    });
    return driver;
  }

  // Reconnect / spectator snapshot (requires roomId+playerId)
  // If a user only has a roomId, allow read-only viewing by fetching the snapshot.
  // Input will be disabled if the player color is unknown.
  if (q.roomId && !q.playerId) {
    driver.setRemoteIds({ serverUrl: q.serverUrl, roomId: q.roomId, playerId: "spectator" });
    const snap = await getJson<GetRoomSnapshotResponse>(q.serverUrl, `/api/room/${encodeURIComponent(q.roomId)}`);
    const anySnap: any = snap;
    await driver.connectFromSnapshot(
      { serverUrl: q.serverUrl, roomId: q.roomId, playerId: "spectator" },
      anySnap.snapshot
    );
    return driver;
  }

  if (!q.roomId || !q.playerId) {
    throw new Error(
      "Online mode requires query params: ?mode=online&create=1 OR ?mode=online&join=1&roomId=... OR ?mode=online&roomId=...&playerId=..."
    );
  }

  driver.setRemoteIds({ serverUrl: q.serverUrl, roomId: q.roomId, playerId: q.playerId });
  if (q.color) driver.setPlayerColor(q.color);
  const snap = await getJson<GetRoomSnapshotResponse>(q.serverUrl, `/api/room/${encodeURIComponent(q.roomId)}`);
  const anySnap: any = snap;
  await driver.connectFromSnapshot({ serverUrl: q.serverUrl, roomId: q.roomId, playerId: q.playerId }, anySnap.snapshot);

  // Even if this page was loaded directly via a reconnect URL (roomId+playerId),
  // persist the resume token so the Start Page can offer "Rejoin" next time.
  updateBrowserUrlForOnline({
    serverUrl: q.serverUrl,
    roomId: q.roomId,
    playerId: q.playerId,
    color: q.color ?? undefined,
  });
  return driver;
}
