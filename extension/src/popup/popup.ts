import type { AuthMessage, AuthResponse } from "../types/auth";
import type { BlocklistMessage, BlocklistResponse } from "../types/blocklist";
import type { MusicMessage, MusicResponse, TrackInfo } from "../types/music";
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

function sendMusic(msg: MusicMessage): Promise<MusicResponse> {
  return new Promise((resolve, reject) =>
    chrome.runtime.sendMessage(msg, (res: MusicResponse | undefined) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!res) return reject(new Error("No response from background"));
      resolve(res);
    }),
  );
}

function sendBlocklist(msg: BlocklistMessage): Promise<BlocklistResponse> {
  return new Promise((resolve, reject) =>
    chrome.runtime.sendMessage(msg, (res: BlocklistResponse | undefined) => {
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
const trackSection  = document.getElementById("track-section")   as HTMLDivElement;
const trackTitle    = document.getElementById("track-title")     as HTMLSpanElement;
const trackArtist   = document.getElementById("track-artist")    as HTMLSpanElement;
const trackSource   = document.getElementById("track-source")    as HTMLSpanElement;
const trackDuration = document.getElementById("track-duration")  as HTMLSpanElement;

// ─── Blocklist DOM refs ────────────────────────────────────────────────────────
const currentDomainEl      = document.getElementById("current-domain")          as HTMLSpanElement;
const toggleCurrentDomain  = document.getElementById("toggle-current-domain")   as HTMLInputElement;
const btnAccordion         = document.getElementById("btn-blocklist-accordion")  as HTMLButtonElement;
const blocklistCountLabel  = document.getElementById("blocklist-count-label")    as HTMLSpanElement;
const blocklistList        = document.getElementById("blocklist-list")           as HTMLDivElement;

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

let isSessionActive = false; // true only when state === "active"

function applyState(state: UIState, elapsedMs = 0): void {
  isSessionActive = state === "active";

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

  // Gray out the music block when session is not actively running
  trackSection.classList.toggle("popup__track--inactive", !isSessionActive);
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

// ─── Now Playing ──────────────────────────────────────────────────────────────

let activeTrack: TrackInfo | null = null;
// Accumulated display duration in ms — only increments while session is active
// AND music is actually playing (detected by playbackTime changing).
// Reset to 0 on track change; initialised from capturedAt on first popup load.
let displayDurationMs = 0;
// Previous playbackTime value — compared each tick to detect play vs pause.
// null = not yet initialised (first tick after track appears).
let prevPlaybackTime: string | null = null;

function formatTrackDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m)}:${String(s).padStart(2, "0")}`;
}

function applyTrack(track: TrackInfo | null): void {
  const prevKey = activeTrack ? `${activeTrack.title}::${activeTrack.artist}` : null;
  const newKey  = track       ? `${track.title}::${track.artist}`             : null;

  // Reset duration counter and playback-time baseline when track changes
  if (newKey !== prevKey) {
    displayDurationMs = track
      ? Math.max(0, Date.now() - new Date(track.capturedAt).getTime())
      : 0;
    prevPlaybackTime = null;
  }

  activeTrack = track;

  if (!track) {
    trackSection.style.display = "none";
    return;
  }

  trackSection.style.display = "flex";
  trackTitle.textContent    = track.title;
  trackArtist.textContent   = track.artist;
  trackDuration.textContent = formatTrackDuration(displayDurationMs);

  const isYTM = track.source === "youtube-music";
  trackSource.textContent = isYTM ? "YTM" : "SC";
  trackSource.className   = `popup__track-source popup__track-source--${isYTM ? "ytm" : "sc"}`;
}

function refreshDuration(): void {
  if (!activeTrack) return;

  // Detect play/pause by comparing consecutive playbackTime values from the DOM.
  // If playbackTime changed since last tick → playing. Same → paused.
  // prevPlaybackTime = null on first tick → skip increment (safe default).
  const curr = activeTrack.playbackTime ?? "";
  const trackIsPlaying =
    prevPlaybackTime !== null &&   // not first tick
    curr !== "" &&                 // player returned a position
    curr !== prevPlaybackTime;     // position advanced since last tick
  prevPlaybackTime = curr;

  if (isSessionActive && trackIsPlaying) displayDurationMs += 1000;
  trackDuration.textContent = formatTrackDuration(displayDurationMs);
}

async function refreshTrack(): Promise<void> {
  const res = await sendMusic({ type: "TRACK_GET_CURRENT" }).catch(() => null);
  if (!res || !res.success) return;
  applyTrack(res.track);
}

// ─── Blocklist ─────────────────────────────────────────────────────────────────

// Tracks accordion open/closed state independently of DOM so refreshBlocklist
// never accidentally resets the visual state between user interactions.
let isAccordionOpen = false;

/** Returns the hostname of the current active tab, or null if unavailable. */
async function getCurrentHostname(): Promise<string | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return null;
    return new URL(tab.url).hostname || null;
  } catch {
    return null;
  }
}

async function refreshBlocklist(): Promise<void> {
  const [res, hostname] = await Promise.all([
    sendBlocklist({ type: "BLOCKLIST_GET" }).catch(() => null),
    getCurrentHostname(),
  ]);

  if (!res || !res.success || !("domains" in res)) return;
  const { domains } = res;

  // 4а: update current-site toggle
  const displayHost = hostname ?? "—";
  currentDomainEl.textContent = displayHost;
  toggleCurrentDomain.disabled = hostname === null;
  toggleCurrentDomain.checked =
    hostname !== null &&
    domains.some((d) => hostname === d || hostname.endsWith(`.${d}`));

  // 4б: update accordion + list
  const count = domains.length;
  if (count === 0) {
    isAccordionOpen = false;       // reset state when list becomes empty
    btnAccordion.hidden = true;
    blocklistList.hidden = true;
  } else {
    btnAccordion.hidden = false;
    // Respect the current open/closed state — don't reset what the user chose
    blocklistList.hidden = !isAccordionOpen;
    blocklistCountLabel.textContent = `${isAccordionOpen ? "▴" : "▾"} ${String(count)} BLOCKED`;
  }

  // Re-render list items
  blocklistList.innerHTML = "";
  for (const domain of domains) {
    const item = document.createElement("div");
    item.className = "popup__blocklist-item";

    const label = document.createElement("span");
    label.className = "popup__blocklist-item-domain";
    label.textContent = domain;

    const toggleLabel = document.createElement("label");
    toggleLabel.className = "popup__toggle";
    toggleLabel.title = `Unblock ${domain}`;

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = true; // all items in the list are blocked by definition
    cb.dataset["domain"] = domain;

    const track = document.createElement("span");
    track.className = "popup__toggle-track";

    toggleLabel.appendChild(cb);
    toggleLabel.appendChild(track);
    item.appendChild(label);
    item.appendChild(toggleLabel);
    blocklistList.appendChild(item);
  }
}

// ─── Blocklist event handlers ──────────────────────────────────────────────────

toggleCurrentDomain.addEventListener("change", async () => {
  const hostname = await getCurrentHostname();
  if (!hostname) return;
  if (toggleCurrentDomain.checked) {
    await sendBlocklist({ type: "BLOCKLIST_ADD", domain: hostname }).catch(() => null);
  } else {
    await sendBlocklist({ type: "BLOCKLIST_REMOVE", domain: hostname }).catch(() => null);
  }
  await refreshBlocklist();
});

btnAccordion.addEventListener("click", () => {
  isAccordionOpen = !isAccordionOpen;
  blocklistList.hidden = !isAccordionOpen;
  blocklistCountLabel.textContent = `${isAccordionOpen ? "▴" : "▾"} ${String(blocklistList.children.length)} BLOCKED`;
});

// Delegated handler for per-domain toggles inside the list
blocklistList.addEventListener("change", async (e) => {
  const target = e.target as HTMLInputElement | null;
  if (!target || target.type !== "checkbox") return;
  const domain = target.dataset["domain"];
  if (!domain) return;
  // Unchecking = unblock (remove from list); re-checking from the list is impossible
  // because items disappear when removed, but guard anyway
  if (!target.checked) {
    await sendBlocklist({ type: "BLOCKLIST_REMOVE", domain }).catch(() => null);
    await refreshBlocklist();
  }
});

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
    await refreshTrack();
    refreshDuration(); // update elapsed time without extra round-trip
    await refreshBlocklist();
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
  await refreshTrack();
  await refreshBlocklist();
  startPolling();
}

// ─── Controls ─────────────────────────────────────────────────────────────────

btnLogin.addEventListener("click", async () => {
  btnLogin.disabled = true;
  btnLogin.textContent = "Signing in...";
  const res = await sendAuth({ type: "AUTH_LOGIN" }).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { success: false as const, error: msg };
  });
  if (res?.success) {
    await init();
  } else {
    btnLogin.disabled = false;
    const errMsg = "error" in res && res.error ? res.error : "Sign-in failed";
    // Trim long error to keep the button readable; full error is in SW inspector
    const short = errMsg.length > 40 ? `${errMsg.slice(0, 40)}…` : errMsg;
    btnLogin.textContent = `⚠ ${short}`;
    setTimeout(() => { btnLogin.textContent = "Sign in with Google"; }, 4000);
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
