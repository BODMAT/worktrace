import type { AuthMessage, AuthResponse, StoredAuth } from "../types/auth";
import type { ContentMessage } from "../types/content";
import type { MusicMessage, MusicResponse, TrackInfo } from "../types/music";
import type { PendingEvent } from "../types/pending";
import type { SessionMessage, SessionResponse } from "../types/session";
import type { SyncMessage, SyncResponse } from "../types/sync";
import {
  getSession,
  startSession,
  stopSession,
  pauseSession,
  resumeSession,
  getElapsedMs,
  attachDbSessionId,
} from "./session";
import { initSync, flush, getStatus } from "./sync";

const DASHBOARD_URL = import.meta.env.VITE_DASHBOARD_URL as string;
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
const DEV_MODE = import.meta.env.VITE_DEV_MODE === "true";
const EXPIRY_BUFFER_MS = 60_000;

// ─── Storage ───────────────────────────────────────────────────────────────────

async function getStoredAuth(): Promise<StoredAuth | null> {
  const r = await chrome.storage.local.get(["jwt", "jwtExpiresAt"]);
  if (!r["jwt"] || !r["jwtExpiresAt"]) return null;
  return { jwt: r["jwt"] as string, jwtExpiresAt: r["jwtExpiresAt"] as number };
}

async function storeAuth(jwt: string, expiresAt: number): Promise<void> {
  await chrome.storage.local.set({ jwt, jwtExpiresAt: expiresAt });
}

async function clearAuth(): Promise<void> {
  await chrome.storage.local.remove(["jwt", "jwtExpiresAt"]);
}

function isExpired(expiresAt: number): boolean {
  return Date.now() >= expiresAt - EXPIRY_BUFFER_MS;
}

function decodeEmail(jwt: string): string | null {
  try {
    const payloadB64 = jwt.split(".")[1];
    if (!payloadB64) return null;
    const payload = JSON.parse(atob(payloadB64)) as { email?: string };
    return payload.email ?? null;
  } catch {
    return null;
  }
}

// ─── Google OAuth ──────────────────────────────────────────────────────────────

async function launchGoogleOAuth(): Promise<string> {
  const redirectUrl = chrome.identity.getRedirectURL("auth");
  const nonce = crypto.randomUUID();

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  url.searchParams.set("response_type", "id_token");
  url.searchParams.set("redirect_uri", redirectUrl);
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("prompt", "select_account");

  const responseUrl = await chrome.identity.launchWebAuthFlow({
    url: url.toString(),
    interactive: true,
  });

  if (!responseUrl) throw new Error("OAuth flow cancelled");

  const fragment = new URL(responseUrl).hash.slice(1);
  const idToken = new URLSearchParams(fragment).get("id_token");
  if (!idToken) throw new Error("No id_token in OAuth response");
  return idToken;
}

// ─── JWT exchange ──────────────────────────────────────────────────────────────

async function exchangeForJWT(googleIdToken: string): Promise<StoredAuth> {
  const res = await fetch(`${DASHBOARD_URL}/api/auth/extension`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ googleToken: googleIdToken }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(`JWT exchange failed (${res.status}): ${JSON.stringify(body)}`);
  }

  const { token } = await res.json() as { token: string };
  const payloadB64 = token.split(".")[1] ?? "";
  const { exp } = JSON.parse(atob(payloadB64)) as { exp: number };
  return { jwt: token, jwtExpiresAt: exp * 1000 };
}

// ─── Core ──────────────────────────────────────────────────────────────────────

async function ensureAuthenticated(): Promise<string> {
  const stored = await getStoredAuth();
  if (stored && !isExpired(stored.jwtExpiresAt)) return stored.jwt;

  const googleIdToken = await launchGoogleOAuth();
  const auth = await exchangeForJWT(googleIdToken);
  await storeAuth(auth.jwt, auth.jwtExpiresAt);
  return auth.jwt;
}

