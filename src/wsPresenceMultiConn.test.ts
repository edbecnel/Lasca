// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { startLascaServer } from "../server/src/app.ts";
import { createInitialGameStateForVariant } from "./game/state.ts";
import { HistoryManager } from "./game/historyManager.ts";
import { serializeWireGameState, serializeWireHistory } from "./shared/wireState.ts";

function toWsUrl(httpUrl: string): string {
  const u = new URL(httpUrl);
  if (u.protocol === "https:") u.protocol = "wss:";
  else u.protocol = "ws:";
  u.pathname = `${u.pathname.replace(/\/$/, "")}/api/ws`;
  u.search = "";
  return u.toString();
}

async function openWsRoom(args: { serverHttpUrl: string; roomId: string; playerId?: string }): Promise<{ close: () => Promise<void> }> {
  const wsUrl = toWsUrl(args.serverHttpUrl);

  // Node 20+ provides a global WebSocket.
  const WS = (globalThis as any).WebSocket as undefined | (new (url: string) => WebSocket);
  if (!WS) throw new Error("Missing global WebSocket in test environment");

  const ws = new WS(wsUrl);

  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true } as any);
    ws.addEventListener("error", () => reject(new Error("WS error")), { once: true } as any);
  });

  ws.send(
    JSON.stringify({
      type: "JOIN",
      roomId: args.roomId,
      ...(args.playerId ? { playerId: args.playerId } : {}),
      lastSeenVersion: -1,
    })
  );

  return {
    close: async () => {
      const closed = new Promise<void>((resolve) => ws.addEventListener("close", () => resolve(), { once: true } as any));
      try {
        ws.close();
      } catch {
        // ignore
      }
      await closed;
    },
  };
}

async function rmWithRetries(p: string): Promise<void> {
  for (let i = 0; i < 6; i++) {
    try {
      await fs.rm(p, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 25 * (i + 1)));
    }
  }
  await fs.rm(p, { recursive: true, force: true });
}

describe("MP2A presence (WebSockets)", () => {
  it("does not mark player disconnected while another socket is still open", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lasca-ws-presence-"));
    const gamesDir = path.join(tmpRoot, "games");

    const graceMs = 60;
    const s = await startLascaServer({ port: 0, gamesDir, disconnectGraceMs: graceMs });

    const initial = createInitialGameStateForVariant("lasca_7_classic" as any);
    const history = new HistoryManager();
    history.push(initial);

    const createRes = await fetch(`${s.url}/api/create`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        variantId: "lasca_7_classic",
        snapshot: {
          state: serializeWireGameState(initial),
          history: serializeWireHistory(history.exportSnapshots()),
          stateVersion: 0,
        },
      }),
    }).then((r) => r.json() as Promise<any>);

    expect(createRes.error).toBeUndefined();
    const roomId = createRes.roomId as string;

    const joinRes = await fetch(`${s.url}/api/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomId }),
    }).then((r) => r.json() as Promise<any>);

    expect(joinRes.error).toBeUndefined();

    const playerW = createRes.playerId as string;

    // Two tabs/sockets for the same seat.
    const ws1 = await openWsRoom({ serverHttpUrl: s.url, roomId, playerId: playerW });
    const ws2 = await openWsRoom({ serverHttpUrl: s.url, roomId, playerId: playerW });

    // Presence should show connected.
    const snap1 = await fetch(`${s.url}/api/room/${encodeURIComponent(roomId)}`).then((r) => r.json() as Promise<any>);
    expect(snap1.error).toBeUndefined();
    expect(snap1.presence[playerW].connected).toBe(true);

    // Close one socket; player should remain connected due to the other.
    await ws1.close();
    await new Promise((r) => setTimeout(r, 10));

    const snap2 = await fetch(`${s.url}/api/room/${encodeURIComponent(roomId)}`).then((r) => r.json() as Promise<any>);
    expect(snap2.error).toBeUndefined();
    expect(snap2.presence[playerW].connected).toBe(true);
    expect(snap2.snapshot.state.forcedGameOver).toBeUndefined();

    // Wait longer than grace; game should still not be forced over.
    await new Promise((r) => setTimeout(r, graceMs + 40));

    const snap3 = await fetch(`${s.url}/api/room/${encodeURIComponent(roomId)}`).then((r) => r.json() as Promise<any>);
    expect(snap3.error).toBeUndefined();
    expect(snap3.presence[playerW].connected).toBe(true);
    expect(snap3.snapshot.state.forcedGameOver).toBeUndefined();

    await ws2.close();

    const closing = new Promise<void>((resolve) => s.server.close(() => resolve()));
    await closing;
    await rmWithRetries(tmpRoot);
  }, 30_000);
});
