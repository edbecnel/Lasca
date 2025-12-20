import type { GameState } from "./state.ts";
import type { Move } from "./moveTypes.ts";
import { parseNodeId, makeNodeId, isPlayable, inBounds } from "./coords.ts";

export function generateLegalMoves(state: GameState): Move[] {
  const moves: Move[] = [];

  const isEmpty = (id: string) => !state.board.has(id) || (state.board.get(id) ?? []).length === 0;

  for (const [fromId, stack] of state.board.entries()) {
    if (!stack || stack.length === 0) continue;

    const top = stack[stack.length - 1];
    if (top.owner !== state.toMove) continue;

    const { r, c } = parseNodeId(fromId);

    const candidates: string[] = [];

    if (top.rank === "S") {
      const dr = top.owner === "B" ? +1 : -1; // Black forward +1, White forward -1
      for (const dc of [-1, +1]) {
        const nr = r + dr;
        const nc = c + dc;
        if (inBounds(nr, nc) && isPlayable(nr, nc)) {
          const to = makeNodeId(nr, nc);
          if (isEmpty(to)) candidates.push(to);
        }
      }
    } else {
      // Officer: one step diagonally any direction
      const deltas = [
        { dr: -1, dc: -1 },
        { dr: -1, dc: +1 },
        { dr: +1, dc: -1 },
        { dr: +1, dc: +1 },
      ];
      for (const { dr, dc } of deltas) {
        const nr = r + dr;
        const nc = c + dc;
        if (inBounds(nr, nc) && isPlayable(nr, nc)) {
          const to = makeNodeId(nr, nc);
          if (isEmpty(to)) candidates.push(to);
        }
      }
    }

    for (const to of candidates) {
      moves.push({ from: fromId, to, kind: "move" });
    }
  }

  return moves;
}
