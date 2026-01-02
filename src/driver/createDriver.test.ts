import { describe, it, expect } from "vitest";
import { selectDriverMode } from "./createDriver";

describe("selectDriverMode", () => {
  it("defaults to local", () => {
    expect(selectDriverMode({ search: "" })).toBe("local");
    expect(selectDriverMode({ search: "?" })).toBe("local");
  });

  it("uses query string mode", () => {
    expect(selectDriverMode({ search: "?mode=online" })).toBe("online");
    expect(selectDriverMode({ search: "mode=online" })).toBe("online");
    expect(selectDriverMode({ search: "?mode=local" })).toBe("local");
  });

  it("falls back to env var", () => {
    expect(selectDriverMode({ search: "", envMode: "online" })).toBe("online");
    expect(selectDriverMode({ search: "", envMode: "LOCAL" })).toBe("local");
  });

  it("query string overrides env", () => {
    expect(selectDriverMode({ search: "?mode=local", envMode: "online" })).toBe("local");
    expect(selectDriverMode({ search: "?mode=online", envMode: "local" })).toBe("online");
  });
});
