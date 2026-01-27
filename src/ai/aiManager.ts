import type { Move } from "../game/moveTypes.ts";
import { serializeGameState } from "../game/saveLoad.ts";
import type { Player } from "../types.ts";
import type { GameController } from "../controller/gameController.ts";
import type { HistoryChangeReason } from "../controller/gameController.ts";
import type { AISettings, AIDifficulty, AIWorkerResponse } from "./aiTypes.ts";
import { difficultyForPlayer } from "./aiTypes.ts";

const LS_KEYS = {
  white: "lasca.ai.white",
  black: "lasca.ai.black",
  delay: "lasca.ai.delayMs",
  paused: "lasca.ai.paused",
};

const DEFAULT_DELAY_MS = 500;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function parseDelayMs(raw: string, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return clamp(Math.round(n), 0, 3000);
}

function parseDifficulty(v: string | null): AIDifficulty {
  if (v === "easy" || v === "medium" || v === "advanced" || v === "human") return v;
  return "human";
}

type ActiveDifficulty = Exclude<AIDifficulty, "human">;

function formatScore(score: number | undefined): string {
  if (score === undefined || !Number.isFinite(score)) return "?";
  const pawns = score / 100;
  const sign = pawns > 0 ? "+" : "";
  return `${sign}${pawns.toFixed(2)}`;
}

function formatMove(m: Move | null): string {
  if (!m) return "(none)";
  if (m.kind === "capture") return `${m.from} x ${m.over} -> ${m.to}`;
  return `${m.from} -> ${m.to}`;
}

export class AIManager {
  private controller: GameController;
  private settings: AISettings;
  private worker: Worker | null = null;
  private requestId = 1;
  private busy = false;
  private activeRequestId: number | null = null;
  private stepping = false;
  private moveDoneResolvers = new Map<number, () => void>();
  private workerTimers = new Map<number, number>();
  private workerFallbackMoves = new Map<number, Move>();

  private elWhite: HTMLSelectElement | null = null;
  private elBlack: HTMLSelectElement | null = null;
  private elDelay: HTMLInputElement | null = null;
  private elDelayReset: HTMLButtonElement | null = null;
  private elDelayLabel: HTMLElement | null = null;
  private elPause: HTMLButtonElement | null = null;
  private elStep: HTMLButtonElement | null = null;
  private elInfo: HTMLElement | null = null;

  private static readonly TAP_RESUME_TOAST_KEY = "aiPausedTapResume";

  private toastSyncTimer: number | null = null;

  private lastBoardTapAtMs: number = 0;

  constructor(controller: GameController) {
    this.controller = controller;
    this.settings = this.loadSettings();

    // Clicking the sticky "Tap anywhere to resume AI" toast should resume AI.
    this.controller.setStickyToastAction(AIManager.TAP_RESUME_TOAST_KEY, () => {
      if (this.shouldOfferTapToResume()) this.resumeAI();
    });

    this.ensureWorker();

    // Subscribe to turn boundaries (history changes).
    this.controller.addHistoryChangeCallback((reason) => this.onHistoryChanged(reason));
  }

  private isBothAI(): boolean {
    return this.settings.white !== "human" && this.settings.black !== "human";
  }

  private isFreshGame(): boolean {
    // Heuristic: `newGame()` clears history and pushes exactly one state.
    // Avoid auto-pausing on normal moves/undo/redo.
    try {
      const h = this.controller.getHistory ? this.controller.getHistory() : null;
      return Array.isArray(h) && h.length === 1 && !!h[0]?.isCurrent;
    } catch {
      return false;
    }
  }

  private forcePausedUI(): void {
    this.settings.paused = true;
    localStorage.setItem(LS_KEYS.paused, "true");
    this.refreshUI();
  }

  private isHumanVsAI(): boolean {
    const wHuman = this.settings.white === "human";
    const bHuman = this.settings.black === "human";
    return (wHuman && !bHuman) || (!wHuman && bHuman);
  }

  private shouldOfferTapToResume(): boolean {
    if (!this.settings.paused) return false;
    if (this.controller.isOver()) return false;

    const p: Player = this.controller.getState().toMove;
    const diff = difficultyForPlayer(this.settings, p);
    return diff !== "human";
  }

