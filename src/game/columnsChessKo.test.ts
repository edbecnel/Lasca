import { describe, expect, it } from "vitest";
import type { GameState } from "./state";
import { applyMoveColumnsChess } from "./applyMoveColumnsChess";
import { hashGameStateForKo } from "./hashState";

function m(entries: Array<[string, any]>): Map<string, any> {
  return new Map(entries);
}

describe("Columns Chess ko rule", () => {
  it("rejects recreating the pre-capture position on the very next move", () => {
    const prev: GameState = {
      board: m([
        ["r7c0", [{ owner: "W", rank: "R" }]],
        ["r7c4", [{ owner: "W", rank: "K" }]],
        ["r0c4", [{ owner: "B", rank: "K" }]],
      ]),
      toMove: "B",
      phase: "idle",
      meta: { variantId: "columns_chess", rulesetId: "columns_chess", boardSize: 8 },
      chess: {
        castling: {
          W: { kingSide: false, queenSide: false },
          B: { kingSide: false, queenSide: false },
        },
      },
    };

    const afterCapture: GameState = {
      board: m([
        ["r7c1", [{ owner: "W", rank: "R" }]],
        ["r7c4", [{ owner: "W", rank: "K" }]],
        ["r0c4", [{ owner: "B", rank: "K" }]],
      ]),
      toMove: "W",
      phase: "idle",
      meta: { variantId: "columns_chess", rulesetId: "columns_chess", boardSize: 8 },
      chess: {
        castling: {
          W: { kingSide: false, queenSide: false },
          B: { kingSide: false, queenSide: false },
        },
        koProhibitHash: hashGameStateForKo(prev),
      },
    };

    expect(() => applyMoveColumnsChess(afterCapture, { kind: "move", from: "r7c1", to: "r7c0" } as any)).toThrow(/ko/i);
  });

  it("sets a ko target after a capture", () => {
    const start: GameState = {
      board: m([
        ["r6c0", [{ owner: "W", rank: "P" }]],
        ["r5c1", [{ owner: "B", rank: "P" }]],
        ["r7c4", [{ owner: "W", rank: "K" }]],
        ["r0c4", [{ owner: "B", rank: "K" }]],
      ]),
      toMove: "W",
      phase: "idle",
      meta: { variantId: "columns_chess", rulesetId: "columns_chess", boardSize: 8 },
      chess: {
        castling: {
          W: { kingSide: false, queenSide: false },
          B: { kingSide: false, queenSide: false },
        },
      },
    };

    const next = applyMoveColumnsChess(start, { kind: "capture", from: "r6c0", over: "r5c1", to: "r5c1" } as any);
    expect(next.chess?.koProhibitHash).toBe(hashGameStateForKo(start));
  });
});
