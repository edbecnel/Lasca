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

  private requireIds(): RemoteIds {
    if (!this.ids) throw new Error("RemoteDriver is not connected (missing roomId/playerId)");
    return this.ids;
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
    const nextState = deserializeWireGameState(snapshot.state) as GameState & { didPromote?: boolean };
    const h = deserializeWireHistory(snapshot.history);
    this.history.replaceAll(h.states as any, h.notation, h.currentIndex);
    this.state = nextState;
    this.lastStateHash = hashGameState(nextState as any);
    return { next: nextState, changed: this.lastStateHash !== prevHash };
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
