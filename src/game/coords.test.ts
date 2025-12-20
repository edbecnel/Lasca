import { describe, it, expect } from "vitest";
import { parseNodeId, makeNodeId, inBounds, isPlayable } from "./coords.ts";

describe("coords", () => {
  it("parses and makes node ids", () => {
    const rc = parseNodeId("r3c5");
    expect(rc).toEqual({ r: 3, c: 5 });
    expect(makeNodeId(rc.r, rc.c)).toBe("r3c5");
  });

  it("bounds and playability", () => {
    expect(inBounds(0, 0)).toBe(true);
    expect(inBounds(6, 6)).toBe(true);
    expect(inBounds(-1, 0)).toBe(false);
    expect(inBounds(7, 0)).toBe(false);

    // Parity-based playable squares
    expect(isPlayable(0, 0)).toBe(true);
    expect(isPlayable(0, 1)).toBe(false);
    expect(isPlayable(1, 1)).toBe(true);
  });
});
