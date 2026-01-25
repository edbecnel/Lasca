// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { startLascaServer } from "../server/src/app.ts";
import { createInitialGameStateForVariant } from "./game/state.ts";
import { HistoryManager } from "./game/historyManager.ts";
import { serializeWireGameState, serializeWireHistory } from "./shared/wireState.ts";

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

describe("MP online debug reports", () => {
  it("persists per-room debug reports with an incrementing counter", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lasca-online-debug-"));
    const gamesDir = path.join(tmpRoot, "games");
    const s = await startLascaServer({ port: 0, gamesDir });

    try {
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
      expect(createRes.roomId).toBeTruthy();
      expect(createRes.playerId).toBeTruthy();

      const roomId = createRes.roomId as string;
      const playerId = createRes.playerId as string;

      const send = async (debug: any) =>
        fetch(`${s.url}/api/room/${roomId}/debug`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ roomId, playerId, debug }),
        }).then((r) => r.json() as Promise<any>);

      const r1 = await send({ kind: "test", n: 1 });
      expect(r1.error).toBeUndefined();
      expect(r1.ok).toBe(true);
      expect(r1.fileName).toBe("debug.1.json");

      const p1 = path.join(gamesDir, roomId, "debug", "debug.1.json");
      const raw1 = await fs.readFile(p1, "utf8");
      const obj1 = JSON.parse(raw1);
      expect(obj1.roomId).toBe(roomId);
      expect(obj1.playerId).toBe(playerId);
      expect(obj1.debug).toEqual({ kind: "test", n: 1 });

      const r2 = await send({ kind: "test", n: 2 });
      expect(r2.error).toBeUndefined();
      expect(r2.ok).toBe(true);
      expect(r2.fileName).toBe("debug.2.json");

      const p2 = path.join(gamesDir, roomId, "debug", "debug.2.json");
      const raw2 = await fs.readFile(p2, "utf8");
      const obj2 = JSON.parse(raw2);
      expect(obj2.roomId).toBe(roomId);
      expect(obj2.debug).toEqual({ kind: "test", n: 2 });
    } finally {
      const closing = new Promise<void>((resolve) => s.server.close(() => resolve()));
      await closing;
      await rmWithRetries(tmpRoot);
    }
  });
});
