import { secureRandomHex } from "../secureRandom.ts";
import type { UserId } from "../../../src/shared/authProtocol.ts";

export type Session = {
  sessionId: string;
  userId: UserId;
  createdAtMs: number;
  expiresAtMs: number;
};

export class SessionStore {
  private sessions = new Map<string, Session>();
  private userToSessions = new Map<UserId, Set<string>>();

  constructor(private ttlMs: number) {}

  create(userId: UserId, nowMs = Date.now()): Session {
    const sessionId = secureRandomHex(24);
    const s: Session = {
      sessionId,
      userId,
      createdAtMs: nowMs,
      expiresAtMs: nowMs + this.ttlMs,
    };

    this.sessions.set(sessionId, s);
    const set = this.userToSessions.get(userId) ?? new Set<string>();
    set.add(sessionId);
    this.userToSessions.set(userId, set);
    return s;
  }

  get(sessionId: string, nowMs = Date.now()): Session | null {
    const s = this.sessions.get(sessionId) ?? null;
    if (!s) return null;
    if (s.expiresAtMs <= nowMs) {
      this.delete(sessionId);
      return null;
    }
    return s;
  }

  delete(sessionId: string): void {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    this.sessions.delete(sessionId);
    const set = this.userToSessions.get(s.userId);
    if (set) {
      set.delete(sessionId);
      if (set.size === 0) this.userToSessions.delete(s.userId);
    }
  }

  deleteAllForUser(userId: UserId): void {
    const set = this.userToSessions.get(userId);
    if (!set) return;
    for (const sessionId of set) this.sessions.delete(sessionId);
    this.userToSessions.delete(userId);
  }
}
