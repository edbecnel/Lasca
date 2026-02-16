import { describe, it, expect } from "vitest";
import { generateLegalMoves } from "./movegen.ts";
import type { GameState } from "./state.ts";
import type { Stack } from "../types";

function remap8x8Id(id: string): string {
  const m = /^r(\d+)c(\d+)$/.exec(id);
  if (!m) return id;
  const r = Number(m[1]);
  const c = Number(m[2]);
  const c2 = 7 - c;
  return `r${r}c${c2}`;
}

function toEngineBoardEntries(entries: Array<[string, Stack]>): Array<[string, Stack]> {
  return entries.map(([id, stack]) => [remap8x8Id(id), stack]);
}

function toTestMove(m: any): any {
  if (!m || typeof m !== "object") return m;
  const out: any = { ...m };
  if (typeof out.from === "string") out.from = remap8x8Id(out.from);
  if (typeof out.to === "string") out.to = remap8x8Id(out.to);
  if (typeof out.over === "string") out.over = remap8x8Id(out.over);
  return out;
}

function toTestMoves(ms: any[]): any[] {
  return ms.map(toTestMove);
}

function toEngineConstraints(constraints: any | undefined): any | undefined {
  if (!constraints) return constraints;
  const out: any = { ...constraints };
  if (typeof out.forcedFrom === "string") out.forcedFrom = remap8x8Id(out.forcedFrom);
  if (out.excludedJumpSquares instanceof Set) {
    out.excludedJumpSquares = new Set(Array.from(out.excludedJumpSquares).map((id) => remap8x8Id(String(id))));
  }
  if (out.lastCaptureDir && typeof out.lastCaptureDir === "object") {
    const dr = Number((out.lastCaptureDir as any).dr);
    const dc = Number((out.lastCaptureDir as any).dc);
    if (Number.isFinite(dr) && Number.isFinite(dc)) {
      out.lastCaptureDir = { dr, dc: -dc };
    }
  }
  return out;
}

function genMovesForTest(s: GameState, constraints?: any): any[] {
  return toTestMoves(generateLegalMoves(s, toEngineConstraints(constraints)) as any);
}

function mkDamascaState(
  boardEntries: Array<[string, Stack]>,
  toMove: "B" | "W" = "B"
): GameState {
  return {
    board: new Map(toEngineBoardEntries(boardEntries)),
    toMove,
    phase: "idle",
    meta: {
      variantId: "damasca_8",
      rulesetId: "damasca",
      boardSize: 8,
    },
  };
}

describe("movegen Damasca", () => {
  it("mandatory capture: if any capture exists, only captures are returned", () => {
    const s = mkDamascaState(
      [
        ["r2c2", [{ owner: "B", rank: "S" }]],
        ["r3c3", [{ owner: "W", rank: "S" }]],
        // Another black piece that would have a quiet move
        ["r5c5", [{ owner: "B", rank: "S" }]],
      ],
      "B"
    );

    const moves = genMovesForTest(s);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((m) => m.kind === "capture")).toBe(true);
  });

  it("soldiers can capture backwards", () => {
    const s = mkDamascaState(
      [
        ["r3c3", [{ owner: "B", rank: "S" }]],
        ["r2c2", [{ owner: "W", rank: "S" }]],
      ],
      "B"
    );

    const moves = genMovesForTest(s);
    expect(moves).toEqual(
      expect.arrayContaining([
        { kind: "capture", from: "r3c3", over: "r2c2", to: "r1c1" },
      ])
    );
  });

  it("officers have flying quiet moves", () => {
    const s = mkDamascaState([["r3c3", [{ owner: "B", rank: "O" }]]], "B");
    const moves = genMovesForTest(s);

    expect(moves.every((m) => m.kind === "move")).toBe(true);
    expect(moves).toEqual(
      expect.arrayContaining([
        { kind: "move", from: "r3c3", to: "r2c2" },
        { kind: "move", from: "r3c3", to: "r1c1" },
        { kind: "move", from: "r3c3", to: "r0c0" },
        { kind: "move", from: "r3c3", to: "r4c4" },
        { kind: "move", from: "r3c3", to: "r5c5" },
        { kind: "move", from: "r3c3", to: "r6c6" },
        { kind: "move", from: "r3c3", to: "r7c7" },
      ])
    );
  });

  it("officers have flying captures (multiple landing squares)", () => {
    const s = mkDamascaState(
      [
        ["r3c3", [{ owner: "B", rank: "O" }]],
        ["r4c4", [{ owner: "W", rank: "S" }]],
      ],
      "B"
    );

    const moves = genMovesForTest(s);
    expect(moves.every((m) => m.kind === "capture")).toBe(true);
    expect(moves).toEqual(
      expect.arrayContaining([
        { kind: "capture", from: "r3c3", over: "r4c4", to: "r5c5" },
        { kind: "capture", from: "r3c3", over: "r4c4", to: "r6c6" },
        { kind: "capture", from: "r3c3", over: "r4c4", to: "r7c7" },
      ])
    );
  });

  it("officers may continue straight or turn 90°, but may not reverse 180° in multi-capture", () => {
    // Forced continuation from r3c3 after a prior capture along (+1,+1).
    // Captures along (+1,+1) are allowed; captures along (-1,-1) are disallowed.
    const s = mkDamascaState(
      [
        ["r3c3", [{ owner: "B", rank: "O" }]],
        ["r4c4", [{ owner: "W", rank: "S" }]],
        ["r2c2", [{ owner: "W", rank: "S" }]],
      ],
      "B"
    );

    const moves = genMovesForTest(s, {
      forcedFrom: "r3c3",
      excludedJumpSquares: new Set(),
      lastCaptureDir: { dr: 1, dc: 1 },
    }).filter((m) => m.kind === "capture");

    expect(moves.some((m: any) => m.over === "r4c4")).toBe(true);
    expect(moves.some((m: any) => m.over === "r2c2")).toBe(false);
  });

  it("enforces maximum-capture line (filters first steps)", () => {
    // Same structure as Dama test, but with Damasca ruleset.
    const s = mkDamascaState(
      [
        ["r2c2", [{ owner: "B", rank: "S" }]],
        ["r3c3", [{ owner: "W", rank: "S" }]],
        ["r5c5", [{ owner: "W", rank: "S" }]],
        ["r3c1", [{ owner: "W", rank: "S" }]],
      ],
      "B"
    );

    const moves = genMovesForTest(s);
    expect(moves).toEqual([{ kind: "capture", from: "r2c2", over: "r3c3", to: "r4c4" }]);
  });

  it("excludedJumpSquares prevents re-jumping a previously jumped square", () => {
    // Geometry would allow a recapture-back over the same square; it must be excluded.
    const afterFirst = mkDamascaState(
      [
        ["r4c4", [{ owner: "B", rank: "S" }]],
        ["r3c3", [{ owner: "W", rank: "S" }]],
      ],
      "B"
    );

    const cont = genMovesForTest(afterFirst, {
      forcedFrom: "r4c4",
      excludedJumpSquares: new Set(["r3c3"]),
    }).filter((m) => m.kind === "capture");

    expect(cont.some((m) => (m as any).over === "r3c3")).toBe(false);
  });
});
