import type { GameState, NodeId } from "./state.ts";
import type { DamaCaptureRemoval } from "../variants/variantTypes";
import { promoteIfNeeded } from "./promote.ts";

export function getDamaCaptureRemovalMode(state: GameState): DamaCaptureRemoval {
  const rulesetId = state.meta?.rulesetId ?? "lasca";
  if (rulesetId !== "dama") return "immediate";
  return state.meta?.damaCaptureRemoval ?? "immediate";
}

export function finalizeDamaCaptureChain(
  state: GameState,
  lastLanding: NodeId,
  jumpedSquares: Iterable<NodeId>
): GameState & { didPromote?: boolean } {
  const mode = getDamaCaptureRemovalMode(state);

  let board = state.board;
  if (mode === "end_of_sequence") {
    const nextBoard = new Map(board);
    for (const over of jumpedSquares) {
      if (over === lastLanding) continue;
      nextBoard.delete(over);
    }
    board = nextBoard;
  }

  const tempState: GameState = { ...state, board };
  const didPromote = promoteIfNeeded(tempState, lastLanding);

  return { ...tempState, didPromote };
}
