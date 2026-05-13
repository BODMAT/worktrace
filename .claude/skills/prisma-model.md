# Skill: add or change a Prisma model

Use when editing `dashboard/prisma/schema.prisma`.

## Steps

1. Edit `dashboard/prisma/schema.prisma` — add/modify model, field, or relation.
2. Add `@@index([fk_field])` on every foreign-key column.
   Postgres does NOT auto-index FKs (unlike MySQL); without this, joins do full table scans.
3. Add `@unique` (single column) or `@@unique([a, b])` (compound) for natural keys.
4. For owned children (e.g., `Session` owned by `User`), set `onDelete: Cascade`:
   ```prisma
   user User @relation(fields: [userId], references: [id], onDelete: Cascade)
   ```
5. Ensure local Postgres is running: `docker compose up -d` (from repo root).
6. Generate the migration AND apply it locally:
   ```
   cd dashboard
   npx prisma migrate dev --name <descriptive_name_in_snake_case>
   ```
7. Inspect `dashboard/prisma/migrations/<timestamp>_<name>/migration.sql` — make sure the SQL matches what you expected.
8. Commit BOTH the schema change AND the migration files.

## Conventions

- IDs: `String @id @default(cuid())`
- Server-set timestamps: `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`
- Client-set timestamps (e.g., when an event happened in the browser): explicit, no default
- Optional fields: `?` suffix — `content String?`
- Arrays of primitives: `tags String[]` (Postgres native array)

## Imports

Generated client lives at `dashboard/app/generated/prisma` (gitignored, regenerated on `prisma generate`).

```ts
import { PrismaClient } from "@/generated/prisma";
```

NOT `@prisma/client` — that path is for Prisma 6 and older. Prisma 7 outputs to a custom folder defined by `generator client { output = "..." }` in `schema.prisma`.

## Singleton in dev

Next.js dev hot-reload would create a new `PrismaClient` on every reload, exhausting connections. Use a singleton in `dashboard/server/db.ts`:

```ts
import { PrismaClient } from "@/generated/prisma";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ log: ["warn", "error"] });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

## Production migrations

On Vercel deploy, run `npx prisma migrate deploy` (not `migrate dev`) — it applies pending migrations without prompting and never alters the schema.

## Anti-patterns

- ❌ Editing schema without running `migrate dev` — DB drifts from code.
- ❌ Editing existing migration SQL files — generate a new migration instead.
- ❌ Using `db push` in production — it skips migration history.
- ❌ Importing `@prisma/client` — wrong path for Prisma 7.
