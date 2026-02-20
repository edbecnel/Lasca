# Offline Chess Bot Checklist (Classic Chess)

Goal: add an **offline-only** chess bot for **Classic Chess** using **Stockfish (UCI)** with a simple UI:

- Beginner
- Intermediate
- Strong

Internally each label has **10 sublevels (0–9)**. The user only chooses the label; the bot adapts **within** that label based on completed game results.

## Stage 0 — Decisions (locked in)

- [x] Offline-only (no online service)
- [x] Engine backend can be either:
  - in-browser Stockfish (Worker + WASM)
  - optional local HTTP Stockfish server (`stockfish-server/`) via `VITE_STOCKFISH_SERVER_URL`
- [x] UI exposes **labels only** (Beginner / Intermediate / Strong)
- [x] Strength controlled by:
  - Stockfish `Skill Level` (0–20)
  - Per-move time budget via `go movetime <ms>`
- [x] Adaptive difficulty:
  - Store `subFloat` (0..9, continuous)
  - Store `applied` (0..9, integer)
  - Hysteresis to avoid oscillation
- [x] Engine abstraction boundary:
  - `UciEngine` interface lives in `src/bot/uciEngine.ts`
  - `ChessBotManager` depends only on the interface (engine is injected via a factory)
  - Stockfish lives behind an adapter (`src/bot/stockfishEngine.ts`)

## Stage 1 — Preset table (Label × Sublevel → engine params)

- [x] Add preset table to code (`skill`, `movetimeMs`) (`src/bot/presets.ts`)
- [x] Add a helper to clamp sublevel to `0..9` (`clampSublevel`)

## Stage 2 — Adaptive update rules

- [x] Implement update math:
  - `TARGET_SCORE = 0.45`
  - beginner `K = 0.90`, intermediate `K = 0.80`, strong `K = 0.70`
  - `subFloat = clamp(subFloat + K * (score - TARGET_SCORE), 0, 9)`
- [x] Meaningful-game filter:
  - `plyCount >= 24`
  - ended normally (checkmate/stalemate/resign)
- [x] Hysteresis:
  - `DEADBAND = 0.35` → step threshold `0.65`
  - at most one applied step per game
- [x] Persist adaptation per-tier in `localStorage`

## Stage 3 — Integration (offline)

- [x] Add Stockfish dependency (bundled for offline use)
- [x] Implement UCI wrapper:
  - set `Skill Level`
  - `position fen ...`
  - `go movetime ...`
  - parse `bestmove`
- [x] Convert app state ⇄ engine:
  - `GameState` → FEN
  - UCI move (e2e4) → internal `Move`
- [x] Add Chess UI controls:
  - Choose per-side: Human / Beginner / Intermediate / Strong
  - Hide/disable bot controls in online mode
- [x] Add game-end hook to update adaptation
- [x] Add unit tests for:
  - FEN conversion (starting position)
  - adaptive update + hysteresis

## Nice-to-haves

- [x] “Reset learning” button (per tier or all tiers)
- [x] Clear status text when engine is thinking
- [x] Safeguards for engine timeouts / failures
- [x] Optional local Stockfish server fallback path