// Використовується в AC 5 для всіх API-запитів
export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await ensureAuthenticated();
  return fetch(`${DASHBOARD_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${token}`,
    },
  });
}

// ─── DB session lifecycle ──────────────────────────────────────────────────────

// Best-effort: ensures the active local session has a DB-backed CUID.
// Called on SESSION_START and again by the sync alarm before each flush.
// Returns the dbSessionId on success, null otherwise.
export async function ensureDbSession(): Promise<string | null> {
  const session = await getSession();
  if (!session) return null;
  if (session.dbSessionId) return session.dbSessionId;

  try {
    const res = await apiFetch("/api/v1/sessions", { method: "POST" });
    if (!res.ok) return null;
    const { id } = await res.json() as { id: string };
    const updated = await attachDbSessionId(id);
    return updated?.dbSessionId ?? id;
  } catch {
    return null;
  }
}

async function tryEndDbSession(dbSessionId: string): Promise<void> {
  try {
    await apiFetch(`/api/v1/sessions/${dbSessionId}`, { method: "PATCH" });
  } catch {
    // Best-effort — losing endedAt is acceptable per AC 5 plan
  }
}

// ─── Music: pull track from active tab ────────────────────────────────────────

// Queries the active YTM or SoundCloud tab directly via content script.
// Used as fallback when currentTrack is not yet in storage (SW was inactive at
// the time the content script first ran and the message was dropped).
async function queryActiveTabForTrack(): Promise<TrackInfo | null> {
  // Search by URL — more reliable than active/currentWindow from a service worker context
  const [ytmTabs, scTabs] = await Promise.all([
    chrome.tabs.query({ url: "https://music.youtube.com/*" }),
    chrome.tabs.query({ url: "https://soundcloud.com/*" }),
  ]);

  const candidates = [...ytmTabs, ...scTabs];
  if (candidates.length === 0) return null;

  // Prefer an active tab; otherwise use the first match
  const tab = candidates.find((t) => t.active) ?? candidates[0];
  if (!tab?.id) return null;

  try {
    const track = await chrome.tabs.sendMessage(tab.id, { type: "TRACK_REQUEST" }) as TrackInfo | null;
    if (track) {
      await chrome.storage.local.set({ currentTrack: track });
      // Save to DB only if we don't already have a DB record for this tab pull
      const existing = await chrome.storage.local.get("currentDbTrackId");
      if (!existing["currentDbTrackId"]) {
        const session = await getSession();
        if (session && session.pausedAt === null && session.dbSessionId) {
          void saveTrackToDb(track, session.dbSessionId);
        }
      }
    }
    return track;
  } catch {
    return null;
  }
}

// ─── Music: save / end track in DB ────────────────────────────────────────────

// Saves a new track to DB and stores its id + period start for listenedMs accumulation.
// Best-effort — errors are logged but never surface to the user.
async function saveTrackToDb(track: TrackInfo, dbSessionId: string): Promise<void> {
  try {
    const res  = await apiFetch("/api/v1/tracks", {
      method: "POST",
      body:   JSON.stringify({ sessionId: dbSessionId, artist: track.artist, title: track.title }),
    });
    if (!res.ok) return;
    const { id } = await res.json() as { id: string };
    // Store id and the moment this listening period started (for listenedMs delta)
    await chrome.storage.local.set({ currentDbTrackId: id, currentPeriodStartMs: Date.now() });
  } catch (err) {
    console.warn("[worktrace] track save failed:", err);
  }
}

// Closes the previous DB track record: sends endedAt + listenedMs delta.
async function endCurrentDbTrack(): Promise<void> {
  const r = await chrome.storage.local.get(["currentDbTrackId", "currentPeriodStartMs"]);
  const id          = r["currentDbTrackId"]    as string | undefined;
  const periodStart = r["currentPeriodStartMs"] as number | undefined;
  if (!id) return;

  const now        = Date.now();
  const listenedMs = periodStart ? Math.max(0, now - periodStart) : 0;

  try {
    await apiFetch(`/api/v1/tracks/${id}`, {
      method: "PATCH",
      body:   JSON.stringify({ endedAt: new Date(now).toISOString(), listenedMs }),
    });
  } catch (err) {
    console.warn("[worktrace] track end failed:", err);
  } finally {
    await chrome.storage.local.remove(["currentDbTrackId", "currentPeriodStartMs"]);
  }
}

