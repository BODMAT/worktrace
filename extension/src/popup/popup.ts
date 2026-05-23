import type { AuthMessage, AuthResponse } from "../types/auth";
import type { SessionMessage, SessionResponse, SessionState } from "../types/session";
import type { SyncMessage, SyncResponse } from "../types/sync";

// ─── Messaging helpers ─────────────────────────────────────────────────────────

function sendAuth(msg: AuthMessage): Promise<AuthResponse> {
  return new Promise((resolve, reject) =>
    chrome.runtime.sendMessage(msg, (res: AuthResponse | undefined) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!res) return reject(new Error("No response from background"));
      resolve(res);
    }),
  );
}

function sendSession(msg: SessionMessage): Promise<SessionResponse> {
  return new Promise((resolve, reject) =>
    chrome.runtime.sendMessage(msg, (res: SessionResponse | undefined) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!res) return reject(new Error("No response from background"));
      resolve(res);
    }),
  );
}

function sendSync(msg: SyncMessage): Promise<SyncResponse> {
  return new Promise((resolve, reject) =>
    chrome.runtime.sendMessage(msg, (res: SyncResponse | undefined) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!res) return reject(new Error("No response from background"));
      resolve(res);
    }),
  );
}

// ─── DOM refs ──────────────────────────────────────────────────────────────────

const statusDot    = document.getElementById("status-dot")     as HTMLSpanElement;
const statusLabel  = document.getElementById("status-label")    as HTMLSpanElement;
const authSection  = document.getElementById("auth-section")    as HTMLElement;
const timerSection = document.getElementById("timer-section")   as HTMLElement;
const timerEl      = document.getElementById("timer")           as HTMLDivElement;
const btnLogin     = document.getElementById("btn-login")       as HTMLButtonElement;
const btnLogout    = document.getElementById("btn-logout")      as HTMLButtonElement;
const btnStart     = document.getElementById("btn-start")       as HTMLButtonElement;
const btnPause     = document.getElementById("btn-pause")       as HTMLButtonElement;
const btnStop      = document.getElementById("btn-stop")        as HTMLButtonElement;
const syncEl       = document.getElementById("sync-indicator")  as HTMLDivElement;
const syncLabel    = document.getElementById("sync-label")      as HTMLSpanElement;
const syncMeta     = document.getElementById("sync-meta")       as HTMLDivElement;
const userEmail    = document.getElementById("user-email")      as HTMLSpanElement;
const noteInput    = document.getElementById("note-input")      as HTMLInputElement;
const tagsInput    = document.getElementById("tags-input")      as HTMLInputElement;
const btnNote      = document.getElementById("btn-note")        as HTMLButtonElement;

// ─── Timer formatting ──────────────────────────────────────────────────────────

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

// ─── UI state ──────────────────────────────────────────────────────────────────

type UIState = "idle" | "active" | "paused";

function applyState(state: UIState, elapsedMs = 0): void {
  timerEl.textContent = state === "idle" ? "00:00:00" : formatMs(elapsedMs);

  timerEl.className     = `popup__time popup__time--${state}`;
  statusDot.className   = `popup__status-dot${state !== "idle" ? ` popup__status-dot--${state}` : ""}`;
  statusLabel.className = `popup__status-label${state !== "idle" ? ` popup__status-label--${state}` : ""}`;
  statusLabel.textContent = state.toUpperCase();

  btnStart.disabled = state !== "idle";
  btnPause.disabled = state === "idle";
  btnStop.disabled  = state === "idle";
  btnPause.textContent = state === "paused" ? "▶ RESUME" : "⏸ PAUSE";
  btnNote.disabled  = state !== "active";
}

function showAuthenticated(email: string | null): void {
  authSection.style.display = "none";
  timerSection.style.display = "flex";
  btnLogout.hidden = false;
  if (email) {
    userEmail.textContent = email;
    userEmail.hidden = false;
  } else {
    userEmail.hidden = true;
  }
}

function showUnauthenticated(): void {
  authSection.style.display = "flex";
  timerSection.style.display = "none";
  btnLogout.hidden = true;
  userEmail.hidden = true;
  userEmail.textContent = "";
  stopPolling();
  applyState("idle");
}

function formatAgo(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 5)   return "just now";
  if (sec < 60)  return `${String(sec)}s ago`;
  if (sec < 3600) return `${String(Math.floor(sec / 60))}m ago`;
  return `${String(Math.floor(sec / 3600))}h ago`;
}

