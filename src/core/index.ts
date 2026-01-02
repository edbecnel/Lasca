// "Core" is a stable, deterministic rules surface (no DOM, no rendering).
// Strangler approach: initially this just re-exports the existing pure modules.

export type { GameState } from "../game/state.ts";
export type { Move } from "../game/moveTypes.ts";

export { createInitialGameStateForVariant } from "../game/state.ts";
export { generateLegalMoves } from "../game/movegen.ts";
export { applyMove } from "../game/applyMove.ts";

export { finalizeDamaCaptureChain, getDamaCaptureRemovalMode } from "../game/damaCaptureChain.ts";
export { finalizeDamascaCaptureChain } from "../game/damascaCaptureChain.ts";

export { checkCurrentPlayerLost, getWinner } from "../game/gameOver.ts";
export { hashGameState } from "../game/hashState.ts";
