import type { ContentMessage, PageMetadata } from "../types/content";

const BLOCKLIST_KEY = "blockedDomains";

/**
 * Returns true if the current page's hostname is in the blocklist.
 * Reads directly from chrome.storage.local — no round-trip to background.
 */
async function isCurrentHostnameBlocked(): Promise<boolean> {
  const r = await chrome.storage.local.get(BLOCKLIST_KEY);
  const blocklist = (r[BLOCKLIST_KEY] as string[] | undefined) ?? [];
  const hostname = window.location.hostname;
  return blocklist.some(
    (blocked) => hostname === blocked || hostname.endsWith(`.${blocked}`),
  );
}

function parseMetadata(): PageMetadata {
  const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
    .map((el) => el.textContent?.trim() ?? "")
    .filter((text) => text.length > 0);

  return {
    url: window.location.href,
    title: document.title,
    metaDescription:
      document.querySelector<HTMLMetaElement>('meta[name="description"]')
        ?.content ?? null,
    headings,
  };
}

async function sendMetadata(): Promise<void> {
  // First-level filter: do not parse or send data for blocked domains
  const blocked = await isCurrentHostnameBlocked();
  if (blocked) return;

  const message: ContentMessage = {
    type: "PAGE_METADATA",
    payload: parseMetadata(),
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
