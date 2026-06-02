# Plan: AC 3 — CORS for Chrome Extension

**Branch:** `feature/api-events-and-cors` (second commit, same branch as AC 7)
**Closes:** Week 1 AC 3 ([docs/Task.md L55](../../docs/Task.md#L55))
**Status:** plan, awaiting approval

## Scope

Make `dashboard/app/api/v1/events/route.ts` (added in AC 7) callable from the Chrome Extension. Add the CORS infrastructure so future Route Handlers can reuse it.

Per AC 3 in TZ:
> У Route Handlers налаштовано `Access-Control-Allow-Origin` для `chrome-extension://*`. Перевірено через Postman — запит проходить без помилок.

## Files

| Path | Action | Notes |
|---|---|---|
| `dashboard/server/cors.ts` | new | `withCors()` wrapper + `corsPreflight()` helper |
| `dashboard/app/api/v1/events/route.ts` | modify | wrap `POST` with `withCors`, add `OPTIONS` handler |
| `.claude/skills/api-route.md` | modify | tighten CORS section with real import path and code snippet |
| `plans/AC3-cors.md` | add (this file) | |

## Design decisions

### 1. Pattern: higher-order wrapper, not header-on-each-response

Two common patterns:

- **Per-handler headers:** every handler manually calls `res.headers.set("Access-Control-Allow-Origin", ...)` before return. Repetitive; easy to forget.
- **Higher-order wrapper:** `withCors(handler)` returns a handler that adds CORS headers to whatever the wrapped handler returns.

**Decision:** wrapper. Adding CORS to a new endpoint is then a one-liner:
```ts
export const POST = withCors(async (req) => { /* ... */ });
```

### 2. Origin matching: regex, not wildcard, not `*`

The TZ says `chrome-extension://*`. CORS spec doesn't support wildcards in the origin value — `Access-Control-Allow-Origin` must be either an exact origin or `*`.

Options:
- **`*`** — allow any origin. Simplest but exposes the API to any website. Also incompatible with `Access-Control-Allow-Credentials: true` (which we'll need in Week 2 for JWT in Authorization header).
- **Echo origin if it matches a regex** — accept the request, then write back the actual origin in the header. Browsers verify the echoed value matches their own origin.

**Decision:** echo + regex. Chrome extension IDs are 32-char lowercase a-p strings (`a-p` because Chrome encodes a 128-bit ID in base16 over `a-p`). Regex: `/^chrome-extension:\/\/[a-p]{32}$/`.

For non-matching origins (or absent `Origin` header), the helper writes `Access-Control-Allow-Origin: null` — browsers block reading the response, but Postman / curl / server-to-server requests still work fine (they don't enforce CORS).

### 3. `OPTIONS` preflight handler

Browsers send `OPTIONS` preflight before any cross-origin POST with `Content-Type: application/json` (it's a "non-simple" request). Without an `OPTIONS` handler that returns 204 with CORS headers, the actual POST never gets sent by the browser.

**Decision:** export an `OPTIONS` function from the route file that returns 204 with the same CORS headers. The helper `corsPreflight(req)` builds the response.

### 4. Headers we expose

- `Access-Control-Allow-Origin: <echoed-or-null>`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: Authorization, Content-Type` — `Authorization` for the upcoming JWT in Week 2, `Content-Type` because our payload is `application/json`
- `Vary: Origin` — tells caches that the response varies by `Origin` header (important for CDN behavior)

**Not yet included** (out of scope for AC 3):
- `Access-Control-Allow-Credentials: true` — only needed if we use cookies. We use a `Bearer` token in `Authorization` header (Week 2), not cookies. Don't enable until needed.
- `Access-Control-Max-Age` — caches the preflight result. Optimization, not correctness. Skip.

### 5. Where the helper lives

`dashboard/server/cors.ts` — single file, per the api-route skill recipe which already references `@/server/cors`.

Not a subfolder; the surface is small (one wrapper, one preflight builder, one regex).

## Final code

`dashboard/server/cors.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";

const ALLOWED_ORIGIN_PATTERN = /^chrome-extension:\/\/[a-p]{32}$/;

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGIN_PATTERN.test(origin) ? origin : "null";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Vary": "Origin",
  };
}

export function withCors(
  handler: (req: NextRequest) => Promise<NextResponse> | NextResponse,
): (req: NextRequest) => Promise<NextResponse> {
  return async (req) => {
    const res = await handler(req);
    const headers = corsHeaders(req.headers.get("origin"));
    for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
    return res;
  };
}

export function corsPreflight(req: NextRequest): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}
```

`dashboard/app/api/v1/events/route.ts` (only delta — wrap POST + add OPTIONS):
```ts
import { NextRequest, NextResponse } from "next/server";
import { createEvent } from "@/server/events";
import { CreateEventInput } from "@/server/schemas/events";
import { withCors, corsPreflight } from "@/server/cors";

export const POST = withCors(async (req) => {
  const body = await req.json();
  const parsed = CreateEventInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }
  const event = await createEvent(parsed.data);
  return NextResponse.json(event, { status: 201 });
});

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
```

## Verification

- [ ] `npx tsc --noEmit` — clean
- [ ] OPTIONS preflight (curl with `-X OPTIONS` and `Origin: chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`) → 204 + correct CORS headers
- [ ] POST with matching origin → 201 + `Access-Control-Allow-Origin: chrome-extension://...` echoed back
- [ ] POST with bad origin (`https://evil.com`) → still 201 (server doesn't reject), but `Access-Control-Allow-Origin: null` so browser would block the response read
- [ ] POST without Origin header (Postman / curl) → still 201, header is `null` but client doesn't care

## Test commands

```powershell
# 1. OPTIONS preflight
$h = @{ "Origin" = "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
$r = Invoke-WebRequest -Uri "http://localhost:3000/api/v1/events" -Method Options -Headers $h
Write-Host "Status: $($r.StatusCode)"
$r.Headers | Format-List

# 2. POST with matching extension origin
$body = '{"sessionId":"ctestsess0000000000000001","url":"https://example.com","title":"With CORS","tags":["cors"],"timestamp":"2026-05-14T13:00:00Z"}'
$r = Invoke-WebRequest -Uri "http://localhost:3000/api/v1/events" -Method Post -Body $body -ContentType "application/json" -Headers $h
$r.Headers["Access-Control-Allow-Origin"]
```

## Out of scope

- **Origin allowlist for the production extension ID** — once the extension is packaged in Week 4 and gets a real Chrome ID, we'd tighten the regex (or env-driven list). For now any extension-shaped origin is accepted.
- **CSRF** — same-origin policy + CORS is enough; we don't use cookies.
- **Rate limiting / abuse** — Week 2/3.
- **CORS for the dashboard's own pages** — same-origin, no CORS needed.

## Lesson for the skill

`api-route.md` already mentions CORS but with placeholder code. Update with the real import paths once `server/cors.ts` exists:
```ts
import { withCors, corsPreflight } from "@/server/cors";

export const POST = withCors(async (req) => { /* ... */ });
export function OPTIONS(req) { return corsPreflight(req); }
```
