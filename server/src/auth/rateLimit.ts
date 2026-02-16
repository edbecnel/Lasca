import type express from "express";

type Bucket = { resetAtMs: number; count: number };

export function makeIpRateLimiter(args: {
  windowMs: number;
  max: number;
  /** Optional key prefix (so different limiters don't share buckets). */
  keyPrefix?: string;
}): (req: express.Request, res: express.Response, next: express.NextFunction) => void {
  const buckets = new Map<string, Bucket>();
  const prefix = args.keyPrefix ?? "rl";

  const cleanup = () => {
    const now = Date.now();
    for (const [k, b] of buckets) {
      if (b.resetAtMs <= now) buckets.delete(k);
    }
  };

  let n = 0;

  return (req, res, next) => {
    // Small periodic cleanup to avoid unbounded growth.
    n++;
    if (n % 200 === 0) cleanup();

    const ip =
      // Respect first XFF entry when present.
      (typeof req.headers["x-forwarded-for"] === "string" && req.headers["x-forwarded-for"].split(",")[0]?.trim()) ||
      req.ip ||
      req.socket.remoteAddress ||
      "unknown";

    const key = `${prefix}:${ip}`;
    const now = Date.now();

    const cur = buckets.get(key);
    if (!cur || cur.resetAtMs <= now) {
      buckets.set(key, { resetAtMs: now + args.windowMs, count: 1 });
      next();
      return;
    }

    cur.count++;
    if (cur.count > args.max) {
      const retryAfterSec = Math.max(1, Math.ceil((cur.resetAtMs - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({ error: "Too many requests" });
      return;
    }

    next();
  };
}
