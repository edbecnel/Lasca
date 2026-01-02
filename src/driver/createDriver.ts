import type { GameState } from "../core/index.ts";
import { HistoryManager } from "../game/historyManager.ts";
import type { DriverMode, GameDriver } from "./gameDriver.ts";
import { LocalDriver } from "./localDriver.ts";
import { RemoteDriver } from "./remoteDriver.ts";

export function selectDriverMode(args: { search: string; envMode?: string | undefined }): DriverMode {
  const params = new URLSearchParams(args.search.startsWith("?") ? args.search : `?${args.search}`);
  const qsMode = params.get("mode");
  if (qsMode === "online") return "online";
  if (qsMode === "local") return "local";

  const env = (args.envMode ?? "").toLowerCase();
  if (env === "online") return "online";
  return "local";
}

export function createDriver(args: {
  state: GameState;
  history: HistoryManager;
  search: string;
  envMode?: string | undefined;
}): GameDriver {
  const mode = selectDriverMode({ search: args.search, envMode: args.envMode });
  if (mode === "online") return new RemoteDriver(args.state);
  return new LocalDriver(args.state, args.history);
}
