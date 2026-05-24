import type { TrackInfo, MusicMessage } from "../types/music";

// ─── DOM parsing ───────────────────────────────────────────────────────────────

/** Try a list of CSS selectors in order and return the first non-empty text match. */
function firstText(...selectors: string[]): string {
  for (const sel of selectors) {
    const text = document.querySelector<HTMLElement>(sel)?.textContent?.trim();
    if (text) return text;
  }
  return "";
}

/**
 * Read the current track from the YTM player bar.
 * Tries several selector strategies; falls back to document.title for the song title only
 * (YTM does NOT put the artist in the tab title).
 */
function parseTrack(): TrackInfo | null {
  // ── Title — try multiple selectors ──────────────────────────────────────────
  const title = firstText(
    // Most reliable: yt-formatted-string with class "title" inside the player bar
    "ytmusic-player-bar yt-formatted-string.title",
    // Alternate: element has both classes "title" and "ytmusic-player-bar"
    "ytmusic-player-bar .title.ytmusic-player-bar",
    // Broad fallback
    "ytmusic-player-bar .title",
  );

  // ── Artist — try multiple selectors ─────────────────────────────────────────
  const artist = firstText(
    // byline contains artist link(s); first <a> is the primary artist
    "ytmusic-player-bar yt-formatted-string.byline a:first-child",
    "ytmusic-player-bar .byline.ytmusic-player-bar a:first-child",
    "ytmusic-player-bar .subtitle.ytmusic-player-bar a:first-child",
    // Fallback: grab entire byline text (may include featuring artists)
    "ytmusic-player-bar yt-formatted-string.byline",
    "ytmusic-player-bar .byline",
    "ytmusic-player-bar .subtitle",
  );

  if (title && artist) {
    return { title, artist, source: "youtube-music", capturedAt: new Date().toISOString() };
  }

  // ── document.title fallback — title only ────────────────────────────────────
  // YTM formats: "Song Title - YouTube Music" or "Song Title · YouTube Music"
  const titleFromDoc = document.title
    .replace(/\s*[-·]\s*YouTube Music\s*$/i, "")
    .trim();

  if (titleFromDoc && titleFromDoc !== "YouTube Music" && artist) {
    return { title: titleFromDoc, artist, source: "youtube-music", capturedAt: new Date().toISOString() };
  }

  // Can't determine both title AND artist — skip
  return null;
}

// ─── Deduplication ────────────────────────────────────────────────────────────

let previousKey = "";

function sendIfChanged(track: TrackInfo | null): void {
  if (!track) return;

  const key = `${track.title}::${track.artist}`;
  if (key === previousKey) return;
  previousKey = key;

  const message: MusicMessage = { type: "TRACK_CAPTURED", payload: track };
  chrome.runtime.sendMessage(message).catch(() => {
    // Service worker may be inactive — ignore silently
  });
}

// ─── MutationObserver ─────────────────────────────────────────────────────────

function observeChanges(): void {
  // Observe <title> — YTM updates it on every track change (most reliable signal)
  const titleNode = document.querySelector("title");
  if (titleNode) {
    new MutationObserver(() => sendIfChanged(parseTrack())).observe(titleNode, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  // Observe the player bar itself — catches DOM updates to title/byline elements
  const playerBar = document.querySelector("ytmusic-player-bar");
  if (playerBar) {
    new MutationObserver(() => sendIfChanged(parseTrack())).observe(playerBar, {
      childList:     true,
      subtree:       true,
      characterData: true,
    });
  } else {
    // Player bar not rendered yet (SPA cold start) — wait for it
    const bodyObserver = new MutationObserver(() => {
      const bar = document.querySelector("ytmusic-player-bar");
      if (bar) {
        bodyObserver.disconnect();
        new MutationObserver(() => sendIfChanged(parseTrack())).observe(bar, {
          childList: true,
          subtree: true,
          characterData: true,
        });
        sendIfChanged(parseTrack());
      }
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });
  }
}

// ─── On-demand request from background ────────────────────────────────────────
// Background sends TRACK_REQUEST when popup opens and storage has no currentTrack.
// This recovers from the SW-inactive race condition on page load.

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
