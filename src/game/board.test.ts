import { describe, it, expect } from "vitest";
import { ALL_NODES, diagNeighbors, jumpTargets } from "./board.ts";

describe("board helpers", () => {
  it("has 25 playable nodes", () => {
    expect(ALL_NODES.length).toBe(25);
    expect(ALL_NODES).toContain("r0c0");
    expect(ALL_NODES).toContain("r0c2");
    expect(ALL_NODES).toContain("r6c6");
  });

  it("diagonal neighbors from center", () => {
    const ns = diagNeighbors("r3c3").sort();
    expect(ns.sort()).toEqual(["r2c2", "r2c4", "r4c2", "r4c4"].sort());
  });

  it("jump targets from center", () => {
    const js = jumpTargets("r3c3");
    const formatted = js.map(j => `${j.over}->${j.land}`).sort();
    expect(formatted).toEqual([
      "r2c2->r1c1",
      "r2c4->r1c5",
      "r4c2->r5c1",
      "r4c4->r5c5",
    ].sort());
  });
});
