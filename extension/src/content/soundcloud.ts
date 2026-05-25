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

/**
 * Read current playback position from the SoundCloud player bar.
 * Changes every ~1 second when playing, stays constant when paused.
 */
function getPlaybackTime(): string {
  // Time passed element (e.g. "1:23")
  const timeEl = document.querySelector<HTMLElement>(
    ".playbackTimeline__timePassed, " +
    "[class*='timePassed'], " +
    ".playControls__time",
  );
  if (timeEl) {
    const t = timeEl.textContent?.trim() ?? "";
    if (t && t !== "0:00") return t;
  }

  // Progress bar aria-valuenow (percentage 0-100 or seconds)
  const bar = document.querySelector<HTMLElement>(
    ".playbackTimeline__progressWrapper, " +
    "[class*='progressWrapper']",
  );
  if (bar) {
    const val = bar.getAttribute("aria-valuenow");
    if (val && val !== "0") return val;
  }

  return "";
}

function parseTrack(): TrackInfo | null {
  const titleEl  = document.querySelector<HTMLElement>(
    ".playbackSoundBadge__titleLink span:not(.sc-visuallyhidden)",
  );
  const artistEl = document.querySelector<HTMLElement>(
    ".playbackSoundBadge__lightLink",
  );

  const titleDOM  = titleEl?.textContent?.trim()  ?? "";
  const artistDOM = artistEl?.textContent?.trim() ?? "";

  if (titleDOM && artistDOM) {
    return {
      title:        titleDOM,
      artist:       artistDOM,
      source:       "soundcloud",
      capturedAt:   new Date().toISOString(),
      playbackTime: getPlaybackTime(),
    };
  }

  const byMatch = /^(.+?) by (.+?) \| /.exec(document.title);
  if (byMatch) {
    const [, title, artist] = byMatch;
    if (title && artist) {
      return {
        title,
        artist,
        source:       "soundcloud",
        capturedAt:   new Date().toISOString(),
        playbackTime: getPlaybackTime(),
      };
    }
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

  const badge = document.querySelector(".playbackSoundBadge");
  if (badge) {
    new MutationObserver(() => sendIfChanged(parseTrack())).observe(badge, {
      childList: true, subtree: true, characterData: true,
    });
  } else {
    const bodyObserver = new MutationObserver(() => {
      const b = document.querySelector(".playbackSoundBadge");
      if (b) {
        bodyObserver.disconnect();
        new MutationObserver(() => sendIfChanged(parseTrack())).observe(b, {
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
