import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { WireSnapshot } from "../../src/shared/wireState.ts";
import { deserializeWireGameState, deserializeWireHistory } from "../../src/shared/wireState.ts";
import { HistoryManager } from "../../src/game/historyManager.ts";
import type { PlayerColor, PlayerId, RoomId } from "../../src/shared/onlineProtocol.ts";

export const SUPPORTED_RULES_VERSION = "v1" as const;

export type PersistedRoomMeta = {
  roomId: RoomId;
  variantId: any;
  rulesVersion: typeof SUPPORTED_RULES_VERSION | string;
  stateVersion: number;
  players: Array<[PlayerId, PlayerColor]>;
  colorsTaken: PlayerColor[];
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
  winner: "B" | "W";
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

export async function appendEvent(gamesDir: string, roomId: RoomId, ev: PersistedEvent): Promise<void> {
  await ensureRoomDir(gamesDir, roomId);
  const p = eventsPath(gamesDir, roomId);
  await fs.appendFile(p, `${JSON.stringify(ev)}\n`, "utf8");
}

export async function writeSnapshotAtomic(gamesDir: string, roomId: RoomId, file: PersistedSnapshotFile): Promise<void> {
  await ensureRoomDir(gamesDir, roomId);
  const p = snapshotPath(gamesDir, roomId);
  const tmp = `${p}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(file, null, 2), "utf8");
  await fs.rename(tmp, p);
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

  const meta: PersistedRoomMeta = {
    roomId,
    variantId,
    rulesVersion,
    stateVersion,
    players: Array.from(players.entries()),
    colorsTaken: Array.from(colorsTaken.values()),
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
  winner: "B" | "W";
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
