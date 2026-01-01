import { describe, it, expect } from "vitest";
import { applyMove } from "./applyMove.ts";
import type { GameState } from "./state.ts";
import { finalizeDamaCaptureChain } from "./damaCaptureChain.ts";

function mkDamaState(boardEntries: Array<[string, any]>, toMove: "B" | "W" = "B"): GameState {
  return {
    board: new Map(boardEntries),
    toMove,
    phase: "idle",
    meta: { variantId: "dama_8_classic_standard", rulesetId: "dama", boardSize: 8 },
  };
}

describe("applyMoveDama", () => {
  it("capture removes jumped piece and does not stack", () => {
    const s = mkDamaState(
      [
        ["r2c2", [{ owner: "W", rank: "S" }]],
        ["r3c3", [{ owner: "B", rank: "S" }]],
      ],
      "W"
    );

    const next = applyMove(s, { kind: "capture", from: "r2c2", over: "r3c3", to: "r4c4" });

    expect(next.toMove).toBe("W"); // capture chain handled by controller
    expect(next.board.has("r2c2")).toBe(false);
    expect(next.board.has("r3c3")).toBe(false); // removed
    const land = next.board.get("r4c4")!;
    expect(land).toEqual([{ owner: "W", rank: "S" }]);
  });

  it("quiet move can promote", () => {
    const s = mkDamaState([["r6c0", [{ owner: "B", rank: "S" }]]], "B");
    const next = applyMove(s, { kind: "move", from: "r6c0", to: "r7c1" });
    expect(next.toMove).toBe("W");
    expect(Boolean((next as any).didPromote)).toBe(true);
    expect(next.board.get("r7c1")?.[0]).toEqual({ owner: "B", rank: "O" });
  });

  it("capture promotes when the chain finalizes (B1)", () => {
    // B1 is r7c1 for an 8×8 board (see nodeIdToA1 mapping).
    const s = mkDamaState(
      [
        ["r5c3", [{ owner: "B", rank: "S" }]],
        ["r6c2", [{ owner: "W", rank: "S" }]],
      ],
      "B"
    );

    const next = applyMove(s, { kind: "capture", from: "r5c3", over: "r6c2", to: "r7c1" });

    // Dama capture chains keep the same side to move; controller switches at turn boundary.
    expect(next.toMove).toBe("B");

    // Finalize the chain (no further captures in this position).
    const finalized = finalizeDamaCaptureChain(next, "r7c1", ["r6c2"]);
    expect(Boolean((finalized as any).didPromote)).toBe(true);
    expect(finalized.board.get("r7c1")?.[0]).toEqual({ owner: "B", rank: "O" });
  });

  it("end_of_sequence: jumped piece removed only after chain finalizes", () => {
    const s: GameState = {
      board: new Map([
        ["r2c2", [{ owner: "W", rank: "S" }]],
        ["r3c3", [{ owner: "B", rank: "S" }]],
      ]),
      toMove: "W",
      phase: "idle",
      meta: {
        variantId: "dama_8_classic_international",
        rulesetId: "dama",
        boardSize: 8,
        damaCaptureRemoval: "end_of_sequence",
      },
    };

    const after = applyMove(s, { kind: "capture", from: "r2c2", over: "r3c3", to: "r4c4" });
    expect(after.board.has("r3c3")).toBe(true);

    const finalized = finalizeDamaCaptureChain(after, "r4c4", new Set(["r3c3"]));
    expect(finalized.board.has("r3c3")).toBe(false);
  });
});
