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

function mkDamascaClassicState(
  boardEntries: Array<[string, Stack]>,
  toMove: "B" | "W" = "B"
): GameState {
  return {
    board: new Map(toEngineBoardEntries(boardEntries)),
    toMove,
    phase: "idle",
    meta: {
      variantId: "damasca_8_classic",
      rulesetId: "damasca_classic",
      boardSize: 8,
    },
  };
}

describe("movegen Damasca Classic", () => {
  it("officers have non-flying quiet moves (one square)", () => {
    const s = mkDamascaClassicState([["r3c3", [{ owner: "B", rank: "O" }]]], "B");
    const moves = genMovesForTest(s);

    expect(moves.every((m) => m.kind === "move")).toBe(true);
    expect(moves).toEqual(
      expect.arrayContaining([
        { kind: "move", from: "r3c3", to: "r2c2" },
        { kind: "move", from: "r3c3", to: "r2c4" },
        { kind: "move", from: "r3c3", to: "r4c2" },
        { kind: "move", from: "r3c3", to: "r4c4" },
      ])
    );

    // Ensure it does NOT include flying destinations.
    expect(moves).not.toEqual(expect.arrayContaining([{ kind: "move", from: "r3c3", to: "r1c1" }]));
  });

  it("officers have non-flying captures (single landing square)", () => {
    const s = mkDamascaClassicState(
      [
        ["r3c3", [{ owner: "B", rank: "O" }]],
        ["r4c4", [{ owner: "W", rank: "S" }]],
      ],
      "B"
    );

    const moves = genMovesForTest(s);
    expect(moves.every((m) => m.kind === "capture")).toBe(true);
    expect(moves).toEqual(
      expect.arrayContaining([{ kind: "capture", from: "r3c3", over: "r4c4", to: "r5c5" }])
    );
    // No flying landings beyond.
    expect(moves).not.toEqual(
      expect.arrayContaining([
        { kind: "capture", from: "r3c3", over: "r4c4", to: "r6c6" },
        { kind: "capture", from: "r3c3", over: "r4c4", to: "r7c7" },
      ])
    );
  });

  it("officers still may not reverse 180° in multi-capture", () => {
    const s = mkDamascaClassicState(
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
});
