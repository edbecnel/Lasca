import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { secureRandomHex } from "./secureRandom.ts";

import type { WireSnapshot } from "../../src/shared/wireState.ts";
import { deserializeWireGameState, deserializeWireHistory } from "../../src/shared/wireState.ts";
import { HistoryManager } from "../../src/game/historyManager.ts";
import type {
  ClockState,
  PlayerColor,
  PlayerId,
  RoomId,
  RoomRules,
  RoomVisibility,
  TimeControl,
  PlayerIdentity,
} from "../../src/shared/onlineProtocol.ts";

export const SUPPORTED_RULES_VERSION = "v1" as const;

export type PersistedRoomMeta = {
  roomId: RoomId;
  variantId: any;
  rulesVersion: typeof SUPPORTED_RULES_VERSION | string;
  stateVersion: number;
  /** ISO timestamp when the room was created (best-effort; may be absent for older snapshots). */
  createdAtIso?: string;
  /** PlayerId of the room creator/host (best-effort; may be absent for older snapshots). */
  createdByPlayerId?: PlayerId;
  players: Array<[PlayerId, PlayerColor]>;
  colorsTaken: PlayerColor[];

  /** Immutable per game; present for newer snapshots. */
  rules?: RoomRules;

  // Optional extensions (back-compat):
  visibility?: RoomVisibility;
  watchToken?: string;

  /** Informational per-player identity (guestId/displayName). */
  identity?: Record<PlayerId, PlayerIdentity>;

  presence?: Record<PlayerId, { connected: boolean; lastSeenAt: string }>;
  disconnectGrace?: Record<PlayerId, { graceUntilIso: string }>; // only when in grace
  timeControl?: TimeControl;
  clock?: ClockState;
};

export type PersistedSnapshotFile = {
  meta: PersistedRoomMeta;
  snapshot: WireSnapshot;
};

export type PersistedEventBase = {
  ts: string;
  roomId: RoomId;
  rulesVersion: typeof SUPPORTED_RULES_VERSION | string;
  stateVersion: number;
};

export type GameCreatedEvent = PersistedEventBase & {
  type: "GAME_CREATED";
  variantId: any;
  snapshot: WireSnapshot;
  players: Array<[PlayerId, PlayerColor]>;
  colorsTaken: PlayerColor[];
};

export type MoveAppliedEvent = PersistedEventBase & {
  type: "MOVE_APPLIED";
  action: "SUBMIT_MOVE" | "FINALIZE_CAPTURE_CHAIN" | "END_TURN";
  move?: any;
  snapshot: WireSnapshot;
  players: Array<[PlayerId, PlayerColor]>;
  colorsTaken: PlayerColor[];
};

export type GameOverEvent = PersistedEventBase & {
  type: "GAME_OVER";
  winner: "B" | "W" | null;
  reason?: string;
};

export type PersistedEvent = GameCreatedEvent | MoveAppliedEvent | GameOverEvent;

export type LoadedRoom = {
  meta: PersistedRoomMeta;
  history: HistoryManager;
  state: any;
  players: Map<PlayerId, PlayerColor>;
  colorsTaken: Set<PlayerColor>;
};

function nowIso(): string {
  return new Date().toISOString();
}

export function resolveDefaultGamesDir(): string {
  // Default to <repo>/server/data/games
  const here = fileURLToPath(new URL(import.meta.url));
  return path.resolve(path.dirname(here), "..", "data", "games");
}

export function resolveGamesDir(explicitDir?: string | undefined): string {
  if (explicitDir && explicitDir.trim()) return path.resolve(explicitDir);
  if (process.env.LASCA_DATA_DIR && process.env.LASCA_DATA_DIR.trim()) return path.resolve(process.env.LASCA_DATA_DIR);
  return resolveDefaultGamesDir();
}

export async function ensureGamesDir(gamesDir: string): Promise<void> {
  await fs.mkdir(gamesDir, { recursive: true });
}

function roomDir(gamesDir: string, roomId: RoomId): string {
  return path.join(gamesDir, roomId);
}

export function eventsPath(gamesDir: string, roomId: RoomId): string {
  return path.join(roomDir(gamesDir, roomId), `${roomId}.events.jsonl`);
}

export function snapshotPath(gamesDir: string, roomId: RoomId): string {
  return path.join(roomDir(gamesDir, roomId), `${roomId}.snapshot.json`);
}

async function ensureRoomDir(gamesDir: string, roomId: RoomId): Promise<void> {
  await fs.mkdir(roomDir(gamesDir, roomId), { recursive: true });
}

