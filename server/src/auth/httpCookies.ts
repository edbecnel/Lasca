import type express from "express";

export function parseCookieHeader(raw: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;

  // Very small cookie parser: "a=b; c=d".
  const parts = raw.split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(value);
  }
  return out;
}

export function clearCookie(res: express.Response, name: string): void {
  // Set expired cookie. Keep attributes matching setCookie() defaults.
  res.setHeader(
    "Set-Cookie",
    `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

export function setCookie(args: {
  res: express.Response;
  name: string;
  value: string;
  maxAgeSeconds: number;
  secure: boolean;
  sameSite: "Lax" | "None";
}): void {
  const parts: string[] = [];
  parts.push(`${args.name}=${encodeURIComponent(args.value)}`);
  parts.push("Path=/");
  parts.push("HttpOnly");
  parts.push(`SameSite=${args.sameSite}`);
  if (args.secure) parts.push("Secure");
  parts.push(`Max-Age=${Math.max(0, Math.floor(args.maxAgeSeconds))}`);
  args.res.setHeader("Set-Cookie", parts.join("; "));
}
