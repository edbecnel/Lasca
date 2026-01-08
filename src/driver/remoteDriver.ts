import type { GameDriver, HistorySnapshots } from "./gameDriver.ts";
import type { GameState, Move } from "../core/index.ts";
import { HistoryManager } from "../game/historyManager.ts";
import type {
  CreateRoomResponse,
  EndTurnRequest,
  EndTurnResponse,
  FinalizeCaptureChainRequest,
  FinalizeCaptureChainResponse,
  GetRoomSnapshotResponse,
  JoinRoomResponse,
  SubmitMoveResponse,
} from "../shared/onlineProtocol.ts";
import { hashGameState } from "../game/hashState.ts";
import {
  deserializeWireGameState,
  deserializeWireHistory,
  type WireSnapshot,
} from "../shared/wireState.ts";

/**
 * RemoteDriver (stub).
 *
 * This is the multiplayer/online path. For now it is intentionally non-functional
 * (no transport yet). The goal is to establish a clean seam without impacting
 * offline/local play.
 */
type RemoteIds = {
  serverUrl: string;
  roomId: string;
  playerId: string;
};

export class RemoteDriver implements GameDriver {
  readonly mode = "online" as const;

  private state: GameState;
  private history: HistoryManager;
  private ids: RemoteIds | null = null;
  private playerColor: "W" | "B" | null = null;
  private lastStateHash: string;
  private lastStateVersion: number = -1;
  private eventSource: EventSource | null = null;
  private onRealtimeUpdate: (() => void) | null = null;
  private realtimeListeners = new Map<string, Set<(payload: any) => void>>();

  constructor(state: GameState) {
    this.state = state;
    this.history = new HistoryManager();
    this.history.push(state);
    this.lastStateHash = hashGameState(state as any);
  }

  getState(): GameState {
    return this.state;
  }

  setState(state: GameState): void {
    this.state = state;
  }

  setRemoteIds(ids: RemoteIds): void {
    this.ids = ids;
  }

  setPlayerColor(color: "W" | "B"): void {
    this.playerColor = color;
  }

  getPlayerColor(): "W" | "B" | null {
    return this.playerColor;
  }

  getRoomId(): string | null {
    return this.ids?.roomId ?? null;
  }

  private requireIds(): RemoteIds {
    if (!this.ids) throw new Error("RemoteDriver is not connected (missing roomId/playerId)");
    return this.ids;
  }

  private toStreamUrl(serverUrl: string, roomId: string, playerId: string): string {
    const base = serverUrl.replace(/\/$/, "");
    const qs = new URLSearchParams({ playerId });
    return `${base}/api/stream/${encodeURIComponent(roomId)}?${qs.toString()}`;
  }

  /**
   * Subscribe to a realtime SSE event.
   * Returns an unsubscribe function.
   */
  onSseEvent(eventName: string, cb: (payload: any) => void): () => void {
    const set = this.realtimeListeners.get(eventName) ?? new Set<(payload: any) => void>();
    set.add(cb);
    this.realtimeListeners.set(eventName, set);
    return () => {
      const cur = this.realtimeListeners.get(eventName);
      if (!cur) return;
      cur.delete(cb);
      if (cur.size === 0) this.realtimeListeners.delete(eventName);
    };
  }

  private emitSseEvent(eventName: string, payload: any): void {
    const set = this.realtimeListeners.get(eventName);
    if (!set || set.size === 0) return;
    for (const cb of set) {
      try {
        cb(payload);
      } catch {
        // ignore listener errors
      }
    }
  }

  /**
   * Starts realtime server push via SSE.
   * Returns true if started (browser-only), else false.
   */
  startRealtime(onUpdated: () => void): boolean {
    if (typeof window === "undefined") return false;
    if (typeof (window as any).EventSource === "undefined") return false;
    if (this.eventSource) return true;

    const ids = this.requireIds();
    this.onRealtimeUpdate = onUpdated;

    const url = this.toStreamUrl(ids.serverUrl, ids.roomId, ids.playerId);
    const es = new EventSource(url);
    this.eventSource = es;

    const listen = (eventName: string, handler: (payload: any) => void) => {
      es.addEventListener(eventName, (ev: MessageEvent) => {
        try {
          const payload = JSON.parse(String(ev.data)) as any;
          handler(payload);
          this.emitSseEvent(eventName, payload);
        } catch {
          // ignore malformed events
        }
      });
    };

    // Required event today.
    listen("snapshot", (payload) => {
      const snap = payload?.snapshot as WireSnapshot | undefined;
      if (!snap) return;
      const applied = this.applySnapshot(snap);
      if (applied.changed) this.onRealtimeUpdate?.();
    });

    // Reserved for MP2+; wiring here avoids transport changes later.
    // Server can start broadcasting these event types when implemented.
    listen("opponent_status", () => void 0);
    listen("clock_sync", () => void 0);
    listen("adjourn", () => void 0);

    // EventSource auto-reconnects. We keep polling fallback at the controller layer.
    es.addEventListener("error", () => {
      // ignore transient disconnects
    });

    return true;
  }

  stopRealtime(): void {
    if (this.eventSource) {
      try {
        this.eventSource.close();
      } catch {
        // ignore
      }
    }
    this.eventSource = null;
    this.onRealtimeUpdate = null;
  }

