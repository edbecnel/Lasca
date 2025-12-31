import { describe, it, expect } from "vitest";
import { applyMove } from "./applyMove.ts";
import type { GameState } from "./state.ts";

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
});