async function roomDirExists(gamesDir: string, roomId: RoomId): Promise<boolean> {
  return fs
    .stat(roomDir(gamesDir, roomId))
    .then(() => true)
    .catch(() => false);
}

async function gamesDirExists(gamesDir: string): Promise<boolean> {
  return fs
    .stat(gamesDir)
    .then(() => true)
    .catch(() => false);
}

export async function appendEvent(
  gamesDir: string,
  roomId: RoomId,
  ev: PersistedEvent,
  opts?: { allowCreateRoomDir?: boolean }
): Promise<void> {
  if (!(await gamesDirExists(gamesDir))) return;

  if (opts?.allowCreateRoomDir) {
    await ensureRoomDir(gamesDir, roomId);
  } else {
    // If the room directory is missing, treat it as an admin deletion and
    // do not recreate it.
    if (!(await roomDirExists(gamesDir, roomId))) return;
  }

  const p = eventsPath(gamesDir, roomId);
  try {
    await fs.appendFile(p, `${JSON.stringify(ev)}\n`, "utf8");
  } catch (err: any) {
    // If the room folder was deleted between the stat check and the write,
    // treat it as an admin deletion and stop persisting.
    if (err && err.code === "ENOENT") return;
    throw err;
  }
}

export async function writeSnapshotAtomic(
  gamesDir: string,
  roomId: RoomId,
  file: PersistedSnapshotFile,
  opts?: { allowCreateRoomDir?: boolean }
): Promise<void> {
  if (!(await gamesDirExists(gamesDir))) return;

  if (opts?.allowCreateRoomDir) {
    await ensureRoomDir(gamesDir, roomId);
  } else {
    // If the room directory is missing, treat it as an admin deletion and
    // do not recreate it.
    if (!(await roomDirExists(gamesDir, roomId))) return;
  }

  const p = snapshotPath(gamesDir, roomId);
  const tmp = `${p}.tmp.${process.pid}.${Date.now()}.${secureRandomHex(8)}`;
  try {
    await fs.writeFile(tmp, JSON.stringify(file, null, 2), "utf8");
  } catch (err: any) {
    if (err && err.code === "ENOENT") return;
    throw err;
  }

  try {
    await fs.rename(tmp, p);
  } catch (err: any) {
    if (err && err.code === "ENOENT") {
      try {
        await fs.unlink(tmp);
      } catch {
        // ignore
      }
      return;
    }
    throw err;
  }
}

