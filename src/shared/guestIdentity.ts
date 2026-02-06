import { secureRandomHex } from "./secureRandom.ts";

const LS_GUEST_ID = "lasca.guest.id";
const LS_GUEST_NAME = "lasca.guest.name";

function clampAsciiLabel(raw: string, maxLen: number): string {
  const s = (raw || "").trim();
  if (!s) return "";
  // Replace control chars to keep logs/JSON tidy.
  const cleaned = s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, maxLen);
}

function genGuestIdHex32(): string | null {
  // Browser/WebView: require WebCrypto.
  const hex = secureRandomHex(16);
  return hex && /^[0-9a-f]{32}$/i.test(hex) ? hex : null;
}

export type GuestIdentity = {
  guestId: string;
  displayName?: string;
};

export function getOrCreateGuestId(): string | null {
  try {
    const existing = localStorage.getItem(LS_GUEST_ID);
    if (existing && /^[0-9a-f]{32}$/i.test(existing)) return existing;
    const id = genGuestIdHex32();
    if (!id) return null;
    localStorage.setItem(LS_GUEST_ID, id);
    return id;
  } catch {
    return null;
  }
}

export function getGuestDisplayName(): string | null {
  try {
    const raw = localStorage.getItem(LS_GUEST_NAME);
    const name = clampAsciiLabel(raw || "", 24);
    return name || null;
  } catch {
    return null;
  }
}

export function setGuestDisplayName(next: string): void {
  try {
    const name = clampAsciiLabel(next || "", 24);
    if (!name) localStorage.removeItem(LS_GUEST_NAME);
    else localStorage.setItem(LS_GUEST_NAME, name);
  } catch {
    // ignore
  }
}

export function getGuestIdentity(): GuestIdentity | null {
  const guestId = getOrCreateGuestId();
  if (!guestId) return null;
  const displayName = getGuestDisplayName() ?? undefined;
  return displayName ? { guestId, displayName } : { guestId };
}