  private syncPausedTurnToastNow(): void {
    if (this.controller.isOver()) {
      this.controller.clearStickyToast(AIManager.TAP_RESUME_TOAST_KEY);
      return;
    }

    const toMove: Player = this.controller.getState().toMove;
    const diff = difficultyForPlayer(this.settings, toMove);
    const isAiTurn = diff !== "human";

    if (this.settings.paused && isAiTurn) {
      const label = toMove === "B" ? "Black" : "White";
      this.controller.showStickyToast(
        AIManager.TAP_RESUME_TOAST_KEY,
        `${label}'s turn. Tap anywhere to resume AI`,
        { force: true }
      );
    } else {
      this.controller.clearStickyToast(AIManager.TAP_RESUME_TOAST_KEY);
    }
  }

  private schedulePausedTurnToastSync(): void {
    // Defer to the next tick so this sticky hint is not immediately overwritten
    // by the controller's own timed turn-change toast.
    if (this.toastSyncTimer) return;
    this.toastSyncTimer = window.setTimeout(() => {
      this.toastSyncTimer = null;
      this.syncPausedTurnToastNow();
    }, 0);
  }

  private resumeAI(): void {
    if (!this.settings.paused) return;
    this.settings.paused = false;
    localStorage.setItem(LS_KEYS.paused, "false");
    this.refreshUI();
    this.syncPausedTurnToastNow();
    this.kick();
  }

  private bindBoardTapToResume(): void {
    if (typeof document === "undefined") return;
    const boardWrap = document.getElementById("boardWrap") as HTMLElement | null;
    const boardSvg = boardWrap?.querySelector("svg") as SVGSVGElement | null;
    if (!boardSvg) return;

    const onTap = (ev: Event) => {
      // On many devices, a single tap produces both pointerdown and click.
      // Avoid handling both, otherwise we can pause on pointerdown and then
      // immediately resume on the follow-up click (making the toast flash).
      const now = Date.now();
      if (ev.type === "click" && now - this.lastBoardTapAtMs < 350) {
        return;
      }

      // Prefer resuming when paused and it's an AI turn.
      if (this.shouldOfferTapToResume()) {
        ev.preventDefault();
        ev.stopPropagation();
        this.lastBoardTapAtMs = now;
        this.resumeAI();
        return;
      }

      // In AI-vs-AI, allow tapping the board to pause AI.
      // Useful for spectators who want to stop the game and inspect.
      if (this.isBothAI() && !this.settings.paused && !this.controller.isOver()) {
        ev.preventDefault();
        ev.stopPropagation();
        this.lastBoardTapAtMs = now;
        this.forcePausedUI();
        this.syncPausedTurnToastNow();
        return;
      }
    };

    // Use capture so we can intercept before the GameController click handler
    // (otherwise a tap might select pieces instead of resuming AI).
    boardSvg.addEventListener("pointerdown", onTap, { capture: true });
    boardSvg.addEventListener("click", onTap, { capture: true });
  }

