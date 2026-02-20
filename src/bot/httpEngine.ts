import type { UciBestMoveArgs, UciEngine } from "./uciEngine.ts";

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  if (!ms || !Number.isFinite(ms) || ms <= 0) return p;
  return new Promise<T>((resolve, reject) => {
    const tid = window.setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms);
    p.then(
      (v) => {
        window.clearTimeout(tid);
        resolve(v);
      },
      (err) => {
        window.clearTimeout(tid);
        reject(err);
      },
    );
  });
}

function normalizeBaseUrl(raw: string): string {
  const s = String(raw || "").trim();
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

export class HttpUciEngine implements UciEngine {
  private baseUrl: string;
  private skill: number | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  async init(opts?: { timeoutMs?: number }): Promise<void> {
    const timeoutMs = opts?.timeoutMs ?? 2000;
    const ctrl = new AbortController();
    const p = fetch(`${this.baseUrl}/health`, { method: "GET", signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = (await r.json()) as any;
        if (!json || json.ok !== true) throw new Error("health check failed");
      })
      .finally(() => ctrl.abort());

    await withTimeout(p, timeoutMs, "health");
  }

  async setSkillLevel(skill: number): Promise<void> {
    const s = Math.max(0, Math.min(20, Math.round(skill)));
    this.skill = s;
  }

  async bestMove(args: UciBestMoveArgs): Promise<string> {
    const timeoutMs = args.timeoutMs ?? Math.max(2500, Math.round(args.movetimeMs) * 20);

    const ctrl = new AbortController();
    const p = fetch(`${this.baseUrl}/bestmove`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fen: args.fen,
        movetimeMs: args.movetimeMs,
        skill: args.skill ?? this.skill ?? undefined,
        timeoutMs,
      }),
      signal: ctrl.signal,
    })
      .then(async (r) => {
        const json = (await r.json().catch(() => null)) as any;
        if (!r.ok) {
          const msg = json?.error ? String(json.error) : `HTTP ${r.status}`;
          throw new Error(msg);
        }
        if (!json || json.ok !== true || typeof json.uci !== "string") {
          throw new Error("bad response");
        }
        return json.uci as string;
      })
      .finally(() => ctrl.abort());

    return withTimeout(p, timeoutMs + 500, "bestmove");
  }
}
