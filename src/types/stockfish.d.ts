declare module "stockfish" {
  export type StockfishMessageEvent = { data: unknown } | string;

  export type StockfishEngine = {
    postMessage(command: string): void;
    onmessage: ((ev: StockfishMessageEvent) => void) | null;
    terminate?: () => void;
  };

  export default function stockfish(): StockfishEngine;
}
