import type { Move } from "../game/moveTypes.ts";
import type { VariantId } from "../variants/variantTypes";
import type { WireSnapshot } from "./wireState.ts";

export type RoomId = string;
export type PlayerId = string;
export type PlayerColor = "W" | "B";

export type OnlineError = {
  error: string;
};

export type CreateRoomRequest = {
  variantId: VariantId;
  snapshot: WireSnapshot;
};

export type CreateRoomResponse =
  | {
      roomId: RoomId;
      playerId: PlayerId;
      color: PlayerColor;
      snapshot: WireSnapshot;
    }
  | OnlineError;

export type JoinRoomRequest = {
  roomId: RoomId;
};

export type JoinRoomResponse =
  | {
      roomId: RoomId;
      playerId: PlayerId;
      color: PlayerColor;
      snapshot: WireSnapshot;
    }
  | OnlineError;

export type SubmitMoveRequest = {
  roomId: RoomId;
  playerId: PlayerId;
  move: Move;
};

export type SubmitMoveResponse =
  | {
      snapshot: WireSnapshot;
      didPromote?: boolean;
    }
  | OnlineError;

export type FinalizeCaptureChainRequest =
  | {
      roomId: RoomId;
      playerId: PlayerId;
      rulesetId: "dama";
      landing: string;
      jumpedSquares: string[];
    }
  | {
      roomId: RoomId;
      playerId: PlayerId;
      rulesetId: "damasca";
      landing: string;
    };

export type FinalizeCaptureChainResponse =
  | {
      snapshot: WireSnapshot;
      didPromote?: boolean;
    }
  | OnlineError;

export type EndTurnRequest = {
  roomId: RoomId;
  playerId: PlayerId;
  notation?: string;
};

export type EndTurnResponse =
  | {
      snapshot: WireSnapshot;
    }
  | OnlineError;

export type GetRoomSnapshotResponse =
  | {
      snapshot: WireSnapshot;
    }
  | OnlineError;
