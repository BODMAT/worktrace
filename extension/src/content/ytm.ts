import type { TrackInfo, MusicMessage } from "../types/music";

const BLOCKLIST_KEY = "blockedDomains";

async function isCurrentHostnameBlocked(): Promise<boolean> {
  const r = await chrome.storage.local.get(BLOCKLIST_KEY);
  const blocklist = (r[BLOCKLIST_KEY] as string[] | undefined) ?? [];
  const hostname = window.location.hostname;
  return blocklist.some(
    (blocked) => hostname === blocked || hostname.endsWith(`.${blocked}`),
  );
}

// ─── DOM parsing ───────────────────────────────────────────────────────────────

function firstText(...selectors: string[]): string {
  for (const sel of selectors) {
    const text = document.querySelector<HTMLElement>(sel)?.textContent?.trim();
    if (text) return text;
  }
  return "";
}

/**
 * Read current playback position from the player bar.
 * Returns a string that changes every ~1 second when playing and stays
 * constant when paused — used by the popup to detect pause state.
 *
 * Uses .time-info textContent ("1:34 / 4:56") — confirmed to update in
 * real-time while playing and stay constant on pause.
 * The slider aria-valuenow was tried but returns a static value.
 */
function getPlaybackTime(): string {
  // Time info text "1:34 / 4:56" — take the left side (current position)
  const timeEl = document.querySelector<HTMLElement>(
    "ytmusic-player-bar .time-info, " +
    "#left-controls .time-info",
  );
  if (timeEl) {
    const raw = timeEl.textContent?.trim() ?? "";
    const curr = raw.split("/")[0]?.trim() ?? "";
    if (curr) return curr;
  }

  return "";
}

function parseTrack(): TrackInfo | null {
  const title = firstText(
    "ytmusic-player-bar yt-formatted-string.title",
    "ytmusic-player-bar .title.ytmusic-player-bar",
    "ytmusic-player-bar .title",
  );

  const artist = firstText(
    "ytmusic-player-bar yt-formatted-string.byline a:first-child",
    "ytmusic-player-bar .byline.ytmusic-player-bar a:first-child",
    "ytmusic-player-bar .subtitle.ytmusic-player-bar a:first-child",
    "ytmusic-player-bar yt-formatted-string.byline",
    "ytmusic-player-bar .byline",
    "ytmusic-player-bar .subtitle",
  );

  if (title && artist) {
    return {
      title,
      artist,
      source:       "youtube-music",
      capturedAt:   new Date().toISOString(),
      playbackTime: getPlaybackTime(),
    };
  }

  const titleFromDoc = document.title.replace(/\s*[-·]\s*YouTube Music\s*$/i, "").trim();
  if (titleFromDoc && titleFromDoc !== "YouTube Music" && artist) {
    return {
      title:        titleFromDoc,
      artist,
      source:       "youtube-music",
      capturedAt:   new Date().toISOString(),
      playbackTime: getPlaybackTime(),
    };
  }

  return null;
}

// ─── Deduplication ────────────────────────────────────────────────────────────

let previousKey = "";

function sendIfChanged(track: TrackInfo | null): void {
  if (!track) return;
  const key = `${track.title}::${track.artist}`;
  if (key === previousKey) return;
  previousKey = key;

  // First-level filter: do not send track data for blocked domains
  isCurrentHostnameBlocked()
    .then((blocked) => {
      if (blocked) return;
      const message: MusicMessage = { type: "TRACK_CAPTURED", payload: track };
      chrome.runtime.sendMessage(message).catch(() => { /* SW inactive — ignore */ });
    })
    .catch(() => { /* storage read failed — skip silently */ });
}

// ─── MutationObserver ─────────────────────────────────────────────────────────

function observeChanges(): void {
  const titleNode = document.querySelector("title");
  if (titleNode) {
    new MutationObserver(() => sendIfChanged(parseTrack())).observe(titleNode, {
      childList: true, characterData: true, subtree: true,
    });
  }

  const playerBar = document.querySelector("ytmusic-player-bar");
  if (playerBar) {
    new MutationObserver(() => sendIfChanged(parseTrack())).observe(playerBar, {
      childList: true, subtree: true, characterData: true,
    });
  } else {
    const bodyObserver = new MutationObserver(() => {
      const bar = document.querySelector("ytmusic-player-bar");
      if (bar) {
        bodyObserver.disconnect();
        new MutationObserver(() => sendIfChanged(parseTrack())).observe(bar, {
          childList: true, subtree: true, characterData: true,
        });
        sendIfChanged(parseTrack());
      }
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });
  }
}

// ─── On-demand request from background ────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (msg: unknown, _sender, sendResponse: (track: TrackInfo | null) => void) => {
    const type = (msg as Record<string, unknown> | null)?.["type"];
    if (type === "TRACK_REQUEST") {
      sendResponse(parseTrack());
      return false;
    }
    return false;
  },
);

// ─── Boot ─────────────────────────────────────────────────────────────────────

sendIfChanged(parseTrack());
observeChanges();

// Notify background to close the DB track record when the tab is closed/navigated.
// pagehide fires for both tab close and navigation (unlike beforeunload).
window.addEventListener("pagehide", () => {
  chrome.runtime.sendMessage({ type: "TRACK_STOP" } satisfies MusicMessage).catch(() => {});
});
