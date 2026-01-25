import express from "express";
import cors from "cors";
import { createServer, type Server } from "node:http";
import fs from "node:fs/promises";

import WebSocket, { WebSocketServer, type RawData } from "ws";

import { applyMove } from "../../src/game/applyMove.ts";
import { finalizeDamaCaptureChain } from "../../src/game/damaCaptureChain.ts";
import { finalizeDamascaCaptureChain } from "../../src/game/damascaCaptureChain.ts";
import { endTurn } from "../../src/game/endTurn.ts";
import { nodeIdToA1 } from "../../src/game/coordFormat.ts";
import { HistoryManager } from "../../src/game/historyManager.ts";
import { checkCurrentPlayerLost } from "../../src/game/gameOver.ts";
import { hashGameState } from "../../src/game/hashState.ts";
import { adjudicateDamascaDeadPlay } from "../../src/game/damascaDeadPlay.ts";
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
  GetReplayResponse,
  GetRoomSnapshotResponse,
  ReplayEvent,
  ResignRequest,
  ResignResponse,
  RoomId,
  PlayerId,
  PlayerColor,
  PresenceByPlayerId,
  TimeControl,
  ClockState,
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
  eventsPath,
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
  presence: Map<PlayerId, { connected: boolean; lastSeenAt: string }>;
  disconnectGrace: Map<PlayerId, { graceUntilIso: string; graceUntilMs: number; timer: NodeJS.Timeout }>;
  timeControl: TimeControl;
  clock: ClockState | null;
  /** Serialize all room mutations to avoid races across concurrent HTTP/WS/timer actions. */
  actionChain: Promise<void>;
  persistChain: Promise<void>;
};

type ServerOpts = {
  gamesDir?: string;
  snapshotEvery?: number;
  disconnectGraceMs?: number;
};

const randId = () => Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);

function nowIso(): string {
  return new Date().toISOString();
}

function ensurePresence(room: Room, playerId: PlayerId): { connected: boolean; lastSeenAt: string } {
  const existing = room.presence.get(playerId);
  if (existing) return existing;
  const created = { connected: false, lastSeenAt: nowIso() };
  room.presence.set(playerId, created);
  return created;
}

function clearGrace(room: Room, playerId: PlayerId): void {
  const g = room.disconnectGrace.get(playerId);
  if (!g) return;
  clearTimeout(g.timer);
  room.disconnectGrace.delete(playerId);
}

function setPresence(room: Room, playerId: PlayerId, patch: Partial<{ connected: boolean; lastSeenAt: string }>): void {
  const p = ensurePresence(room, playerId);
  if (typeof patch.connected === "boolean") p.connected = patch.connected;
  if (typeof patch.lastSeenAt === "string") p.lastSeenAt = patch.lastSeenAt;
}

function presenceForRoom(room: Room): PresenceByPlayerId {
  const out: PresenceByPlayerId = {};
  for (const [playerId] of room.players.entries()) {
    const p = ensurePresence(room, playerId);
    const g = room.disconnectGrace.get(playerId);
    out[playerId] = {
      connected: p.connected,
      lastSeenAt: p.lastSeenAt,
      ...(g ? { inGrace: true, graceUntil: g.graceUntilIso } : {}),
    };
  }
  return out;
}

function isValidTimeControl(raw: any): raw is TimeControl {
  if (!raw || typeof raw !== "object") return false;
  if (raw.mode === "none") return true;
  if (raw.mode === "clock") {
    const initialMs = Number(raw.initialMs);
    const inc = raw.incrementMs == null ? 0 : Number(raw.incrementMs);
    return Number.isFinite(initialMs) && initialMs > 0 && Number.isFinite(inc) && inc >= 0;
  }
  return false;
}