export async function tryLoadRoom(gamesDir: string, roomId: RoomId): Promise<LoadedRoom | null> {
  const snapP = snapshotPath(gamesDir, roomId);
  const eventsP = eventsPath(gamesDir, roomId);

  let snapshotFile: PersistedSnapshotFile | null = null;
  try {
    const raw = await fs.readFile(snapP, "utf8");
    snapshotFile = JSON.parse(raw) as PersistedSnapshotFile;
  } catch {
    snapshotFile = null;
  }

  // If neither snapshot nor event log exist, nothing to load.
  const hasEvents = await fs
    .stat(eventsP)
    .then(() => true)
    .catch(() => false);
  if (!snapshotFile && !hasEvents) return null;

  // Start from snapshot if present, else from first event.
  let rulesVersion: string | null = null;
  let variantId: any = null;
  let stateVersion = -1;
  let state: any = null;
  let history = new HistoryManager();
  let players = new Map<PlayerId, PlayerColor>();
  let colorsTaken = new Set<PlayerColor>();

  if (snapshotFile) {
    rulesVersion = snapshotFile.meta.rulesVersion;
    variantId = snapshotFile.meta.variantId;
    stateVersion = snapshotFile.meta.stateVersion;

    const embeddedVariantId = snapshotFile.snapshot?.state?.meta?.variantId;
    if (!embeddedVariantId) {
      throw new Error("Persisted snapshot is missing state.meta.variantId");
    }
    if (embeddedVariantId !== variantId) {
      throw new Error("Persisted snapshot variantId mismatch");
    }

    if (rulesVersion !== SUPPORTED_RULES_VERSION) {
      throw new Error("Unsupported rules version for replay");
    }

    const s = deserializeWireGameState(snapshotFile.snapshot.state);
    const h = deserializeWireHistory(snapshotFile.snapshot.history);
    history.replaceAll(h.states as any, h.notation, h.currentIndex);
    const current = history.getCurrent();
    state = current ?? s;

    players = new Map(snapshotFile.meta.players);
    colorsTaken = new Set(snapshotFile.meta.colorsTaken);
  }

  if (hasEvents) {
    const raw = await fs.readFile(eventsP, "utf8");
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);

    for (const line of lines) {
      const ev = JSON.parse(line) as PersistedEvent;

      // First event might establish rulesVersion if no snapshot.
      if (!rulesVersion && (ev as any).rulesVersion) {
        rulesVersion = (ev as any).rulesVersion;
        if (rulesVersion !== SUPPORTED_RULES_VERSION) {
          throw new Error("Unsupported rules version for replay");
        }
      }

      if (ev.type === "GAME_CREATED") {
        if (!variantId) variantId = ev.variantId;
        if (stateVersion < 0) {
          const s = deserializeWireGameState(ev.snapshot.state);
          const h = deserializeWireHistory(ev.snapshot.history);
          history = new HistoryManager();
          history.replaceAll(h.states as any, h.notation, h.currentIndex);
          state = history.getCurrent() ?? s;
          stateVersion = ev.stateVersion;
          players = new Map(ev.players);
          colorsTaken = new Set(ev.colorsTaken);
        }
        continue;
      }

      // Replay only events newer than snapshot's stateVersion.
      if (ev.stateVersion <= stateVersion) continue;

      if (ev.type === "MOVE_APPLIED") {
        const s = deserializeWireGameState(ev.snapshot.state);
        const h = deserializeWireHistory(ev.snapshot.history);
        history.replaceAll(h.states as any, h.notation, h.currentIndex);
        state = history.getCurrent() ?? s;
        stateVersion = ev.stateVersion;
        players = new Map(ev.players);
        colorsTaken = new Set(ev.colorsTaken);
      }

      // GAME_OVER is metadata-only for now; does not change state.
      if (ev.type === "GAME_OVER") {
        stateVersion = ev.stateVersion;
      }
    }
  }

  if (!rulesVersion) {
    throw new Error("Unsupported rules version for replay");
  }

  if (stateVersion < 0 || !state) {
    return null;
  }

  const optionalFromSnapshot: Pick<
    PersistedRoomMeta,
    "visibility" | "watchToken" | "identity" | "presence" | "disconnectGrace" | "timeControl" | "clock"
  > = snapshotFile
    ? {
        visibility: snapshotFile.meta.visibility,
        watchToken: snapshotFile.meta.watchToken,
        identity: snapshotFile.meta.identity,
        presence: snapshotFile.meta.presence,
        disconnectGrace: snapshotFile.meta.disconnectGrace,
        timeControl: snapshotFile.meta.timeControl,
        clock: snapshotFile.meta.clock,
      }
    : {};

  const meta: PersistedRoomMeta = {
    roomId,
    variantId,
    rulesVersion,
    stateVersion,
    players: Array.from(players.entries()),
    colorsTaken: Array.from(colorsTaken.values()),
    ...optionalFromSnapshot,
  };

  return {
    meta,
    history,
    state,
    players,
    colorsTaken,
  };
}

export function makeCreatedEvent(args: {
  roomId: RoomId;
  variantId: any;
  stateVersion: number;
  snapshot: WireSnapshot;
  players: Map<PlayerId, PlayerColor>;
  colorsTaken: Set<PlayerColor>;
}): GameCreatedEvent {
  return {
    type: "GAME_CREATED",
    ts: nowIso(),
    roomId: args.roomId,
    rulesVersion: SUPPORTED_RULES_VERSION,
    stateVersion: args.stateVersion,
    variantId: args.variantId,
    snapshot: args.snapshot,
    players: Array.from(args.players.entries()),
    colorsTaken: Array.from(args.colorsTaken.values()),
  };
}

export function makeMoveAppliedEvent(args: {
  roomId: RoomId;
  stateVersion: number;
  action: MoveAppliedEvent["action"];
  snapshot: WireSnapshot;
  players: Map<PlayerId, PlayerColor>;
  colorsTaken: Set<PlayerColor>;
  move?: any;
}): MoveAppliedEvent {
  return {
    type: "MOVE_APPLIED",
    ts: nowIso(),
    roomId: args.roomId,
    rulesVersion: SUPPORTED_RULES_VERSION,
    stateVersion: args.stateVersion,
    action: args.action,
    ...(args.move ? { move: args.move } : {}),
    snapshot: args.snapshot,
    players: Array.from(args.players.entries()),
    colorsTaken: Array.from(args.colorsTaken.values()),
  };
}

export function makeGameOverEvent(args: {
  roomId: RoomId;
  stateVersion: number;
  winner: "B" | "W" | null;
  reason?: string;
}): GameOverEvent {
  return {
    type: "GAME_OVER",
    ts: nowIso(),
    roomId: args.roomId,
    rulesVersion: SUPPORTED_RULES_VERSION,
    stateVersion: args.stateVersion,
    winner: args.winner,
    ...(args.reason ? { reason: args.reason } : {}),
  };
}
