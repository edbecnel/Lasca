import { describe, expect, test } from "vitest";
import { nodeIdToA1, parseNodeId } from "./coordFormat";

describe("coordFormat", () => {
  test("parseNodeId parses r#c#", () => {
    expect(parseNodeId("r0c0")).toEqual({ row: 0, col: 0 });
    expect(parseNodeId("r6c6")).toEqual({ row: 6, col: 6 });
  });

  test("nodeIdToA1 maps A-left / 1-bottom", () => {
    expect(nodeIdToA1("r0c0")).toBe("A7");
    expect(nodeIdToA1("r0c6")).toBe("G7");
    expect(nodeIdToA1("r6c0")).toBe("A1");
    expect(nodeIdToA1("r6c6")).toBe("G1");
    expect(nodeIdToA1("r2c2")).toBe("C5");
    expect(nodeIdToA1("r4c2")).toBe("C3");
  });

  test("nodeIdToA1 leaves unknown strings unchanged", () => {
    expect(nodeIdToA1("foo")).toBe("foo");
    expect(nodeIdToA1("r7c0")).toBe("r7c0");
  });
});