  private ensureWorker(): void {
    if (this.worker) return;
    try {
      this.worker = new Worker(new URL("./aiWorker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (ev: MessageEvent<AIWorkerResponse>) => this.onWorkerMessage(ev.data);
      this.worker.onerror = (ev) => {
        // If the worker crashes, don't leave the UI frozen.
        if ((import.meta as any).env?.DEV) {
          // eslint-disable-next-line no-console
          console.error("[ai] worker error", ev);
        }
        this.onWorkerFailed();
      };
      this.worker.onmessageerror = (ev) => {
        if ((import.meta as any).env?.DEV) {
          // eslint-disable-next-line no-console
          console.error("[ai] worker message error", ev);
        }
        this.onWorkerFailed();
      };
    } catch {
      this.worker = null;
    }
  }

  private clearWorkerTimer(requestId: number): void {
    const tid = this.workerTimers.get(requestId);
    if (tid !== undefined) {
      window.clearTimeout(tid);
      this.workerTimers.delete(requestId);
    }
    this.workerFallbackMoves.delete(requestId);
  }

  bind(): void {
    this.elWhite = document.getElementById("aiWhiteSelect") as HTMLSelectElement | null;
    this.elBlack = document.getElementById("aiBlackSelect") as HTMLSelectElement | null;
    this.elDelay = document.getElementById("aiDelay") as HTMLInputElement | null;
    this.elDelayReset = document.getElementById("aiDelayReset") as HTMLButtonElement | null;
    this.elDelayLabel = document.getElementById("aiDelayLabel");
    this.elPause = document.getElementById("aiPauseBtn") as HTMLButtonElement | null;
    this.elStep = document.getElementById("aiStepBtn") as HTMLButtonElement | null;
    this.elInfo = document.getElementById("aiInfo");

    if (this.elWhite) {
      this.elWhite.value = this.settings.white;
      this.elWhite.addEventListener("change", () => {
        this.settings.white = parseDifficulty(this.elWhite!.value);
        localStorage.setItem(LS_KEYS.white, this.settings.white);
        this.refreshUI();
        this.kick();
      });
    }

    if (this.elBlack) {
      this.elBlack.value = this.settings.black;
      this.elBlack.addEventListener("change", () => {
        this.settings.black = parseDifficulty(this.elBlack!.value);
        localStorage.setItem(LS_KEYS.black, this.settings.black);
        this.refreshUI();
        this.kick();
      });
    }

    if (this.elDelay) {
      this.elDelay.value = String(this.settings.delayMs);
      this.elDelay.addEventListener("input", () => {
        const v = parseDelayMs(this.elDelay!.value || String(DEFAULT_DELAY_MS), DEFAULT_DELAY_MS);
        this.settings.delayMs = v;
        localStorage.setItem(LS_KEYS.delay, String(v));
        this.refreshUI();
      });
    }

    if (this.elDelayReset) {
      this.elDelayReset.addEventListener("click", () => {
        const v = clamp(DEFAULT_DELAY_MS, 0, 3000);
        this.settings.delayMs = v;
        if (this.elDelay) this.elDelay.value = String(v);
        localStorage.setItem(LS_KEYS.delay, String(v));
        this.refreshUI();
      });
    }

    if (this.elPause) {
      this.elPause.addEventListener("click", () => {
        this.settings.paused = !this.settings.paused;
        localStorage.setItem(LS_KEYS.paused, String(this.settings.paused));
        this.refreshUI();
        if (!this.settings.paused) this.kick();
      });
    }

    if (this.elStep) {
      this.elStep.addEventListener("click", () => {
        // Step one AI move (useful for AI-vs-AI).
        if (this.busy) return;
        this.settings.paused = true;
        localStorage.setItem(LS_KEYS.paused, "true");
        this.refreshUI();
        this.stepOnce();
      });
    }

    // Always start in paused mode on page load.
    // User must explicitly click Resume to start AI play.
    this.forcePausedUI();

    // Make it easy for mobile/newcomers: tapping the board resumes AI when it's AI's turn.
    this.bindBoardTapToResume();

    // If we're paused on an AI turn in human-vs-AI, show a persistent hint.
    this.schedulePausedTurnToastSync();

    // Don't auto-kick on page load - wait for user to Resume.
  }

  onHistoryChanged(reason?: HistoryChangeReason): void {
    // Loading a save should always pause AI.
    // Otherwise, a running AI can immediately start playing from the loaded position.
    if (reason === "loadGame") {
      if (this.busy || this.activeRequestId !== null) {
        this.onWorkerFailed();
      }
      this.forcePausedUI();
      return;
    }

    // When the game ends, always pause AI.
    if (reason === "gameOver") {
      if (this.busy || this.activeRequestId !== null) {
        this.onWorkerFailed();
      }
      this.forcePausedUI();
      return;
    }

    // Undo/Redo/Jump are explicit user navigation: immediately pause AI.
    // This prevents AI from instantly replaying a navigated position.
    if (reason === "undo" || reason === "redo" || reason === "jump") {
      this.forcePausedUI();
      return;
    }

    // New Game should start paused when both sides are AI.
    if (this.isBothAI() && (reason === "newGame" || this.isFreshGame())) {
      this.forcePausedUI();
      return;
    }

    // Turn likely changed; re-evaluate.
    this.kick();
  }

  private loadSettings(): AISettings {
    const white = parseDifficulty(localStorage.getItem(LS_KEYS.white));
    const black = parseDifficulty(localStorage.getItem(LS_KEYS.black));
    const delay = parseDelayMs(localStorage.getItem(LS_KEYS.delay) || String(DEFAULT_DELAY_MS), DEFAULT_DELAY_MS);
    // Default to paused on page load (startup). User must explicitly Resume.
    const pausedValue = localStorage.getItem(LS_KEYS.paused);
    const paused = pausedValue === null ? true : pausedValue === "true";
    return { white, black, delayMs: delay, paused };
  }

  private refreshUI(): void {
    if (this.elDelayLabel) this.elDelayLabel.textContent = `${this.settings.delayMs} ms`;
    if (this.elDelayReset) this.elDelayReset.title = `Reset to default speed (${DEFAULT_DELAY_MS} ms)`;

    if (this.elPause) {
      this.elPause.textContent = this.settings.paused ? "Resume AI" : "Pause AI";
    }

    // Input lock: if it's an AI turn and we are not paused, lock input.
    const p: Player = this.controller.getState().toMove;
    const diff = difficultyForPlayer(this.settings, p);
    const shouldLock = !this.settings.paused && diff !== "human";
    if (this.controller.setInputEnabled) {
      this.controller.setInputEnabled(!shouldLock);
    }

    if (this.elInfo) {
      const w = this.settings.white;
      const b = this.settings.black;
      const bothAI = w !== "human" && b !== "human";
      const note = bothAI ? "Both sides are AI — use Pause/Step." : "";
      this.elInfo.textContent = note;
    }

    if (this.elStep) {
      const p: Player = this.controller.getState().toMove;
      const diff = difficultyForPlayer(this.settings, p);
      const canStep = !this.busy && !this.controller.isOver() && diff !== "human";
      this.elStep.disabled = !canStep;
    }

    this.schedulePausedTurnToastSync();
  }

  private onWorkerFailed(): void {
    // Disable worker and unblock any pending request/Step.
    const doomedRequestId = this.activeRequestId;
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch {
        // ignore
      }
    }
    this.worker = null;
    this.busy = false;
    this.activeRequestId = null;

    if (doomedRequestId !== null) {
      this.clearWorkerTimer(doomedRequestId);
      const resolve = this.moveDoneResolvers.get(doomedRequestId);
      if (resolve) {
        this.moveDoneResolvers.delete(doomedRequestId);
        resolve();
      }
    }

    this.refreshUI();
  }

  private kick(): void {
    if (this.settings.paused) {
      this.refreshUI();
      return;
    }

    // Defer so UI updates and animations settle.
    window.setTimeout(() => this.maybeMove(), 0);
  }

  private async stepOnce(): Promise<void> {
    // Perform exactly one AI move if the current side is AI.
    const p: Player = this.controller.getState().toMove;
    const diff = difficultyForPlayer(this.settings, p);
    if (diff === "human") return;

    this.stepping = true;
    try {
      await this.maybeMove(/*force*/ true);
    } finally {
      this.stepping = false;
    }
  }

  private async maybeMove(force: boolean = false): Promise<void> {
    if (this.busy) return;
    if (this.controller.isOver()) return;

    const state = this.controller.getState();
    const p: Player = state.toMove;
    const difficulty = difficultyForPlayer(this.settings, p);

    if (!force && this.settings.paused) return;
    if (difficulty === "human") {
      this.refreshUI();
      return;
    }

    const legal = this.controller.getLegalMovesForTurn
      ? this.controller.getLegalMovesForTurn() as Move[]
      : [];

    if (!legal || legal.length === 0) {
      // No moves; controller should already handle game-over messaging.
      if (this.controller.setInputEnabled) {
        this.controller.setInputEnabled(true);
      }
      this.refreshUI();
      return;
    }

    // Lock human input during AI decision.
    if (this.controller.setInputEnabled) {
      this.controller.setInputEnabled(false);
    }

    this.busy = true;
    const myRequestId = this.requestId++;
    this.activeRequestId = myRequestId;

    // Grab capture-chain constraints (if any).
    const constraints = this.controller.getCaptureChainConstraints
      ? this.controller.getCaptureChainConstraints()
      : { lockedCaptureFrom: null, lockedCaptureDir: null, jumpedSquares: [] };

    const serialized = serializeGameState(state);

    // Prefer worker; fall back to greedy.
    this.ensureWorker();
    if (this.worker) {
      const waitForMove = force;
      const done = waitForMove
        ? new Promise<void>((resolve) => {
            this.moveDoneResolvers.set(myRequestId, resolve);
          })
        : null;

      // If the worker gets stuck, apply a safe fallback move so the game cannot freeze.
      const timeoutMs = difficulty === "advanced" ? 4000 : 6000;
      const fallbackMove = legal[Math.floor(Math.random() * legal.length)];
      this.workerFallbackMoves.set(myRequestId, fallbackMove);
      const tid = window.setTimeout(() => {
        if (this.activeRequestId !== myRequestId) return;
        if ((import.meta as any).env?.DEV) {
          // eslint-disable-next-line no-console
          console.warn("[ai] worker timeout; applying fallback move", { requestId: myRequestId, difficulty });
        }
        // Reset the worker for next time.
        this.onWorkerFailed();
        // Apply fallback move (still validated against current legal moves).
        void this.applyPickedMove(myRequestId, fallbackMove, { ms: timeoutMs });
      }, timeoutMs);
      this.workerTimers.set(myRequestId, tid);

      this.worker.postMessage({
        kind: "chooseMove",
        requestId: myRequestId,
        difficulty: difficulty,
        state: serialized,
        lockedFrom: constraints.lockedCaptureFrom,
        lockedDir: constraints.lockedCaptureDir,
        excludedJumpSquares: constraints.jumpedSquares,
      });

      if (done) {
        await done;
      }
      return;
    }

    // No worker: just pick first legal move.
    const picked = legal[Math.floor(Math.random() * legal.length)];
    await this.applyPickedMove(myRequestId, picked, undefined);
  }

  private async applyPickedMove(requestId: number, move: Move | null, info?: { depth?: number; nodes?: number; ms?: number }): Promise<void> {
    try {
      if (!move) return;

      const before = this.controller.getState();
      const side: Player = before.toMove;
      const difficulty = difficultyForPlayer(this.settings, side);
      const isFallback = this.workerFallbackMoves.get(requestId) === move;

      // Validate: still legal in current state.
      const legal = this.controller.getLegalMovesForTurn
        ? this.controller.getLegalMovesForTurn() as Move[]
        : [];

      const isSame = (a: Move, b: Move) => {
        if (a.kind !== b.kind) return false;
        if (a.from !== (b as any).from || (a as any).to !== (b as any).to) return false;
        if (a.kind === "capture") return (a as any).over === (b as any).over;
        return true;
      };

      if (!legal.some((m) => isSame(m, move))) {
        return;
      }

      // Delay before moving, so the user can see what's happening.
      if (!this.stepping && this.settings.delayMs > 0) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, this.settings.delayMs));
      }

