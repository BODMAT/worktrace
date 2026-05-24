import type { TrackInfo, MusicMessage } from "../types/music";

// ─── DOM parsing ───────────────────────────────────────────────────────────────

/**
 * Attempt to read the current track directly from the YTM player bar DOM.
 * Falls back to parsing document.title if the player bar is not rendered yet.
 */
function parseTrack(): TrackInfo | null {
  // Primary: player-bar DOM elements (present while a track is loaded)
  const titleEl  = document.querySelector<HTMLElement>("ytmusic-player-bar .title.ytmusic-player-bar");
  const artistEl = document.querySelector<HTMLElement>(
    "ytmusic-player-bar .subtitle.ytmusic-player-bar a:first-child",
  );

  const titleDOM  = titleEl?.textContent?.trim()  ?? "";
  const artistDOM = artistEl?.textContent?.trim() ?? "";

  if (titleDOM && artistDOM) {
    return { title: titleDOM, artist: artistDOM, source: "youtube-music", capturedAt: new Date().toISOString() };
  }

  // Fallback: document.title — format: "Title - Artist - YouTube Music"
  const match = /^(.+?) - (.+?) - YouTube Music$/.exec(document.title);
  if (match) {
    const [, title, artist] = match;
    if (title && artist) {
      return { title, artist, source: "youtube-music", capturedAt: new Date().toISOString() };
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

  const message: MusicMessage = { type: "TRACK_CAPTURED", payload: track };
  chrome.runtime.sendMessage(message).catch(() => {
    // Service worker may be inactive — ignore silently
  });
}

// ─── MutationObserver ─────────────────────────────────────────────────────────

function observeChanges(): void {
  // Observe <title> changes — YTM updates it on every track change
  const titleNode = document.querySelector("title");
  if (titleNode) {
    new MutationObserver(() => sendIfChanged(parseTrack())).observe(titleNode, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  // Observe the player bar itself — catches subtitle/artist updates
  const playerBar = document.querySelector("ytmusic-player-bar");
  if (playerBar) {
    new MutationObserver(() => sendIfChanged(parseTrack())).observe(playerBar, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  } else {
    // Player bar not rendered yet — watch <body> until it appears
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

// ─── Boot ─────────────────────────────────────────────────────────────────────

sendIfChanged(parseTrack());
observeChanges();
