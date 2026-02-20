import type { GameController, HistoryChangeReason } from "../controller/gameController.ts";
import { checkCurrentPlayerLost } from "../game/gameOver.ts";
import { createPrng } from "../shared/prng.ts";
import type { Player } from "../types.ts";
import type { Move } from "../game/moveTypes.ts";
import type { BotTier } from "./presets.ts";
import { BOT_PRESETS } from "./presets.ts";
import { adaptAfterGame, normalizeAdaptState, type AdaptState } from "./adaptive.ts";
import { gameStateToFen } from "./fen.ts";
import { uciToLegalMove } from "./chessMoveMap.ts";
import type { UciEngine } from "./uciEngine.ts";
import { StockfishUciEngine } from "./stockfishEngine.ts";
import { HttpUciEngine } from "./httpEngine.ts";

export type BotSideSetting = "human" | BotTier;

type BotSettings = {
  white: BotSideSetting;
  black: BotSideSetting;
  paused: boolean;
};

const LS_KEYS = {
  white: "lasca.chessbot.white",
  black: "lasca.chessbot.black",
  paused: "lasca.chessbot.paused",
  adaptPrefix: "lasca.chessbot.adapt.",
} as const;

function parseSideSetting(v: string | null): BotSideSetting {
  if (v === "beginner" || v === "intermediate" || v === "strong" || v === "human") return v;
  return "human";
}

function safeBool(raw: string | null, fallback: boolean): boolean {
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return fallback;
}

function tierForPlayer(settings: BotSettings, p: Player): BotTier | null {
  const v = p === "W" ? settings.white : settings.black;
  return v === "human" ? null : v;
}

function isHumanForPlayer(settings: BotSettings, p: Player): boolean {
  return (p === "W" ? settings.white : settings.black) === "human";
}

function other(p: Player): Player {
  return p === "W" ? "B" : "W";
}

function plyCountFromController(controller: GameController): number {
  try {
    const h = controller.getHistory();
    return Math.max(0, h.length - 1);
  } catch {
    return 0;
  }
}

function fullmoveFromPly(ply: number): number {
  return Math.floor(ply / 2) + 1;
}

export class ChessBotManager {
  private controller: GameController;
  private engineFactory: () => UciEngine;
  private engine: UciEngine | null = null;

  private engineReady = false;
  private allowFallbackDuringWarmup = false;
  private readonly serverEngineUrl: string | null;

  private settings: BotSettings;

  private elWhite: HTMLSelectElement | null = null;
  private elBlack: HTMLSelectElement | null = null;
  private elPause: HTMLButtonElement | null = null;
  private elReset: HTMLButtonElement | null = null;
  private elStatus: HTMLElement | null = null;

  private busy = false;
  private requestId = 1;

  private prewarmStarted = false;
  // On some mobile devices, first-time WASM compile can exceed 2 minutes.
  // We warm up in the background with a long timeout, but we keep per-move
  // engine attempts short so the bot still plays (with a fallback) immediately.
  private initTimeoutMs = 300_000;
  private initRetryCount = 0;
  private initRetryTimer: number | null = null;
  private engineBackoffUntilMs = 0;
  private engineFailureCount = 0;

  private undoTakebackInProgress = false;

  private engineLabel(): string {
    return this.serverEngineUrl ? "Stockfish server" : "Stockfish";
  }

  private static readonly PAUSED_TURN_TOAST_KEY = "chessbot_paused_turn";
  private static readonly WARMUP_TOAST_KEY = "chessbot_warmup";
  private tapToResumeInstalled = false;
  private toastSyncTimer: number | null = null;
  private lastTapToResumeAtMs = 0;

  constructor(controller: GameController, opts?: { engineFactory?: () => UciEngine }) {
    this.controller = controller;
    this.serverEngineUrl =
      (import.meta as any).env?.VITE_STOCKFISH_SERVER_URL &&
      String((import.meta as any).env.VITE_STOCKFISH_SERVER_URL).trim().length > 0
        ? String((import.meta as any).env.VITE_STOCKFISH_SERVER_URL).trim()
        : null;

    this.engineFactory =
      opts?.engineFactory ??
      (() => (this.serverEngineUrl ? new HttpUciEngine(this.serverEngineUrl) : new StockfishUciEngine()));

    this.settings = this.loadSettings();

    this.controller.addHistoryChangeCallback((reason) => this.onHistoryChanged(reason));
  }

