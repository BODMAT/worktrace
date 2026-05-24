import type { TrackInfo, MusicMessage } from "../types/music";

// ─── DOM parsing ───────────────────────────────────────────────────────────────

/**
 * Read the current track from the SoundCloud playback badge.
 * Falls back to parsing document.title if the badge is not yet rendered.
 */
function parseTrack(): TrackInfo | null {
  // Primary: playback badge (bottom player bar)
  const titleEl  = document.querySelector<HTMLElement>(
    ".playbackSoundBadge__titleLink span:not(.sc-visuallyhidden)",
  );
  const artistEl = document.querySelector<HTMLElement>(
    ".playbackSoundBadge__lightLink",
  );

  const titleDOM  = titleEl?.textContent?.trim()  ?? "";
  const artistDOM = artistEl?.textContent?.trim() ?? "";

  if (titleDOM && artistDOM) {
    return { title: titleDOM, artist: artistDOM, source: "soundcloud", capturedAt: new Date().toISOString() };
  }

  // Fallback: document.title
  // Formats observed:
  //   "Track Title by Artist | Free Listening on SoundCloud"
  //   "Track Title by Artist | Stream on SoundCloud"
  //   "Track Title | Artist | SoundCloud"
  const byMatch = /^(.+?) by (.+?) \| /.exec(document.title);
  if (byMatch) {
    const [, title, artist] = byMatch;
    if (title && artist) {
      return { title, artist, source: "soundcloud", capturedAt: new Date().toISOString() };
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
  // Observe <title> — SoundCloud updates it on track change
  const titleNode = document.querySelector("title");
  if (titleNode) {
    new MutationObserver(() => sendIfChanged(parseTrack())).observe(titleNode, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  // Observe the playback badge — catches title/artist text updates
  const badge = document.querySelector(".playbackSoundBadge");
  if (badge) {
    new MutationObserver(() => sendIfChanged(parseTrack())).observe(badge, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  } else {
    // Badge not rendered yet — watch <body> until it appears
    const bodyObserver = new MutationObserver(() => {
      const b = document.querySelector(".playbackSoundBadge");
      if (b) {
        bodyObserver.disconnect();
        new MutationObserver(() => sendIfChanged(parseTrack())).observe(b, {
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
