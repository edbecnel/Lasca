import type { Stack, Player } from "../types";
import {
  BLACK_START_NODE_IDS,
  WHITE_START_NODE_IDS,
  DEMO_STACK_NODE_ID,
  DEMO_STACK,
} from "./initialPosition.ts";

export type NodeId = string;
export type BoardState = Map<NodeId, Stack>;

export interface GameState {
  board: BoardState;
  toMove: Player;
  phase: "idle" | "select" | "anim";
}

export function createInitialGameState(): GameState {
  const board: BoardState = new Map();

  // Place Black soldiers on their starting nodes
  for (const id of BLACK_START_NODE_IDS) {
    board.set(id, [{ owner: "B", rank: "S" }]);
  }

  // Place White soldiers on their starting nodes
  for (const id of WHITE_START_NODE_IDS) {
    board.set(id, [{ owner: "W", rank: "S" }]);
  }

  // Also place the demo stack for dev/testing
  board.set(DEMO_STACK_NODE_ID, DEMO_STACK);

  return {
    board,
    toMove: "W",
    phase: "select",
  };
}
