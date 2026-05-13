# Skill: add a Next.js Route Handler

Use when adding or modifying a `dashboard/app/api/**/route.ts` endpoint.

## Location

- App Router: `dashboard/app/api/<resource>/route.ts`
- For versioned APIs: `dashboard/app/api/v1/<resource>/route.ts`
- Subresource: `dashboard/app/api/v1/<resource>/[id]/route.ts`

## Structure (every handler)

1. Parse the request — `await req.json()`, query params via `req.nextUrl.searchParams`, route params via the second arg.
2. Validate with a Zod schema. Define inline unless reused; if reused, move to `dashboard/server/schemas/`.
3. Delegate to a `dashboard/server/<domain>.ts` module — never inline business logic.
4. Return typed JSON via `NextResponse.json(...)`.

## Example: POST /api/v1/events

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createEvent } from "@/server/events";

const CreateEventInput = z.object({
  sessionId: z.string().cuid(),
  url: z.string().url(),
  title: z.string().min(1),
  content: z.string().optional(),
  tags: z.array(z.string()).default([]),
  timestamp: z.coerce.date(),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = CreateEventInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }

  const event = await createEvent(parsed.data);
  return NextResponse.json(event, { status: 201 });
}
```

## HTTP semantics

- `200` OK — successful GET / PATCH / DELETE-with-body
- `201` Created — successful POST that created a resource
- `204` No Content — DELETE / accepted POST with no response body
- `400` Bad Request — Zod validation error
- `401` Unauthorized — missing/invalid JWT
- `403` Forbidden — authenticated but not allowed
- `404` Not Found — resource missing

## CORS for the Chrome Extension

Endpoints called from `chrome-extension://*` need CORS headers. Use the shared helper (added in AC 3):

```ts
import { withCors } from "@/server/cors";

export const POST = withCors(async (req) => { /* ... */ });
export const OPTIONS = withCors(async () => new NextResponse(null, { status: 204 }));
```

Always pair non-GET handlers with an `OPTIONS` handler for the CORS preflight.

## Anti-patterns

- ❌ Doing DB queries directly in the handler — delegate to `server/`.
- ❌ Swallowing errors with `try/catch` that returns `200` — let real errors bubble or map them to typed responses.
- ❌ `req.json()` without `safeParse` — always validate.
- ❌ Adding business logic to the handler to "make it easier" — refactor the server module instead.
