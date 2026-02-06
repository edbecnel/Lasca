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

describe("admin delete room", () => {
  it("deletes a room from disk and prevents reload", async () => {
    const prev = process.env.LASCA_ADMIN_TOKEN;
    process.env.LASCA_ADMIN_TOKEN = "test-token";

    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lasca-admin-delete-"));
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
      const roomId = String(createRes.roomId || "");
      expect(roomId).toBeTruthy();

      const roomDir = path.join(gamesDir, roomId);
      const roomDirExistsBefore = await fs
        .stat(roomDir)
        .then(() => true)
        .catch(() => false);
      expect(roomDirExistsBefore).toBe(true);

      const delRes = await fetch(`${s.url}/api/admin/room/${roomId}`, {
        method: "DELETE",
        headers: { "x-lasca-admin-token": "test-token" },
      }).then((r) => r.json() as Promise<any>);

      expect(delRes.error).toBeUndefined();
      expect(delRes.ok).toBe(true);
      expect(delRes.roomId).toBe(roomId);

      const roomDirExistsAfter = await fs
        .stat(roomDir)
        .then(() => true)
        .catch(() => false);
      expect(roomDirExistsAfter).toBe(false);

      // The deleted room should not show in lobby.
      const lobby = await fetch(`${s.url}/api/lobby`).then((r) => r.json() as Promise<any>);
      expect(lobby.error).toBeUndefined();
      const ids = (Array.isArray(lobby.rooms) ? lobby.rooms : []).map((x: any) => x.roomId);
      expect(ids).not.toContain(roomId);

      // The deleted room should not be loadable via meta endpoint.
      const meta = await fetch(`${s.url}/api/room/${roomId}/meta`).then((r) => r.json() as Promise<any>);
      expect(meta.roomId).toBeUndefined();
      expect(typeof meta.error).toBe("string");
    } finally {
      const closing = new Promise<void>((resolve) => s.server.close(() => resolve()));
      await closing;
      await rmWithRetries(tmpRoot);
      process.env.LASCA_ADMIN_TOKEN = prev;
    }
  });

  it("is hidden when LASCA_ADMIN_TOKEN is not set", async () => {
    const prev = process.env.LASCA_ADMIN_TOKEN;
    delete (process.env as any).LASCA_ADMIN_TOKEN;

    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lasca-admin-delete-hidden-"));
    const gamesDir = path.join(tmpRoot, "games");
    const s = await startLascaServer({ port: 0, gamesDir });

    try {
      const res = await fetch(`${s.url}/api/admin/room/abcd`, { method: "DELETE" });
      expect(res.status).toBe(404);
    } finally {
      const closing = new Promise<void>((resolve) => s.server.close(() => resolve()));
      await closing;
      await rmWithRetries(tmpRoot);
      process.env.LASCA_ADMIN_TOKEN = prev;
    }
  });
});
