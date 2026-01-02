import { describe, it, expect } from "vitest";
import { applyMove } from "./applyMove.ts";
import type { GameState } from "./state.ts";
import { finalizeHybridCaptureChain } from "./hybridCaptureChain.ts";

function mkHybridState(boardEntries: Array<[string, any]>, toMove: "B" | "W" = "B"): GameState {
  return {
    board: new Map(boardEntries),
    toMove,
    phase: "idle",
    meta: { variantId: "hybrid_8_damasca", rulesetId: "hybrid", boardSize: 8 },
  };
}

describe("applyMoveHybrid", () => {
  it("capture transfers top jumped piece to bottom and does not switch turn", () => {
    const s = mkHybridState(
      [
        ["r1c1", [{ owner: "W", rank: "O" }]],
        ["r2c2", [{ owner: "B", rank: "S" }, { owner: "B", rank: "O" }]], // bottom S, top O
      ],
      "W"
    );

    const next = applyMove(s, { kind: "capture", from: "r1c1", over: "r2c2", to: "r3c3" } as any);

    expect(next.toMove).toBe("W");
    expect(next.board.has("r1c1")).toBe(false);

    // Jumped stack keeps remainder [B,S]
    const rem = next.board.get("r2c2")!;
    expect(rem).toEqual([{ owner: "B", rank: "S" }]);

    // Landing stack: captured top (B,O) inserted at bottom, mover on top
    const land = next.board.get("r3c3")!;
    expect(land.length).toBe(2);
    expect(land[0]).toEqual({ owner: "B", rank: "O" });
    expect(land[1]).toEqual({ owner: "W", rank: "O" });
  });

  it("capture reaching far rank does not promote until chain finalizes", () => {
    const s = mkHybridState(
      [
        ["r5c3", [{ owner: "B", rank: "S" }]],
        ["r6c2", [{ owner: "W", rank: "S" }]],
      ],
      "B"
    );

    const after = applyMove(s, { kind: "capture", from: "r5c3", over: "r6c2", to: "r7c1" } as any);
    expect(after.toMove).toBe("B");
    expect(Boolean((after as any).didPromote)).toBe(false);
    expect(after.board.get("r7c1")?.[1] ?? after.board.get("r7c1")?.[0]).toEqual({ owner: "B", rank: "S" });

    const finalized = finalizeHybridCaptureChain(after, "r7c1");
    expect(Boolean((finalized as any).didPromote)).toBe(true);
    const top = finalized.board.get("r7c1")![finalized.board.get("r7c1")!.length - 1];
    expect(top).toEqual({ owner: "B", rank: "O" });
  });

  it("quiet move can promote (end-of-turn) and switches turn", () => {
    const s = mkHybridState([["r6c0", [{ owner: "B", rank: "S" }]]], "B");
    const next = applyMove(s, { kind: "move", from: "r6c0", to: "r7c1" });
    expect(next.toMove).toBe("W");
    expect(Boolean((next as any).didPromote)).toBe(true);
    expect(next.board.get("r7c1")?.[0]).toEqual({ owner: "B", rank: "O" });
  });
});
