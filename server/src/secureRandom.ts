import { randomBytes, randomInt } from "node:crypto";

export function secureRandomHex(byteLength: number): string {
  const n = Math.max(1, Math.floor(byteLength));
  return randomBytes(n).toString("hex");
}

// Unbiased integer in [min, maxExclusive)
export function secureRandomInt(min: number, maxExclusive: number): number {
  const lo = Math.floor(min);
  const hi = Math.floor(maxExclusive);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) {
    throw new Error(`Invalid secureRandomInt range: [${min}, ${maxExclusive})`);
  }
  return randomInt(lo, hi);
}
