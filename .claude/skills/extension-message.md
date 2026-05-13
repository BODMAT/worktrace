# Skill: messaging inside the Chrome Extension

The extension has 3 isolated execution contexts that communicate via Chrome message APIs.

## Topology

```
+----------+          +-------------------+          +-----------+
|  popup   |   <-->   |  background (SW)  |   <-->   |  content  |
+----------+          +-------------------+          +-----------+
                              |
                              v
                      +---------------+
                      | dashboard API |
                      +---------------+
```

## Rules

- **All `fetch` calls to the dashboard API live in `background.ts`.**
  Never `fetch` from `content.ts` or `popup.ts` — they don't hold the JWT and CORS blocks them anyway.
- **JWT is stored in `chrome.storage.local`, read only by the service worker.**
  Content scripts and popup never touch the token directly.
- **content.ts** parses the current page (DOM, metadata, tracks) and sends events to background.
- **popup.ts** controls UI; it queries background for state and triggers actions.

## Typed message envelope

Define a single discriminated union and a matching Zod schema in `extension/shared/messages.ts`:

```ts
import { z } from "zod";

export const ExtensionMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("PAGE_PARSED"), data: ParsedPage }),
  z.object({ type: z.literal("TRACK_CAPTURED"), data: TrackInfo }),
  z.object({ type: z.literal("GET_SESSION_STATE") }),
  z.object({ type: z.literal("START_SESSION") }),
  z.object({ type: z.literal("STOP_SESSION") }),
  z.object({ type: z.literal("SYNC_NOW") }),
]);
export type ExtensionMessage = z.infer<typeof ExtensionMessage>;
```

Always validate incoming messages — content scripts from other extensions can post to your listener:

```ts
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const parsed = ExtensionMessage.safeParse(msg);
  if (!parsed.success) return;
  handleMessage(parsed.data).then(sendResponse);
  return true; // keep channel open for async response
});
```

## Send direction

- popup → background: `chrome.runtime.sendMessage(msg)`
- background → content (specific tab): `chrome.tabs.sendMessage(tabId, msg)`
- content → background: `chrome.runtime.sendMessage(msg)`
- background → popup: response to the popup's `sendMessage` promise

## Service worker lifecycle

Chrome may unload a Manifest V3 service worker at any time when idle.

- Persist all state in `chrome.storage.local` — never in module-level variables.
- For periodic work (sync polling, session timer), use `chrome.alarms`, not `setInterval` (it dies on unload).
- On every event the worker handles, re-read state from storage; don't trust cached in-memory state.

## Network failures

Events from content scripts must not be lost when the network drops:

1. Try to send the event/batch via `fetch`.
2. On failure, queue it in `chrome.storage.local` under a `pendingEvents` key.
3. Re-try on `online` event with exponential backoff (1s, 2s, 4s, …, cap at 60s).
4. After N failed attempts, surface a sync-error indicator to the popup.

## Anti-patterns

- ❌ `fetch` directly from `content.ts` — JWT not available; CORS blocks the request anyway.
- ❌ Storing JWT in any tab's `localStorage` — per-origin and gets cleared.
- ❌ `setInterval` in service worker — unreliable in MV3.
- ❌ Importing TypeScript types from `dashboard/` — breaks isolation, complicates bundling.