async function refreshSyncIndicator(): Promise<void> {
  const res = await sendSync({ type: "SYNC_GET_STATUS" }).catch(() => null);
  if (!res || !res.success) return;

  syncLabel.textContent = `${String(res.queueSize)} event${res.queueSize !== 1 ? "s" : ""} queued`;
  syncEl.classList.toggle("popup__sync--has-events", res.queueSize > 0);

  if (res.lastError) {
    syncMeta.textContent = `error: ${res.lastError}`;
    syncMeta.classList.add("popup__sync-meta--error");
  } else if (res.lastSyncedAt) {
    syncMeta.textContent = `synced ${formatAgo(res.lastSyncedAt)}`;
    syncMeta.classList.remove("popup__sync-meta--error");
  } else {
    syncMeta.textContent = "not synced yet";
    syncMeta.classList.remove("popup__sync-meta--error");
  }
}

// ─── Session polling ───────────────────────────────────────────────────────────

let pollInterval: ReturnType<typeof setInterval> | null = null;

function startPolling(): void {
  if (pollInterval) return;
  pollInterval = setInterval(async () => {
    const res = await sendSession({ type: "SESSION_GET_STATE" }).catch(() => null);
    if (!res || !res.success || !("session" in res)) return;
    const session = res.session as SessionState | null;
    if (!session) {
      applyState("idle");
    } else if (session.pausedAt !== null) {
      applyState("paused", session.elapsedMs);
    } else {
      applyState("active", session.elapsedMs);
    }
    await refreshSyncIndicator();
  }, 1000);
}

function stopPolling(): void {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = null;
}

// ─── Auth flow ─────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  const authRes = await sendAuth({ type: "AUTH_GET_STATUS" }).catch(() => null);

  if (!authRes || !authRes.success || !("isAuthenticated" in authRes) || !authRes.isAuthenticated) {
    showUnauthenticated();
    return;
  }

  showAuthenticated(authRes.email);

  const res = await sendSession({ type: "SESSION_GET_STATE" }).catch(() => null);
  if (res?.success && "session" in res) {
    const session = res.session as SessionState | null;
    if (!session) applyState("idle");
    else if (session.pausedAt !== null) applyState("paused", session.elapsedMs);
    else applyState("active", session.elapsedMs);
  }

  await refreshSyncIndicator();
  startPolling();
}

// ─── Controls ─────────────────────────────────────────────────────────────────

btnLogin.addEventListener("click", async () => {
  btnLogin.disabled = true;
  btnLogin.textContent = "Signing in...";
  const res = await sendAuth({ type: "AUTH_LOGIN" }).catch(() => null);
  if (res?.success) {
    await init();
  } else {
    btnLogin.disabled = false;
    btnLogin.textContent = "Sign in with Google";
  }
});

btnLogout.addEventListener("click", async () => {
  await sendAuth({ type: "AUTH_LOGOUT" }).catch(() => null);
  showUnauthenticated();
});

btnStart.addEventListener("click", async () => {
  await sendSession({ type: "SESSION_START" });
  applyState("active", 0);
  startPolling();
});

btnPause.addEventListener("click", async () => {
  const isPaused = btnPause.textContent?.includes("RESUME");
  if (isPaused) {
    const res = await sendSession({ type: "SESSION_RESUME" });
    if (res.success && "session" in res && res.session) {
      applyState("active", res.session.elapsedMs);
    }
  } else {
    const res = await sendSession({ type: "SESSION_PAUSE" });
    if (res.success && "session" in res && res.session) {
      applyState("paused", res.session.elapsedMs);
    }
  }
});

btnStop.addEventListener("click", async () => {
  await sendSession({ type: "SESSION_STOP" });
  stopPolling();
  applyState("idle");
  await refreshSyncIndicator();
});

btnNote.addEventListener("click", async () => {
  const text = noteInput.value.trim();
  if (!text) return;
  const tags = tagsInput.value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  await sendSession({ type: "NOTE_ADD", text, tags });
  noteInput.value = "";
  tagsInput.value = "";

  // Visual feedback
  const prev = btnNote.textContent;
  btnNote.textContent = "✓ SAVED";
  btnNote.disabled = true;
  setTimeout(() => {
    btnNote.textContent = prev;
    btnNote.disabled = false;
  }, 1500);

  await refreshSyncIndicator();
});

// ─── Boot ──────────────────────────────────────────────────────────────────────

window.addEventListener("unload", stopPolling);
void init();
