import express from "express";
import cors from "cors";
import type { Server } from "node:http";

import { applyMove } from "../../src/game/applyMove.ts";
import { finalizeDamaCaptureChain } from "../../src/game/damaCaptureChain.ts";
import { finalizeDamascaCaptureChain } from "../../src/game/damascaCaptureChain.ts";
import { nodeIdToA1 } from "../../src/game/coordFormat.ts";
import { HistoryManager } from "../../src/game/historyManager.ts";
import { checkCurrentPlayerLost } from "../../src/game/gameOver.ts";
import type { Move } from "../../src/game/moveTypes.ts";
import type { VariantId } from "../../src/variants/variantTypes.ts";

import type {
  CreateRoomRequest,
  CreateRoomResponse,
  JoinRoomRequest,
  JoinRoomResponse,
  SubmitMoveRequest,
  SubmitMoveResponse,
  FinalizeCaptureChainRequest,
  FinalizeCaptureChainResponse,
  EndTurnRequest,
  EndTurnResponse,
  GetRoomSnapshotResponse,
  RoomId,
  PlayerId,
  PlayerColor,
} from "../../src/shared/onlineProtocol.ts";

import {
  deserializeWireGameState,
  deserializeWireHistory,
  serializeWireGameState,
  serializeWireHistory,
  type WireSnapshot,
} from "../../src/shared/wireState.ts";

import {
  appendEvent,
  ensureGamesDir,
  makeCreatedEvent,
  makeGameOverEvent,
  makeMoveAppliedEvent,
  resolveGamesDir,
  tryLoadRoom,
  writeSnapshotAtomic,
  type PersistedSnapshotFile,
  SUPPORTED_RULES_VERSION,
} from "./persistence.ts";

type Room = {
  roomId: RoomId;
  history: HistoryManager;
  state: any;
  players: Map<PlayerId, PlayerColor>;
  colorsTaken: Set<PlayerColor>;
  variantId: VariantId;
  stateVersion: number;
  rulesVersion: string;
  lastGameOverVersion: number;
};

type ServerOpts = {
  gamesDir?: string;
  snapshotEvery?: number;
};

const randId = () => Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);

function nextColor(room: Room): PlayerColor | null {
  if (!room.colorsTaken.has("W")) return "W";
  if (!room.colorsTaken.has("B")) return "B";
  return null;
}

function requirePlayer(room: Room, playerId: PlayerId): PlayerColor {
  const color = room.players.get(playerId);
  if (!color) throw new Error("Invalid player");
  return color;
}

function snapshotForRoom(room: Room): WireSnapshot {
  return {
    state: serializeWireGameState(room.state),
    history: serializeWireHistory(room.history.exportSnapshots()),
    stateVersion: room.stateVersion,
  };
}

async function persistSnapshot(gamesDir: string, room: Room): Promise<void> {
  const file: PersistedSnapshotFile = {
    meta: {
      roomId: room.roomId,
      variantId: room.variantId,
      rulesVersion: room.rulesVersion,
      stateVersion: room.stateVersion,
      players: Array.from(room.players.entries()),
      colorsTaken: Array.from(room.colorsTaken.values()),
    },
    snapshot: snapshotForRoom(room),
  };
  await writeSnapshotAtomic(gamesDir, room.roomId, file);

  if (process.env.LASCA_PERSIST_LOG === "1") {
    // eslint-disable-next-line no-console
    console.log(`[lasca-server] [persist] snapshot room=${room.roomId} v=${room.stateVersion}`);
  }
}

async function persistMoveApplied(args: {
  gamesDir: string;
  room: Room;
  action: "SUBMIT_MOVE" | "FINALIZE_CAPTURE_CHAIN" | "END_TURN";
  move?: any;
  snapshotEvery: number;
}): Promise<void> {
  const snap = snapshotForRoom(args.room);
  await appendEvent(
    args.gamesDir,
    args.room.roomId,
    makeMoveAppliedEvent({
      roomId: args.room.roomId,
      stateVersion: args.room.stateVersion,
      action: args.action,
      move: args.move,
      snapshot: snap,
      players: args.room.players,
      colorsTaken: args.room.colorsTaken,
    })
  );

  if (process.env.LASCA_PERSIST_LOG === "1") {
    // eslint-disable-next-line no-console
    console.log(`[lasca-server] [persist] event MOVE_APPLIED room=${args.room.roomId} v=${args.room.stateVersion}`);
  }

  if (args.room.stateVersion % args.snapshotEvery === 0) {
    await persistSnapshot(args.gamesDir, args.room);
  }
}

