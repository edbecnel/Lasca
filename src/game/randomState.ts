import type { GameState } from "./state.ts";
import type { Player, Stack } from "../types";
import { getAllNodes } from "./board.ts";
import { parseNodeId } from "./coords.ts";

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
  boardSize?: 7 | 8;     // default: 7
  ranks?: { B?: ("S"|"O")[], W?: ("S"|"O")[] }; // optional ranks per side; default all "S"
};

export function createRandomGameState(opts: RandomStateOptions = {}): GameState {
  const boardSize = opts.boardSize ?? 7;
  const allNodes = getAllNodes(boardSize);

  const totalPerSide = Math.min(
    Math.max(opts.totalPerSide ?? 11, 1),
    Math.floor(allNodes.length / 2),
  );
  const toMove = opts.toMove ?? "B";

  const bRanks = opts.ranks?.B ?? Array(totalPerSide).fill("S");
  const wRanks = opts.ranks?.W ?? Array(totalPerSide).fill("S");

  // Filter nodes for placement:
  // Black soldiers can't be on row 6 (their promotion row)
  // White soldiers can't be on row 0 (their promotion row)
  const blackSoldierNodes = allNodes.filter(n => {
    const { r } = parseNodeId(n);
    return r !== boardSize - 1; // can't place on promotion row
  });
  const whiteSoldierNodes = allNodes.filter(n => {
    const { r } = parseNodeId(n);
    return r !== 0; // White can't have soldiers on row 0
  });

  const shuffledBlackSoldiers = shuffle(blackSoldierNodes);
  const shuffledWhiteSoldiers = shuffle(whiteSoldierNodes);
  const allNodesShuffled = shuffle(allNodes);

  const board = new Map<string, Stack>();

  let blackNodeIdx = 0;
  let whiteNodeIdx = 0;
  let allNodeIdx = 0;

  for (let i = 0; i < totalPerSide; i++) {
    const bRank = bRanks[i] ?? "S";
    const wRank = wRanks[i] ?? "S";

    // For Black pieces
    if (bRank === "S") {
      // Use filtered nodes for soldiers
      const bn = shuffledBlackSoldiers[blackNodeIdx++];
      board.set(bn, [{ owner: "B", rank: bRank }]);
    } else {
      // Officers can be placed anywhere
      while (allNodeIdx < allNodesShuffled.length && board.has(allNodesShuffled[allNodeIdx])) {
        allNodeIdx++;
      }
      if (allNodeIdx < allNodesShuffled.length) {
        board.set(allNodesShuffled[allNodeIdx++], [{ owner: "B", rank: bRank }]);
      }
    }

    // For White pieces
    if (wRank === "S") {
      // Use filtered nodes for soldiers
      const wn = shuffledWhiteSoldiers[whiteNodeIdx++];
      board.set(wn, [{ owner: "W", rank: wRank }]);
    } else {
      // Officers can be placed anywhere
      while (allNodeIdx < allNodesShuffled.length && board.has(allNodesShuffled[allNodeIdx])) {
        allNodeIdx++;
      }
      if (allNodeIdx < allNodesShuffled.length) {
        board.set(allNodesShuffled[allNodeIdx++], [{ owner: "W", rank: wRank }]);
      }
    }
  }

  return {
    board,
    toMove,
    phase: "idle",
    meta: {
      variantId: boardSize === 8 ? "lasca_8_dama_board" : "lasca_7_classic",
      rulesetId: "lasca",
      boardSize,
    },
  };
}