  bind(): void {
    this.elWhite = document.getElementById("botWhiteSelect") as HTMLSelectElement | null;
    this.elBlack = document.getElementById("botBlackSelect") as HTMLSelectElement | null;
    this.elPause = document.getElementById("botPauseBtn") as HTMLButtonElement | null;
    this.elReset = document.getElementById("botResetLearningBtn") as HTMLButtonElement | null;
    this.elStatus = document.getElementById("botStatus");

    // Classic Chess bot UX: always start paused (but only meaningful if a bot is enabled).
    // This prevents surprise moves immediately on load/launch.
    if (this.settings.white !== "human" || this.settings.black !== "human") {
      this.settings.paused = true;
      try {
        localStorage.setItem(LS_KEYS.paused, String(this.settings.paused));
      } catch {
        // ignore
      }

      // Warm up the engine immediately so the first bot move doesn't pay the full
      // WASM fetch/compile cost on-demand.
      this.prewarmEngine();
    }

    this.installTapAnywhereToResume();

    if (this.elWhite) {
      this.elWhite.value = this.settings.white;
      this.elWhite.addEventListener("change", () => {
        this.settings.white = parseSideSetting(this.elWhite!.value);
        localStorage.setItem(LS_KEYS.white, this.settings.white);
        if (this.settings.white !== "human" || this.settings.black !== "human") {
          this.prewarmEngine();
        }
        this.refreshUI();
        this.kick();
      });
    }

    if (this.elBlack) {
      this.elBlack.value = this.settings.black;
      this.elBlack.addEventListener("change", () => {
        this.settings.black = parseSideSetting(this.elBlack!.value);
        localStorage.setItem(LS_KEYS.black, this.settings.black);
        if (this.settings.white !== "human" || this.settings.black !== "human") {
          this.prewarmEngine();
        }
        this.refreshUI();
        this.kick();
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

    if (this.elReset) {
      this.elReset.addEventListener("click", () => {
        const ok = confirm("Reset bot learning for all tiers?");
        if (!ok) return;
        this.resetLearning();
        this.refreshUI();
      });
    }

    this.refreshUI();
    this.kick();
  }

  private resetEngine(): void {
    try {
      this.engine?.terminate?.();
    } catch {
      // ignore
    }
    this.engine = null;
    this.engineReady = false;
  }

  private prewarmEngine(): void {
    if (this.prewarmStarted) return;
    this.prewarmStarted = true;

    this.showWarmupToast();

    // Fire and forget.
    (async () => {
      try {
        const engine = this.ensureEngine();
        await engine.init({ timeoutMs: this.initTimeoutMs });
        this.engineBackoffUntilMs = 0;
        this.engineFailureCount = 0;
        this.engineReady = true;
        this.clearWarmupToast();
        // If we are paused, keep UX paused; just update status.
        this.refreshUI();

        // If the bot is active, try again now that the engine is ready.
        if (!this.settings.paused) this.kick();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[chessbot] engine prewarm failed", err);

        // If we're using a local server engine and it can't be reached, don't hard-stall.
        // Switch to built-in heuristic fallback moves automatically.
        if (this.serverEngineUrl) {
          this.allowFallbackDuringWarmup = true;
          this.setStatus("Stockfish server unavailable — using built-in bot moves");
        }

        // Keep the warmup toast visible; allow the user to tap to enable fallback/retry.
        this.showWarmupToast(true);
      }
    })();
  }

  private showWarmupToast(isError = false): void {
    const anyBot = this.settings.white !== "human" || this.settings.black !== "human";
    if (!anyBot) return;

    const engineLabel = this.engineLabel();

    const lanHint = (() => {
      if (!this.serverEngineUrl) return "";
      let serverHost = "";
      try {
        serverHost = new URL(this.serverEngineUrl).hostname;
      } catch {
        return "";
      }
      const pageHost = String(window.location.hostname || "").toLowerCase();
      const pageIsLocal = pageHost === "localhost" || pageHost === "127.0.0.1";
      const serverIsLoopback = serverHost === "localhost" || serverHost === "127.0.0.1";

      if (!pageIsLocal && serverIsLoopback) {
        return " (LAN: set server URL to your PC IP)";
      }
      return "";
    })();

    const msg = isError
      ? `${engineLabel} failed to start (yet)${lanHint}. Tap to allow fallback moves.`
      : `Warming up ${engineLabel}… first load can take a while${lanHint}. Tap to allow fallback moves.`;

    this.controller.setStickyToastAction(ChessBotManager.WARMUP_TOAST_KEY, () => {
      this.allowFallbackDuringWarmup = true;
      this.controller.clearStickyToast(ChessBotManager.WARMUP_TOAST_KEY);
      this.kick();
    });
    this.controller.showStickyToast(ChessBotManager.WARMUP_TOAST_KEY, msg, { force: true });
  }

  private clearWarmupToast(): void {
    this.controller.setStickyToastAction(ChessBotManager.WARMUP_TOAST_KEY, null);
    this.controller.clearStickyToast(ChessBotManager.WARMUP_TOAST_KEY);
  }

  private async playFallbackMove(): Promise<void> {
    const state = this.controller.getState();
    const legal = this.controller.getLegalMovesForTurn();
    if (!legal.length) return;

    // Heuristic fallback for chess:
    // 1) prefer captures (highest-value captured piece)
    // 2) prefer promotions
    // 3) otherwise random
    if (state.meta?.rulesetId === "chess") {
      const pieceValue = (rank: string | undefined): number => {
        switch (rank) {
          case "Q":
            return 9;
          case "R":
            return 5;
          case "B":
          case "N":
            return 3;
          case "P":
            return 1;
          case "K":
            return 100;
          default:
            return 0;
        }
      };

      const captureMoves = legal.filter((m) => m.kind === "capture") as Array<Move & { kind: "capture" }>;
      if (captureMoves.length) {
        let best: (Move & { kind: "capture" }) | null = null;
        let bestScore = -Infinity;
        for (const m of captureMoves) {
          const stack = state.board.get(m.over);
          const top = stack && stack.length ? stack[stack.length - 1] : null;
          const score = pieceValue((top as any)?.rank);
          if (score > bestScore) {
            bestScore = score;
            best = m;
          }
        }
        if (best) {
          await this.controller.playMove(best);
          return;
        }
      }

      // Prefer promotions (we auto-queen in applyMoveChess).
      const promoRow = state.toMove === "W" ? 0 : 7;
      const promotionMoves = legal.filter((m) => {
        if (m.kind !== "move" && m.kind !== "capture") return false;
        const moving = state.board.get((m as any).from);
        const top = moving && moving.length ? moving[moving.length - 1] : null;
        if (!top || (top as any).rank !== "P") return false;
        const to = String((m as any).to);
        const match = /^r(\d+)c(\d+)$/.exec(to);
        const r = match ? Number(match[1]) : NaN;
        return Number.isFinite(r) && r === promoRow;
      });
      if (promotionMoves.length) {
        const rng = createPrng("chessbot_fallback_promo_" + String(Date.now()));
        await this.controller.playMove(promotionMoves[rng.int(0, promotionMoves.length)]);
        return;
      }
    }

    const rng = createPrng("chessbot_fallback_" + String(Date.now()));
    await this.controller.playMove(legal[rng.int(0, legal.length)]);
  }

  private loadSettings(): BotSettings {
    try {
      const white = parseSideSetting(localStorage.getItem(LS_KEYS.white));
      const black = parseSideSetting(localStorage.getItem(LS_KEYS.black));
      const paused = safeBool(localStorage.getItem(LS_KEYS.paused), false);
      return { white, black, paused };
    } catch {
      return { white: "human", black: "human", paused: false };
    }
  }

  private ensureEngine(): UciEngine {
    if (!this.engine) {
      this.engine = this.engineFactory();
    }
    return this.engine;
  }

  private setStatus(text: string): void {
    if (this.elStatus) this.elStatus.textContent = text;
  }

  private refreshUI(): void {
    if (this.elWhite) this.elWhite.value = this.settings.white;
    if (this.elBlack) this.elBlack.value = this.settings.black;
    const anyBot = this.settings.white !== "human" || this.settings.black !== "human";
    if (this.elPause) {
      this.elPause.disabled = !anyBot;
      this.elPause.textContent = this.settings.paused ? "Resume bot" : "Pause bot";
    }

    if (!anyBot) {
      this.setStatus("Bot off");
      return;
    }

    const sideSummary = `W:${this.settings.white} B:${this.settings.black}`;
    let turnSummary = "";
    try {
      const state = this.controller.getState();
      if (state.meta?.rulesetId === "chess") {
        const toMove: Player = state.toMove;
        const tier = tierForPlayer(this.settings, toMove);
        turnSummary = ` | toMove:${toMove}${tier ? ` (bot:${tier})` : " (human)"}`;
      }
    } catch {
      // ignore
    }

    const mode = this.settings.paused ? "paused" : "active";

    const engine = this.serverEngineUrl ? "server" : "browser";
    const readiness = this.engineReady ? "ready" : "warming";
    this.setStatus(`Bot ${mode} (${sideSummary})${turnSummary} | engine:${engine} (${readiness})`);
  }

  private installTapAnywhereToResume(): void {
    if (this.tapToResumeInstalled) return;
    this.tapToResumeInstalled = true;

    // "Tap anywhere" should resume only when it's actually a paused bot turn.
    const onTap = (ev: Event) => {
      if (!this.settings.paused) return;
      if (!this.isPausedBotTurn()) return;

      const now = Date.now();
      // On many devices, a single tap generates pointerdown then click.
      if (ev.type === "click" && now - this.lastTapToResumeAtMs < 350) return;

      const target = ev.target as Element | null;
      if (target) {
        // Avoid fighting with explicit bot UI controls.
        if (target.closest("#botPauseBtn, #botWhiteSelect, #botBlackSelect, #botResetLearningBtn, #botStatus")) {
          return;
        }
      }

      ev.preventDefault();
      ev.stopPropagation();
      this.lastTapToResumeAtMs = now;
      this.resumeBotFromPause();
    };

    document.addEventListener("pointerdown", onTap, { capture: true });
    document.addEventListener("click", onTap, { capture: true });
  }

  private isPausedBotTurn(): boolean {
    if (!this.settings.paused) return false;
    if (this.controller.isOver()) return false;
    const state = this.controller.getState();
    const rulesetId = state.meta?.rulesetId;
    if (rulesetId !== "chess") return false;
    const tier = tierForPlayer(this.settings, state.toMove);
    return tier !== null;
  }

  private resumeBotFromPause(): void {
    this.settings.paused = false;
    try {
      localStorage.setItem(LS_KEYS.paused, String(this.settings.paused));
    } catch {
      // ignore
    }
    this.controller.clearStickyToast(ChessBotManager.PAUSED_TURN_TOAST_KEY);
    this.refreshUI();
    this.schedulePausedTurnToastSync();
    this.prewarmEngine();
    this.kick();
  }

  private isAtNewGame(): boolean {
    try {
      const h = this.controller.getHistory();
      return Array.isArray(h) && h.length === 1;
    } catch {
      return false;
    }
  }

  private schedulePausedTurnToastSync(): void {
    // Defer so we don't get overwritten by the controller's timed turn-change toast.
    if (this.toastSyncTimer) return;
    this.toastSyncTimer = window.setTimeout(() => {
      this.toastSyncTimer = null;
      this.syncPausedTurnToastNow();
    }, 0);
  }

  private syncPausedTurnToastNow(): void {
    if (this.controller.isOver()) {
      this.controller.clearStickyToast(ChessBotManager.PAUSED_TURN_TOAST_KEY);
      return;
    }

    const state = this.controller.getState();
    if (state.meta?.rulesetId !== "chess") {
      this.controller.clearStickyToast(ChessBotManager.PAUSED_TURN_TOAST_KEY);
      return;
    }

    const toMove: Player = state.toMove;
    const tier = tierForPlayer(this.settings, toMove);
    const isBotTurn = tier !== null;

    if (this.settings.paused && isBotTurn) {
      this.controller.setInputEnabled(false);
      const sideLabel = toMove === "B" ? "Black" : "White";
      const msg = `${sideLabel}'s turn. Tap anywhere to resume bot.`;
      this.controller.setStickyToastAction(ChessBotManager.PAUSED_TURN_TOAST_KEY, () => this.resumeBotFromPause());
      this.controller.showStickyToast(ChessBotManager.PAUSED_TURN_TOAST_KEY, msg, { force: true });
      return;
    }

    this.controller.clearStickyToast(ChessBotManager.PAUSED_TURN_TOAST_KEY);
  }

  private kick(): void {
    // Defer so we don't fight with UI updates / controller toasts.
    window.setTimeout(() => void this.maybeMove(), 0);
    this.schedulePausedTurnToastSync();
  }

  private setPaused(paused: boolean): void {
    if (this.settings.paused === paused) return;
    this.settings.paused = paused;
    try {
      localStorage.setItem(LS_KEYS.paused, String(this.settings.paused));
    } catch {
      // ignore
    }
  }

  private updateInputForCurrentTurn(): void {
    if (this.controller.isOver()) {
      this.controller.setInputEnabled(true);
      return;
    }

    const state = this.controller.getState();
    if (state.meta?.rulesetId !== "chess") {
      this.controller.setInputEnabled(true);
      return;
    }

    const tier = tierForPlayer(this.settings, state.toMove);
    const isBotTurn = tier !== null;
    // If it's a bot turn and we're paused, input stays locked (toast handles).
    if (isBotTurn) {
      this.controller.setInputEnabled(false);
      return;
    }
    // Human turn.
    this.controller.setInputEnabled(true);
  }

  private onUndoRedoJump(reason: HistoryChangeReason): void {
    const anyBot = this.settings.white !== "human" || this.settings.black !== "human";
    if (!anyBot) {
      this.refreshUI();
      this.updateInputForCurrentTurn();
      return;
    }

    // In human-vs-bot, treat Undo as "takeback":
    // if the user just undid a bot move (which makes it bot-to-move again),
    // automatically undo one more ply so it's the human's turn.
    if (reason === "undo" && !this.undoTakebackInProgress) {
      try {
        const state = this.controller.getState();
        if (state.meta?.rulesetId === "chess") {
          const tier = tierForPlayer(this.settings, state.toMove);
          const isBotTurn = tier !== null;
          const otherTier = tierForPlayer(this.settings, other(state.toMove));
          const otherIsHuman = otherTier === null;

          if (isBotTurn && otherIsHuman && this.controller.canUndo()) {
            this.undoTakebackInProgress = true;
            window.setTimeout(() => {
              try {
                if (this.controller.canUndo()) this.controller.undo();
              } finally {
                this.undoTakebackInProgress = false;
                // After the second undo, do not auto-kick a bot move.
                this.refreshUI();
                this.updateInputForCurrentTurn();
                this.schedulePausedTurnToastSync();
              }
            }, 0);

            // While we wait for the second undo, make sure the bot doesn't instantly replay.
            this.setPaused(true);
            this.refreshUI();
            this.updateInputForCurrentTurn();
            this.schedulePausedTurnToastSync();
            return;
          }
        }
      } catch {
        // ignore; fall through to generic navigation handling
      }
    }

    // Undo/Redo/Jump are explicit user navigation: pause any bot turn so it
    // doesn't immediately replay moves from the navigated position.
    try {
      const state = this.controller.getState();
      if (state.meta?.rulesetId === "chess") {
        const tier = tierForPlayer(this.settings, state.toMove);
        const isBotTurn = tier !== null;
        if (isBotTurn) this.setPaused(true);
      }
    } catch {
      // ignore
    }

    this.refreshUI();
    this.updateInputForCurrentTurn();
    this.schedulePausedTurnToastSync();
  }

  private onHistoryChanged(reason: HistoryChangeReason): void {
    if (reason === "gameOver") {
      this.onGameOver();
      return;
    }

    if (reason === "undo" || reason === "redo" || reason === "jump") {
      this.onUndoRedoJump(reason);
      return;
    }

    // Auto-pause whenever a new game starts and a bot is enabled.
    // This covers first load, restart, and undo-back-to-start.
    if (this.isAtNewGame() && (this.settings.white !== "human" || this.settings.black !== "human")) {
      if (!this.settings.paused) {
        this.settings.paused = true;
        try {
          localStorage.setItem(LS_KEYS.paused, String(this.settings.paused));
        } catch {
          // ignore
        }
        this.refreshUI();
      }
    }

    // Any position change can affect whether it's a bot turn.
    this.kick();
  }

  private onGameOver(): void {
    try {
      this.maybeAdaptAfterGameOver();
    } finally {
      this.controller.setInputEnabled(true);
      this.setStatus("Game over");
    }
  }

  private loadAdaptState(tier: BotTier): AdaptState {
    try {
      const raw = localStorage.getItem(`${LS_KEYS.adaptPrefix}${tier}`);
      if (!raw) return normalizeAdaptState(null);
      const parsed = JSON.parse(raw);
      return normalizeAdaptState(parsed);
    } catch {
      return normalizeAdaptState(null);
    }
  }

  private saveAdaptState(tier: BotTier, s: AdaptState): void {
    try {
      localStorage.setItem(`${LS_KEYS.adaptPrefix}${tier}`, JSON.stringify(s));
    } catch {
      // ignore
    }
  }

  private resetLearning(): void {
    for (const tier of ["beginner", "intermediate", "strong"] as const) {
      this.saveAdaptState(tier, normalizeAdaptState(null));
    }
  }

  private maybeAdaptAfterGameOver(): void {
    const plyCount = plyCountFromController(this.controller);
    if (plyCount < 24) return;

    // Only adapt for human-vs-bot (exactly one human).
    const wHuman = this.settings.white === "human";
    const bHuman = this.settings.black === "human";
    if (wHuman === bHuman) return;

    const human: Player = wHuman ? "W" : "B";
    const bot: Player = other(human);
    const tier = tierForPlayer(this.settings, bot);
    if (!tier) return;

    const result = checkCurrentPlayerLost(this.controller.getState());
    const winner = result.winner;

    const score: 0 | 0.5 | 1 = winner === null ? 0.5 : winner === human ? 1 : 0;

    const prev = this.loadAdaptState(tier);
    const next = adaptAfterGame({ tier, prev, score });
    this.saveAdaptState(tier, next);
  }

  private async maybeMove(): Promise<void> {
    if (this.busy) return;
    if (this.controller.isOver()) return;

    const state = this.controller.getState();
    const rulesetId = state.meta?.rulesetId;
    if (rulesetId !== "chess") return;

    const toMove: Player = state.toMove;
    const tier = tierForPlayer(this.settings, toMove);
    if (!tier) {
      // Human to move.
      this.controller.setInputEnabled(true);
      this.controller.clearStickyToast(ChessBotManager.PAUSED_TURN_TOAST_KEY);
      return;
    }

    if (this.settings.paused) {
      // Bot is to move, but paused.
      // Lock input immediately so the human can't play for the bot while paused
      // (the sticky toast is synced async and could otherwise lag a frame).
      this.controller.setInputEnabled(false);
      this.setStatus(`Bot paused — tap to resume (${this.engineLabel()})`);
      this.schedulePausedTurnToastSync();
      return;
    }

    // Ensure our paused-turn toast is not left hanging.
    this.controller.clearStickyToast(ChessBotManager.PAUSED_TURN_TOAST_KEY);

    // Always keep a background warmup going while bots are enabled.
    this.prewarmEngine();

    // If the engine isn't ready yet, prefer waiting (real Stockfish) over playing
    // random fallback moves — unless the user explicitly allows fallback.
    if (!this.engineReady && !this.allowFallbackDuringWarmup) {
      this.controller.setInputEnabled(false);
      this.setStatus(`Bot warming up… (${this.engineLabel()})`);
      this.showWarmupToast();
      // We'll retry when warmup completes (prewarmEngine kicks), but also poll lightly.
      window.setTimeout(() => void this.maybeMove(), 1000);
      return;
    }

    this.busy = true;
    const myRequestId = this.requestId++;

    // Disable input while bot is deciding (unless it becomes human turn later).
    this.controller.setInputEnabled(false);

    try {
      const presets = BOT_PRESETS[tier];
      const defaultSub = 4;
      const sub = isHumanForPlayer(this.settings, other(toMove)) ? this.loadAdaptState(tier).applied : defaultSub;
      const subIdx = Math.max(0, Math.min(presets.length - 1, Math.round(sub)));
      const preset = presets[subIdx];

      const fen = gameStateToFen(state);

      // If Stockfish is struggling to boot (common on slow/mobile), don't freeze the game.
      // Use a fallback move immediately, and keep warming the engine in the background.
      const shouldSkipEngine = Date.now() < this.engineBackoffUntilMs;
      let pickedMove: Move | null = null;

      if (!shouldSkipEngine) {
        const engine = this.ensureEngine();
        const engineTimeoutMs = Math.min(8000, Math.max(2500, Math.round(preset.movetimeMs) + 2000));

        this.setStatus(`Bot thinking… (${this.engineLabel()})`);

        const uci = await engine.bestMove({
          fen,
          movetimeMs: preset.movetimeMs,
          skill: preset.skill,
          // Keep per-move attempts short; background prewarm uses a longer timeout.
          timeoutMs: engineTimeoutMs,
        });

        if (myRequestId !== this.requestId - 1) return;
        pickedMove = uciToLegalMove(state, uci);
      }

      if (pickedMove) {
        await this.controller.playMove(pickedMove);
      } else {
        this.setStatus(`Bot (fallback) — ${this.engineLabel()} still loading...`);
        await this.playFallbackMove();
      }

      // After move, decide whether input should be enabled.
      const nextToMove = this.controller.getState().toMove;
      const nextTier = tierForPlayer(this.settings, nextToMove);
      this.controller.setInputEnabled(nextTier === null);

      this.setStatus(`Bot ready (${this.engineLabel()})`);

      // Continue if next side is also a bot.
      if (nextTier !== null) this.kick();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[chessbot] move failed", err);

      const msg = err instanceof Error ? err.message : String(err);

      // If Stockfish is just still coming up, retry a few times before giving up.
      // (Some environments take a long time to fetch/compile WASM on first run.)
      const isInitTimeout =
        msg.includes("Stockfish timeout: uciok") ||
        msg.includes("Stockfish timeout: readyok") ||
        msg.includes("Stockfish worker failed:");

      if (isInitTimeout && myRequestId === this.requestId - 1) {
        // Don't stall gameplay on engine init. Play a fallback move immediately.
        // Back off engine attempts for a bit to avoid repeated multi-second stalls.
        this.engineFailureCount++;
        const backoffMs = Math.min(90_000, 5_000 * this.engineFailureCount);
        this.engineBackoffUntilMs = Date.now() + backoffMs;

        this.setStatus(`Bot (fallback) — ${this.engineLabel()} still loading...`);
        try {
          await this.playFallbackMove();
        } catch {
          // If even fallback fails, unlock input.
          this.controller.setInputEnabled(true);
          this.setStatus(`Bot error: ${msg}`);
          return;
        }

        // Keep warming Stockfish in the background. Do NOT reset the engine on
        // init timeouts; slow WASM compile/fetch should be allowed to finish.
        this.prewarmEngine();

        // After move, decide whether input should be enabled.
        const nextToMove = this.controller.getState().toMove;
        const nextTier = tierForPlayer(this.settings, nextToMove);
        this.controller.setInputEnabled(nextTier === null);

        // Continue if next side is also a bot.
        if (nextTier !== null) this.kick();
        return;
      }

      // Non-init failure: let the player continue manually.
      this.controller.setInputEnabled(true);
      this.setStatus(`Bot error: ${msg}`);
    } finally {
      this.busy = false;
    }
  }
}
