// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { startLascaServer } from "../server/src/app.ts";
import { createInitialGameStateForVariant } from "./game/state.ts";
import { HistoryManager } from "./game/historyManager.ts";
import { generateLegalMoves } from "./game/movegen.ts";
import { serializeWireGameState, serializeWireHistory, deserializeWireGameState } from "./shared/wireState.ts";

function toWsUrl(httpUrl: string): string {
  const u = new URL(httpUrl);
  if (u.protocol === "https:") u.protocol = "wss:";
  else u.protocol = "ws:";
  u.pathname = `${u.pathname.replace(/\/$/, "")}/api/ws`;
  u.search = "";
  return u.toString();
}

async function openWsRoom(args: { serverHttpUrl: string; roomId: string }): Promise<{
  close: () => Promise<void>;
  nextSnapshot: () => Promise<any>;
}> {
  const wsUrl = toWsUrl(args.serverHttpUrl);

  // Node 20+ provides a global WebSocket.
  const WS = (globalThis as any).WebSocket as undefined | (new (url: string) => WebSocket);
  if (!WS) throw new Error("Missing global WebSocket in test environment");

  const ws = new WS(wsUrl);

  const queue: any[] = [];
  let pendingResolve: ((v: any) => void) | null = null;
  let pendingReject: ((e: any) => void) | null = null;

  const deliver = (msg: any) => {
    queue.push(msg);
    if (pendingResolve) {
      const r = pendingResolve;
      pendingResolve = null;
      pendingReject = null;
      r(queue.shift());
    }
  };

  ws.addEventListener("message", (ev: MessageEvent) => {
    try {
      const raw = typeof ev.data === "string" ? ev.data : String(ev.data);
      const msg = JSON.parse(raw) as any;
      if (msg?.event === "snapshot") {
        deliver(msg.payload);
      }
    } catch {
      // ignore
    }
  });

  const opened = new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true } as any);
    ws.addEventListener("error", () => reject(new Error("WS error")), { once: true } as any);
  });

  await opened;

  ws.send(
    JSON.stringify({
      type: "JOIN",
      roomId: args.roomId,
      // Observer connection to avoid presence/grace side effects in this test.
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
    nextSnapshot: async () => {
      if (queue.length > 0) return queue.shift();
      return new Promise<any>((resolve, reject) => {
        pendingResolve = resolve;
        pendingReject = reject;
        // Safety timeout so test fails cleanly.
        setTimeout(() => {
          if (pendingReject) {
            const rj = pendingReject;
            pendingResolve = null;
            pendingReject = null;
            rj(new Error("Timed out waiting for WS snapshot"));
          }
        }, 5000);
      });
    },
  };
}

async function nextSnapshotWithNewerVersion(stream: { nextSnapshot: () => Promise<any> }, minVersion: number): Promise<any> {
  while (true) {
    const ev = await stream.nextSnapshot();
    const v = Number(ev?.snapshot?.stateVersion ?? -1);
    if (v > minVersion) return ev;
  }
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

describe("MP1.5 realtime push transport (WebSockets)", () => {
  it("broadcasts snapshots to all connected sockets", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lasca-online-ws-"));
    const gamesDir = path.join(tmpRoot, "games");
    const s = await startLascaServer({ port: 0, gamesDir });

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
    const playerB = joinRes.playerId as string;

    const a = await openWsRoom({ serverHttpUrl: s.url, roomId });
    const b = await openWsRoom({ serverHttpUrl: s.url, roomId });

    const a0 = await a.nextSnapshot();
    const b0 = await b.nextSnapshot();
    expect(a0.roomId).toBe(roomId);
    expect(b0.roomId).toBe(roomId);

    const snap = await fetch(`${s.url}/api/room/${encodeURIComponent(roomId)}`).then((r) => r.json() as Promise<any>);
    const state = deserializeWireGameState(snap.snapshot.state);
    const toMove = state.toMove as "W" | "B";
    const mover = toMove === "W" ? playerW : playerB;

    const legal = generateLegalMoves(state);
    expect(legal.length).toBeGreaterThan(0);
    const move = legal.find((m) => m.kind === "move") ?? legal[0];

    const submitRes = await fetch(`${s.url}/api/submitMove`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomId, playerId: mover, move }),
    }).then((r) => r.json() as Promise<any>);

    expect(submitRes.error).toBeUndefined();

    const a1 = await nextSnapshotWithNewerVersion(a, a0.snapshot.stateVersion);
    const b1 = await nextSnapshotWithNewerVersion(b, b0.snapshot.stateVersion);

    expect(a1.snapshot.stateVersion).toBeGreaterThan(a0.snapshot.stateVersion);
    expect(b1.snapshot.stateVersion).toBeGreaterThan(b0.snapshot.stateVersion);

    await a.close();
    await b.close();

    const closing = new Promise<void>((resolve) => s.server.close(() => resolve()));
    await closing;
    await rmWithRetries(tmpRoot);
  }, 30_000);
});
