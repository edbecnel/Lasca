import { describe, it, expect } from "vitest";
import { applyMove } from "./applyMove.ts";
import type { GameState } from "./state.ts";
import { finalizeDamascaCaptureChain } from "./damascaCaptureChain.ts";

function mkDamascaState(boardEntries: Array<[string, any]>, toMove: "B" | "W" = "B"): GameState {
  return {
    board: new Map(boardEntries),
    toMove,
    phase: "idle",
    meta: { variantId: "damasca_8", rulesetId: "damasca", boardSize: 8 },
  };
}

describe("applyMoveDamasca", () => {
  it("capture transfers top jumped piece to bottom and does not switch turn", () => {
    const s = mkDamascaState(
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
    const s = mkDamascaState(
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

    const finalized = finalizeDamascaCaptureChain(after, "r7c1");
    expect(Boolean((finalized as any).didPromote)).toBe(true);
    const top = finalized.board.get("r7c1")![finalized.board.get("r7c1")!.length - 1];
    expect(top).toEqual({ owner: "B", rank: "O" });
  });

  it("reaching far rank mid-chain promotes at chain end even if final square is not the far rank", () => {
    // Capture path: B5 -> D3 -> F1 -> H3
    const s = mkDamascaState(
      [
        ["r3c1", [{ owner: "B", rank: "S" }]], // B5
        ["r4c2", [{ owner: "W", rank: "S" }]], // jumped on first capture
        ["r6c4", [{ owner: "W", rank: "S" }]], // jumped on second capture
        ["r6c6", [{ owner: "W", rank: "S" }]], // jumped on third capture
      ],
      "B"
    );

    const after1 = applyMove(s, { kind: "capture", from: "r3c1", over: "r4c2", to: "r5c3" } as any);
    const after2 = applyMove(after1, { kind: "capture", from: "r5c3", over: "r6c4", to: "r7c5" } as any);
    // Landed on far rank (r7) but should not promote mid-chain.
    const topAfter2 = after2.board.get("r7c5")![after2.board.get("r7c5")!.length - 1];
    expect(topAfter2).toEqual({ owner: "B", rank: "S" });
    expect(Boolean((after2 as any).didPromote)).toBe(false);

    const after3 = applyMove(after2, { kind: "capture", from: "r7c5", over: "r6c6", to: "r5c7" } as any);

    const finalized = finalizeDamascaCaptureChain(after3, "r5c7");
    expect(Boolean((finalized as any).didPromote)).toBe(true);
    const topFinal = finalized.board.get("r5c7")![finalized.board.get("r5c7")!.length - 1];
    expect(topFinal).toEqual({ owner: "B", rank: "O" });
  });

  it("quiet move can promote (end-of-turn) and switches turn", () => {
    const s = mkDamascaState([["r6c0", [{ owner: "B", rank: "S" }]]], "B");
    const next = applyMove(s, { kind: "move", from: "r6c0", to: "r7c1" });
    expect(next.toMove).toBe("W");
    expect(Boolean((next as any).didPromote)).toBe(true);
    expect(next.board.get("r7c1")?.[0]).toEqual({ owner: "B", rank: "O" });
  });
});
