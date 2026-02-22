import { createPrng } from "../shared/prng.ts";

export type SfxName =
  | "uiOn"
  | "uiOff"
  | "select"
  | "move"
  | "capture"
  | "promote"
  | "undo"
  | "redo"
  | "gameOver"
  | "error";

export interface SfxManager {
  isSupported(): boolean;
  isEnabled(): boolean;
  setEnabled(enabled: boolean): void;
  play(name: SfxName): void;
}

type AudioContextLike = AudioContext;

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function getAudioContextCtor(): (new () => AudioContextLike) | null {
  const anyWin = typeof window !== "undefined" ? (window as any) : null;
  const Ctor = anyWin?.AudioContext ?? anyWin?.webkitAudioContext;
  return typeof Ctor === "function" ? (Ctor as any) : null;
}

function pieceCount(state: any): { total: number; officers: number } {
  const board = state?.board;
  if (!board || typeof board.entries !== "function") return { total: 0, officers: 0 };
  let total = 0;
  let officers = 0;
  for (const [, stack] of board.entries()) {
    if (!Array.isArray(stack)) continue;
    total += stack.length;
    for (const p of stack) {
      if (p && p.rank === "O") officers += 1;
    }
  }
  return { total, officers };
}

export function guessSfxFromStateChange(prev: unknown, next: unknown): SfxName | null {
  const p = pieceCount(prev);
  const n = pieceCount(next);
  if (n.total < p.total) return "capture";
  if (n.officers > p.officers) return "promote";
  // If the board changed but counts didn't, treat as a normal move.
  if (n.total !== p.total || n.officers !== p.officers) return "move";
  return "move";
}

