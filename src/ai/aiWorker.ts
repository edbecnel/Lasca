/// <reference lib="webworker" />

import type { AIWorkerRequest, AIWorkerResponse } from "./aiTypes.ts";
import { deserializeGameState } from "../game/saveLoad.ts";
import { chooseMoveByDifficulty } from "./search.ts";

self.onmessage = (ev: MessageEvent<AIWorkerRequest>) => {
  const msg = ev.data;
  if (!msg || msg.kind !== "chooseMove") return;

  const t0 = performance.now();
  const state = deserializeGameState(msg.state as any);
  const ctx = {
    state,
    lockedFrom: msg.lockedFrom,
    excludedJumpSquares: new Set<string>(msg.excludedJumpSquares || []),
  };

  // Allow overrides from UI later if desired.
  const difficulty = msg.difficulty;

  const result = chooseMoveByDifficulty(ctx, difficulty);
  const t1 = performance.now();

  const resp: AIWorkerResponse = {
    kind: "chooseMoveResult",
    requestId: msg.requestId,
    move: result.move,
    info: {
      ...result.info,
      ms: Math.round(t1 - t0),
    },
  };

  (self as any).postMessage(resp);
};