// ─── Pending event queue ───────────────────────────────────────────────────────

async function enqueuePending(event: PendingEvent): Promise<void> {
  const r = await chrome.storage.local.get("pendingEvents");
  const pending = (r["pendingEvents"] as PendingEvent[] | undefined) ?? [];
  pending.push(event);
  await chrome.storage.local.set({ pendingEvents: pending });
}

// ─── Message listener ──────────────────────────────────────────────────────────

type IncomingMessage = AuthMessage | SessionMessage | ContentMessage | SyncMessage | MusicMessage;

chrome.runtime.onMessage.addListener(
  (
    message: IncomingMessage,
    _sender,
    sendResponse: (r: AuthResponse | SessionResponse | SyncResponse | MusicResponse) => void,
  ) => {
    if (message.type === "AUTH_LOGIN") {
      if (DEV_MODE) {
        storeAuth("dev.fake.jwt", Date.now() + 7 * 24 * 60 * 60 * 1000)
          .then(() => sendResponse({ success: true, jwt: "dev.fake.jwt" }))
          .catch((err: unknown) =>
            sendResponse({
              success: false,
              error: err instanceof Error ? err.message : "Unknown error",
            }),
          );
        return true;
      }
      ensureAuthenticated()
        .then((jwt) => sendResponse({ success: true, jwt }))
        .catch((err: unknown) =>
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : "Unknown error",
          }),
        );
      return true;
    }

    if (message.type === "AUTH_LOGOUT") {
      clearAuth()
        .then(() => sendResponse({ success: true }))
        .catch((err: unknown) =>
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : "Unknown error",
          }),
        );
      return true;
    }

    if (message.type === "AUTH_GET_STATUS") {
      getStoredAuth()
        .then((stored) => {
          const authed = stored !== null && !isExpired(stored.jwtExpiresAt);
          sendResponse({
            success: true,
            isAuthenticated: authed,
            email: authed && stored ? decodeEmail(stored.jwt) : null,
          });
        })
        .catch((err: unknown) =>
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : "Unknown error",
          }),
        );
      return true;
    }

    // ─── Session messages ────────────────────────────────────────────────────

    if (message.type === "SESSION_START") {
      startSession()
        .then((session) => {
          sendResponse({
            success: true,
            session: { ...session, elapsedMs: getElapsedMs(session) },
          });
          // Fire-and-forget DB session creation — retried by sync alarm if it fails
          if (!session.dbSessionId) void ensureDbSession();
        })
        .catch((err: unknown) =>
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : "Unknown error",
          }),
        );
      return true;
    }

    if (message.type === "SESSION_STOP") {
      (async () => {
        await endCurrentDbTrack(); // record endedAt for the last playing track
        await flush();
        return stopSession();
      })()
        .then((session) => {
          sendResponse({
            success: true,
            session: session ? { ...session, elapsedMs: getElapsedMs(session) } : null,
          });
          if (session?.dbSessionId) void tryEndDbSession(session.dbSessionId);
        })
        .catch((err: unknown) =>
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : "Unknown error",
          }),
        );
      return true;
    }

    if (message.type === "SESSION_GET_STATE") {
      getSession()
        .then((session) => {
          if (session) {
            // Attach live elapsed for the popup timer
            const sessionWithElapsed = {
              ...session,
              elapsedMs: getElapsedMs(session),
            };
            sendResponse({ success: true, session: sessionWithElapsed });
          } else {
            sendResponse({ success: true, session: null });
          }
        })
        .catch((err: unknown) =>
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : "Unknown error",
          }),
        );
      return true;
    }

    if (message.type === "SESSION_PAUSE") {
      (async () => {
        await endCurrentDbTrack(); // record listenedMs up to pause point
        return pauseSession();
      })()
        .then((session) =>
          sendResponse({
            success: true,
            session: session ? { ...session, elapsedMs: getElapsedMs(session) } : null,
          }),
        )
        .catch((err: unknown) =>
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : "Unknown error",
          }),
        );
      return true;
    }

    if (message.type === "SESSION_RESUME") {
      resumeSession()
        .then(async (session) => {
          sendResponse({
            success: true,
            session: session ? { ...session, elapsedMs: getElapsedMs(session) } : null,
          });
          // Re-open a DB track record for the currently playing song (if any)
          if (session?.dbSessionId) {
            const r = await chrome.storage.local.get("currentTrack");
            const track = r["currentTrack"] as TrackInfo | undefined;
            if (track) void saveTrackToDb(track, session.dbSessionId);
          }
        })
        .catch((err: unknown) =>
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : "Unknown error",
          }),
        );
      return true;
    }

    if (message.type === "NOTE_ADD") {
      getSession().then((session) => {
        if (!session || session.pausedAt !== null) return;
        const event: PendingEvent = {
          url:       `worktrace://note/${crypto.randomUUID()}`,
          title:     message.text.slice(0, 80) || "Note",
          content:   message.text,
          tags:      ["note", ...message.tags],
          timestamp: new Date().toISOString(),
        };
        void enqueuePending(event);
      });
      return false;
    }

    // ─── Sync messages ───────────────────────────────────────────────────────

    if (message.type === "SYNC_GET_STATUS") {
      getStatus()
        .then((status) => sendResponse({ success: true, ...status }))
        .catch((err: unknown) =>
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : "Unknown error",
          }),
        );
      return true;
    }

    // ─── Music messages ──────────────────────────────────────────────────────

    if (message.type === "TRACK_CAPTURED") {
      const track = message.payload;
      void chrome.storage.local.set({ currentTrack: track });

      // Close the previous track then save the new one
      getSession().then(async (session) => {
        await endCurrentDbTrack(); // no-op if no previous track
        if (session && session.pausedAt === null && session.dbSessionId) {
          void saveTrackToDb(track, session.dbSessionId);
        }
      });

      return false;
    }

    if (message.type === "TRACK_GET_CURRENT") {
      (async () => {
        const r     = await chrome.storage.local.get("currentTrack");
        let   track = (r["currentTrack"] as TrackInfo | undefined) ?? null;

        // Fallback: ask the active music tab directly — handles the SW race
        // condition where the initial TRACK_CAPTURED message was dropped
        if (!track) track = await queryActiveTabForTrack();

        sendResponse({ success: true, track });
      })().catch((err: unknown) =>
        sendResponse({
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        }),
      );
      return true;
    }

    // ─── Content script messages ─────────────────────────────────────────────

    if (message.type === "PAGE_METADATA") {
      // Store metadata only when a session is active (AC 5 will batch-send it)
      getSession().then((session) => {
        if (!session) return;
        const { url, title, metaDescription, headings } = message.payload;
        const content = [metaDescription, ...headings].filter(Boolean).join(" | ") || null;
        const event: PendingEvent = {
          url,
          title,
          content,
          tags: [],
          timestamp: new Date().toISOString(),
        };
        void enqueuePending(event);
      });
      return false; // no async response needed
    }

    return false;
  },
);

// ─── Lifecycle ─────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener((details) => {
  console.log("[worktrace] service worker installed:", details.reason);
});

// Boot sync alarm — runs every service-worker startup, idempotent under chrome.alarms
initSync({
  apiFetch,
  ensureDbSession,
  checkAuth: async () => {
    const stored = await getStoredAuth();
    return stored !== null && !isExpired(stored.jwtExpiresAt);
  },
});
