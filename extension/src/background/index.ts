import type { AuthMessage, AuthResponse, StoredAuth } from "../types/auth";
import type { ContentMessage } from "../types/content";
import type { PendingEvent } from "../types/pending";
import type { SessionMessage, SessionResponse } from "../types/session";
import {
  getSession,
  startSession,
  stopSession,
  pauseSession,
  resumeSession,
  getElapsedMs,
  attachDbSessionId,
} from "./session";

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

// Best-effort: attempts to create a DB Session and store its CUID on the local
// session. Failures are swallowed — the sync alarm (AC 5) retries via
// ensureDbSession() before each flush.
export async function tryCreateDbSession(): Promise<void> {
  try {
    const res = await apiFetch("/api/v1/sessions", { method: "POST" });
    if (!res.ok) return;
    const { id } = await res.json() as { id: string };
    await attachDbSessionId(id);
  } catch {
    // Network/auth failure — leave dbSessionId null, sync will retry
  }
}

async function tryEndDbSession(dbSessionId: string): Promise<void> {
  try {
    await apiFetch(`/api/v1/sessions/${dbSessionId}`, { method: "PATCH" });
  } catch {
    // Best-effort — losing endedAt is acceptable per AC 5 plan
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

type IncomingMessage = AuthMessage | SessionMessage | ContentMessage;

chrome.runtime.onMessage.addListener(
  (message: IncomingMessage, _sender, sendResponse: (r: AuthResponse | SessionResponse) => void) => {
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
        .then((stored) =>
          sendResponse({
            success: true,
            isAuthenticated: stored !== null && !isExpired(stored.jwtExpiresAt),
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

    // ─── Session messages ────────────────────────────────────────────────────

    if (message.type === "SESSION_START") {
      startSession()
        .then((session) => {
          sendResponse({
            success: true,
            session: { ...session, elapsedMs: getElapsedMs(session) },
          });
          // Fire-and-forget DB session creation — retried by sync alarm if it fails
          if (!session.dbSessionId) void tryCreateDbSession();
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
      stopSession()
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
      pauseSession()
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
