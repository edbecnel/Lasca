# Lasca Stockfish Server (local)

Runs Stockfish as a local HTTP service so the Lasca web app can request moves without relying on in-browser WASM workers.

## Start

From the repo root:

- `npm --prefix stockfish-server start`

It listens on `http://127.0.0.1:8799` by default.

### Configure

- `PORT=8799` to change port
- `HOST=127.0.0.1` to change bind address (use `0.0.0.0` to allow LAN devices)
- `STOCKFISH_ENGINE_JS=...` to override the engine JS file

## API

- `GET /health` → status JSON
- `POST /bestmove` with JSON `{ "fen": string, "movetimeMs": number, "skill"?: number, "timeoutMs"?: number }`
  - returns `{ ok: true, uci: "e2e4" }`

## Wire the web app

Option A: use the convenience script (recommended):

- `npm run bot:dev`

If you're using LAN dev (`vite --host 0.0.0.0`) and playing from another device, use the LAN IP instead of 127.0.0.1:

- PowerShell: `$env:HOST='0.0.0.0'; npm run stockfish:server`
- PowerShell: `$env:VITE_STOCKFISH_SERVER_URL='http://<your-pc-ip>:8799'; npm run online:client:lan`

Option B: run in two terminals:

Terminal 1:

- `npm --prefix stockfish-server start`

Terminal 2:

- `npm run dev` with `VITE_STOCKFISH_SERVER_URL` set.

On Windows PowerShell you can do:

- `$env:VITE_STOCKFISH_SERVER_URL='http://127.0.0.1:8799'; npm run dev`

On Windows cmd.exe:

- `set VITE_STOCKFISH_SERVER_URL=http://127.0.0.1:8799 && npm run dev`

### LAN note

If you want to use the bot from another device on your LAN:

- start the server with `HOST=0.0.0.0`
- set `VITE_STOCKFISH_SERVER_URL` to your PC's LAN IP (e.g. `http://192.168.1.50:8799`)

`http://127.0.0.1:8799` only works when the browser is running on the same machine as the server.

Then the chess bot will prefer the local server. If unreachable, it falls back to built-in heuristic moves.
