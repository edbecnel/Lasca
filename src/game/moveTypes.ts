import type { NodeId } from "./state.ts";

export interface QuietMove {
  kind: "move";
  from: NodeId;
  to: NodeId;
}

export interface CaptureMove {
  kind: "capture";
  from: NodeId;
  over: NodeId;
  to: NodeId;
}

export type Move = QuietMove | CaptureMove;