function nextColor(room: Room): PlayerColor | null {
  // Be defensive: colorsTaken is redundant with players, and can become stale
  // across persistence/back-compat loads. Derive from players to ensure we never
  // assign the same color twice.
  const derived = new Set<PlayerColor>(Array.from(room.players.values()));
  room.colorsTaken = derived;
  if (!derived.has("W")) return "W";
  if (!derived.has("B")) return "B";
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

function parseExpectedVersion(raw: any): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

async function persistSnapshot(gamesDir: string, room: Room): Promise<void> {
  const presenceRecord: Record<PlayerId, { connected: boolean; lastSeenAt: string }> = {};
  for (const [pid, p] of room.presence.entries()) {
    presenceRecord[pid] = { connected: p.connected, lastSeenAt: p.lastSeenAt };
  }
  const graceRecord: Record<PlayerId, { graceUntilIso: string }> = {};
  for (const [pid, g] of room.disconnectGrace.entries()) {
    graceRecord[pid] = { graceUntilIso: g.graceUntilIso };
  }

  const file: PersistedSnapshotFile = {
    meta: {
      roomId: room.roomId,
      variantId: room.variantId,
      rulesVersion: room.rulesVersion,
      stateVersion: room.stateVersion,
      players: Array.from(room.players.entries()),
      colorsTaken: Array.from(room.colorsTaken.values()),
      presence: presenceRecord,
      disconnectGrace: graceRecord,
      timeControl: room.timeControl,
      clock: room.clock ?? undefined,
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
  const forced = (room.state as any)?.forcedGameOver;
  const result = checkCurrentPlayerLost(room.state as any);

  const isForced = Boolean(forced?.message);
  const isNormalWin = Boolean(result.winner);
  if (!isForced && !isNormalWin) return;

  // Avoid spamming GAME_OVER on every subsequent action.
  if (room.lastGameOverVersion === room.stateVersion) return;
  room.lastGameOverVersion = room.stateVersion;

  await appendEvent(
    gamesDir,
    room.roomId,
    makeGameOverEvent({
      roomId: room.roomId,
      stateVersion: room.stateVersion,
      winner: (result.winner ?? forced?.winner ?? null) as any,
      reason: (result.reason ?? forced?.message ?? undefined) as any,
    })
  );
  await persistSnapshot(gamesDir, room);
}

export function createLascaApp(opts: ServerOpts = {}): {
  app: express.Express;
  rooms: Map<RoomId, Room>;
  gamesDir: string;
  attachWebSockets: (server: Server) => void;
  shutdown: () => Promise<void>;
} {
  const gamesDir = resolveGamesDir(opts.gamesDir);
  const snapshotEvery = Math.max(1, Number(opts.snapshotEvery ?? 20));
  const disconnectGraceMs = Math.max(0, Number(opts.disconnectGraceMs ?? 120_000));

  const rooms = new Map<RoomId, Room>();
  const streamClients = new Map<RoomId, Set<express.Response>>();
  const wsClients = new Map<RoomId, Set<WebSocket>>();
  const streamPlayerClients = new Map<RoomId, Map<PlayerId, Set<express.Response>>>();
  const wsPlayerClients = new Map<RoomId, Map<PlayerId, Set<WebSocket>>>();
  let wss: WebSocketServer | null = null;
  let wsHeartbeat: NodeJS.Timeout | null = null;
  let isShuttingDown = false;

  function addStreamPlayerClient(roomId: RoomId, playerId: PlayerId, res: express.Response): void {
    const byPlayer = streamPlayerClients.get(roomId) ?? new Map<PlayerId, Set<express.Response>>();
    const set = byPlayer.get(playerId) ?? new Set<express.Response>();
    set.add(res);
    byPlayer.set(playerId, set);
    streamPlayerClients.set(roomId, byPlayer);
  }

  function removeStreamPlayerClient(roomId: RoomId, playerId: PlayerId, res: express.Response): void {
    const byPlayer = streamPlayerClients.get(roomId);
    if (!byPlayer) return;
    const set = byPlayer.get(playerId);
    if (!set) return;
    set.delete(res);
    if (set.size === 0) byPlayer.delete(playerId);
    if (byPlayer.size === 0) streamPlayerClients.delete(roomId);
  }

  function addWsPlayerClient(roomId: RoomId, playerId: PlayerId, ws: WebSocket): void {
    const byPlayer = wsPlayerClients.get(roomId) ?? new Map<PlayerId, Set<WebSocket>>();
    const set = byPlayer.get(playerId) ?? new Set<WebSocket>();
    set.add(ws);
    byPlayer.set(playerId, set);
    wsPlayerClients.set(roomId, byPlayer);
  }

  function removeWsPlayerClient(roomId: RoomId, playerId: PlayerId, ws: WebSocket): void {
    const byPlayer = wsPlayerClients.get(roomId);
    if (!byPlayer) return;
    const set = byPlayer.get(playerId);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) byPlayer.delete(playerId);
    if (byPlayer.size === 0) wsPlayerClients.delete(roomId);
  }

  function isPlayerConnectedByAnyTransport(roomId: RoomId, playerId: PlayerId): boolean {
    const wsByPlayer = wsPlayerClients.get(roomId);
    const wsCount = wsByPlayer?.get(playerId)?.size ?? 0;
    if (wsCount > 0) return true;
    const sseByPlayer = streamPlayerClients.get(roomId);
    const sseCount = sseByPlayer?.get(playerId)?.size ?? 0;
    return sseCount > 0;
  }

  function queuePersist(room: Room): Promise<void> {
    if (isShuttingDown) return Promise.resolve();
    room.persistChain = room.persistChain
      .then(() => persistSnapshot(gamesDir, room))
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[lasca-server] persistSnapshot error", err);
      });
    return room.persistChain;
  }

  function queueRoomAction<T>(room: Room, fn: () => Promise<T>): Promise<T> {
    if (isShuttingDown) return Promise.reject(new Error("Server shutting down"));

    // Chain actions so at most one runs at a time per room.
    const prev = room.actionChain;
    let resolveNext: (() => void) | null = null;
    room.actionChain = new Promise<void>((resolve) => {
      resolveNext = resolve;
    });

    return prev
      .catch(() => undefined)
      .then(fn)
      .finally(() => {
        try {
          resolveNext?.();
        } catch {
          // ignore
        }
      });
  }

  function streamWrite(res: express.Response, eventName: string, payload: unknown): void {
    // SSE format: each message ends with a blank line
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

  function broadcastRoomEvent(roomId: RoomId, eventName: string, payload: unknown): void {
    const clients = streamClients.get(roomId);
    if (!clients || clients.size === 0) return;

    for (const res of clients) {
      try {
        streamWrite(res, eventName, payload);
      } catch {
        // Ignore write failures; cleanup happens on close.
      }
    }
  }

  function broadcastRoomSnapshot(room: Room): void {
    const payload = {
      roomId: room.roomId,
      snapshot: snapshotForRoom(room),
      presence: presenceForRoom(room),
      timeControl: room.timeControl,
      clock: room.clock ?? undefined,
    };

    broadcastRoomEvent(room.roomId, "snapshot", payload);

    const sockets = wsClients.get(room.roomId);
    if (!sockets || sockets.size === 0) return;
    const msg = JSON.stringify({ event: "snapshot", payload });
    for (const ws of sockets) {
      try {
        if (ws.readyState === WebSocket.OPEN) ws.send(msg);
      } catch {
        // ignore; cleanup on close
      }
    }
  }

  function removeWsClient(roomId: RoomId, ws: WebSocket): void {
    const set = wsClients.get(roomId);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) wsClients.delete(roomId);
  }

  function attachWebSockets(server: Server): void {
    if (wss) return;

    wss = new WebSocketServer({ server, path: "/api/ws" });

    type WsConnState = {
      roomId: RoomId | null;
      playerId: PlayerId | null;
    };

    wss.on("connection", (ws: WebSocket) => {
      const state: WsConnState = { roomId: null, playerId: null };
      (ws as any).isAlive = true;

      ws.on("pong", () => {
        (ws as any).isAlive = true;
      });

      const joinTimeout = setTimeout(() => {
        try {
          if (!state.roomId) ws.close(1008, "JOIN required");
        } catch {
          // ignore
        }
      }, 5_000);

      ws.on("message", async (raw: RawData) => {
        try {
          const text = typeof raw === "string" ? raw : raw.toString("utf8");
          const msg = JSON.parse(text) as any;

          if (msg?.type !== "JOIN") return;
          const roomId = typeof msg.roomId === "string" ? (msg.roomId as RoomId) : null;
          const playerId = typeof msg.playerId === "string" ? (msg.playerId as PlayerId) : null;
          if (!roomId) throw new Error("Missing roomId");

          // Re-join: move socket between rooms.
          if (state.roomId && state.roomId !== roomId) {
            removeWsClient(state.roomId, ws);
            if (state.playerId) {
              removeWsPlayerClient(state.roomId, state.playerId, ws);
            }

            const prevRoom = rooms.get(state.roomId);
            if (prevRoom && state.playerId && prevRoom.players.has(state.playerId)) {
              const prevPlayerId = state.playerId;
              // Only mark disconnected if this was the last connection.
              if (!isPlayerConnectedByAnyTransport(state.roomId, state.playerId)) {
                void queueRoomAction(prevRoom, async () => {
                  touchClock(prevRoom);
                  await maybeForceClockTimeout(prevRoom);
                  setPresence(prevRoom, prevPlayerId, { connected: false, lastSeenAt: nowIso() });
                  await startGraceIfNeeded(prevRoom, prevPlayerId);
                });
              }
            }
          }

          state.roomId = roomId;
          state.playerId = playerId;

          const room = await requireRoom(roomId);

          // Track room membership
          const set = wsClients.get(roomId) ?? new Set<WebSocket>();
          set.add(ws);
          wsClients.set(roomId, set);

          // Presence/clock behavior mirrors SSE stream behavior.
          if (playerId && room.players.has(playerId)) {
            addWsPlayerClient(roomId, playerId, ws);
            await queueRoomAction(room, async () => {
              touchClock(room);
              await maybeForceClockTimeout(room);
              setPresence(room, playerId, { connected: true, lastSeenAt: nowIso() });
              clearGrace(room, playerId);
              updateClockPause(room);
              await persistSnapshot(gamesDir, room);
            });
          }

          // Send initial snapshot (authoritative) to this socket.
          const payload = {
            roomId,
            snapshot: snapshotForRoom(room),
            presence: presenceForRoom(room),
            timeControl: room.timeControl,
            clock: room.clock ?? undefined,
          };
          ws.send(JSON.stringify({ event: "snapshot", payload }));

          // Notify others that presence changed.
          if (playerId && room.players.has(playerId)) {
            broadcastRoomSnapshot(room);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "JOIN failed";
          try {
            ws.send(JSON.stringify({ event: "error", payload: { message } }));
          } catch {
            // ignore
          }
        }
      });

      ws.on("close", () => {
        clearTimeout(joinTimeout);
        const roomId = state.roomId;
        if (roomId) removeWsClient(roomId, ws);
        if (isShuttingDown) return;

        const playerId = state.playerId;
        if (!roomId || !playerId) return;
        const room = rooms.get(roomId);
        if (!room) return;
        if (!room.players.has(playerId)) return;

        removeWsPlayerClient(roomId, playerId, ws);

        // If there is still another live connection for this player (e.g., another tab),
        // do NOT mark them disconnected or start grace.
        if (isPlayerConnectedByAnyTransport(roomId, playerId)) return;

        void queueRoomAction(room, async () => {
          touchClock(room);
          await maybeForceClockTimeout(room);
          setPresence(room, playerId, { connected: false, lastSeenAt: nowIso() });
          await startGraceIfNeeded(room, playerId);
        });
      });

      ws.on("error", () => {
        // ignore; close handler will do cleanup
      });
    });

    // Heartbeat to detect dead connections (needed for MP2 presence/grace).
    wsHeartbeat = setInterval(() => {
      if (!wss) return;
      for (const ws of wss.clients) {
        const alive = Boolean((ws as any).isAlive);
        if (!alive) {
          try {
            ws.terminate();
          } catch {
            // ignore
          }
          continue;
        }
        (ws as any).isAlive = false;
        try {
          ws.ping();
        } catch {
          // ignore
        }
      }
    }, 15_000);
  }

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

    const loadedPresence = (loaded.meta as any).presence as Record<string, { connected: boolean; lastSeenAt: string }> | undefined;
    const loadedGrace = (loaded.meta as any).disconnectGrace as Record<string, { graceUntilIso: string }> | undefined;
    const loadedTimeControlRaw = (loaded.meta as any).timeControl;
    const loadedTimeControl: TimeControl = isValidTimeControl(loadedTimeControlRaw) ? loadedTimeControlRaw : { mode: "none" };
    const loadedClock = ((loaded.meta as any).clock as ClockState | undefined) ?? null;

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
      presence: new Map(),
      disconnectGrace: new Map(),
      timeControl: loadedTimeControl,
      clock: loadedTimeControl.mode === "clock" ? loadedClock : null,
      actionChain: Promise.resolve(),
      persistChain: Promise.resolve(),
    };

    // Repair any stale colorsTaken from older snapshots.
    room.colorsTaken = new Set<PlayerColor>(Array.from(room.players.values()));

    // Restore presence (but server restart means no active connections).
    for (const [playerId] of room.players.entries()) {
      const saved = loadedPresence?.[playerId];
      setPresence(room, playerId, {
        connected: false,
        lastSeenAt: typeof saved?.lastSeenAt === "string" ? saved.lastSeenAt : nowIso(),
      });
    }
    rooms.set(roomId, room);

    // Restore grace timers.
    const graceMs = Math.max(0, Number(opts.disconnectGraceMs ?? 120_000));
    if (loadedGrace && graceMs > 0) {
      for (const [pid, g] of Object.entries(loadedGrace)) {
        if (!room.players.has(pid as any)) continue;
        const graceUntilMs = Date.parse(g.graceUntilIso);
        if (!Number.isFinite(graceUntilMs)) continue;
        // Only restore grace if player is disconnected.
        if (room.presence.get(pid as any)?.connected) continue;

        const delay = Math.max(0, graceUntilMs - Date.now());
        const timer = setTimeout(() => {
          const p = room.presence.get(pid as any);
          if (!p || p.connected) {
            clearGrace(room, pid as any);
            return;
          }
          clearGrace(room, pid as any);
          void queueRoomAction(room, () => forceDisconnectTimeout({ gamesDir, room, disconnectedPlayerId: pid as any }));
        }, delay);
        room.disconnectGrace.set(pid as any, { graceUntilIso: g.graceUntilIso, graceUntilMs, timer });
      }
    }

    // If any grace is active, clocks should start paused.
    if (room.clock) {
      room.clock.paused = room.disconnectGrace.size > 0;
      room.clock.lastTickMs = Date.now();
    }

    return room;
  }

  function touchClock(room: Room): void {
    if (!room.clock) return;
    const now = Date.now();
    const elapsed = Math.max(0, now - room.clock.lastTickMs);
    room.clock.lastTickMs = now;
    if (room.clock.paused) return;

    const active = room.clock.active;
    const next = Math.max(0, Number(room.clock.remainingMs[active] ?? 0) - elapsed);
    room.clock.remainingMs[active] = next;
  }

  function updateClockPause(room: Room): void {
    if (!room.clock) return;
    const shouldPause = room.disconnectGrace.size > 0;
    if (room.clock.paused === shouldPause) return;
    // Settle time up to the transition point.
    touchClock(room);
    room.clock.paused = shouldPause;
    room.clock.lastTickMs = Date.now();
  }

  function onTurnSwitch(room: Room, prevToMove: PlayerColor, nextToMove: PlayerColor): void {
    if (!room.clock) return;
    if (prevToMove === nextToMove) return;
    const inc = room.timeControl.mode === "clock" ? Number(room.timeControl.incrementMs ?? 0) : 0;
    if (inc > 0) {
      room.clock.remainingMs[prevToMove] = Number(room.clock.remainingMs[prevToMove] ?? 0) + inc;
    }
    room.clock.active = nextToMove;
    room.clock.lastTickMs = Date.now();
  }

  function isRoomOver(room: Room): boolean {
    return Boolean((room.state as any)?.forcedGameOver?.message);
  }

  function maybeApplyDamascaThreefold(room: Room): void {
    if (isRoomOver(room)) return;
    const rulesetId = (room.state as any)?.meta?.rulesetId ?? "lasca";
    if (rulesetId !== "damasca" && rulesetId !== "damasca_classic") return;

    const snap = room.history.exportSnapshots();
    const end = snap.currentIndex;
    if (end < 0 || end >= snap.states.length) return;

    const current = snap.states[end];
    const h = hashGameState(current as any);
    let count = 0;
    for (let i = 0; i <= end && i < snap.states.length; i++) {
      if (hashGameState(snap.states[i] as any) === h) count++;
    }
    if (count < 3) return;

    room.state = adjudicateDamascaDeadPlay(room.state as any, "DAMASCA_THREEFOLD_REPETITION", "threefold repetition");

    // Ensure history's current entry reflects the adjudicated state.
    const snap2 = room.history.exportSnapshots();
    if (snap2.states.length > 0 && snap2.currentIndex >= 0 && snap2.currentIndex < snap2.states.length) {
      snap2.states[snap2.currentIndex] = room.state as any;
      room.history.replaceAll(snap2.states as any, snap2.notation, snap2.currentIndex);
    }
  }

  async function forceDisconnectTimeout(args: { gamesDir: string; room: Room; disconnectedPlayerId: PlayerId }): Promise<void> {
    if (isShuttingDown) return;
    const { room, disconnectedPlayerId } = args;
    if (isRoomOver(room)) return;

    const disconnectedColor = room.players.get(disconnectedPlayerId);
    if (!disconnectedColor) return;
    const winner: PlayerColor = disconnectedColor === "W" ? "B" : "W";
    const winnerName = winner === "W" ? "White" : "Black";

    room.state = {
      ...(room.state as any),
      forcedGameOver: {
        winner,
        reasonCode: "DISCONNECT_TIMEOUT",
        message: `${winnerName} wins — disconnect timeout`,
      },
    };

    room.stateVersion += 1;
    try {
      await appendEvent(
        args.gamesDir,
        room.roomId,
        makeGameOverEvent({
          roomId: room.roomId,
          stateVersion: room.stateVersion,
          winner,
          reason: "DISCONNECT_TIMEOUT",
        })
      );
      await persistSnapshot(args.gamesDir, room);
    } catch (err) {
      // Persistence is best-effort; in tests the data dir may be deleted while the grace timer is running.
      // eslint-disable-next-line no-console
      console.error("[lasca-server] forceDisconnectTimeout persist error", err);
    }
    broadcastRoomSnapshot(room);
  }

  async function maybeForceClockTimeout(room: Room): Promise<void> {
    if (!room.clock) return;
    if (isRoomOver(room)) return;
    if (room.timeControl.mode !== "clock") return;

    const active = room.clock.active;
    const remaining = Number(room.clock.remainingMs[active] ?? 0);
    if (remaining > 0) return;

    const winner: PlayerColor = active === "W" ? "B" : "W";
    const winnerName = winner === "W" ? "White" : "Black";

    room.state = {
      ...(room.state as any),
      forcedGameOver: {
        winner,
        reasonCode: "TIMEOUT",
        message: `${winnerName} wins — time out`,
      },
    };

    room.stateVersion += 1;
    await appendEvent(
      gamesDir,
      room.roomId,
      makeGameOverEvent({
        roomId: room.roomId,
        stateVersion: room.stateVersion,
        winner,
        reason: "TIMEOUT",
      })
    );
    await queuePersist(room);
    broadcastRoomSnapshot(room);
  }

  async function startGraceIfNeeded(room: Room, playerId: PlayerId): Promise<void> {
    if (isShuttingDown) return;
    if (disconnectGraceMs <= 0) return;
    if (isRoomOver(room)) return;
    if (!room.players.has(playerId)) return;
    if (room.presence.get(playerId)?.connected) return;
    if (room.disconnectGrace.has(playerId)) return;

    const graceUntilMs = Date.now() + disconnectGraceMs;
    const graceUntilIso = new Date(graceUntilMs).toISOString();
    const timer = setTimeout(() => {
      if (isShuttingDown) return;
      // If still disconnected when grace expires, end the game.
      const p = room.presence.get(playerId);
      if (!p || p.connected) {
        clearGrace(room, playerId);
        return;
      }
      clearGrace(room, playerId);
      void queueRoomAction(room, () => forceDisconnectTimeout({ gamesDir, room, disconnectedPlayerId: playerId }));
    }, disconnectGraceMs);

    room.disconnectGrace.set(playerId, { graceUntilIso, graceUntilMs, timer });
    updateClockPause(room);
    // Persist grace start so it survives restart.
    await queuePersist(room);
    broadcastRoomSnapshot(room);
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

  // Server-Sent Events stream for realtime room snapshots.
  // Clients should keep this open and will receive `snapshot` events.
  app.get("/api/stream/:roomId", async (req, res) => {
    try {
      const roomId = req.params.roomId as RoomId;
      const room = await requireRoom(roomId);

      const playerId = typeof req.query.playerId === "string" ? (req.query.playerId as PlayerId) : null;
      if (playerId && room.players.has(playerId)) {
        await queueRoomAction(room, async () => {
          touchClock(room);
          await maybeForceClockTimeout(room);
          setPresence(room, playerId, { connected: true, lastSeenAt: nowIso() });
          clearGrace(room, playerId);
          updateClockPause(room);
          await persistSnapshot(gamesDir, room);
        });
      }

      res.status(200);
      res.setHeader("content-type", "text/event-stream");
      res.setHeader("cache-control", "no-cache, no-transform");
      res.setHeader("connection", "keep-alive");
      // Best-effort: some proxies buffer without this.
      res.setHeader("x-accel-buffering", "no");
      (res as any).flushHeaders?.();

      // Register client before sending initial snapshot so it also gets broadcasts immediately.
      const set = streamClients.get(roomId) ?? new Set<express.Response>();
      set.add(res);
      streamClients.set(roomId, set);

      if (playerId && room.players.has(playerId)) {
        addStreamPlayerClient(roomId, playerId, res);
      }

      // Initial snapshot so client can render immediately.
      streamWrite(res, "snapshot", {
        roomId,
        snapshot: snapshotForRoom(room),
        presence: presenceForRoom(room),
        timeControl: room.timeControl,
        clock: room.clock ?? undefined,
      });

      // Presence changed; notify other connected clients.
      if (playerId && room.players.has(playerId)) {
        broadcastRoomSnapshot(room);
      }

      // Heartbeat helps keep some intermediaries from closing idle connections.
      const heartbeat = setInterval(() => {
        try {
          res.write(`: keep-alive\n\n`);
        } catch {
          // ignore
        }
      }, 15_000);

      req.on("close", () => {
        clearInterval(heartbeat);
        const clients = streamClients.get(roomId);
        if (clients) {
          clients.delete(res);
          if (clients.size === 0) streamClients.delete(roomId);
        }

        if (isShuttingDown) return;

        if (playerId && room.players.has(playerId)) {
          removeStreamPlayerClient(roomId, playerId, res);

          // If another connection still exists for this player (e.g., another tab),
          // do NOT mark disconnected or start grace.
          if (isPlayerConnectedByAnyTransport(roomId, playerId)) return;

          void queueRoomAction(room, async () => {
            touchClock(room);
            await maybeForceClockTimeout(room);
            setPresence(room, playerId, { connected: false, lastSeenAt: nowIso() });
            await startGraceIfNeeded(room, playerId);
          });
        }
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Stream failed";
      res.status(400).json({ error: msg });
    }
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

      const timeControl: TimeControl = isValidTimeControl((body as any).timeControl) ? (body as any).timeControl : { mode: "none" };

      const preferredColor = (body as any)?.preferredColor;
      const creatorColor: PlayerColor = preferredColor === "B" || preferredColor === "W" ? preferredColor : "W";

      const room: Room = {
        roomId,
        state: aligned,
        history,
        players: new Map([[playerId, creatorColor]]),
        colorsTaken: new Set([creatorColor]),
        variantId,
        stateVersion: 0,
        rulesVersion: SUPPORTED_RULES_VERSION,
        lastGameOverVersion: -1,
        presence: new Map(),
        disconnectGrace: new Map(),
        timeControl,
        clock:
          timeControl.mode === "clock"
            ? {
                remainingMs: { W: timeControl.initialMs, B: timeControl.initialMs },
                active: (aligned as any).toMove === "B" ? "B" : "W",
                paused: false,
                lastTickMs: Date.now(),
              }
            : null,
        actionChain: Promise.resolve(),
        persistChain: Promise.resolve(),
      };
      setPresence(room, playerId, { connected: true, lastSeenAt: nowIso() });
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
        color: creatorColor,
        snapshot: snapshotForRoom(room),
        presence: presenceForRoom(room),
        timeControl: room.timeControl,
        clock: room.clock ?? undefined,
      };
      broadcastRoomSnapshot(room);
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
      const response = await queueRoomAction(room, async () => {
        touchClock(room);
        await maybeForceClockTimeout(room);

        const preferredColor = (body as any)?.preferredColor;
        let color: PlayerColor | null = null;
        if (preferredColor === "W" || preferredColor === "B") {
          // Enforce explicit seat choice.
          const taken = new Set<PlayerColor>(Array.from(room.players.values()));
          if (taken.has(preferredColor)) throw new Error("Color taken");
          color = preferredColor;
        } else {
          color = nextColor(room);
        }
        if (!color) throw new Error("Room full");

        const playerId: PlayerId = randId();
        room.players.set(playerId, color);
        room.colorsTaken.add(color);
        setPresence(room, playerId, { connected: true, lastSeenAt: nowIso() });
        clearGrace(room, playerId);
        updateClockPause(room);

        // Persist join as a snapshot-only update (no gameplay change).
        // This keeps reconnection (roomId+playerId) working across server restarts.
        await persistSnapshot(gamesDir, room);

        const resp: JoinRoomResponse = {
          roomId,
          playerId,
          color,
          snapshot: snapshotForRoom(room),
          presence: presenceForRoom(room),
          timeControl: room.timeControl,
          clock: room.clock ?? undefined,
        };
        broadcastRoomSnapshot(room);
        return resp;
      });

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
      touchClock(room);
      await maybeForceClockTimeout(room);
      updateClockPause(room);
      await room.persistChain;
      const response: GetRoomSnapshotResponse = {
        snapshot: snapshotForRoom(room),
        presence: presenceForRoom(room),
        timeControl: room.timeControl,
        clock: room.clock ?? undefined,
      };
      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Snapshot failed";
      const response: GetRoomSnapshotResponse = { error: msg };
      res.status(400).json(response);
    }
  });

  // Replay/event log fetch (post-game summary / replay viewer).
  // Returns the persisted JSONL event log as an array of objects.
  app.get("/api/room/:roomId/replay", async (req, res) => {
    try {
      const roomId = req.params.roomId as RoomId;
      const room = await requireRoom(roomId);

      // Ensure any in-flight persistence (e.g. recent moves) is flushed before reading.
      await room.persistChain;

      const limitRaw = typeof req.query.limit === "string" ? req.query.limit : "";
      const limit = Math.max(1, Math.min(10_000, Number.parseInt(limitRaw || "5000", 10) || 5000));

      const p = eventsPath(gamesDir, roomId);
      let raw = "";
      try {
        raw = await fs.readFile(p, "utf8");
      } catch {
        raw = "";
      }

      const lines = raw
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const sliced = lines.length > limit ? lines.slice(lines.length - limit) : lines;

      const events: ReplayEvent[] = [];
      for (const line of sliced) {
        try {
          events.push(JSON.parse(line) as any);
        } catch {
          // ignore malformed log lines
        }
      }

      const response: GetReplayResponse = { events };
      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Replay failed";
      const response: GetReplayResponse = { error: msg };
      res.status(400).json(response);
    }
  });

  app.post("/api/submitMove", async (req, res) => {
    try {
      const body = req.body as SubmitMoveRequest;
      const room = await requireRoom(body.roomId);
      const response = await queueRoomAction(room, async () => {
        touchClock(room);
        await maybeForceClockTimeout(room);

        const expected = parseExpectedVersion((body as any).expectedStateVersion);
        if (expected != null && expected !== room.stateVersion) {
          throw new Error(`Stale request (expected v${expected}, current v${room.stateVersion})`);
        }

        const color = requirePlayer(room, body.playerId);
        setPresence(room, body.playerId, { connected: true, lastSeenAt: nowIso() });

        if (isRoomOver(room)) throw new Error("Game over");

        if (room.state.toMove !== color) throw new Error(`Not your turn (toMove=${room.state.toMove}, you=${color})`);

        const move = body.move as Move;
        if (!move || typeof (move as any).from !== "string" || typeof (move as any).to !== "string") {
          throw new Error("Invalid move");
        }

        const prevToMove = (room.state as any).toMove as PlayerColor;
        const next = applyMove(room.state as any, move as any) as any;
        room.state = next;

        // Record history for every applied move so capture-chain steps are visible in the UI.
        const boardSize = Number((next as any)?.meta?.boardSize ?? 7);
        const from = nodeIdToA1(move.from, boardSize);
        const to = nodeIdToA1(move.to, boardSize);
        const sep = move.kind === "capture" ? " × " : " → ";
        const notation = `${from}${sep}${to}`;
        room.history.push(room.state, notation);

        // Damasca: adjudicate and end on threefold repetition.
        maybeApplyDamascaThreefold(room);

        const nextToMove = (room.state as any).toMove as PlayerColor;
        onTurnSwitch(room, prevToMove, nextToMove);

        room.stateVersion += 1;
        await persistMoveApplied({ gamesDir, room, action: "SUBMIT_MOVE", move, snapshotEvery });
        await maybePersistGameOver(gamesDir, room);

        const resp: SubmitMoveResponse = {
          snapshot: snapshotForRoom(room),
          didPromote: Boolean(next.didPromote) || undefined,
          presence: presenceForRoom(room),
          timeControl: room.timeControl,
          clock: room.clock ?? undefined,
        };
        broadcastRoomSnapshot(room);
        return resp;
      });

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
      const response = await queueRoomAction(room, async () => {
        touchClock(room);
        await maybeForceClockTimeout(room);

        const expected = parseExpectedVersion((body as any).expectedStateVersion);
        if (expected != null && expected !== room.stateVersion) {
          throw new Error(`Stale request (expected v${expected}, current v${room.stateVersion})`);
        }

        const color = requirePlayer(room, body.playerId);
        setPresence(room, body.playerId, { connected: true, lastSeenAt: nowIso() });

        if (isRoomOver(room)) throw new Error("Game over");

        if (room.state.toMove !== color) throw new Error(`Not your turn (toMove=${room.state.toMove}, you=${color})`);

        let next: any;
        if (body.rulesetId === "dama") {
          next = finalizeDamaCaptureChain(room.state as any, body.landing, new Set(body.jumpedSquares));
        } else {
          next = finalizeDamascaCaptureChain(room.state as any, body.landing);
        }

        const prevToMove = (room.state as any).toMove as PlayerColor;
        room.state = next;
        // Turn does not switch here; client will call /api/endTurn when the capture turn ends.

        const nextToMove = (room.state as any).toMove as PlayerColor;
        onTurnSwitch(room, prevToMove, nextToMove);

        room.stateVersion += 1;
        await persistMoveApplied({ gamesDir, room, action: "FINALIZE_CAPTURE_CHAIN", snapshotEvery });
        await maybePersistGameOver(gamesDir, room);

        const resp: FinalizeCaptureChainResponse = {
          snapshot: snapshotForRoom(room),
          didPromote: Boolean(next.didPromote) || undefined,
          presence: presenceForRoom(room),
          timeControl: room.timeControl,
          clock: room.clock ?? undefined,
        };
        broadcastRoomSnapshot(room);
        return resp;
      });

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
      const response = await queueRoomAction(room, async () => {
        touchClock(room);
        await maybeForceClockTimeout(room);

        const expected = parseExpectedVersion((body as any).expectedStateVersion);
        if (expected != null && expected !== room.stateVersion) {
          throw new Error(`Stale request (expected v${expected}, current v${room.stateVersion})`);
        }

        const color = requirePlayer(room, body.playerId);
        setPresence(room, body.playerId, { connected: true, lastSeenAt: nowIso() });

        if (isRoomOver(room)) throw new Error("Game over");

        if (room.state.toMove !== color) throw new Error(`Not your turn (toMove=${room.state.toMove}, you=${color})`);

        const prevToMove = (room.state as any).toMove as PlayerColor;
        room.state = endTurn(room.state as any);

        const nextToMove = (room.state as any).toMove as PlayerColor;
        onTurnSwitch(room, prevToMove, nextToMove);

        // END_TURN is not a move by itself. The move/capture steps were already recorded via /api/submitMove.
        // We still need history's *current* entry to reflect the authoritative state (esp. toMove),
        // otherwise the UI can highlight the wrong row.
        const notation = typeof (body as any).notation === "string" ? (body as any).notation : undefined;
        const snap = room.history.exportSnapshots();
        if (snap.states.length === 0) {
          room.history.push(room.state as any, notation);
        } else {
          snap.states[snap.states.length - 1] = room.state as any;
          if (typeof notation === "string") {
            snap.notation[snap.notation.length - 1] = notation;
          }
          room.history.replaceAll(snap.states as any, snap.notation, snap.states.length - 1);
        }

        // Damasca: adjudicate and end on threefold repetition.
        maybeApplyDamascaThreefold(room);

        room.stateVersion += 1;
        await persistMoveApplied({ gamesDir, room, action: "END_TURN", snapshotEvery });
        await maybePersistGameOver(gamesDir, room);

        const resp: EndTurnResponse = {
          snapshot: snapshotForRoom(room),
          presence: presenceForRoom(room),
          timeControl: room.timeControl,
          clock: room.clock ?? undefined,
        };
        broadcastRoomSnapshot(room);
        return resp;
      });

      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "End turn failed";
      // eslint-disable-next-line no-console
      console.error("[lasca-server] endTurn error", msg);
      const response: EndTurnResponse = { error: msg };
      res.status(400).json(response);
    }
  });

  app.post("/api/resign", async (req, res) => {
    try {
      const body = req.body as ResignRequest;
      const room = await requireRoom(body.roomId);
      const response = await queueRoomAction(room, async () => {
        touchClock(room);
        await maybeForceClockTimeout(room);

        const expected = parseExpectedVersion((body as any).expectedStateVersion);
        if (expected != null && expected !== room.stateVersion) {
          throw new Error(`Stale request (expected v${expected}, current v${room.stateVersion})`);
        }

        const color = requirePlayer(room, body.playerId);
        setPresence(room, body.playerId, { connected: true, lastSeenAt: nowIso() });

        if (isRoomOver(room)) throw new Error("Game over");

        const winner: PlayerColor = color === "W" ? "B" : "W";
        const winnerName = winner === "W" ? "White" : "Black";
        const loserName = color === "W" ? "White" : "Black";

        room.state = {
          ...(room.state as any),
          forcedGameOver: {
            winner,
            reasonCode: "RESIGN",
            message: `${loserName} resigned — ${winnerName} wins!`,
          },
        };

        room.stateVersion += 1;
        room.lastGameOverVersion = room.stateVersion;
        await appendEvent(
          gamesDir,
          room.roomId,
          makeGameOverEvent({
            roomId: room.roomId,
            stateVersion: room.stateVersion,
            winner,
            reason: "RESIGN",
          })
        );
        await persistSnapshot(gamesDir, room);

        const resp: ResignResponse = {
          snapshot: snapshotForRoom(room),
          presence: presenceForRoom(room),
          timeControl: room.timeControl,
          clock: room.clock ?? undefined,
        };
        broadcastRoomSnapshot(room);
        return resp;
      });

      res.json(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Resign failed";
      // eslint-disable-next-line no-console
      console.error("[lasca-server] resign error", msg);
      const response: ResignResponse = { error: msg };
      res.status(400).json(response);
    }
  });

  async function shutdown(): Promise<void> {
    isShuttingDown = true;

    if (wsHeartbeat) {
      clearInterval(wsHeartbeat);
      wsHeartbeat = null;
    }

    if (wss) {
      try {
        wss.close();
      } catch {
        // ignore
      }
      wss = null;
    }

    // Best-effort cleanup: stop grace timers so they don't fire after teardown.
    for (const room of rooms.values()) {
      for (const g of room.disconnectGrace.values()) {
        clearTimeout(g.timer);
      }
      room.disconnectGrace.clear();
    }

    // Wait for any queued persistence to finish.
    await Promise.all(Array.from(rooms.values()).map((r) => r.persistChain.catch(() => undefined)));
  }

  return { app, rooms, gamesDir, attachWebSockets, shutdown };
}

export async function startLascaServer(args: {
  port?: number;
  gamesDir?: string;
  snapshotEvery?: number;
  disconnectGraceMs?: number;
}): Promise<{
  app: express.Express;
  server: Server;
  url: string;
  gamesDir: string;
}> {
  const { app, gamesDir, attachWebSockets, shutdown } = createLascaApp({
    gamesDir: args.gamesDir,
    snapshotEvery: args.snapshotEvery,
    disconnectGraceMs: args.disconnectGraceMs,
  });
  await ensureGamesDir(gamesDir);

  const port = Number.isFinite(args.port as any) ? Number(args.port) : 8787;

  // Use an explicit HTTP server so WebSockets can attach cleanly.
  const server = createServer(app);
  attachWebSockets(server);
  server.listen(port);

  // Ensure teardown disables grace/persistence side effects.
  const originalClose = server.close.bind(server);
  (server as any).close = (cb?: any) => {
    void (async () => {
      await shutdown();
      originalClose(cb);
    })();
    return server;
  };

  await new Promise<void>((resolve) => {
    server.once("listening", () => resolve());
  });

  const actualPort = (server.address() as any)?.port ?? port;
  return { app, server, url: `http://localhost:${actualPort}`, gamesDir };
}
