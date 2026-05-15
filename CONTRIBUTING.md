# Contributing

Short reference for working in this repo. Full context, weekly roadmap, and acceptance criteria live in [docs/Task.md](docs/Task.md).

## Workflow: Plan → Review → Implement

Never start a non-trivial change by writing code. The loop is:

1. **Plan** — write a markdown file at `plans/weekN/<name>.md` describing scope, files touched, design decisions, and a verification checklist. The plan goes on the feature branch as its first commit (or alongside the implementation commit when small).
2. **Review** — the user reads the plan and approves (or asks for adjustments) before any code is written.
3. **Implement** — only after approval. The implementation should follow the plan; if reality diverges, update the plan in the same PR.

See [docs/Task.md § "Головне правило воркфлоу"](docs/Task.md#L180) for the rationale.

## Branches

Two protected branches:

- `main` — production. Direct pushes blocked. Only merges from `development` after final review.
- `development` — integration branch. Direct pushes blocked. All feature work merges here via PR.

Each task gets its own branch off `development`:

```
feature/<short-name>   new functionality
fix/<short-name>       bug fix
chore/<short-name>     deps, config, repo meta — no logic changes
refactor/<short-name>  behavior-preserving refactor
docs/<short-name>      docs-only changes
```

PR → `development`. When a week (or milestone) is done: `development` → PR → `main`.

See [docs/Task.md § "Git воркфлоу"](docs/Task.md#L104) for full naming conventions and examples.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/). Format:

```
<type>(<scope>): <short description>
```

Types: `feat`, `fix`, `chore`, `refactor`, `style`, `test`, `docs`.

- Description in English, lowercase, no trailing period.
- First line ≤ 72 characters.
- Body (after a blank line) only if extra context is needed.

Examples:

```
feat(extension): add content script for page metadata parsing
fix(popup): reset timer on service worker restart
docs(readme): add full root readme (AC 5)
chore(deps): update prisma to 7.9
```

Full guidance: [docs/Task.md § "Commit messages"](docs/Task.md#L144).

## Branch protection (one-time GitHub UI setup — repo owner)

Settings → Branches → add rule for each of `main` and `development`:

- [x] Require a pull request before merging
- [x] Require status checks to pass before merging
  - Required checks (once CI lands): `CI / dashboard`, `CI / extension`
- [x] Do not allow bypassing the above settings

This step is GitHub UI only — it isn't expressible in a commit. Enable after the CI workflow has run at least once on `development` so the status check names become selectable.

## Where things live

Architectural invariants enforced in [CLAUDE.md](CLAUDE.md). Quick map:

| Concern | Location |
|---|---|
| Business logic (dashboard) | `dashboard/server/` — never inside React components or Route Handlers |
| Route Handlers | `dashboard/app/api/**/route.ts` — thin: parse → validate (Zod) → call `server/` → respond |
| Auth (Google token, JWT) | `dashboard/app/api/auth/**/route.ts` + `dashboard/middleware.ts` — nowhere else |
| Zod schemas for API input | `dashboard/server/schemas/<domain>.ts` — derived from `@/generated/zod/...`, never hand-written from scratch |
| Prisma schema + migrations | `dashboard/prisma/` |
| Extension service worker | `extension/src/background/` — only place that talks to the API or `chrome.storage.local` |
| Extension content/popup | `extension/src/content/`, `extension/src/popup/` — message the background, never `fetch` directly |
| Task recipes (for the AI) | `.claude/skills/` |
| Plans (per-AC) | `plans/weekN/` |

## Type safety

TypeScript strict. `any` is forbidden — use `unknown` + type guards, or define proper types. Enforced by `tsc --noEmit` in CI.

## `extension/` ↔ `dashboard/` isolation

Never import from `dashboard/` inside `extension/` or vice versa. They communicate only via HTTP (the API routes). Separate `package.json`, `tsconfig.json`, and `node_modules` per app.
