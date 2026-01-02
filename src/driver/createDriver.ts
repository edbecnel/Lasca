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
};

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
  return { serverUrl, create, join, roomId, playerId, color };
}

async function postJson<TReq, TRes>(serverUrl: string, path: string, body: TReq): Promise<TRes> {
  const res = await fetch(`${serverUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as any;
  if (!res.ok) {
    const msg = typeof json?.error === "string" ? json.error : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  if (json?.error) throw new Error(String(json.error));
  return json as TRes;
}

async function getJson<TRes>(serverUrl: string, path: string): Promise<TRes> {
  const res = await fetch(`${serverUrl}${path}`);
  const json = (await res.json()) as any;
  if (!res.ok) {
    const msg = typeof json?.error === "string" ? json.error : `HTTP ${res.status}`;
    throw new Error(msg);
  }
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

  const q = parseOnlineQuery(args.search, args.envServerUrl);
  const driver = new RemoteDriver(args.state);

  const wireSnapshot: WireSnapshot = {
    state: serializeWireGameState(args.state),
    history: serializeWireHistory(args.history.exportSnapshots()),
  };

  // Create room
  if (q.create) {
    const variantId = args.state.meta?.variantId;
    if (!variantId) throw new Error("Cannot create online room: missing state.meta.variantId");
    const res = await postJson<{ variantId: any; snapshot: WireSnapshot }, CreateRoomResponse>(
      q.serverUrl,
      "/api/create",
      { variantId, snapshot: wireSnapshot }
    );
    const anyRes: any = res;
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
    const res = await postJson<{ roomId: string }, JoinRoomResponse>(q.serverUrl, "/api/join", { roomId: q.roomId });
    const anyRes: any = res;
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
  return driver;
}
