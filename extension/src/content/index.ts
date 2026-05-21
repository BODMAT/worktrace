import type { ContentMessage, PageMetadata } from "../types/content";

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

function sendMetadata(): void {
  const message: ContentMessage = {
    type: "PAGE_METADATA",
    payload: parseMetadata(),
  };
  chrome.runtime.sendMessage(message).catch(() => {
    // Service worker may be inactive — silently ignore
  });
}

// Send on initial load
sendMetadata();

// Re-send on SPA navigation
window.addEventListener("popstate", sendMetadata);
window.addEventListener("hashchange", sendMetadata);
