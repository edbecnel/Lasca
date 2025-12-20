import type { NodeId } from "./state.ts";

export interface Move {
  from: NodeId;
  to: NodeId;
  kind: "move" | "capture";
  path?: NodeId[];
}
