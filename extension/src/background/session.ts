import type { Session } from "../types/session";

const STORAGE_KEY = "activeSession";

// ─── Storage ───────────────────────────────────────────────────────────────────

export async function getSession(): Promise<Session | null> {
  const r = await chrome.storage.local.get(STORAGE_KEY);
  return (r[STORAGE_KEY] as Session) ?? null;
}

async function saveSession(session: Session): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: session });
}

async function clearSession(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
}

// ─── Timer ─────────────────────────────────────────────────────────────────────

// Elapsed ms is derived from stored values — safe after SW restart
export function getElapsedMs(session: Session): number {
  return session.totalActiveMs + (Date.now() - session.startedAt);
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export async function startSession(): Promise<Session> {
  const existing = await getSession();
  if (existing) return existing; // idempotent

  const session: Session = {
    id: crypto.randomUUID(),
    startedAt: Date.now(),
    totalActiveMs: 0,
  };
  await saveSession(session);
  return session;
}

export async function stopSession(): Promise<Session | null> {
  const session = await getSession();
  if (!session) return null;
  await clearSession();
  return session;
}
