// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

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

function randGuestId(): string {
  return crypto.randomBytes(16).toString("hex");
}

describe("MP rejoin by guestId", () => {
  it("allows rejoin via /api/join when room is full", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lasca-online-guest-rejoin-"));
    const gamesDir = path.join(tmpRoot, "games");
    const s = await startLascaServer({ port: 0, gamesDir });

    try {
      const guest1 = randGuestId();
      const guest2 = randGuestId();

      const initial = createInitialGameStateForVariant("lasca_7_classic" as any);
      const history = new HistoryManager();
      history.push(initial);

      const createRes = await fetch(`${s.url}/api/create`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          variantId: "lasca_7_classic",
          guestId: guest1,
          displayName: "Host",
          preferredColor: "W",
          snapshot: {
            state: serializeWireGameState(initial),
            history: serializeWireHistory(history.exportSnapshots()),
            stateVersion: 0,
          },
        }),
      }).then((r) => r.json() as Promise<any>);

      expect(createRes.error).toBeUndefined();
      expect(typeof createRes.roomId).toBe("string");
      expect(typeof createRes.playerId).toBe("string");
      expect(createRes.color).toBe("W");

      const joinRes = await fetch(`${s.url}/api/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId: createRes.roomId, guestId: guest2, displayName: "Guest" }),
      }).then((r) => r.json() as Promise<any>);

      expect(joinRes.error).toBeUndefined();
      expect(joinRes.roomId).toBe(createRes.roomId);
      expect(joinRes.playerId).not.toBe(createRes.playerId);
      expect(joinRes.color).toBe("B");

      // Room is now full. A follow-up join with the same guestId should act as a rejoin.
      const rejoin1 = await fetch(`${s.url}/api/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId: createRes.roomId, guestId: guest1, preferredColor: "W" }),
      }).then((r) => r.json() as Promise<any>);

      expect(rejoin1.error).toBeUndefined();
      expect(rejoin1.roomId).toBe(createRes.roomId);
      expect(rejoin1.playerId).toBe(createRes.playerId);
      expect(rejoin1.color).toBe("W");

      const rejoin2 = await fetch(`${s.url}/api/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId: createRes.roomId, guestId: guest2 }),
      }).then((r) => r.json() as Promise<any>);

      expect(rejoin2.error).toBeUndefined();
      expect(rejoin2.roomId).toBe(createRes.roomId);
      expect(rejoin2.playerId).toBe(joinRes.playerId);
      expect(rejoin2.color).toBe("B");

      // A random guestId should still be blocked when full.
      const denied = await fetch(`${s.url}/api/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId: createRes.roomId, guestId: randGuestId() }),
      }).then((r) => r.json() as Promise<any>);

      expect(String(denied.error ?? "").toLowerCase()).toContain("room");
      expect(String(denied.error ?? "").toLowerCase()).toContain("full");
    } finally {
      const closing = new Promise<void>((resolve) => s.server.close(() => resolve()));
      await closing;
      await rmWithRetries(tmpRoot);
    }
  }, 30_000);
});
