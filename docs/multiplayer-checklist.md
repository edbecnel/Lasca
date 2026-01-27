# Multiplayer Online Checklist (Living)

Last reviewed: 2026-01-27

This document tracks the current multiplayer implementation status for Lasca / Dama / Damasca online 2‑player play.

## Guiding principles

- Server is authoritative: the client renders whatever the server broadcasts.
- State updates are versioned via a monotonic `stateVersion`.
- Realtime transport: WebSockets preferred; SSE supported as fallback (plus snapshot polling fallback if push transports are unavailable).
- Persistence: snapshot + append-only event log (JSONL) to survive server restarts.

## Quick links (implementation)

- Server: `server/src/app.ts`
- Persistence: `server/src/persistence.ts`
- Online protocol types: `src/shared/onlineProtocol.ts`
- Online driver: `src/driver/remoteDriver.ts`

---

## Up Next (Highest Leverage)

If you’re not sure what to tackle next, MP6 hardening is usually the best safety step.

### MP6 / MP1 — Hardening: Versioning, Resync, Concurrency

- [x] **Gap detection + explicit RESYNC** (client)
  - Detect gaps on incoming snapshots: if `incomingVersion > lastSeenVersion + 1`, immediately resync via `GET /api/room/:roomId`.
  - Treat `incomingVersion <= lastSeenVersion` as a duplicate/out-of-order message (ignore).
  - Implemented in `RemoteDriver.applySnapshot()`.
- [x] **Stale-intent + concurrency control (CAS on stateVersion)** (server)
  - `expectedStateVersion` supported by the client and enforced by the server for move-like requests.
  - Server rejects if `expectedStateVersion !== room.stateVersion` (client should then resync).
  - Per-room action queue serializes mutations (prevents double-applies under concurrent POSTs).

### MP1.5 — Backpressure / Burst Strategy

- [x] **Drop-to-resync strategy** (recommended)
  - If the client is flooded or detects out-of-order delivery, it can stop applying intermediate snapshots and simply resync once.
  - Prefer this over maintaining a deep client-side queue since the server already emits full snapshots.
  - Implemented in `RemoteDriver.enqueueRealtimeSnapshot()`.

### MP7 — Online UX

- [x] **Opponent presence indicator UI**
  - Exposes server `presence` + grace info in the Online panel.
  - Shows “Opponent: Connected / Disconnected (grace until …)”.
  - UI: `#onlineOpponentStatus` in the game HTML; render logic in `GameController.updatePanel()`.
- [x] **Replay viewer / post-game summary (from JSONL)**
  - Server endpoint: `GET /api/room/:roomId/replay`.
  - UI: Online panel “Replay → Open” overlay with prev/next stepping through snapshots.
- [x] **Room-ready gating (no play until both seats filled)**
  - Client blocks local input until an opponent is seated.
  - Server rejects move-like endpoints until `room.players.size >= 2`.
  - Guard lives in `server/src/app.ts` (`requireRoomReady`).
- [x] **Waiting-for-opponent onboarding toast (tap-to-copy invite link)**
  - Sticky toast appears for newly created rooms while waiting.
  - Tap copies an invite link (join URL) to clipboard.

### MP3 — Lobby / Matchmaking

- [x] Admin deletion safety: lobby refresh no longer shows rooms whose persisted folder/snapshot was deleted.
  - Server drops stale in-memory rooms when the snapshot on disk is missing.
  - See `server/src/app.ts`; test coverage: `src/onlineLobby.test.ts`.
- [~] Basic lobby list of open rooms
  - Server endpoint: `GET /api/lobby`.
  - Lists joinable rooms active in memory (freshest) and also joinable rooms persisted on disk but not currently loaded (restart discoverability).
  - UI: Start Page “Lobby” panel (Refresh + quick-fill Join).
- [ ] Matchmaking queue (optional)
- [ ] Productized spectator UX (explicit mode)

---

## Status legend

- [x] Implemented
- [~] Partial / present but incomplete
- [ ] Not started

---

## MP1 — Core Multiplayer Foundation (or Notes / Decisions)

- [x] Server-authoritative game rooms (`roomId/gameId`)
  - Rooms are loaded on-demand and persisted under `server/data/games/<roomId>/`.
- [x] Create game endpoint (new game, initial state)
  - `POST /api/create`
- [x] Join game endpoint (returns current state + player assignment)
  - `POST /api/join` (supports `preferredColor`; rejects taken color)
