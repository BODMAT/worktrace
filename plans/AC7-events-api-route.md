# Plan: AC 7 — POST /api/v1/events Route Handler

**Branch:** `feature/api-events-and-cors` (combined PR with AC 3)
**Closes:** Week 1 AC 7 ([docs/Task.md L63](../docs/Task.md#L63))
**Status:** implemented, awaiting smoke test

This plan is written post-hoc after several mid-stream corrections from the user. It documents the final decisions and the changes that landed, including all the adjustments made during implementation.

## Scope

First Route Handler in the project, exercising the rules from CLAUDE.md (AC 6). Accepts an event payload from the (future) extension and writes to Postgres via Prisma.

Per CLAUDE.md:
- Thin handler: parse → validate → delegate → respond
- Business logic in `dashboard/server/`
- Zod for validation at the boundary
- Schemas in `dashboard/server/schemas/`

## Files

| Path | Action | Notes |
|---|---|---|
| `dashboard/server/db.ts` | new | PrismaClient singleton + `@prisma/adapter-pg` |
| `dashboard/server/schemas/events.ts` | new | `CreateEventInput` Zod schema derived from generated |
| `dashboard/server/events.ts` | new | `createEvent()` business function |
| `dashboard/app/api/v1/events/route.ts` | new | POST handler |
| `dashboard/prisma/schema.prisma` | modify | output path + zod generator block |
| `dashboard/package.json` | modify | `+@prisma/adapter-pg`, `+pg`, `+@types/pg`, `+prisma-zod-generator` |
| `.gitignore` (root) | modify | broader `**/generated/` pattern |
| `dashboard/.gitignore` | modify | `/generated` (was `/app/generated/prisma`) |
| `dashboard/server/.gitkeep` | delete | server has real files now |
| `CLAUDE.md` | modify | dedup Validation section, document derived-schema pattern, adapter requirement |
| `.claude/skills/api-route.md` | modify | example uses derived-from-generated pattern |
| `.claude/skills/prisma-model.md` | modify | document zod generator + adapter singleton |

## Design decisions

### 1. Use `@prisma/adapter-pg` (Prisma 7 mandate)

**Initial assumption:** `new PrismaClient({ log: ["warn", "error"] })` would just work, like Prisma 6.

**Reality:** Prisma 7's new `prisma-client` generator drops the built-in engine. `PrismaClient` constructor requires either `accelerateUrl` (Prisma Accelerate) or an `adapter` (driver-based). Without one, TypeScript rejects the call.

**Decision:** install `@prisma/adapter-pg` + `pg` + `@types/pg`. Wrap the `DATABASE_URL` in `new PrismaPg({ connectionString })`. For Neon production we'll later swap to `@prisma/adapter-neon` (Week 4 deploy).

### 2. Singleton — `declare global` instead of `as unknown as` (user correction)

**Initial code:**
```ts
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
```

User flagged: double-cast is ugly.

**Final code:**
```ts
declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

export const prisma = globalThis.prismaGlobal ?? createPrismaClient();
```

`declare global` augments the global type properly, no cast needed.

### 3. Move Prisma output out of `app/` directory

**Initial path:** `dashboard/app/generated/prisma` (from AC 2 PR).

**Problem found during AC 7:** the default tsconfig alias `"@/*": ["./*"]` resolves `@/generated/prisma` to `dashboard/generated/prisma` (not `dashboard/app/generated/prisma`). CLAUDE.md (AC 6) had documented `@/generated/prisma/client` as the import path — which would have been broken.

**Decision:** change the schema's `output` from `"../app/generated/prisma"` → `"../generated/prisma"`. Prisma generator now produces client at `dashboard/generated/prisma/`. The default `@/*` alias resolves correctly without custom tsconfig paths. Also matches Next.js best practice (non-route code stays outside `app/`).

### 4. Import path: `@/generated/prisma/client` (not `@/generated/prisma`)

**Reason:** Prisma 7's new generator emits `client.ts` as the entry point — there is no `index.ts`. So the package directory itself can't be imported; you must point at `client`.

**CLAUDE.md and `prisma-model.md` skill updated** to reflect this. Previously they said `from "@/generated/prisma"` which would have failed at TypeScript resolution.

### 5. Zod schemas in `server/schemas/`, not inline (user direction)

**Initial code:** Zod schema was inline in `route.ts`.

User flagged: schemas should live in a dedicated folder.

**Decision:** all API Zod schemas live in `dashboard/server/schemas/<domain>.ts`. Route handlers import from there.

`api-route.md` skill rule was tightened from "inline unless reused" to "always in `server/schemas/`".

### 6. Generate Zod schemas from Prisma (user direction)

**User request:** use `zod-prisma-types` everywhere possible to avoid duplicating Prisma field types in hand-written Zod schemas.

**Discovery (via WebSearch):** `zod-prisma-types` is in maintenance mode and does NOT support Prisma 7 (only 4.x-6.x). Its own author recommends migrating to `prisma-zod-generator` by Omar Dulaimi, which requires Prisma 7+ in its latest versions.

**Decision:** install `prisma-zod-generator`. Add to `schema.prisma`:
```prisma
generator zod {
  provider = "prisma-zod-generator"
  output   = "../generated/zod"
}
```

This generates `dashboard/generated/zod/schemas/objects/*.schema.ts` — one Zod schema per Prisma input/output type.

### 7. Derive from `EventUncheckedCreateInput`, not `EventCreateInput`

Two Zod schemas are generated for create:
- `EventCreateInputObjectSchema` — has nested `session: SessionCreateNestedOneWithoutEventsInputSchema` (Prisma's relation-create syntax)
- `EventUncheckedCreateInputObjectSchema` — has scalar `sessionId: string`

**API clients send a flat `{ sessionId, url, title, ... }` payload** — they don't know about Prisma's nested-create dialect. So we derive from the `Unchecked` variant.

**Final `server/schemas/events.ts`:**
```ts
export const CreateEventInput = EventUncheckedCreateInputObjectZodSchema
  .omit({ id: true, createdAt: true })
  .extend({
    sessionId: z.string().regex(/^c[a-z0-9]{24}$/, "must be a CUID"),
    url: z.url(),
    title: z.string().min(1),
  });
```

- `.omit({ id, createdAt })` — server sets these, never accepts from client.
- `.extend(...)` — tighten validation. Generated schema types these as plain `z.string()`; we add CUID format, URL format, non-empty constraint.

Prisma's `event.create()` accepts both `EventCreateInput` and `EventUncheckedCreateInput` shapes, so passing the flat object works.

### 8. Zod 4 deprecations — use top-level helpers + custom regex

**Hit at runtime:**
- `z.string().cuid()` deprecated → tried `z.cuid()` → also deprecated (Zod 4 deprecates cuid1 validation entirely in favor of cuid2)
- `z.string().url()` deprecated → replaced with `z.url()` (top-level)

**Decision:**
- URL: `z.url()` (top-level)
- CUID: custom regex `/^c[a-z0-9]{24}$/`. We can't use `z.cuid2()` because Prisma's `@default(cuid())` generates cuid v1 (24-char strings starting with `c`), not v2.

Documented in `api-route.md` skill so future schemas use the same pattern.

### 9. Broader `.gitignore` pattern for generated files

**Before:** root `.gitignore` had `**/generated/prisma/` (specific path).

**Problem:** new `dashboard/generated/zod/` folder wouldn't be covered — 73+ files would be committed.

**Decision:** simplify root `.gitignore` to `**/generated/` — covers any subfolder under any `generated/` directory. Also updated `dashboard/.gitignore` to `/generated` (relative to dashboard root) for clarity, replacing the obsolete `/app/generated/prisma` line from AC 2.

### 10. No auth, no batching, no rate-limit in this AC

Out of scope:
- **Auth:** Week 2 AC 1 will add JWT verification. AC 7's handler accepts unauthenticated requests for now.
- **Batching:** Week 2 AC 5 (extension sends events in batches with retry). AC 7's handler accepts one event per request.
- **Idempotency keys:** future enhancement.
- **Rate limiting:** future enhancement.

## Final file: `dashboard/app/api/v1/events/route.ts`

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

5 imports out, 12 lines of logic. Matches `api-route.md` skill exactly.

## Verification

- [x] `npx tsc --noEmit` — clean, no errors, no deprecations
- [x] `npx prisma generate` — both prisma client and zod schemas regenerate
- [x] `docker compose up -d` — Postgres healthy on port 5433
- [ ] **Smoke test:** POST a valid event → 201 with event JSON; POST a bad body → 400 with Zod errors (TODO before commit)

## Out of scope for this AC (handled in AC 3 of same PR)

- CORS headers (`Access-Control-Allow-Origin: chrome-extension://*`)
- `OPTIONS` preflight handler
- `dashboard/server/cors.ts` helper

CORS is the next commit on the same branch.

## Lessons captured for the skills

The drift between "initial plan" and "what landed" was driven by issues that future AI sessions would hit too. The skills now document the actual patterns:

- `api-route.md` — derived-from-generated example, CUID regex, server-managed fields via `.omit()`
- `prisma-model.md` — adapter-based singleton, both generators on schema change
- `CLAUDE.md` — consolidated Validation section pointing at `server/schemas/` and the derived-schema rule
