# WorkTrace — Claude Code rules

Chrome extension + Next.js dashboard for capturing dev session context
and generating AI session reports.

## Repo layout
- `/dashboard` — Next.js 16 (App Router) web app
- `/extension` — Chrome Extension (Manifest V3) — coming in AC 4
- `/docs` — task spec
- Database: PostgreSQL via Prisma 7

## Type safety
- TypeScript strict. **`any` is forbidden** — use `unknown` + type guards, or define proper types.

## Dashboard structure
- **Business logic lives in `dashboard/server/`** (server-only modules).
- Route Handlers in `dashboard/app/api/**/route.ts` are thin: parse → validate (Zod) → call `server/` → respond.
- React components NEVER contain business logic or direct DB access.
- Server Components MAY call `server/` modules directly (no fetch round-trip).

## Auth
Auth logic lives ONLY in:
- `dashboard/app/api/auth/**/route.ts` — Google token verification, JWT issuance
- `dashboard/middleware.ts` — route guarding for `/dashboard/*`

Do NOT duplicate auth checks in components, server modules, or other Route Handlers.

## Extension ↔ Dashboard isolation
- NEVER import from `dashboard/` inside `extension/` (or vice versa).
- All extension API calls go through `background.ts` (service worker) — never directly from `content.ts` or `popup.ts`.
- JWT lives in `chrome.storage.local`, read/written only by service worker.

## Database (Prisma 7)
- Schema: `dashboard/prisma/schema.prisma`.
- Two generators run on `prisma generate`:
  - `dashboard/generated/prisma/` — Prisma client (entry: `client.ts`)
  - `dashboard/generated/zod/` — Zod schemas (`prisma-zod-generator`)
- Both folders gitignored.
- Imports:
  - `import { PrismaClient } from "@/generated/prisma/client"` — **not** `@prisma/client` (Prisma 7 uses `client.ts` entry).
  - Base Zod schemas: `import { EventUncheckedCreateInputObjectZodSchema } from "@/generated/zod/schemas/objects/EventUncheckedCreateInput.schema"`.
- Singleton `PrismaClient` per process — see `dashboard/server/db.ts`. Uses `@prisma/adapter-pg` (Prisma 7 requires a driver adapter at runtime).
- Migrations are committed to git.

## Validation
- Zod for all external input (Route Handlers, extension messages, env vars).
- API-facing schemas live in `dashboard/server/schemas/<domain>.ts` — derived from the generated `@/generated/zod` base schemas via `.omit()` / `.extend()` / `.pick()`. **Never hand-write a schema that duplicates Prisma model fields.**
- Validate at the boundary, not deep inside business logic.

## Skills
Task-specific recipes live in `.claude/skills/`:
- `api-route.md` — adding a Next.js Route Handler
- `prisma-model.md` — adding/changing a Prisma model
- `extension-message.md` — messaging between extension contexts

## Workflow
Use `Plan → Review → Implement` for non-trivial work:
1. Write a plan markdown to `/plans/<name>.md` describing scope and decisions
2. User reviews and approves
3. Implement following the approved plan