  private async postJson<TReq, TRes>(path: string, body: TReq): Promise<TRes> {
    const { serverUrl } = this.requireIds();
    const res = await fetch(`${serverUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as any;
    if (!res.ok) {
      const msg = typeof json?.error === "string" ? json.error : `HTTP ${res.status}`;
      throw new Error(msg);
    }
    if (json?.error) throw new Error(String(json.error));
    return json as TRes;
  }

  private async getJson<TRes>(path: string): Promise<TRes> {
    const { serverUrl } = this.requireIds();
    const res = await fetch(`${serverUrl}${path}`);
    const json = (await res.json()) as any;
    if (!res.ok) {
      const msg = typeof json?.error === "string" ? json.error : `HTTP ${res.status}`;
      throw new Error(msg);
    }
    if (json?.error) throw new Error(String(json.error));
    return json as TRes;
  }

  private applySnapshot(snapshot: WireSnapshot): { next: GameState & { didPromote?: boolean }; changed: boolean } {
    const prevHash = this.lastStateHash;
    const prevVersion = this.lastStateVersion;
    const nextState = deserializeWireGameState(snapshot.state) as GameState & { didPromote?: boolean };
    const h = deserializeWireHistory(snapshot.history);
    this.history.replaceAll(h.states as any, h.notation, h.currentIndex);
    this.state = nextState;
    this.lastStateHash = hashGameState(nextState as any);

    // Server-provided monotonic version is the authoritative change detector.
    // Hash is retained as a fallback for legacy snapshots.
    const nextVersion = Number.isFinite((snapshot as any).stateVersion) ? Number((snapshot as any).stateVersion) : prevVersion;
    this.lastStateVersion = nextVersion;

    const changed = nextVersion !== prevVersion || this.lastStateHash !== prevHash;
    return { next: nextState, changed };
  }

  async connectFromSnapshot(ids: RemoteIds, snapshot: WireSnapshot): Promise<void> {
    this.ids = ids;
    this.applySnapshot(snapshot);
  }

  async fetchLatest(): Promise<boolean> {
    const { roomId } = this.requireIds();
    const res = await this.getJson<GetRoomSnapshotResponse>(`/api/room/${encodeURIComponent(roomId)}`);
    if ((res as any).error) throw new Error((res as any).error);
    const applied = this.applySnapshot((res as any).snapshot);
    return applied.changed;
  }

  async submitMove(_move: Move): Promise<GameState & { didPromote?: boolean }> {
    const ids = this.requireIds();
    const res = await this.postJson<{ roomId: string; playerId: string; move: Move }, SubmitMoveResponse>(
      "/api/submitMove",
      { roomId: ids.roomId, playerId: ids.playerId, move: _move }
    );
    const next = this.applySnapshot((res as any).snapshot).next;
    (next as any).didPromote = (res as any).didPromote;
    return next;
  }

  finalizeCaptureChain(
    _args:
      | { rulesetId: "dama"; state: GameState; landing: string; jumpedSquares: Set<string> }
      | { rulesetId: "damasca"; state: GameState; landing: string }
  ): GameState & { didPromote?: boolean } {
    // In online mode, chain finalization must come from the server.
    // Keep interface sync by throwing if called synchronously; use finalizeCaptureChainRemote.
    throw new Error("RemoteDriver.finalizeCaptureChain must be awaited via finalizeCaptureChainRemote()");
  }

  async finalizeCaptureChainRemote(
    args:
      | { rulesetId: "dama"; state: GameState; landing: string; jumpedSquares: Set<string> }
      | { rulesetId: "damasca"; state: GameState; landing: string }
  ): Promise<GameState & { didPromote?: boolean }> {
    const ids = this.requireIds();
    const req: FinalizeCaptureChainRequest =
      args.rulesetId === "dama"
        ? {
            roomId: ids.roomId,
            playerId: ids.playerId,
            rulesetId: "dama",
            landing: args.landing,
            jumpedSquares: Array.from(args.jumpedSquares),
          }
        : {
            roomId: ids.roomId,
            playerId: ids.playerId,
            rulesetId: "damasca",
            landing: args.landing,
          };

    const res = await this.postJson<FinalizeCaptureChainRequest, FinalizeCaptureChainResponse>(
      "/api/finalizeCaptureChain",
      req
    );
    const next = this.applySnapshot((res as any).snapshot).next;
    (next as any).didPromote = (res as any).didPromote;
    return next;
  }

  async endTurnRemote(notation?: string): Promise<GameState> {
    const ids = this.requireIds();
    const req: EndTurnRequest = {
      roomId: ids.roomId,
      playerId: ids.playerId,
      ...(notation ? { notation } : {}),
    };
    const res = await this.postJson<EndTurnRequest, EndTurnResponse>("/api/endTurn", req);
    return this.applySnapshot((res as any).snapshot).next;
  }

  canUndo(): boolean {
    return false;
  }

  canRedo(): boolean {
    return false;
  }

  undo(): GameState | null {
    return null;
  }

  redo(): GameState | null {
    return null;
  }

  jumpToHistory(_index: number): GameState | null {
    return null;
  }

  clearHistory(): void {
    this.history.clear();
  }

  pushHistory(state: GameState, notation?: string): void {
    // In online mode, server is authoritative; local pushes are ignored.
    // We still update local state for UI consistency.
    this.state = state;
    void notation;
  }

  replaceHistory(snap: HistorySnapshots): void {
    this.history.replaceAll(snap.states as any, snap.notation, snap.currentIndex);
  }

  exportHistorySnapshots(): HistorySnapshots {
    return this.history.exportSnapshots();
  }

  getHistory(): Array<{ index: number; toMove: "B" | "W"; isCurrent: boolean; notation: string }> {
    return this.history.getHistory();
  }

  getHistoryCurrent(): GameState | null {
    return this.history.getCurrent();
  }
}