async function maybePersistGameOver(gamesDir: string, room: Room): Promise<void> {
  const result = checkCurrentPlayerLost(room.state as any);
  if (!result.winner) return;

  // Avoid spamming GAME_OVER on every subsequent action.
  if (room.lastGameOverVersion === room.stateVersion) return;
  room.lastGameOverVersion = room.stateVersion;

  await appendEvent(
    gamesDir,
    room.roomId,
    makeGameOverEvent({
      roomId: room.roomId,
      stateVersion: room.stateVersion,
      winner: result.winner,
      reason: result.reason ?? undefined,
    })
  );
  await persistSnapshot(gamesDir, room);
}

export function createLascaApp(opts: ServerOpts = {}): { app: express.Express; rooms: Map<RoomId, Room>; gamesDir: string } {
  const gamesDir = resolveGamesDir(opts.gamesDir);
  const snapshotEvery = Math.max(1, Number(opts.snapshotEvery ?? 20));

  const rooms = new Map<RoomId, Room>();

  async function requireRoom(roomId: RoomId): Promise<Room> {
    const existing = rooms.get(roomId);
    if (existing) return existing;

    const loaded = await tryLoadRoom(gamesDir, roomId);
    if (!loaded) throw new Error("Room not found");

    if (process.env.LASCA_PERSIST_LOG === "1") {
      // eslint-disable-next-line no-console
      console.log(`[lasca-server] [persist] loaded room ${roomId} from disk (stateVersion=${loaded.meta.stateVersion})`);
    }

    if (loaded.meta.rulesVersion !== SUPPORTED_RULES_VERSION) {
      throw new Error("Unsupported rules version for replay");
    }

    const room: Room = {
      roomId,
      state: loaded.state,
      history: loaded.history,
      players: loaded.players,
      colorsTaken: loaded.colorsTaken,
      variantId: loaded.meta.variantId as any,
      stateVersion: loaded.meta.stateVersion,
      rulesVersion: loaded.meta.rulesVersion,
      lastGameOverVersion: -1,
    };
    rooms.set(roomId, room);
    return room;
  }

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.use((req, _res, next) => {
    // eslint-disable-next-line no-console
    console.log(`[lasca-server] ${req.method} ${req.path}`);
    next();
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/create", async (req, res) => {
    try {
      const body = req.body as CreateRoomRequest;
      const variantId = body?.variantId as VariantId;
      if (!variantId) throw new Error("Missing variantId");
      const snapshot = body?.snapshot as WireSnapshot;
      if (!snapshot?.state || !snapshot?.history) throw new Error("Missing snapshot");

      const roomId: RoomId = randId();
      const playerId: PlayerId = randId();

      const state = deserializeWireGameState(snapshot.state);
      const history = new HistoryManager();
      const h = deserializeWireHistory(snapshot.history);
      history.replaceAll(h.states as any, h.notation, h.currentIndex);
      const current = history.getCurrent();
      const aligned = current ?? state;

      const room: Room = {
        roomId,
        state: aligned,
        history,
        players: new Map([[playerId, "W"]]),
        colorsTaken: new Set(["W"]),
        variantId,
        stateVersion: 0,
        rulesVersion: SUPPORTED_RULES_VERSION,
        lastGameOverVersion: -1,
      };
      rooms.set(roomId, room);

      // Persist creation event and initial snapshot.
      await appendEvent(gamesDir, roomId, makeCreatedEvent({
        roomId,
        variantId,
        stateVersion: room.stateVersion,
        snapshot: snapshotForRoom(room),
        players: room.players,
        colorsTaken: room.colorsTaken,
      }));
      await persistSnapshot(gamesDir, room);

      const response: CreateRoomResponse = {
        roomId,
        playerId,
        color: "W",
        snapshot: snapshotForRoom(room),
      };
      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Create failed";
      const response: CreateRoomResponse = { error: msg };
      res.status(400).json(response);
    }
  });

  app.post("/api/join", async (req, res) => {
    try {
      const body = req.body as JoinRoomRequest;
      const roomId = body?.roomId;
      if (!roomId) throw new Error("Missing roomId");

      const room = await requireRoom(roomId);
      const color = nextColor(room);
      if (!color) throw new Error("Room full");

      const playerId: PlayerId = randId();
      room.players.set(playerId, color);
      room.colorsTaken.add(color);

      // Persist join as a snapshot-only update (no gameplay change).
      // This keeps reconnection (roomId+playerId) working across server restarts.
      await persistSnapshot(gamesDir, room);

      const response: JoinRoomResponse = {
        roomId,
        playerId,
        color,
        snapshot: snapshotForRoom(room),
      };
      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Join failed";
      const response: JoinRoomResponse = { error: msg };
      res.status(400).json(response);
    }
  });

  app.get("/api/room/:roomId", async (req, res) => {
    try {
      const roomId = req.params.roomId as RoomId;
      const room = await requireRoom(roomId);
      const response: GetRoomSnapshotResponse = {
        snapshot: snapshotForRoom(room),
      };
      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Snapshot failed";
      const response: GetRoomSnapshotResponse = { error: msg };
      res.status(400).json(response);
    }
  });

  app.post("/api/submitMove", async (req, res) => {
    try {
      const body = req.body as SubmitMoveRequest;
      const room = await requireRoom(body.roomId);
      const color = requirePlayer(room, body.playerId);

      if (room.state.toMove !== color) throw new Error(`Not your turn (toMove=${room.state.toMove}, you=${color})`);

      const move = body.move as Move;
      if (!move || typeof (move as any).from !== "string" || typeof (move as any).to !== "string") {
        throw new Error("Invalid move");
      }

      const prevToMove = (room.state as any).toMove;
      const next = applyMove(room.state as any, move as any) as any;
      room.state = next;

      // Record history only at turn boundaries (quiet moves typically switch turns).
      if (next.toMove !== prevToMove) {
        const boardSize = Number((next as any)?.meta?.boardSize ?? 7);
        const from = nodeIdToA1(move.from, boardSize);
        const to = nodeIdToA1(move.to, boardSize);
        const sep = move.kind === "capture" ? " × " : " → ";
        const notation = `${from}${sep}${to}`;
        room.history.push(room.state, notation);
      }

      room.stateVersion += 1;
      await persistMoveApplied({ gamesDir, room, action: "SUBMIT_MOVE", move, snapshotEvery });
      await maybePersistGameOver(gamesDir, room);

      const response: SubmitMoveResponse = {
        snapshot: snapshotForRoom(room),
        didPromote: Boolean(next.didPromote) || undefined,
      };
      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Move failed";
      // eslint-disable-next-line no-console
      console.error("[lasca-server] submitMove error", msg);
      const response: SubmitMoveResponse = { error: msg };
      res.status(400).json(response);
    }
  });

  app.post("/api/finalizeCaptureChain", async (req, res) => {
    try {
      const body = req.body as FinalizeCaptureChainRequest;
      const room = await requireRoom(body.roomId);
      const color = requirePlayer(room, body.playerId);

      if (room.state.toMove !== color) throw new Error(`Not your turn (toMove=${room.state.toMove}, you=${color})`);

      let next: any;
      if (body.rulesetId === "dama") {
        next = finalizeDamaCaptureChain(room.state as any, body.landing, new Set(body.jumpedSquares));
      } else {
        next = finalizeDamascaCaptureChain(room.state as any, body.landing);
      }

      room.state = next;
      // Turn does not switch here; client will call /api/endTurn when the capture turn ends.

      room.stateVersion += 1;
      await persistMoveApplied({ gamesDir, room, action: "FINALIZE_CAPTURE_CHAIN", snapshotEvery });
      await maybePersistGameOver(gamesDir, room);

      const response: FinalizeCaptureChainResponse = {
        snapshot: snapshotForRoom(room),
        didPromote: Boolean(next.didPromote) || undefined,
      };
      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Finalize failed";
      // eslint-disable-next-line no-console
      console.error("[lasca-server] finalizeCaptureChain error", msg);
      const response: FinalizeCaptureChainResponse = { error: msg };
      res.status(400).json(response);
    }
  });

  app.post("/api/endTurn", async (req, res) => {
    try {
      const body = req.body as EndTurnRequest;
      const room = await requireRoom(body.roomId);
      const color = requirePlayer(room, body.playerId);

      if (room.state.toMove !== color) throw new Error(`Not your turn (toMove=${room.state.toMove}, you=${color})`);

      room.state = {
        ...(room.state as any),
        toMove: room.state.toMove === "B" ? "W" : "B",
        phase: "idle",
      };

      const notation = typeof (body as any).notation === "string" ? (body as any).notation : undefined;
      room.history.push(room.state as any, notation);

      room.stateVersion += 1;
      await persistMoveApplied({ gamesDir, room, action: "END_TURN", snapshotEvery });
      await maybePersistGameOver(gamesDir, room);

      const response: EndTurnResponse = {
        snapshot: snapshotForRoom(room),
      };
      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "End turn failed";
      // eslint-disable-next-line no-console
      console.error("[lasca-server] endTurn error", msg);
      const response: EndTurnResponse = { error: msg };
      res.status(400).json(response);
    }
  });

  return { app, rooms, gamesDir };
}

export async function startLascaServer(args: { port?: number; gamesDir?: string; snapshotEvery?: number }): Promise<{
  app: express.Express;
  server: Server;
  url: string;
  gamesDir: string;
}> {
  const { app, gamesDir } = createLascaApp({ gamesDir: args.gamesDir, snapshotEvery: args.snapshotEvery });
  await ensureGamesDir(gamesDir);

  const port = Number.isFinite(args.port as any) ? Number(args.port) : 8787;
  const server = app.listen(port);

  await new Promise<void>((resolve) => {
    server.once("listening", () => resolve());
  });

  const actualPort = (server.address() as any)?.port ?? port;
  return { app, server, url: `http://localhost:${actualPort}`, gamesDir };
}
