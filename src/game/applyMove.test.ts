import { describe, it, expect } from "vitest";
import { applyMove } from "./applyMove.ts";
import type { GameState } from "./state.ts";

describe("applyMove (quiet)", () => {
  it("moves entire stack and toggles turn", () => {
    const state: GameState = {
      board: new Map([
        ["r1c1", [{ owner: "B", rank: "S" }, { owner: "B", rank: "O" }]],
      ]),
      toMove: "B",
      phase: "idle",
    };

    const next = applyMove(state, { kind: "move", from: "r1c1", to: "r2c2" });

    expect(next.board.has("r1c1")).toBe(false);
    expect(next.board.get("r2c2")?.length).toBe(2);
    expect(next.board.get("r2c2")?.[0].rank).toBe("S");
    expect(next.board.get("r2c2")?.[1].rank).toBe("O");
    expect(next.toMove).toBe("W");
    expect(next.phase).toBe("idle");
  });

  it("capture toggles turn (no board changes yet)", () => {
    const state: GameState = {
      board: new Map([
        ["r1c1", [{ owner: "W", rank: "S" }]],
        ["r2c2", [{ owner: "B", rank: "S" }]],
      ]),
      toMove: "W",
      phase: "idle",
    };
    const next = applyMove(state, { kind: "capture", from: "r1c1", to: "r3c3" });
    // Turn toggles from White to Black
    expect(next.toMove).toBe("B");
    // Board remains unchanged in PR6
    expect(next.board.get("r1c1")?.length).toBe(1);
    expect(next.board.get("r2c2")?.length).toBe(1);
  });
});
