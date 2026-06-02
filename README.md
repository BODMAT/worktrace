# WorkTrace

Browser extension + web dashboard that captures developer session context and generates AI-powered session reports.

## What it is

A Chrome extension (Manifest V3) silently records the pages a developer opens during a coding session — URLs, titles, page metadata, tags, optionally the music they listen to — and ships them to a Next.js dashboard. The dashboard renders a per-session timeline and asks an LLM to summarize each session into a structured Markdown report.

See [docs/Task.md](docs/Task.md) for the full specification, acceptance criteria, and four-week roadmap.

## Repo layout

```
worktrace/
├─ dashboard/         Next.js 16 web app (App Router) + API routes + Prisma
├─ extension/         Chrome Manifest V3 extension (Vite + @crxjs/vite-plugin)
├─ docs/              Project specification (Task.md)
├─ plans/             Per-AC implementation plans (Plan → Review → Implement)
├─ .claude/skills/    Task recipes for the AI assistant
├─ CLAUDE.md          AI agent rules (architecture invariants)
└─ docker-compose.yml Local PostgreSQL for development
```

The two apps are isolated — `extension/` never imports from `dashboard/` and vice versa. They communicate over HTTP only.

## Tech stack

- **Dashboard** — Next.js 16 (App Router, Server Components), React 19, Tailwind CSS v4, TanStack Query v5, Framer Motion, D3.js
- **Backend** — Next.js Route Handlers, Prisma 7 (with `@prisma/adapter-pg`), Zod, `google-auth-library`, `jose`
- **Extension** — Manifest V3, Vite 7 + `@crxjs/vite-plugin`, TypeScript (strict)
- **Database** — PostgreSQL 16 (Docker for local, Neon for production)
- **AI** — Groq (`llama-3.3-70b-versatile`), з можливістю вказати власний API ключ у налаштуваннях
- **Deploy** — Vercel (dashboard), `.zip` для локального завантаження extension

Versions in `dashboard/package.json` and `extension/package.json` are authoritative.

## Prerequisites

- **Node.js** 20 or newer
- **Docker Desktop** (or Docker Engine + Compose plugin)
- **Chrome** 120+ (for loading the unpacked extension)

## Setup

### 1. Clone and configure env

```bash
git clone https://github.com/BODMAT/worktrace.git
cd worktrace
cp dashboard/.env.example dashboard/.env
cp extension/.env.example extension/.env
```

The dashboard `.env` contains `DATABASE_URL` (already pointing at the docker-compose Postgres) plus `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `JWT_SECRET`, `GROQ_API_KEY`, and `CRON_SECRET`. See comments in `.env.example` for how to generate each value.

### 2. Start PostgreSQL

```bash
docker-compose up -d
```

This boots a `worktrace-postgres` container on host port **5433** (mapped to container 5432, so it won't collide with a local Postgres on 5432). The `DATABASE_URL` in `dashboard/.env.example` already uses this port.

### 3. Run the dashboard

```bash
cd dashboard
npm install
npx prisma migrate dev
npm run dev
```

The dashboard is now at `http://localhost:3000`. The `npm run dev` step also implicitly runs `prisma generate` on first build, materializing the Prisma client and Zod schemas into `dashboard/generated/` (both gitignored).

### 4. Build and load the extension

```bash
cd extension
npm install
npm run build
```

Then in Chrome:

1. Open `chrome://extensions`
2. Toggle **Developer mode** (top right)
3. Click **Load unpacked**
4. Select `extension/dist/`

The extension card should appear with no errors. For HMR-rebuild during active development use `npm run dev` instead of `npm run build`.

### Load from `.zip` (without source code)

Download `worktrace-extension.zip` from the [latest GitHub Release](https://github.com/BODMAT/worktrace/releases/latest), then:

1. Unzip to any folder
2. Open `chrome://extensions` → **Developer mode** → **Load unpacked**
3. Select the unzipped folder

No `.env` needed — the production dashboard URL and OAuth client ID are baked into the release build.

## Verifying it works

1. **Dashboard** — відкрий `http://localhost:3000`, натисни "Sign in with Google" → має відкритись `/dashboard` з даними.
2. **Extension** — картка на `chrome://extensions` без помилок; іконка в тулбарі відкриває popup; сервіс воркер логує `[worktrace] installed` (видно через **Inspect** посилання розширення).
3. **API** — Bearer токен з extension працює:

   ```bash
   curl -X POST http://localhost:3000/api/v1/events \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <jwt-from-extension-storage>" \
     -d '{"sessionId":"<active-session-id>","url":"https://github.com","title":"Test","timestamp":"2026-06-01T10:00:00Z"}'
   ```

   Відповідь `201` означає що dashboard, Prisma і Postgres з'єднані коректно.

## Project docs

- [docs/Task.md](docs/Task.md) — full acceptance criteria, weekly roadmap, git workflow
- [CLAUDE.md](CLAUDE.md) — AI agent rules: architecture invariants, type-safety constraints, import boundaries
- [.claude/skills/](.claude/skills/) — task recipes (`api-route.md`, `prisma-model.md`, `extension-message.md`)
- [plans/](plans/) — per-AC implementation plans authored before each commit (the Plan → Review → Implement loop)

## Deploy

- **Dashboard** — Vercel with **Root Directory: `dashboard`**. The build command `prisma generate && next build` (declared in `dashboard/package.json`) regenerates the Prisma client at build time since `dashboard/generated/` is gitignored. Production database is Neon.
- **Extension** — `npm run zip` inside `extension/` builds and packages `dist/` into `worktrace-extension.zip`. Load unpacked in Chrome via Developer mode.
