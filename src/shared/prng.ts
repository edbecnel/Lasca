export type Prng = {
  nextFloat(): number; // [0,1)
  nextUint32(): number;
  int(min: number, maxExclusive: number): number;
  pick<T>(arr: readonly T[]): T;
  shuffleInPlace<T>(arr: T[]): T[];
};

function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Mulberry32: small, fast, deterministic.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createPrng(seed: number | string): Prng {
  const seed32 = typeof seed === "string" ? fnv1a32(seed) : (seed >>> 0);
  const next = mulberry32(seed32);

  const api: Prng = {
    nextFloat: () => next(),
    nextUint32: () => Math.floor(next() * 0x1_0000_0000) >>> 0,
    int: (min: number, maxExclusive: number) => {
      const lo = Math.floor(min);
      const hi = Math.floor(maxExclusive);
      if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return lo;
      const range = hi - lo;
      return lo + (api.nextUint32() % range);
    },
    pick: <T,>(arr: readonly T[]) => {
      if (!arr || arr.length === 0) throw new Error("pick() from empty array");
      return arr[api.int(0, arr.length)]!;
    },
    shuffleInPlace: <T,>(arr: T[]) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = api.int(0, i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  };

  return api;
}