export function createSfxManager(opts: { volume?: number } = {}): SfxManager {
  let enabled = false;
  let volume = clamp01(opts.volume ?? 0.22);
  const Ctor = getAudioContextCtor();
  let ctx: AudioContextLike | null = null;
  let master: GainNode | null = null;
  let unlocked = false;
  let unlockArmed = false;

  function ensure(): { ctx: AudioContextLike; master: GainNode } | null {
    if (!Ctor) return null;
    if (!ctx) {
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
    }
    if (!ctx || !master) return null;
    return { ctx, master };
  }

  function armUnlockListeners(): void {
    if (unlockArmed) return;
    if (typeof window === "undefined") return;
    unlockArmed = true;

    const unlock = () => {
      if (unlocked) return;
      unlocked = true;
      try {
        ensure();
        safeResume();
      } catch {
        // ignore
      }
    };

    // Use a broad set of gestures to maximize compatibility.
    // The listeners are `once`, so they remove themselves.
    window.addEventListener("pointerdown", unlock, { once: true, capture: true });
    window.addEventListener("keydown", unlock, { once: true, capture: true });
    window.addEventListener("touchstart", unlock, { once: true, capture: true });
    window.addEventListener("mousedown", unlock, { once: true, capture: true });
  }

  function safeResume(): void {
    try {
      if (ctx && ctx.state === "suspended") {
        void ctx.resume().catch(() => {
          // ignore
        });
      }
    } catch {
      // ignore
    }
  }

  function tone(args: { freq: number; dur: number; type?: OscillatorType; gain?: number; detune?: number }) {
    if (!enabled) return;
    if (!unlocked) {
      armUnlockListeners();
      return;
    }
    const g = ensure();
    if (!g) return;
    safeResume();

    const t0 = g.ctx.currentTime;
    const osc = g.ctx.createOscillator();
    const amp = g.ctx.createGain();

    osc.type = args.type ?? "sine";
    osc.frequency.setValueAtTime(args.freq, t0);
    if (typeof args.detune === "number") osc.detune.setValueAtTime(args.detune, t0);

    const peak = clamp01(args.gain ?? 0.5);
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + args.dur);

    osc.connect(amp);
    amp.connect(g.master);

    osc.start(t0);
    osc.stop(t0 + args.dur + 0.02);
    osc.onended = () => {
      try {
        osc.disconnect();
        amp.disconnect();
      } catch {
        // ignore
      }
    };
  }

  function noise(args: { dur: number; gain?: number; hp?: number; lp?: number }) {
    if (!enabled) return;
    if (!unlocked) {
      armUnlockListeners();
      return;
    }
    const g = ensure();
    if (!g) return;
    safeResume();

    const t0 = g.ctx.currentTime;
    const sr = g.ctx.sampleRate;
    const len = Math.max(1, Math.floor(sr * args.dur));
    const buf = g.ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    const rng = createPrng(`sfx.noise:${len}:${sr}:${args.dur}:${args.hp ?? ""}:${args.lp ?? ""}`);
    for (let i = 0; i < data.length; i++) data[i] = (rng.nextFloat() * 2 - 1) * 0.7;

    const src = g.ctx.createBufferSource();
    src.buffer = buf;

    const amp = g.ctx.createGain();
    const peak = clamp01(args.gain ?? 0.35);
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + args.dur);

    let node: AudioNode = src;

    if (typeof args.hp === "number") {
      const hp = g.ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.setValueAtTime(args.hp, t0);
      node.connect(hp);
      node = hp;
    }

    if (typeof args.lp === "number") {
      const lp = g.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(args.lp, t0);
      node.connect(lp);
      node = lp;
    }

    node.connect(amp);
    amp.connect(g.master);

    src.start(t0);
    src.stop(t0 + args.dur + 0.02);
    src.onended = () => {
      try {
        src.disconnect();
        amp.disconnect();
      } catch {
        // ignore
      }
    };
  }

  function playInternal(name: SfxName): void {
    if (!enabled) return;
    if (!Ctor) return;

    switch (name) {
      case "uiOn":
        tone({ freq: 740, dur: 0.06, type: "sine", gain: 0.35 });
        tone({ freq: 990, dur: 0.07, type: "sine", gain: 0.25, detune: 8 });
        return;
      case "uiOff":
        tone({ freq: 440, dur: 0.08, type: "sine", gain: 0.32 });
        return;
      case "select":
        tone({ freq: 880, dur: 0.04, type: "triangle", gain: 0.28 });
        return;
      case "move":
        noise({ dur: 0.11, gain: 0.20, hp: 350, lp: 2200 });
        tone({ freq: 220, dur: 0.09, type: "sine", gain: 0.18, detune: -6 });
        return;
      case "capture":
        noise({ dur: 0.10, gain: 0.28, hp: 220, lp: 1800 });
        tone({ freq: 130, dur: 0.10, type: "square", gain: 0.14 });
        tone({ freq: 70, dur: 0.12, type: "sine", gain: 0.12 });
        return;
      case "promote":
        tone({ freq: 392, dur: 0.10, type: "sine", gain: 0.18 });
        tone({ freq: 587, dur: 0.12, type: "sine", gain: 0.16 });
        tone({ freq: 784, dur: 0.14, type: "sine", gain: 0.12 });
        return;
      case "undo":
        tone({ freq: 520, dur: 0.08, type: "sine", gain: 0.20 });
        tone({ freq: 390, dur: 0.10, type: "sine", gain: 0.18 });
        return;
      case "redo":
        tone({ freq: 390, dur: 0.08, type: "sine", gain: 0.20 });
        tone({ freq: 520, dur: 0.10, type: "sine", gain: 0.18 });
        return;
      case "gameOver":
        tone({ freq: 330, dur: 0.16, type: "sine", gain: 0.22 });
        tone({ freq: 262, dur: 0.18, type: "sine", gain: 0.20 });
        tone({ freq: 196, dur: 0.22, type: "sine", gain: 0.18 });
        return;
      case "error":
        tone({ freq: 160, dur: 0.10, type: "sawtooth", gain: 0.16 });
        tone({ freq: 120, dur: 0.12, type: "sawtooth", gain: 0.14 });
        return;
      default:
        return;
    }
  }

  return {
    isSupported: () => Boolean(Ctor),
    isEnabled: () => enabled,
    setEnabled: (v: boolean) => {
      enabled = Boolean(v);
      if (!enabled) return;
      // Don't create/resume AudioContext until after a user gesture.
      armUnlockListeners();
    },
    play: (name: SfxName) => {
      try {
        playInternal(name);
      } catch {
        // Never let audio failures break gameplay.
      }
    },
  };
}
