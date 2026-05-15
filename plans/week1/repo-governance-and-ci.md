# Plan: Repository governance + minimal CI

**Branch:** `chore/repo-setup` (commits 2 and 3, continuing after `65d8aad` — root README)
**Closes:**
- No Week 1 AC directly (governance files aren't in TZ)
- Week 4 AC 1 partially ([docs/Task.md L97](../../docs/Task.md#L97)) — CI runs lint+typecheck on PRs to `development` and `main`, branch protection prevents merging with failing checks
**Status:** plan, awaiting approval

## Scope

Two commits, in order:

### Commit 2 — `chore: add license, contributing guide, and PR template`

GitHub community-health files + documented branch-protection rules. No code, only repo-meta.

### Commit 3 — `ci: add lint and typecheck workflow`

Minimal GitHub Actions workflow that runs ESLint on the dashboard and `tsc --noEmit` on both packages for every PR to `development` and `main`. This is the technical half of Week 4 AC 1; UI-side branch-protection (toggling "Require status checks") is a one-time GitHub Settings click that the repo owner does after the workflow lands and runs once successfully.

## Files

### Commit 2

| Path | Action | Notes |
|---|---|---|
| `LICENSE` | new | MIT, copyright 2026 BODMAT |
| `CONTRIBUTING.md` | new | Plan→Review→Implement, branch naming, commit conventions, branch protection summary |
| `.github/PULL_REQUEST_TEMPLATE.md` | new | Auto-populated PR body — closes AC link, plan link, changes summary, verification checklist |
| `plans/repo-governance-and-ci.md` | add (this file) | committed with commit 2 |

### Commit 3

| Path | Action | Notes |
|---|---|---|
| `.github/workflows/ci.yml` | new | Two jobs: `dashboard` (lint + typecheck), `extension` (typecheck) |

Nothing else touched. No changes to `dashboard/` or `extension/` source.

## Design decisions

### 1. LICENSE — MIT, single copyright holder

User picked MIT in the previous question. Standard form, single copyright line:

```
Copyright (c) 2026 BODMAT
```

Use the canonical OSI MIT text verbatim (no project-specific clauses). Adding `<your name>` is optional — `BODMAT` matches the GitHub handle.

### 2. CONTRIBUTING.md — reference, not full duplication

The Plan→Review→Implement workflow, branch strategy, and commit conventions are already in [docs/Task.md](../../docs/Task.md) (§ "Git воркфлоу", "Commit messages", "Головне правило воркфлоу"). CONTRIBUTING.md will:

- Summarize each in 3-5 lines (so a drive-by contributor doesn't need to read the full TZ).
- Link out to `docs/Task.md` for full context.
- Add one section that's **not** in `docs/Task.md`: branch-protection rules that need to be toggled in GitHub Settings UI by the owner (`main` and `development` — require PR, require status checks, do not allow bypass).
- Add a short "Where to put new files" map (server logic → `dashboard/server/`, extension messaging → `extension/src/background/`, etc.) — pulled from CLAUDE.md.

Tone: imperative, terse. Audience: someone who just cloned the repo and wants to open their first PR.

Section sketch:

```
# Contributing

## Workflow: Plan → Review → Implement
  ← 3 bullet description, link to docs/Task.md § "Головне правило воркфлоу"

## Branches
  ← naming (feature/, fix/, chore/), branched from development,
    PR back to development. Link to docs/Task.md § "Git воркфлоу".

## Commit messages
  ← Conventional Commits, 1 example line, link to docs/Task.md.

## Branch protection (repo owner — one-time GitHub UI setup)
  ← bulleted list: Settings → Branches → for main and development:
    [x] Require a pull request before merging
    [x] Require status checks to pass before merging
    [x] Do not allow bypassing the above settings
    Status check to require: "CI / dashboard" and "CI / extension" (added in next commit).

## Where things live
  ← short map from CLAUDE.md (server/ for business logic, etc.)
```

### 3. Pull request template — reinforces Plan→Review→Implement

GitHub renders `.github/PULL_REQUEST_TEMPLATE.md` as the default PR body. The template should make it impossible to open a PR without saying which plan and AC it closes — the loop's enforcement mechanism.

Template:

```markdown
## Closes
- AC: <link to docs/Task.md#L… or "n/a">
- Plan: <link to plans/…>

## Changes
- <bullet 1>
- <bullet 2>

## Verification
- [ ] `npm run lint` (dashboard) — clean
- [ ] `npm run typecheck` (extension) — clean
- [ ] `npx tsc --noEmit` (dashboard) — clean
- [ ] Manual test: <what you actually did>

## Notes
<optional — design changes from plan, follow-ups, etc.>
```

The verification commands match what CI runs, so a green CI box ≈ verification done.

### 4. CI workflow shape

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
    branches: [development, main]
  push:
    branches: [development, main]   # also runs on direct pushes for status badges

jobs:
  dashboard:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: dashboard
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: dashboard/package-lock.json
      - run: npm ci
      - run: npx prisma generate
      - run: npm run lint
      - run: npx tsc --noEmit

  extension:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: extension
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: extension/package-lock.json
      - run: npm ci
      - run: npm run typecheck
```

Decisions inside this:

#### 4a. Two jobs, not a matrix

Matrix would be tempting (`strategy.matrix.package: [dashboard, extension]`) but the two packages have different scripts (`lint` exists in dashboard, not extension; `prisma generate` only matters in dashboard). Splitting into named jobs makes the GitHub status-check names readable (`CI / dashboard`, `CI / extension`) and lets us configure required checks per branch protection cleanly.

#### 4b. `prisma generate` before typecheck

The dashboard codebase imports from `@/generated/prisma/client` and `@/generated/zod/...`, both gitignored. Without `prisma generate`, `tsc` would error with "Cannot find module". The dashboard's `npm run build` already chains this (`"build": "prisma generate && next build"`), but `tsc --noEmit` alone doesn't — we run it explicitly. Extension doesn't have generated artifacts so no equivalent step needed.

#### 4c. No ESLint in extension

`extension/package.json` doesn't declare a lint script, and there's no ESLint config there. Out of scope for this commit (the AC 4 plan noted ESLint for extension is a future task). When extension lint is added later, append `- run: npm run lint` to the extension job.

#### 4d. `actions/checkout@v4`, `actions/setup-node@v4`, Node 20

- `@v4` are current as of 2026-05. Pin majors; let Dependabot bump.
- Node 20 LTS matches the README prerequisite. Next.js 16 needs Node ≥ 18.18, so 20 is comfortable.
- No `cache: 'npm'` matrix wizardry — `cache-dependency-path` pins each job's cache to its own `package-lock.json` so they don't trash each other.

#### 4e. Triggers — PR + push

- `pull_request`: required for branch protection's "require status checks" to apply.
- `push` to `development`/`main`: gives the README a green-build badge and catches direct pushes (shouldn't happen once branch protection is on, but defensive).
- Not running on every push to feature branches — saves Actions minutes; the PR trigger covers it.

#### 4f. No matrix on Node versions

YAGNI. We support exactly Node 20 (per README). Add a 22/23 column when there's a reason.

#### 4g. No caching of `~/.npm` manually

`actions/setup-node@v4` with `cache: 'npm'` handles it. Don't reinvent.

### 5. What CI does NOT do (yet)

- **Build** (`next build`, `vite build`) — slower, and lint+typecheck already catch type/syntax errors. Add when we have build-time failures worth catching (e.g., when AC 4 Vercel deploys started failing).
- **Tests** — there are no tests yet; nothing to run.
- **Migrations check** (`prisma migrate diff` against committed schema) — useful, but Week 1 has exactly one migration. Add if drift becomes a problem.
- **Lint extension code** — see 4c. Future.
- **Auto-deploy to Vercel** — Vercel has its own GitHub integration; we don't need to duplicate it in Actions. (Week 4 AC 1 says "При мерджі в main — автодеплой на Vercel" — that's the Vercel integration, not a workflow step here.)

### 6. Branch protection — documented, not automated

GitHub branch protection is a UI setting, not a file in the repo (Rulesets API exists but is overkill for this). CONTRIBUTING.md will explicitly list the toggles to enable. The repo owner does this once after commit 3 lands and the workflow has run successfully on `development` (otherwise "Require status checks" can't find the check names to require).

## Verification

### Commit 2

- [ ] `LICENSE` exists, MIT text, copyright 2026 BODMAT
- [ ] `CONTRIBUTING.md` renders on GitHub, all internal links resolve
- [ ] `.github/PULL_REQUEST_TEMPLATE.md` exists — verify by opening a draft PR after push, body is pre-filled

### Commit 3

- [ ] `.github/workflows/ci.yml` validates as YAML (`yamllint` or just GitHub Actions UI showing no parse errors)
- [ ] After push, **Actions** tab shows two jobs running: `dashboard` and `extension`
- [ ] Both jobs go green on the existing `chore/repo-setup` branch state
- [ ] If we deliberately break a file (add `const x: number = "string"` somewhere), CI fails on `dashboard` job — confirms typecheck is wired
- [ ] Branch-protection UI on GitHub now lists `dashboard` and `extension` as status checks the user can require

## Out of scope (for this branch)

- ESLint for extension code (no config exists; add when needed).
- Build step in CI (deferred until something breaks).
- Auto-merge / Dependabot / CodeQL / release workflows.
- CHANGELOG.md.
- Issue templates (skipped per earlier answer).

## Lesson for the skill

After commit 3, the `.claude/skills/` recipes already say "use Plan → Review → Implement"; they don't need an update for CI. If a future Route Handler skill adds a test command, mention it in the PR template's Verification section.
