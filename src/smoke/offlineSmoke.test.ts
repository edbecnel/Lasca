import { describe, it, expect } from "vitest";
import { createInitialGameStateForVariant } from "../game/state";
import { generateLegalMoves } from "../game/movegen";
import { applyMove } from "../game/applyMove";
import { deserializeSaveData } from "../game/saveLoad";
import { getVariantById } from "../variants/variantRegistry";
import * as fs from "node:fs";
import * as path from "node:path";

const VARIANT_IDS = [
  "lasca_7_classic",
  "lasca_8_dama_board",
  "dama_8_classic_standard",
  "dama_8_classic_international",
  "damasca_8",
] as const;

describe("offline baseline smoke", () => {
  it("can generate and apply at least one legal move from each initial position", () => {
    for (const variantId of VARIANT_IDS) {
      const s0 = createInitialGameStateForVariant(variantId as any);
      const legal = generateLegalMoves(s0);
      expect(legal.length, `${variantId}: expected at least one legal move`).toBeGreaterThan(0);

      const s1 = applyMove(s0, legal[0]);

      // Basic sanity: state stays well-formed and turn usually changes.
      expect(s1.board).toBeInstanceOf(Map);
      expect(s1.phase).toBeDefined();
      expect(s1.meta?.variantId).toBe(variantId);

      // For capture chains some rulesets may keep same toMove mid-chain; accept either,
      // but ensure something changed.
      const changed = s1.toMove !== s0.toMove || s1.board.size !== s0.board.size;
      expect(changed, `${variantId}: expected state to change after applyMove`).toBe(true);
    }
  });

  it("can load golden fixtures and apply a legal move", () => {
    const fixturesDir = path.resolve(process.cwd(), "docs", "test-saves");
    const fixtures = [
      "dama-promotion-delayed-until-chain-ends.json",
      "damasca-promotion-delayed-until-chain-ends.json",
      "damasca-no-rejump-square.json",
      "damasca-zigzag-multicapture.json",
    ];

    for (const filename of fixtures) {
      const fullPath = path.join(fixturesDir, filename);
      const raw = fs.readFileSync(fullPath, "utf8");
      const parsed = JSON.parse(raw);

      // Use the fixture's own metadata, but normalize to the canonical variant spec.
      const expectedVariantId = String(parsed?.variantId ?? parsed?.current?.meta?.variantId);
      const v = getVariantById(expectedVariantId as any);

      const loaded = deserializeSaveData(parsed as any, {
        variantId: v.variantId as any,
        rulesetId: v.rulesetId as any,
        boardSize: v.boardSize as any,
        ...(v.rulesetId === "dama" ? { damaCaptureRemoval: (v as any).damaCaptureRemoval } : {}),
      } as any);

      const state = loaded.state;
      const legal = generateLegalMoves(state);
      expect(legal.length, `${filename}: expected at least one legal move`).toBeGreaterThan(0);

      const next = applyMove(state, legal[0]);
      expect(next.board).toBeInstanceOf(Map);
    }
  });
});
