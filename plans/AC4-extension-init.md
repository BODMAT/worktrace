# Plan: AC 4 — Chrome Extension initialization

**Branch:** `feature/extension-init`
**Closes:** Week 1 AC 4 ([docs/Task.md L58](../docs/Task.md#L58))
**Status:** plan, awaiting approval

## Scope

Bootstrap an empty-but-loadable Chrome Extension at `extension/` with:

- Manifest V3
- Background service worker (TypeScript, empty handler with a `console.log` heartbeat)
- Content script (TypeScript, empty stub injected on `<all_urls>`)
- Empty popup (HTML + CSS + minimal TS)
- Vite + `@crxjs/vite-plugin` build pipeline producing a `dist/` that loads via `chrome://extensions` → Load unpacked without errors

Per AC 4 in TZ:
> Створено Chrome Extension з Manifest V3. Є фоновий service worker, базовий content script та порожній HTML popup. Розширення завантажується у Chrome без помилок.

Out of scope (later ACs of Week 2):
- Auth flow / Google OAuth (AC 1)
- Real content parsing logic (AC 2)
- Session manager / timer (AC 3)
- Popup UI (AC 4 of Week 2)
- Batch sync to `/api/v1/events` (AC 5)

## Files

| Path | Action | Notes |
|---|---|---|
| `extension/package.json` | new | name `worktrace-extension`, scripts `dev` / `build` / `typecheck` |
| `extension/tsconfig.json` | new | strict mode, `target: ES2022`, types `chrome` + `vite/client` |
| `extension/vite.config.ts` | new | imports `@crxjs/vite-plugin` with `manifest` from `./src/manifest.ts` |
| `extension/src/manifest.ts` | new | typed `defineManifest({...})` — MV3, permissions, content scripts, action |
| `extension/src/background/index.ts` | new | service worker — `chrome.runtime.onInstalled` log |
| `extension/src/content/index.ts` | new | content script stub — `console.debug("[worktrace] content loaded", location.href)` |
| `extension/src/popup/index.html` | new | empty popup shell, references `popup.ts` and `popup.css` |
| `extension/src/popup/popup.ts` | new | empty TS module (just a `console.debug`) |
| `extension/src/popup/popup.css` | new | minimal layout (320×200, padding) |
| `extension/src/icons/icon-16.png` | new | placeholder icon (16/32/48/128) |
| `extension/src/icons/icon-32.png` | new | |
| `extension/src/icons/icon-48.png` | new | |
| `extension/src/icons/icon-128.png` | new | |
| `extension/.env.example` | new | `VITE_API_BASE_URL=http://localhost:3000` |
| `extension/.env` | new (gitignored) | local override; same default for now |
| `extension/.gitignore` | new | `node_modules`, `dist`, `.env` |
| `extension/README.md` | new | dev/build instructions, "Load unpacked → select `extension/dist`" |
| `dashboard/package.json` | modify | `build` script: `"prisma generate && next build"` — Vercel build needs Prisma client generated (see "Build script piggyback" below) |
| `plans/AC4-extension-init.md` | add (this file) | |

Root `README.md` (the one closing AC 5 next sprint) is **not** touched here — that's AC 5's scope.

## Design decisions

### 1. Bundler: Vite + `@crxjs/vite-plugin`

Considered:

- **Plain `tsc` + manual copy** of `manifest.json` / HTML / icons to `dist/`. Smallest dep tree but no HMR, asset pipeline by hand, manifest is plain JSON (no type safety).
- **`tsup` (esbuild wrapper).** Fast, simple, but same asset-copy problem; popup HTML still hand-managed.
- **webpack + `webpack-extension-reloader`.** Mature but heavy config; the project already standardizes on Vite-style tooling via Next.js, so adding webpack is gratuitous.
- **Vite + `@crxjs/vite-plugin`.** Industry default for MV3 + TS in 2025/26. Manifest authored as a typed TS module (`defineManifest({...})`), HMR for popup, automatic rebuild + copy of content/background scripts and icons, source-map support.

**Decision:** Vite + `@crxjs/vite-plugin`. The asset pipeline alone (HTML, icons, manifest) saves enough boilerplate to justify the dep, and HMR will pay for itself starting Week 2 popup work.

Versions to pin (latest stable as of 2026-05): `vite@^7`, `@crxjs/vite-plugin@^2`, `@types/chrome@latest`, `typescript@^5`.

### 2. Directory layout: `src/` + `dist/`

```
extension/
├─ src/
│  ├─ manifest.ts              ← defineManifest(...)
│  ├─ background/index.ts
│  ├─ content/index.ts
│  ├─ popup/
│  │  ├─ index.html
│  │  ├─ popup.ts
│  │  └─ popup.css
│  └─ icons/icon-{16,32,48,128}.png
├─ dist/                        ← gitignored, output of `npm run build`
├─ .env.example
├─ package.json
├─ tsconfig.json
└─ vite.config.ts
```

`@crxjs/vite-plugin` reads `manifest.ts`, treats every script/HTML it references as a Vite entry point, and writes the final `manifest.json` into `dist/`. No copy step.

### 3. Permissions — declared upfront for the whole project

Per the question we resolved: declare everything the future ACs will need now, so we don't have to re-prompt the user to reload the extension on each AC.

```ts
permissions: ["storage", "activeTab", "tabs"],
host_permissions: [
  "http://localhost:3000/*",
  "https://worktrace-ecru.vercel.app/*",
],
```

Rationale per permission:

- **`storage`** — `chrome.storage.local` for JWT (Week 2 AC 1) and session state (Week 2 AC 3).
- **`activeTab`** — gives the extension temporary access to the currently focused tab when the user clicks the action icon, without the broad `<all_urls>` host grant. Used by the popup to read tab info on demand.
- **`tabs`** — needed to read `tab.url` / `tab.title` from the background worker for events that fire outside a user click (e.g. tab change while a session is active). `activeTab` alone won't suffice because it's gated on user gesture.
- **`host_permissions`** for the API: required for `fetch()` from the background worker to the dashboard. `localhost:3000` for dev; `worktrace-ecru.vercel.app` is the production domain assigned by Vercel (the `-ecru` suffix because `worktrace.vercel.app` was taken). Preview deploys (`worktrace-git-*.vercel.app`, `worktrace-<hash>-*.vercel.app`) are intentionally **not** included — extension talks only to production. If we ever need to point the local extension at a preview, override `VITE_API_BASE_URL` in `.env` for that build.

**Not added** (would expand the warning shown at install time):

- `"<all_urls>"` as a host permission — content scripts are declared with `matches: ["<all_urls>"]` in the `content_scripts` block, which is a separate grant from `host_permissions`. We don't need full host access for `fetch` from anywhere.
- `"scripting"` — only needed if we inject scripts dynamically via `chrome.scripting.executeScript`. We use static `content_scripts` registration. Add later only if dynamic injection becomes necessary.
- `"alarms"` — for Week 2 batched sync if we choose `chrome.alarms` over `setTimeout`. Decide then.

### 4. API base URL via Vite env

Per the question we resolved: `VITE_API_BASE_URL` from `.env` is inlined at build time.

- `extension/.env.example` documents the var.
- `extension/.env` (gitignored) holds the local value (`http://localhost:3000`).
- Production build will set the var via shell or `.env.production` later (Week 4).
- Access in TS: `import.meta.env.VITE_API_BASE_URL` (typed via `vite/client` reference in `tsconfig.json`).

Not used in AC 4 itself (no fetch yet) but the wiring lets Week 2 AC 1 reach for it without scaffolding.

### 5. Manifest — single source of truth as TS

```ts
// extension/src/manifest.ts
import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "../package.json" with { type: "json" };

export default defineManifest({
  manifest_version: 3,
  name: "WorkTrace",
  version: pkg.version,
  description: "Capture dev session context for AI-generated reports.",
  icons: {
    "16": "src/icons/icon-16.png",
    "32": "src/icons/icon-32.png",
    "48": "src/icons/icon-48.png",
    "128": "src/icons/icon-128.png",
  },
  action: {
    default_popup: "src/popup/index.html",
    default_title: "WorkTrace",
  },
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["src/content/index.ts"],
      run_at: "document_idle",
    },
  ],
  permissions: ["storage", "activeTab", "tabs"],
  host_permissions: [
    "http://localhost:3000/*",
    "https://worktrace-ecru.vercel.app/*",
  ],
});
```

`type: "module"` on background is what unlocks ES module imports inside the service worker (MV3 requirement when bundling with Vite).

### 6. Empty stubs — what counts as "porozhniy"

The TZ asks for an empty popup and basic content script. To keep "loads without errors" honest, each stub will:

- **background:** register `chrome.runtime.onInstalled` with a `console.log("[worktrace] installed")`. Nothing else.
- **content:** one `console.debug("[worktrace] content script loaded", location.href)`. No DOM access, no message listeners.
- **popup:** an `<h1>WorkTrace</h1>` and a paragraph "Coming soon." Loads `popup.css` and `popup.ts`. `popup.ts` does nothing but log.

This is enough to verify each entry point bundles and is wired in the manifest, without preempting Week 2 logic.

### 7. Icons

Placeholder PNGs at the four required sizes. I'll generate a single solid-colour square (project accent) at each size — manifest validation requires the files to exist at the declared paths or Chrome refuses to load. Real icon design is out of scope here.

### 8. Build script piggyback (`dashboard/package.json`)

While setting up the Vercel project for the production domain, the first deploy revealed that `dashboard/package.json` build script was just `next build`, but the codebase imports from `@/generated/prisma/client` and `@/generated/zod/...` — both gitignored per CLAUDE.md. Vercel had no generated client → `Module not found` at build time.

**Fix:** `"build": "prisma generate && next build"`. Currently overridden in Vercel UI (Build Command override toggle); committing the package.json change here makes the Vercel override redundant (can be turned off after merge, but no harm in leaving it).

Why bundle this here instead of a separate fix PR: the override was needed precisely because we wanted the production URL for `host_permissions` in this AC. The two changes are coupled in motivation.

Alternative considered: `"postinstall": "prisma generate"`. Rejected because it runs on every `npm install` (including tooling installs that don't need a client) and is less explicit about when generation happens.

### 9. Isolation rule from CLAUDE.md

`extension/` does not import from `dashboard/` and vice versa. Verified by:
- Separate `package.json`, `tsconfig.json`, `node_modules` per app.
- No path aliases reaching across.

The two stay communicable only via HTTP (the events API).

## `package.json` shape

```json
{
  "name": "worktrace-extension",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "^2.0.0",
    "@types/chrome": "^0.0.270",
    "typescript": "^5.6.0",
    "vite": "^7.0.0"
  }
}
```

Versions will be re-checked at `npm install` time and pinned to whatever resolves; the caret ranges above are the floor.

## `tsconfig.json` shape

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["chrome", "vite/client"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*", "vite.config.ts"]
}
```

`any` is forbidden per CLAUDE.md — strict mode + `noUncheckedIndexedAccess` enforce it at compile time.

## Verification

- [ ] `cd extension && npm install` — clean install
- [ ] `npm run typecheck` — zero errors
- [ ] `npm run build` — produces `extension/dist/manifest.json`, `dist/src/background/index.js`, `dist/src/content/index.js`, `dist/src/popup/index.html`, all four icons
- [ ] Chrome `chrome://extensions` → Developer mode → Load unpacked → select `extension/dist` → loads with no errors / warnings in the extension card
- [ ] Click extension icon → popup opens, shows "WorkTrace / Coming soon."
- [ ] Open any HTTPS page → DevTools console shows `[worktrace] content script loaded ...`
- [ ] `chrome://extensions` → service worker "Inspect" → console shows `[worktrace] installed` after first load
- [ ] `npm run dev` — Vite dev server runs, HMR-rebuilds the popup on edit (sanity-check the toolchain)

## Out of scope

- **Real icon art** — placeholder solid-colour PNGs.
- **Custom production domain** — if a non-`vercel.app` domain is added later (e.g. `worktrace.app`), update `host_permissions` then.
- **Linting** — the project hasn't standardized an extension-side ESLint config; can be added when the dashboard's flat config is generalized.
- **CI** — extension build will be added to GitHub Actions in Week 4 AC 1.
- **Packaging `.zip`** — Week 4 AC 2.

## Lesson for the skill

After implementation, update `.claude/skills/extension-message.md` to reference the actual `src/background/index.ts` / `src/content/index.ts` paths and the typed `import.meta.env.VITE_API_BASE_URL` access pattern.
