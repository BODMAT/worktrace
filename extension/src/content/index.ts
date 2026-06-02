import type { PageMetadata } from "../types/content";
import type { PendingEvent } from "../types/pending";
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

async function captureMetadata(): Promise<void> {
  // Single read — everything needed to decide and act, except pendingEvents
  const r = await chrome.storage.local.get([
    "blockedDomains",
    "parsingMode",
    "activeSession",
  ]);

  // Level-1 blocklist filter: blocked domains are never parsed
  const blocklist = (r["blockedDomains"] as string[] | undefined) ?? [];
  const hostname = window.location.hostname;
  const blocked = blocklist.some(
    (d) => hostname === d || hostname.endsWith(`.${d}`),
  );
  if (blocked) return;

  // No session or paused session → do not collect
  const session = r["activeSession"] as { pausedAt: number | null } | undefined;
  if (!session || session.pausedAt !== null) return;

  // Music sites always use full mode to preserve album/playlist context
  const globalMode = (r["parsingMode"] as ParsingMode | undefined) ?? "full";
  const effectiveMode: ParsingMode = MUSIC_HOSTNAMES.has(hostname)
    ? "full"
    : globalMode;

  const meta = parseMetadata(effectiveMode);
  const content =
    [meta.metaDescription, ...meta.headings].filter(Boolean).join(" | ") ||
    null;

  const event: PendingEvent = {
    url: meta.url,
    title: meta.title,
    content,
    tags: [],
    timestamp: new Date().toISOString(),
  };

  // Fresh read of pendingEvents right before writing to avoid stale overwrites
  // when multiple tabs capture simultaneously.
  // Writing directly to storage bypasses the service worker entirely —
  // events are never dropped due to SW sleep (MV3 limitation).
  const fresh = await chrome.storage.local.get("pendingEvents");
  const pending = (fresh["pendingEvents"] as PendingEvent[] | undefined) ?? [];
  await chrome.storage.local.set({ pendingEvents: [...pending, event] });
}

// Capture on initial page load
void captureMetadata();

// Re-capture on SPA navigation
window.addEventListener("popstate", () => { void captureMetadata(); });
window.addEventListener("hashchange", () => { void captureMetadata(); });
