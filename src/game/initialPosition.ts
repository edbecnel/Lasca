export const BLACK_START_NODE_IDS = [
  "r0c0", "r0c2", "r0c4", "r0c6",
  "r1c1", "r1c3", "r1c5",
  "r2c0", "r2c2", "r2c4", "r2c6",
];

export const WHITE_START_NODE_IDS = [
  "r4c0", "r4c2", "r4c4", "r4c6",
  "r5c1", "r5c3", "r5c5",
  "r6c0", "r6c2", "r6c4", "r6c6",
];

export const DEMO_STACK_NODE_ID = "r3c3";

import type { Stack } from "../types";
export const DEMO_STACK: Stack = [
  { owner: "B", rank: "O" },
  { owner: "W", rank: "S" },
  { owner: "B", rank: "S" },
  { owner: "W", rank: "O" },
  { owner: "B", rank: "S" },
  { owner: "W", rank: "S" },
  { owner: "B", rank: "O" },
  { owner: "W", rank: "S" },
];
