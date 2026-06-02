import type { PendingEvent } from "../types/pending";
import { getSession } from "./session";

const ALARM_NAME    = "worktrace-sync";
const PERIOD_MIN    = 0.5;   // 30 seconds
const BATCH_SIZE    = 50;
const STATUS_KEY    = "syncStatus";
const PENDING_KEY   = "pendingEvents";

export interface SyncStatus {
  lastSyncedAt: number | null;
  lastError:    string | null;
}

// Functions injected at startup to avoid circular import with background/index.ts
type ApiFetch        = (path: string, init?: RequestInit) => Promise<Response>;
type EnsureDbSession = () => Promise<string | null>;
type CheckAuth       = () => Promise<boolean>;

let apiFetchFn:        ApiFetch        | null = null;
let ensureDbSessionFn: EnsureDbSession | null = null;
let checkAuthFn:       CheckAuth       | null = null;

// Re-entry guard: the 30s alarm and the inline SESSION_STOP flush can overlap.
// Without this, two concurrent flushes read the same queue, POST the same
// events (event.create has no idempotency key → permanent duplicates), and
// race on writing `remaining` back. The SW is single-threaded, so a synchronous
// check before the first await is sufficient to serialise.
let flushing = false;

export function initSync(deps: {
  apiFetch:        ApiFetch;
  ensureDbSession: EnsureDbSession;
  checkAuth:       CheckAuth;
}): void {
  apiFetchFn        = deps.apiFetch;
  ensureDbSessionFn = deps.ensureDbSession;
  checkAuthFn       = deps.checkAuth;

  chrome.alarms.create(ALARM_NAME, { periodInMinutes: PERIOD_MIN });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) void flush();
  });
}

// ─── Status ────────────────────────────────────────────────────────────────────

export async function getStatus(): Promise<SyncStatus & { queueSize: number }> {
  const r = await chrome.storage.local.get([STATUS_KEY, PENDING_KEY]);
  const status   = (r[STATUS_KEY] as SyncStatus | undefined) ?? { lastSyncedAt: null, lastError: null };
  const pending  = (r[PENDING_KEY] as PendingEvent[] | undefined) ?? [];
  return { ...status, queueSize: pending.length };
}

async function setStatus(patch: Partial<SyncStatus>): Promise<void> {
  const r        = await chrome.storage.local.get(STATUS_KEY);
  const current  = (r[STATUS_KEY] as SyncStatus | undefined) ?? { lastSyncedAt: null, lastError: null };
  await chrome.storage.local.set({ [STATUS_KEY]: { ...current, ...patch } });
}

// ─── Flush ─────────────────────────────────────────────────────────────────────

export async function flush(): Promise<void> {
  if (!apiFetchFn || !ensureDbSessionFn || !checkAuthFn) return;

  // Bail synchronously if another flush is already in flight (see `flushing` above).
  if (flushing) return;
  flushing = true;
  try {
    // Skip flush entirely if the user is not authenticated — avoids ERR_CONNECTION_REFUSED spam
    const isAuth = await checkAuthFn();
    if (!isAuth) return;

    const session = await getSession();
    if (!session) return;

    const dbSessionId = session.dbSessionId ?? (await ensureDbSessionFn());
    if (!dbSessionId) {
      await setStatus({ lastError: "DB session not available" });
      return;
    }

    const r       = await chrome.storage.local.get(PENDING_KEY);
    const queue   = (r[PENDING_KEY] as PendingEvent[] | undefined) ?? [];
    if (queue.length === 0) return;

    const batch     = queue.slice(0, BATCH_SIZE);
    let   sentCount = 0;
    let   lastError: string | null = null;

    for (let i = 0; i < batch.length; i++) {
      const event = batch[i]!;
      let res: Response;
      try {
        res = await apiFetchFn("/api/v1/events", {
          method: "POST",
          body:   JSON.stringify({ ...event, sessionId: dbSessionId }),
        });
      } catch (err) {
        // Network error — keep this event and everything after it for the next flush
        lastError = err instanceof Error ? err.message : "Network error";
        break;
      }

      if (res.ok) {
        sentCount++;
        continue;
      }

      if (res.status === 401) {
        // Token rotated/expired — stop, queue waits for next login
        lastError = "Unauthorized — please sign in again";
        break;
      }

      if (res.status >= 400 && res.status < 500) {
        // Poisonous payload — drop it, keep going so it can't block the queue
        sentCount++;
        lastError = `Dropped invalid event (HTTP ${String(res.status)})`;
        continue;
      }

      // 5xx — retry next alarm
      lastError = `Server error (HTTP ${String(res.status)})`;
      break;
    }

    if (sentCount > 0) {
      // Re-read the queue: events may have been appended by content scripts
      // while we were awaiting the network. Only drop what we actually sent.
      const fresh     = await chrome.storage.local.get(PENDING_KEY);
      const current   = (fresh[PENDING_KEY] as PendingEvent[] | undefined) ?? [];
      const remaining = current.slice(sentCount);
      await chrome.storage.local.set({ [PENDING_KEY]: remaining });
    }
    await setStatus({
      lastSyncedAt: sentCount > 0 ? Date.now() : (await getStatus()).lastSyncedAt,
      lastError,
    });
  } finally {
    flushing = false;
  }
}
