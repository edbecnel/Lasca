import type { GameController } from "../controller/gameController";
import type { GameState } from "../game/state";
import { evaluateState } from "../ai/evaluate";
import type { Player, Piece } from "../types";

type EvaluationMode = "advantage" | "control" | "material";

const LS_KEY_MODE = "lasca.evaluation.mode";

function clampMode(v: string | null): EvaluationMode {
  if (v === "advantage" || v === "control" || v === "material") return v;
  return "advantage";
}

function formatSigned(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "±";
  const abs = Math.abs(n);
  return `${sign}${abs.toFixed(1)}`;
}

function pieceValue(p: Piece): number {
  return p.rank === "O" ? 1.6 : 1.0;
}

function countControlledStacks(state: GameState, p: Player): number {
  let n = 0;
  for (const stack of state.board.values()) {
    if (!stack || stack.length === 0) continue;
    const top = stack[stack.length - 1];
    if (top.owner === p) n++;
  }
  return n;
}

function sumMaterial(state: GameState, p: Player): number {
  let total = 0;
  for (const stack of state.board.values()) {
    if (!stack || stack.length === 0) continue;
    for (const piece of stack) {
      if (piece.owner === p) total += pieceValue(piece);
    }
  }
  return total;
}

function formatAdvantage(state: GameState): string {
  // evaluateState returns an arbitrary scale. In this codebase, soldier ≈ 100.
  // Convert to "soldier units" for display.
  const scoreWhitePerspective = evaluateState(state, "W");
  const units = scoreWhitePerspective / 100;

  if (Math.abs(units) < 0.05) return "Even";
  return units > 0 ? `White ${formatSigned(units)}` : `Black ${formatSigned(units)}`;
}

function formatControl(state: GameState): string {
  const w = countControlledStacks(state, "W");
  const b = countControlledStacks(state, "B");
  if (w === b) return `Controlled stacks: White ${w} / Black ${b} (even)`;
  const leader = w > b ? "White" : "Black";
  const diff = Math.abs(w - b);
  return `Controlled stacks: White ${w} / Black ${b} (${leader} +${diff})`;
}

function formatMaterial(state: GameState): string {
  const w = sumMaterial(state, "W");
  const b = sumMaterial(state, "B");
  if (Math.abs(w - b) < 0.05) return `Material: White ${w.toFixed(1)} / Black ${b.toFixed(1)} (even)`;
  const leader = w > b ? "White" : "Black";
  const diff = Math.abs(w - b);
  return `Material: White ${w.toFixed(1)} / Black ${b.toFixed(1)} (${leader} +${diff.toFixed(1)})`;
}

export function bindEvaluationPanel(controller: GameController): void {
  const modeRootEl = document.getElementById("evaluationMode") as HTMLElement | null;
  const valueEl = document.getElementById("evaluationValue") as HTMLElement | null;
  if (!modeRootEl || !valueEl) return;

  const btnEls = Array.from(modeRootEl.querySelectorAll<HTMLButtonElement>(".evalModeBtn"));
  if (btnEls.length === 0) return;

  let mode: EvaluationMode = clampMode(localStorage.getItem(LS_KEY_MODE));

  const setMode = (next: EvaluationMode) => {
    mode = next;
    localStorage.setItem(LS_KEY_MODE, mode);
    for (const btn of btnEls) {
      const m = clampMode(btn.getAttribute("data-mode"));
      btn.setAttribute("aria-pressed", String(m === mode));
    }
  };

  const render = () => {
    const state = controller.getState();
    const currentMode = mode;

    if (controller.isOver()) {
      // Still show something useful, but avoid implying certainty.
      if (currentMode === "advantage") valueEl.textContent = `Final: ${formatAdvantage(state)}`;
      else if (currentMode === "control") valueEl.textContent = `Final: ${formatControl(state)}`;
      else valueEl.textContent = `Final: ${formatMaterial(state)}`;
      return;
    }

    if (currentMode === "advantage") valueEl.textContent = formatAdvantage(state);
    else if (currentMode === "control") valueEl.textContent = formatControl(state);
    else valueEl.textContent = formatMaterial(state);
  };

  for (const btn of btnEls) {
    btn.addEventListener("click", () => {
      const next = clampMode(btn.getAttribute("data-mode"));
      setMode(next);
      render();
    });
  }

  controller.addHistoryChangeCallback(render);
  setMode(mode);
  render();
}
