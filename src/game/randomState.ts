import type { GameState } from "./state.ts";
import type { Player, Stack } from "../types";
import { ALL_NODES } from "./board.ts";

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export type RandomStateOptions = {
  totalPerSide?: number; // default: 11
  toMove?: Player;       // default: "B"
  ranks?: { B?: ("S"|"O")[], W?: ("S"|"O")[] }; // optional ranks per side; default all "S"
};

export function createRandomGameState(opts: RandomStateOptions = {}): GameState {
  const totalPerSide = Math.min(Math.max(opts.totalPerSide ?? 11, 1), Math.floor(ALL_NODES.length / 2));
  const toMove = opts.toMove ?? "B";

  const nodes = shuffle(ALL_NODES);
  const blackNodes = nodes.slice(0, totalPerSide);
  const whiteNodes = nodes.slice(totalPerSide, totalPerSide * 2);

  const board = new Map<string, Stack>();

  const bRanks = opts.ranks?.B ?? Array(totalPerSide).fill("S");
  const wRanks = opts.ranks?.W ?? Array(totalPerSide).fill("S");

  for (let i = 0; i < totalPerSide; i++) {
    const bn = blackNodes[i];
    const wr = bRanks[i] ?? "S";
    board.set(bn, [{ owner: "B", rank: wr }]);

    const wn = whiteNodes[i];
    const rr = wRanks[i] ?? "S";
    board.set(wn, [{ owner: "W", rank: rr }]);
  }

  return { board, toMove, phase: "idle" };
}