      // If paused during delay, do nothing (except when stepping).
      if (this.settings.paused && !this.stepping) return;

      await this.controller.playMove(move);

      // Console telemetry (DEV only): one line per AI move.
      if ((import.meta as any).env?.DEV) {
        const depth = info?.depth;
        const nodes = info?.nodes;
        const ms = info?.ms;
        const score = (info as any)?.score as number | undefined;
        const tag = isFallback ? "fallback" : "move";
        const parts = [
          `[ai:${tag}]`,
          side === "W" ? "White" : "Black",
          String(difficulty),
          formatMove(move),
          `eval=${formatScore(score)}`,
          depth !== undefined ? `d=${depth}` : null,
          nodes !== undefined ? `n=${nodes}` : null,
          ms !== undefined ? `ms=${ms}` : null,
        ].filter(Boolean);

        // eslint-disable-next-line no-console
        console.log(parts.join(" "));
      }

    } finally {
      this.busy = false;
      this.activeRequestId = null;
      this.clearWorkerTimer(requestId);
      const resolve = this.moveDoneResolvers.get(requestId);
      if (resolve) {
        this.moveDoneResolvers.delete(requestId);
        resolve();
      }
      this.refreshUI();

      // Continue automatically if next side is also AI and not paused.
      if (!this.settings.paused) {
        window.setTimeout(() => this.maybeMove(), 0);
      }
    }
  }

  private async onWorkerMessage(msg: AIWorkerResponse): Promise<void> {
    if (!msg || msg.kind !== "chooseMoveResult") return;
    if (msg.requestId !== this.activeRequestId) return;

    this.clearWorkerTimer(msg.requestId);

    const info = msg.info;
    await this.applyPickedMove(msg.requestId, msg.move, info);
  }
}
