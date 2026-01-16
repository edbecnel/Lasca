import type { Stack, Player } from "../types";
import type { GameMeta } from "../variants/variantTypes";
import { ACTIVE_VARIANT_ID } from "../variants/activeVariant";
import { getVariantById } from "../variants/variantRegistry";
import { computeStartNodeIds } from "./initialPosition.ts";
import type { VariantId } from "../variants/variantTypes";

export type NodeId = string;
export type BoardState = Map<NodeId, Stack>;

export interface GameState {
  board: BoardState;
  toMove: Player;
  phase: "idle" | "select" | "anim";
  meta?: GameMeta;

  /**
   * Server-enforced game over (e.g., disconnect timeout).
   * When present, the game should be treated as finished.
   */
  forcedGameOver?: {
    winner: Player | null;
    reasonCode: string;
    message: string;
  };

  /**
   * Damasca-specific dead-play counters.
   *
   * Plies (half-moves) are counted and reset based on captures, promotions,
   * and soldier-advance to prevent endless non-progress play.
   */
  damascaDeadPlay?: {
    noProgressPlies: number;
    officerOnlyPlies: number;
  };

  /**
   * Ephemeral (not serialized): used by some rulesets to track multi-capture chain state.
   * Currently used by Damasca to remember if a soldier has reached the promotion row
   * at any point during a capture chain (promotion is applied at chain end).
   */
  captureChain?: {
    promotionEarned?: boolean;
  };
}

export function createInitialGameStateForVariant(variantId: VariantId): GameState {
  const board: BoardState = new Map();
  const variant = getVariantById(variantId);

  const { blackStartNodeIds, whiteStartNodeIds } = computeStartNodeIds({
    boardSize: variant.boardSize,
    piecesPerSide: variant.piecesPerSide,
  });

  // Place Black soldiers on their starting nodes
  for (const id of blackStartNodeIds) {
    board.set(id, [{ owner: "B", rank: "S" }]);
  }

  // Place White soldiers on their starting nodes
  for (const id of whiteStartNodeIds) {
    board.set(id, [{ owner: "W", rank: "S" }]);
  }

  return {
    board,
    toMove: "W",
    phase: "select",
    meta: {
      variantId,
      rulesetId: variant.rulesetId,
      boardSize: variant.boardSize,
      ...(variant.rulesetId === "dama"
        ? { damaCaptureRemoval: variant.damaCaptureRemoval ?? "immediate" }
        : {}),
    },
  };
}

export function createInitialGameState(): GameState {
  return createInitialGameStateForVariant(ACTIVE_VARIANT_ID);
}
