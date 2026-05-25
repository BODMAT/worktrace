import type { ContentMessage, PageMetadata } from "../types/content";
import type { ParsingMode } from "../types/parsing";

/** Music sites always get full parsing regardless of the global mode setting. */
const MUSIC_HOSTNAMES = new Set(["music.youtube.com", "soundcloud.com"]);

function parseMetadata(mode: ParsingMode): PageMetadata {
  const headings =
    mode !== "meta"
      ? Array.from(document.querySelectorAll("h1, h2, h3"))
          .map((el) => el.textContent?.trim() ?? "")
          .filter((text) => text.length > 0)
      : [];

  const metaDescription =
    mode !== "headings"
      ? (document.querySelector<HTMLMetaElement>('meta[name="description"]')
          ?.content ?? null)
      : null;

  return {
    url: window.location.href,
    title: document.title,
    metaDescription,
    headings,
  };
}

async function sendMetadata(): Promise<void> {
  // Single storage read — blocklist and parsing mode in one I/O call
  const r = await chrome.storage.local.get(["blockedDomains", "parsingMode"]);
  const blocklist = (r["blockedDomains"] as string[] | undefined) ?? [];
  const hostname = window.location.hostname;

  // Level-1 blocklist filter: do not parse or send data for blocked domains
  const blocked = blocklist.some(
    (d) => hostname === d || hostname.endsWith(`.${d}`),
  );
  if (blocked) return;

  // Music sites always use full mode to preserve album/playlist context
  const globalMode = (r["parsingMode"] as ParsingMode | undefined) ?? "full";
  const effectiveMode: ParsingMode = MUSIC_HOSTNAMES.has(hostname)
    ? "full"
    : globalMode;

  const message: ContentMessage = {
    type: "PAGE_METADATA",
    payload: parseMetadata(effectiveMode),
  };
  chrome.runtime.sendMessage(message).catch(() => {
    // Service worker may be inactive — silently ignore
  });
}

// Send on initial load
void sendMetadata();

// Re-send on SPA navigation
window.addEventListener("popstate", () => { void sendMetadata(); });
window.addEventListener("hashchange", () => { void sendMetadata(); });
