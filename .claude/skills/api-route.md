# Skill: add a Next.js Route Handler

Use when adding or modifying a `dashboard/app/api/**/route.ts` endpoint.

## Location

- App Router: `dashboard/app/api/<resource>/route.ts`
- For versioned APIs: `dashboard/app/api/v1/<resource>/route.ts`
- Subresource: `dashboard/app/api/v1/<resource>/[id]/route.ts`

## Structure (every handler)

1. Parse the request — `await req.json()`, query params via `req.nextUrl.searchParams`, route params via the second arg.
2. Validate with a Zod schema. Schemas live in `dashboard/server/schemas/<domain>.ts` — never inline in the route handler. **Derive from the generated schemas at `@/generated/zod/schemas/objects/<Model>UncheckedCreateInput.schema`** (or similar) using `.omit()` / `.extend()` / `.pick()`. The `Unchecked*` variants expose foreign keys as scalars (e.g., `sessionId: string`), matching what API clients send.
3. Delegate to a `dashboard/server/<domain>.ts` module — never inline business logic.
4. Return typed JSON via `NextResponse.json(...)`.

## Example: POST /api/v1/events

`dashboard/server/schemas/events.ts`:
```ts
import { z } from "zod";
import { EventUncheckedCreateInputObjectZodSchema } from "@/generated/zod/schemas/objects/EventUncheckedCreateInput.schema";

export const CreateEventInput = EventUncheckedCreateInputObjectZodSchema
  .omit({ id: true, createdAt: true })
  .extend({
    sessionId: z.string().regex(/^c[a-z0-9]{24}$/, "must be a CUID"),
    url: z.url(),
    title: z.string().min(1),
  });

export type CreateEventInput = z.infer<typeof CreateEventInput>;
```

Notes on the derived pattern:
- **Base from generated:** all fields and types come from Prisma — no manual duplication.
- **`.omit()` server-managed fields:** clients don't set `id` or `createdAt`.
- **`.extend()` for stricter validation:** the generated schema just says `z.string()` for FKs and URLs; we tighten with a CUID regex, `z.url()`, and `z.string().min(1)`.
- **CUID regex** not `z.cuid()`: Zod 4 deprecated `z.cuid()`. Our Prisma uses cuid v1 (`@default(cuid())`), validated by `/^c[a-z0-9]{24}$/`.

`dashboard/app/api/v1/events/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { createEvent } from "@/server/events";
import { CreateEventInput } from "@/server/schemas/events";

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

Endpoints called from `chrome-extension://*` need CORS headers. Use the shared helpers in `@/server/cors`:

```ts
import { withCors, corsPreflight } from "@/server/cors";

export const POST = withCors(async (req) => { /* ... */ });
export function OPTIONS(req: NextRequest) { return corsPreflight(req); }
```

`withCors` echoes the request's `Origin` back in `Access-Control-Allow-Origin` if it matches the Chrome extension format (`^chrome-extension://[a-p]{32}$`); otherwise it sends `null` (browsers block reading the response; Postman/curl ignore CORS and still see the body).

Always pair non-GET handlers with an `OPTIONS` handler for the CORS preflight.

## Anti-patterns

- ❌ Doing DB queries directly in the handler — delegate to `server/`.
- ❌ Swallowing errors with `try/catch` that returns `200` — let real errors bubble or map them to typed responses.
- ❌ `req.json()` without `safeParse` — always validate.
- ❌ Adding business logic to the handler to "make it easier" — refactor the server module instead.
