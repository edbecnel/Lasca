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

  it("applies a single capture: move stack, take top enemy, captured goes to bottom, toggle turn", () => {
    const state: GameState = {
      board: new Map([
        ["r1c1", [{ owner: "W", rank: "S" }]],
        ["r2c2", [{ owner: "B", rank: "S" }]],
      ]),
      toMove: "W",
      phase: "idle",
    };
    const next = applyMove(state, { kind: "capture", from: "r1c1", over: "r2c2", to: "r3c3" } as any);
    expect(next.toMove).toBe("B");
    // Source cleared, over cleared (was single piece)
    expect(next.board.has("r1c1")).toBe(false);
    expect(next.board.has("r2c2")).toBe(false);
    // Landing has two pieces: [captured(B,S), mover(W,S)] bottom→top
    const stack = next.board.get("r3c3")!;
    expect(stack.length).toBe(2);
    expect(stack[0]).toEqual({ owner: "B", rank: "S" });
    expect(stack[1]).toEqual({ owner: "W", rank: "S" });
  });

  it("leaves remainder at over after capture", () => {
    const state: GameState = {
      board: new Map([
        ["r3c3", [{ owner: "W", rank: "O" }]],
        ["r4c4", [{ owner: "B", rank: "S" }, { owner: "B", rank: "O" }]], // bottom S, top O
      ]),
      toMove: "W",
      phase: "idle",
    };
    const next = applyMove(state, { kind: "capture", from: "r3c3", over: "r4c4", to: "r5c5" } as any);
    expect(next.toMove).toBe("B");
    // Over keeps remainder [B,S]
    const rem = next.board.get("r4c4")!;
    expect(rem.length).toBe(1);
    expect(rem[0]).toEqual({ owner: "B", rank: "S" });
    // Landing has [captured(B,O), mover(W,O)]
    const land = next.board.get("r5c5")!;
    expect(land.length).toBe(2);
    expect(land[0]).toEqual({ owner: "B", rank: "O" });
    expect(land[1]).toEqual({ owner: "W", rank: "O" });
  });

  it("throws if capture landing is occupied", () => {
    const state: GameState = {
      board: new Map([
        ["r1c1", [{ owner: "W", rank: "S" }]],
        ["r2c2", [{ owner: "B", rank: "S" }]],
        ["r3c3", [{ owner: "W", rank: "O" }]], // occupied landing
      ]),
      toMove: "W",
      phase: "idle",
    };
    expect(() => applyMove(state, { kind: "capture", from: "r1c1", over: "r2c2", to: "r3c3" } as any)).toThrow();
  });
});
