import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

function readAsset(relFromSrc: string): string {
  const fullPath = path.resolve(process.cwd(), "src", relFromSrc);
  return fs.readFileSync(fullPath, "utf8");
}

describe("board SVG node click targets", () => {
  it("lasca_board.svg nodes have pointer-events and transparent fill", () => {
    const svg = readAsset(path.join("assets", "lasca_board.svg"));
    // Ensure the nodes group is present and provides a wide click target.
    expect(svg).toMatch(/<g[^>]*id="nodes"[^>]*>/);
    expect(svg).toMatch(/<g[^>]*id="nodes"[^>]*pointer-events="all"[^>]*>/);
    expect(svg).toMatch(/<g[^>]*id="nodes"[^>]*fill="transparent"[^>]*>/);
  });

  it("graph_board_8x8.svg nodes have transparent fill", () => {
    const svg = readAsset(path.join("assets", "graph_board_8x8.svg"));
    expect(svg).toMatch(/<g[^>]*id="nodes"[^>]*>/);
    expect(svg).toMatch(/<g[^>]*id="nodes"[^>]*pointer-events="all"[^>]*>/);
    expect(svg).toMatch(/<g[^>]*id="nodes"[^>]*fill="transparent"[^>]*>/);
  });
});
