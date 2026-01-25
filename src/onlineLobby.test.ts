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

describe("MP3 lobby", () => {
  it("lists joinable rooms and hides rooms once full", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lasca-online-lobby-"));
    const gamesDir = path.join(tmpRoot, "games");
    const s = await startLascaServer({ port: 0, gamesDir });

    try {
      const mkRoom = async () => {
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
        return { roomId: createRes.roomId as string };
      };

      const r1 = await mkRoom();
      const r2 = await mkRoom();

      const lobby1 = await fetch(`${s.url}/api/lobby`).then((r) => r.json() as Promise<any>);
      expect(lobby1.error).toBeUndefined();
      const rooms1 = Array.isArray(lobby1.rooms) ? lobby1.rooms : [];
      const ids1 = rooms1.map((x: any) => x.roomId);
      expect(ids1).toContain(r1.roomId);
      expect(ids1).toContain(r2.roomId);

      // Fill r1 by joining as player 2.
      const joinRes = await fetch(`${s.url}/api/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId: r1.roomId }),
      }).then((r) => r.json() as Promise<any>);
      expect(joinRes.error).toBeUndefined();
      expect(joinRes.playerId).toBeTruthy();

      const lobby2 = await fetch(`${s.url}/api/lobby`).then((r) => r.json() as Promise<any>);
      expect(lobby2.error).toBeUndefined();
      const rooms2 = Array.isArray(lobby2.rooms) ? lobby2.rooms : [];
      const ids2 = rooms2.map((x: any) => x.roomId);

      expect(ids2).not.toContain(r1.roomId);
      expect(ids2).toContain(r2.roomId);
    } finally {
      const closing = new Promise<void>((resolve) => s.server.close(() => resolve()));
      await closing;
      await rmWithRetries(tmpRoot);
    }
  });
});
