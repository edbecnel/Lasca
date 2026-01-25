# Multiplayer Online Checklist (Living)

Last reviewed: 2026-01-25

This document tracks the current multiplayer implementation status for Lasca / Dama / Damasca online 2‑player play.

Guiding principles

- Server is authoritative: the client renders whatever the server broadcasts.
- State updates are versioned via a monotonic `stateVersion`.
- Realtime transport: WebSockets preferred; SSE supported as fallback.
- Persistence: snapshot + append-only event log (JSONL) to survive server restarts.

Quick links (implementation)

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

- [ ] **Opponent presence indicator UI**
  - Server already sends `presence` and grace info; expose it in the Online panel.
  - Show “Opponent: Connected / Disconnected (grace until …)” and optionally a small dot indicator.
- [ ] **Replay viewer / post-game summary (from JSONL)**
  - Add a server endpoint to fetch the room event log (or a summarized replay payload).
  - Build a simple UI: list moves + allow stepping through snapshots.

### MP3 — Lobby / Matchmaking

- [ ] Basic lobby list of open rooms
- [ ] Matchmaking queue (optional)
- [ ] Productized spectator UX (explicit mode)

---

## Status legend

- [x] Implemented
- [~] Partial / present but incomplete
- [ ] Not started

---

## MP1 — Core Multiplayer Foundation

- [x] Server-authoritative game rooms (`roomId`)
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
- [~] Client detects gaps (missed versions) and requests RESYNC
  - Client tracks `lastStateVersion`, but does not explicitly detect gaps and force resync.
  - Current behavior relies on full snapshots (so a single message is sufficient to catch up).
- [x] RESYNC returns latest full authoritative state
  - Implemented as `GET /api/room/:roomId` (no dedicated `/api/resync` route).
- [x] Persistence of game state (snapshots)
  - Snapshot file: `<roomId>.snapshot.json` written periodically (`snapshotEvery`).
- [x] Event log / replay (append-only log of applied actions)
  - Event log: `<roomId>.events.jsonl`.
  - Contains `MOVE_APPLIED` events and `GAME_CREATED` and `GAME_OVER` metadata.
- [x] Server can rebuild game state by replaying snapshot + event log
  - `tryLoadRoom()` reconstructs the room.
- [~] Deterministic rules engine requirement documented/tested
  - Replay safety is enforced via `SUPPORTED_RULES_VERSION` and tested via restart/persistence tests.
  - Explicit “determinism contract” is not yet documented.
  - Determinism contract (server + client): The shared rules engine must be strictly deterministic. Given the same starting snapshot and the same ordered sequence of MOVE INTENT inputs, the server must always produce the exact same resulting snapshots (including stateVersion progression and any derived fields). No rule or state transition may depend on client time, local randomness, iteration-order side effects, or any non-deterministic data source; any timestamps or IDs used for clocks/logging must be server-supplied and never influence legal-move generation or applyMove outcomes.
- [~] Basic anti-cheat: reject illegal moves, wrong-turn moves, stale intents
  - Illegal/invalid moves and wrong-turn moves are rejected server-side.
  - Stale-intent / concurrency control (CAS on `stateVersion`) implemented via `expectedStateVersion`.

Regression/tests to keep green

- `src/onlineStream.test.ts` (SSE broadcast)
- `src/onlineWebSocket.test.ts` (WS broadcast)
- `src/persistenceRestart.test.ts` (restart persistence)

---

## MP1.5 — Real-time Push Transport (no polling)

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

Regression/tests to keep green

- `src/presence.test.ts`
- `src/disconnectTimeout.test.ts`
- `src/graceRestoreRestart.test.ts`

### MP2B — Server-owned Clocks (Time Controls)

- [x] `timeControl` immutable per game (set at creation)
- [x] Server is source of truth for remaining time
- [x] Clock updates tied to authoritative turns + server timestamps
- [x] On each move apply: decrement mover’s clock by elapsed time
- [x] Timeout forces game over (`reasonCode=TIMEOUT`)
- [x] Persist clock state + `lastTickMs`; restart-safe
- [x] Handle reconnect/resubscribe without clock desync

Regression/tests to keep green

- `src/clockTimeout.test.ts`
- `src/clockPauseDuringGrace.test.ts`

---

## MP3 — Matchmaking & Lobby

- [ ] Public lobby list of open games (optional)
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
- [ ] Profile basics
- [ ] Prevent multi-session confusion (one user controlling two seats)

---

## MP5 — Ratings / Ranking

- [ ] Rating system (Elo/Glicko)
- [ ] Rated vs casual
- [ ] Record results with reason codes
- [ ] Update rating on game end
- [ ] Match history / leaderboard

---

## MP6 — Game Lifecycle Hardening

- [ ] Idempotent endpoints
- [x] Concurrency control (CAS/locking on `stateVersion`)
- [x] Server restart recovery (load from snapshot/log)
- [~] Observability
  - Basic request logging exists; not structured/complete.
- [ ] Abuse limits (rate limiting)

---

## MP7 — UX / Product Polish (Online)

- [x] “Connecting / Reconnecting” UI states
  - Controller shows “Reconnecting…” and suppresses turn-toasts while reconnecting.
- [ ] Opponent presence indicator
  - Presence is computed/sent by server, but UI doesn’t yet present an explicit opponent status widget.
- [x] Latency-safe move UX (authoritative settle)
- [ ] Post-game summary + replay viewer from event log
- [~] Report issue / copy debug info
  - Room ID copy exists; no consolidated “copy debug blob” yet.

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
