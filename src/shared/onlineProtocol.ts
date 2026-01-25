import type { Move } from "../game/moveTypes.ts";
import type { VariantId } from "../variants/variantTypes";
import type { WireSnapshot } from "./wireState.ts";

export type RoomId = string;
export type PlayerId = string;
export type PlayerColor = "W" | "B";

export type PlayerPresence = {
  connected: boolean;
  lastSeenAt: string; // ISO timestamp
  /** Present when the server has started a disconnect grace window. */
  inGrace?: boolean;
  /** ISO timestamp when grace expires. */
  graceUntil?: string;
};

export type PresenceByPlayerId = Record<PlayerId, PlayerPresence>;

export type TimeControl =
  | { mode: "none" }
  | { mode: "clock"; initialMs: number; incrementMs?: number };

export type ClockState = {
  /** Remaining time per player color. */
  remainingMs: Record<PlayerColor, number>;
  /** Whose clock is currently running (if not paused). */
  active: PlayerColor;
  /** True when clocks are paused (e.g., disconnect grace). */
  paused: boolean;
  /** Server timestamp (ms since epoch) when the active clock last started/resumed. */
  lastTickMs: number;
};

export type OnlineError = {
  error: string;
};

export type CreateRoomRequest = {
  variantId: VariantId;
  snapshot: WireSnapshot;
  /** Optional seat preference for the creator. If omitted, creator is White (back-compat). */
  preferredColor?: PlayerColor;
  /** Immutable per game; only settable at create. */
  timeControl?: TimeControl;
};

export type CreateRoomResponse =
  | {
      roomId: RoomId;
      playerId: PlayerId;
      color: PlayerColor;
      snapshot: WireSnapshot;
      presence?: PresenceByPlayerId;
      timeControl?: TimeControl;
      clock?: ClockState;
    }
  | OnlineError;

export type JoinRoomRequest = {
  roomId: RoomId;
  /** Optional seat preference for the joiner. If omitted, server assigns the remaining color. */
  preferredColor?: PlayerColor;
};

export type JoinRoomResponse =
  | {
      roomId: RoomId;
      playerId: PlayerId;
      color: PlayerColor;
      snapshot: WireSnapshot;
      presence?: PresenceByPlayerId;
      timeControl?: TimeControl;
      clock?: ClockState;
    }
  | OnlineError;

export type SubmitMoveRequest = {
  roomId: RoomId;
  playerId: PlayerId;
  move: Move;
  /**
   * Optional optimistic concurrency control.
   * When provided, the server rejects the request unless it matches the current room.stateVersion.
   * Back-compat: older clients may omit this.
   */
  expectedStateVersion?: number;
};

export type SubmitMoveResponse =
  | {
      snapshot: WireSnapshot;
      didPromote?: boolean;
      presence?: PresenceByPlayerId;
      timeControl?: TimeControl;
      clock?: ClockState;
    }
  | OnlineError;

export type FinalizeCaptureChainRequest =
  | {
      roomId: RoomId;
      playerId: PlayerId;
      rulesetId: "dama";
      landing: string;
      jumpedSquares: string[];
      expectedStateVersion?: number;
    }
  | {
      roomId: RoomId;
      playerId: PlayerId;
      rulesetId: "damasca" | "damasca_classic";
      landing: string;
      expectedStateVersion?: number;
    };

export type FinalizeCaptureChainResponse =
  | {
      snapshot: WireSnapshot;
      didPromote?: boolean;
      presence?: PresenceByPlayerId;
      timeControl?: TimeControl;
      clock?: ClockState;
    }
  | OnlineError;

export type EndTurnRequest = {
  roomId: RoomId;
  playerId: PlayerId;
  notation?: string;
  expectedStateVersion?: number;
};

export type EndTurnResponse =
  | {
      snapshot: WireSnapshot;
      presence?: PresenceByPlayerId;
      timeControl?: TimeControl;
      clock?: ClockState;
    }
  | OnlineError;

export type ResignRequest = {
  roomId: RoomId;
  playerId: PlayerId;
  expectedStateVersion?: number;
};

export type ResignResponse =
  | {
      snapshot: WireSnapshot;
      presence?: PresenceByPlayerId;
      timeControl?: TimeControl;
      clock?: ClockState;
    }
  | OnlineError;

export type GetRoomSnapshotResponse =
  | {
      snapshot: WireSnapshot;
      presence?: PresenceByPlayerId;
      timeControl?: TimeControl;
      clock?: ClockState;
    }
  | OnlineError;