- [x] Client sends MOVE INTENT only (not direct state mutation)
  - Client uses `RemoteDriver` methods; server returns authoritative snapshot.
- [x] Server validates move intent using shared rules engine
  - Uses shared rules functions (e.g. `applyMove`, `endTurn`, capture chain finalizers).
- [x] Server applies move, emits authoritative next state
  - Broadcasts a full `snapshot` payload to connected clients.
- [x] `stateVersion` (monotonic) included in every state update
  - Included on `WireSnapshot` (`snapshot.stateVersion`).
- [x] Client detects gaps (missed versions) and requests RESYNC
  - Detects version gaps and forces resync via `GET /api/room/:roomId`.
- [x] RESYNC returns latest full authoritative state
  - Implemented as `GET /api/room/:roomId` (no dedicated `/api/resync` route).
- [x] Persistence of game state (snapshots)
  - Snapshot file: `<roomId>.snapshot.json` written periodically (`snapshotEvery`).
- [x] Event log / replay (append-only log of applied actions)
  - Event log: `<roomId>.events.jsonl`.
  - Contains `MOVE_APPLIED` events and `GAME_CREATED` and `GAME_OVER` metadata.
- [x] Server can rebuild game state by replaying snapshot + event log
  - `tryLoadRoom()` reconstructs the room.
- [x] Deterministic rules engine requirement documented/tested
  - Replay safety is enforced via `SUPPORTED_RULES_VERSION` and tested via restart/persistence tests.
  - Determinism contract (server + client): The shared rules engine must be strictly deterministic. Given the same starting snapshot and the same ordered sequence of MOVE INTENT inputs, the server must always produce the exact same resulting snapshots (including stateVersion progression and any derived fields). No rule or state transition may depend on client time, local randomness, iteration-order side effects, or any non-deterministic data source; any timestamps or IDs used for clocks/logging must be server-supplied and never influence legal-move generation or applyMove outcomes.
- [~] Basic anti-cheat: reject illegal moves, wrong-turn moves, stale intents
  - Illegal/invalid moves and wrong-turn moves are rejected server-side.
  - Stale-intent / concurrency control (CAS on `stateVersion`) implemented via `expectedStateVersion`.
- Online rules: creator-lock for “threefold repetition draw”:
  rule flag is sent/persisted by server; clients remove the in-game toggle for online games.
  See src/shared/onlineProtocol.ts, server/src/persistence.ts, and entrypoints like src/main.ts.

Regression/tests to keep green

- `src/onlineStream.test.ts` (SSE broadcast)
- `src/onlineWebSocket.test.ts` (WS broadcast)
- `src/persistenceRestart.test.ts` (restart persistence)

---

## MP1.5 — Real-time Push Transport (no polling)

Note: although realtime push is WS/SSE, the client/controller also supports a snapshot polling fallback for environments where those transports are blocked.

- [x] Implement push updates
  - WebSockets: `GET /api/ws` (WS path; client sends `{"type":"JOIN"}`)
  - SSE: `GET /api/stream/:roomId`
- [x] Server broadcasts state updates to both players in room
  - Broadcasts `snapshot` events to all connected SSE/WS clients.
- [x] Client subscribes to room updates; updates UI immediately
  - `RemoteDriver.startRealtime()`.
- [x] Handle reconnect: client resubscribes and requests RESYNC if needed
  - WS reconnect loop implemented; SSE is auto-reconnecting.
  - No explicit server-side “diff since version” resync; client can always `GET /api/room/:roomId`.
- [x] Backpressure / burst handling (queue or drop-to-resync)
  - Client coalesces realtime snapshots and uses a drop-to-resync fallback on bursts.
  - Tests: `src/onlineGapResync.test.ts`.
- [x] Heartbeats/pings to detect dead connections
  - WS ping/pong heartbeat; SSE keep-alive comments.

---

## MP2 — Robust Sessions & Time (Server-owned)

### MP2A — Disconnect Handling (no undo/takebacks)

- [x] Presence tracking per player (connected/disconnected + `lastSeenAt`)
- [x] Grace timer default = 120s after disconnect
- [x] Clocks pause during disconnect grace (if clocks enabled)
- [x] Grace expiry forces game over (`reasonCode=DISCONNECT_TIMEOUT`)
- [x] Persist disconnect/grace state so it survives server restart
- [x] Restore correctly after restart and on reconnect
- Presence/grace reliability: fixed mutual-disconnect “stuck” edge case by counting polling as presence activity.
  See server/src/app.ts; regression: src/disconnectTimeout.test.ts.
