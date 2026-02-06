function getCrypto(): Crypto | null {
  try {
    const c = (globalThis as any)?.crypto as Crypto | undefined;
    if (c && typeof c.getRandomValues === "function") return c;
    return null;
  } catch {
    return null;
  }
}

export function secureRandomBytes(length: number): Uint8Array | null {
  if (!Number.isFinite(length) || length <= 0) return null;
  const cryptoObj = getCrypto();
  if (!cryptoObj) return null;
  const b = new Uint8Array(length);
  cryptoObj.getRandomValues(b);
  return b;
}

export function secureRandomHex(byteLength: number): string | null {
  const b = secureRandomBytes(byteLength);
  if (!b) return null;
  return Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

function secureRandomUint32(): number | null {
  const cryptoObj = getCrypto();
  if (!cryptoObj) return null;
  const buf = new Uint32Array(1);
  cryptoObj.getRandomValues(buf);
  return buf[0] ?? 0;
}

// Unbiased integer in [min, maxExclusive)
export function secureRandomInt(min: number, maxExclusive: number): number | null {
  const lo = Math.floor(min);
  const hi = Math.floor(maxExclusive);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  if (hi <= lo) return null;

  const range = hi - lo;
  // Rejection sampling from uint32.
  const maxUint = 0xffff_ffff;
  const limit = Math.floor((maxUint + 1) / range) * range;

  for (let attempts = 0; attempts < 20; attempts++) {
    const x = secureRandomUint32();
    if (x == null) return null;
    if (x < limit) return lo + (x % range);
  }

  // Extremely unlikely to hit.
  const x = secureRandomUint32();
  if (x == null) return null;
  return lo + (x % range);
}

export function secureRandomSeed32(): number | null {
  return secureRandomUint32();
}
