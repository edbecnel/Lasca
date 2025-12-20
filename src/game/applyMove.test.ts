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

  it("ignores non-move kinds", () => {
    const state: GameState = { board: new Map(), toMove: "B", phase: "idle" };
    // @ts-expect-error testing wrong kind
    const next = applyMove(state, { kind: "capture", from: "r1c1", to: "r3c3" });
    expect(next).toBe(state);
  });
});
