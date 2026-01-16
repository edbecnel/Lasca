import { describe, expect, it } from "vitest";
import type { GameState } from "./state.ts";
import { applyMove } from "./applyMove.ts";

function makeDamascaState(board: GameState["board"], toMove: "W" | "B" = "W"): GameState {
  return {
    board,
    toMove,
    phase: "idle",
    meta: { variantId: "damasca_8" as any, rulesetId: "damasca", boardSize: 8 },
    damascaDeadPlay: { noProgressPlies: 0, officerOnlyPlies: 0 },
  };
}

describe("Damasca dead-play / infinite-loop adjudication", () => {
  it("ends and adjudicates on officer-only >= 30 plies", () => {
    let state = makeDamascaState(
      new Map([
        ["r3c3", [{ owner: "W", rank: "O" }]],
        ["r3c5", [{ owner: "B", rank: "O" }]],
      ]),
      "W"
    );

    for (let ply = 0; ply < 30; ply++) {
      if ((state as any).forcedGameOver) break;

      if (state.toMove === "W") {
        const from = state.board.has("r3c3") ? "r3c3" : "r4c4";
        const to = from === "r3c3" ? "r4c4" : "r3c3";
        state = applyMove(state, { kind: "move", from, to });
      } else {
        const from = state.board.has("r3c5") ? "r3c5" : "r4c6";
        const to = from === "r3c5" ? "r4c6" : "r3c5";
        state = applyMove(state, { kind: "move", from, to });
      }
    }

    const forced = (state as any).forcedGameOver;
    expect(forced).toBeTruthy();
    expect(forced.reasonCode).toBe("DAMASCA_OFFICER_ONLY");
    expect(forced.winner).toBeNull();
    expect(String(forced.message ?? "").toLowerCase()).toContain("adjudicated");
  });

  it("ends and adjudicates on no-progress >= 40 plies", () => {
    let state = makeDamascaState(
      new Map([
        ["r3c3", [{ owner: "W", rank: "O" }]],
        ["r3c5", [{ owner: "B", rank: "O" }]],
      ]),
      "W"
    );

    (state as any).damascaDeadPlay = { noProgressPlies: 39, officerOnlyPlies: 0 };

    state = applyMove(state, { kind: "move", from: "r3c3", to: "r4c4" });
    const forced = (state as any).forcedGameOver;
    expect(forced).toBeTruthy();
    expect(forced.reasonCode).toBe("DAMASCA_NO_PROGRESS");
  });

  it("resets counters on soldier advance", () => {
    let state = makeDamascaState(
      new Map([
        ["r6c0", [{ owner: "W", rank: "S" }]],
        ["r3c5", [{ owner: "B", rank: "O" }]],
      ]),
      "W"
    );
    (state as any).damascaDeadPlay = { noProgressPlies: 10, officerOnlyPlies: 10 };

    state = applyMove(state, { kind: "move", from: "r6c0", to: "r5c1" });
    const dp = (state as any).damascaDeadPlay;
    expect(dp.noProgressPlies).toBe(0);
    expect(dp.officerOnlyPlies).toBe(0);
  });

  it("resets counters on promotion", () => {
    let state = makeDamascaState(
      new Map([
        ["r1c1", [{ owner: "W", rank: "S" }]],
        ["r3c5", [{ owner: "B", rank: "O" }]],
      ]),
      "W"
    );
    (state as any).damascaDeadPlay = { noProgressPlies: 10, officerOnlyPlies: 10 };

    state = applyMove(state, { kind: "move", from: "r1c1", to: "r0c0" });
    const dp = (state as any).damascaDeadPlay;
    expect(dp.noProgressPlies).toBe(0);
    expect(dp.officerOnlyPlies).toBe(0);
  });
});