- Server now blocks move submissions while opponent is disconnected (grace active) and exposes grace deadline for UI messaging.
  See server/src/app.ts; regression: src/disconnectTimeout.test.ts.

Regression/tests to keep green

- `src/presence.test.ts`
- `src/disconnectTimeout.test.ts`
- `src/graceRestoreRestart.test.ts`

### MP2B — Server-owned Clocks (Time Controls)

- [x] `timeControl` immutable per game (set at creation)
- [x] Server is source of truth for remaining time
- [x] Clock updates tied to authoritative turns + server timestamps
- [x] On each move apply: decrement mover’s clock by elapsed time
- [x] Timeout condition => GAME_OVER reason=TIMEOUT
- [x] Persist clock state + `lastTickMs`; replay-safe
- [x] Handle reconnect/resubscribe without clock desync

Regression/tests to keep green

- `src/clockTimeout.test.ts`
- `src/clockPauseDuringGrace.test.ts`

---

## MP3 — Matchmaking & Lobby

- [~] Public lobby list of open games (optional)
  - `GET /api/lobby` lists joinable rooms active in memory and joinable rooms persisted on disk but not currently loaded.
- [ ] Random matchmaking queue
- [x] Private invite links / friend match
  - Start Page supports Create/Join and shares `roomId`.
- [x] Prevent double-join / enforce one seat per side
  - Seat enforcement via `preferredColor` and “room full” behavior.
- [~] Spectator mode (optional)
  - Transport supports observer connections (no `playerId`), but no explicit spectator UX / permissions model.

---

## MP4 — Accounts & Identity

- [ ] User registration/login (email or OAuth)
- [ ] Guest play with upgrade path
- [ ] Profile basics: display name, avatar (optional)
- [ ] Prevent multi-session confusion (one user controlling two seats)

---

## MP5 — Ratings / Ranking

- [ ] Rating system (Elo/Glicko) and implement
- [ ] Rated vs casual games flag at creation
- [ ] Record results with reason codes (RESIGN, TIMEOUT, DISCONNECT, ADJUDICATED, DRAW)
- [ ] Update rating on game end (rated only)
- [ ] Store match history; basic leaderboard

---

## MP6 — Game Lifecycle Hardening

- [ ] Idempotent endpoints (repeat requests safe)
- [x] Concurrency: prevent double-move apply (locks / compare-and-swap on stateVersion)
- [x] Server restart recovery: rebuild active games from DB/log
- [~] Observability: logs for intents, validation failures, disconnects
  - Basic request logging exists; not structured/complete.
- [ ] Abuse limits: rate limiting, per-IP or per-user throttles

---

## MP7 — UX / Product Polish (Online)

- [x] “Connecting / Reconnecting” UI states
  - Controller shows “Reconnecting…” in status and also emits toast notifications for Connecting/Reconnecting/Reconnected.
- [x] Opponent presence indicator
  - Online panel shows “Opponent: Connected/Disconnected (grace until …)” and emits toasts for disconnect/leave/rejoin.
  - On-board presence badge (beneath turn indicator) shows opponent online/grace/offline.
- [x] Latency-safe move UX (authoritative settle)
- [x] Post-game summary + replay viewer from event log
- [x] Report issue / copy debug info
  - Online panel ⓘ generates debug JSON, copies it to clipboard, and POSTs it to the server for per-room logging.
  - Server persists under `server/data/games/<roomId>/debug/debug.<n>.json`.
- UX: sticky reconnect + opponent-status detail toasts; status icon is clickable.
  See `src/controller/gameController.ts` and `src/render/opponentPresenceIndicator.ts`.

---

## Notes / Decisions to lock in (current reality)

- [x] Transport choice: WebSockets primary, SSE fallback
- [x] Event log schema: applied-snapshot per event (MOVE_APPLIED carries snapshot)
- [x] Snapshot frequency: every N versions (default `snapshotEvery=20`)
- [ ] Security model: authentication requirements (especially for rated games)

---

## How to keep this updated (workflow)

When a multiplayer-related commit lands:

1. Update the relevant checkbox(es) above.
2. Add a short bullet under the section with:
   - What changed (endpoint/behavior)
   - Where it lives (`server/src/...` / `src/...`)
   - Any new/updated test file
3. If behavior changed in a way that impacts clients, bump and document `SUPPORTED_RULES_VERSION` handling as needed.
