# AC 4 — Framer Motion Animations

## Scope

Add Framer Motion animations across the WorkTrace dashboard.
Five animation groups, ordered by visual impact.

---

## 0. Installation

```bash
cd dashboard && npm install framer-motion
```

---

## 1. Scroll-Reactive Background (Layout Layer)

**File:** `dashboard/app/dashboard/layout.tsx`

A fixed canvas sitting behind all dashboard content. Three gradient orbs at different z-depths move at different parallax speeds as the user scrolls. The orbs never move enough to be distracting — max 60–80px travel — but give the page a sense of depth.

**Implementation:**

Create `dashboard/components/parallax-bg.tsx` — a `"use client"` component:

- `useScroll({ container: ref })` tracks scroll offset of the main scrollable div in the layout.
- Three `motion.div` orbs with `useTransform(scrollY, [0, 1000], [0, -N])` where N differs per orb (60 / 40 / 25 px), creating depth.
- Orbs: blurred radial gradients (cyan `#00ffff22`, purple `#8b5cf622`, pink `#ec489922`) — same palette as the app.
- `will-change: transform` + `pointer-events-none` — zero layout impact.

Layout passes the scroll container ref into the component via context or direct prop.

**Result:** Subtle 3D depth on every dashboard page, scroll down/up triggers smooth orb drift.

---

## 2. Page Transitions (Between FEED / REPORTS / MUSIC)

**File:** `dashboard/app/dashboard/layout.tsx` wrapping `{children}`

Navigation order: FEED (0) → REPORTS (1) → MUSIC (2).

**Implementation:**

- Wrap `{children}` in `<AnimatePresence mode="wait">`.
- A `<PageTransition>` client component wraps each page — it reads the current pathname to determine direction (left/right).
- Forward navigation (FEED→REPORTS, REPORTS→MUSIC): page slides in from right (`x: 40`), current page exits to left (`x: -40`).
- Backward navigation (MUSIC→REPORTS, REPORTS→FEED): reverse direction.
- Both combined with `opacity: 0 → 1` and a quick scale `0.97 → 1`.
- Duration: `0.3s ease-out` — fast enough not to feel slow, slow enough to register.

```
variants = {
  enter(dir):  { x: dir > 0 ? 40 : -40, opacity: 0, scale: 0.97 }
  center:      { x: 0, opacity: 1, scale: 1 }
  exit(dir):   { x: dir > 0 ? -40 : 40, opacity: 0, scale: 0.97 }
}
```

**Create:** `dashboard/components/page-transition.tsx`

---

## 3. AI Report Loading Indicator

**File:** `dashboard/app/dashboard/reports/report-form.tsx` → `LoadingPanel`

Current: a single `animate-pulse` cyan bar + static text.

Replace with a **three-layer animation**:

**Layer A — Scanning bar:** A `motion.div` with a bright cyan gradient sweeps left→right infinitely (`x: "-100%" → "100%"`, `repeat: Infinity`, `duration: 1.4s`, `ease: "linear"`). Container is `overflow-hidden` with a subtle cyan track.

**Layer B — Pulsing orbs:** Three small dots (`●●●`) each animate `opacity` and `y` with staggered delays (`0 / 0.15 / 0.3s`) — a breathing wave effect.

**Layer C — Typewriter text:** "ASKING THE MODEL" text with each character using `staggerChildren` on mount. Characters animate `opacity: 0 → 1` and `y: 4 → 0`.

Total visual: strong, clearly communicates "AI is working", fits the terminal/hacker aesthetic.

---

## 4. Modal Animations (ApiKeyModal)

**File:** `dashboard/app/dashboard/reports/api-key-modal.tsx`

Current: instant appear/disappear via `createPortal`.

**Implementation:**

- Wrap the portal root in `<AnimatePresence>` (conditional render → animate out before unmount).
- **Backdrop:** `motion.div` fades `opacity: 0 → 0.7`, `duration: 0.2s`.
- **Modal panel:** `motion.div` with spring physics:
  ```
  initial:  { opacity: 0, scale: 0.92, y: 16 }
  animate:  { opacity: 1, scale: 1,    y: 0  }  — spring(stiffness:400, damping:28)
  exit:     { opacity: 0, scale: 0.95, y: 8  }  — duration: 0.15s
  ```
- Enter feels snappy (spring), exit is quick fade-shrink.
- Applies to all future modals (the pattern becomes reusable).

---

## 5. Event Feed Cards (Staggered Entrance)

**Files:**
- `dashboard/app/dashboard/event-feed.tsx` — list container
- `dashboard/app/dashboard/event-card.tsx` — individual card

**Implementation:**

Container (`motion.ul` / `motion.div`) uses `variants` with `staggerChildren: 0.05s`.

Each card on mount:
```
initial:  { opacity: 0, y: 20 }
animate:  { opacity: 1, y: 0  }  — duration: 0.3s, ease: [0.25, 0.1, 0.25, 1]
```

- Only the first "page" of cards staggers (use `custom` prop to cap stagger at index 10 — beyond that, instant appear to avoid long delays on deep scroll).
- Hover: `whileHover={{ scale: 1.015, transition: { duration: 0.15 } }}` — subtle lift.
- The existing `border-purple` hover CSS stays; scale adds depth.

---

## 6. Additional Targeted Animations

| Location | Animation |
|---|---|
| `toast.tsx` | `AnimatePresence` + slide-in from right (`x: 120 → 0`), fade-out on dismiss |
| `mobile-nav.tsx` | Replace CSS `max-h` trick with `motion.div` height `0 → auto` via `layout` prop, spring easing |
| `header-nav.tsx` | Shared `layoutId="nav-indicator"` pill that slides between active links |
| `top-sessions.tsx` | Progress bars animate width `0 → actual%` on mount via `motion.div` |
| `music-client.tsx` | Summary stat numbers count up from 0 using custom `useCountUp` + `useInView` |
| `charts.tsx` | Fade-in container when data replaces skeleton (`AnimatePresence` swap) |
| `login/page.tsx` | Logo entrance: `scale: 0.8, opacity: 0 → 1`, staggered with button |

---

## File Inventory

### New files
```
dashboard/components/parallax-bg.tsx      — scroll-reactive background orbs
dashboard/components/page-transition.tsx  — directional page slide wrapper
```

### Modified files
```
dashboard/app/dashboard/layout.tsx        — integrate ParallaxBg + PageTransition + AnimatePresence
dashboard/app/dashboard/event-feed.tsx    — stagger container
dashboard/app/dashboard/event-card.tsx    — card entrance + whileHover
dashboard/app/dashboard/reports/report-form.tsx    — LoadingPanel overhaul
dashboard/app/dashboard/reports/api-key-modal.tsx  — spring modal + AnimatePresence
dashboard/app/dashboard/header-nav.tsx    — layoutId nav indicator
dashboard/app/dashboard/mobile-nav.tsx    — motion height animation
dashboard/app/dashboard/top-sessions.tsx  — progress bar animate
dashboard/app/dashboard/music/music-client.tsx     — count-up stats
dashboard/components/toast.tsx            — slide-in/out with AnimatePresence
dashboard/app/login/page.tsx              — entrance stagger
```

---

## Technical Notes

- **SSR safety:** All Framer Motion components that use `useScroll`/`useMotionValue` must be `"use client"`. Already the case for every file in scope.
- **`AnimatePresence mode="wait"`** on page transitions prevents overlap flash.
- **`layout` prop** on progress bars / nav indicator uses Framer's FLIP algorithm — no manual width math.
- **Reduced-motion:** Wrap all animation variants behind `useReducedMotion()` fallback — respect OS accessibility setting.
- **Bundle size:** `framer-motion` is ~45 kB gzipped. Acceptable for a dashboard app. Use tree-shaking (named imports only).

---

## Commit Plan

| # | Commit message | Що входить |
|---|---|---|
| 1 | `docs: add framer-motion animations plan` | цей файл `/plans/week4/framer-motion-animations.md` |
| 2 | `chore: install framer-motion` | `npm install framer-motion`, оновлений `package.json` / `package-lock.json` |
| 3 | `feat(anim): parallax background orbs on scroll` | `parallax-bg.tsx` + інтеграція в `dashboard/layout.tsx` |
| 4 | `feat(anim): directional page transitions` | `page-transition.tsx` + `AnimatePresence` у `dashboard/layout.tsx` |
| 5 | `feat(anim): AI report loading panel` | `reports/report-form.tsx` — `LoadingPanel` overhaul |
| 6 | `feat(anim): modal spring entrance + AnimatePresence` | `reports/api-key-modal.tsx` |
| 7 | `feat(anim): event feed stagger + card hover` | `event-feed.tsx`, `event-card.tsx` |
| 8 | `feat(anim): nav indicator, mobile-nav, progress bars` | `header-nav.tsx`, `mobile-nav.tsx`, `top-sessions.tsx` |
| 9 | `feat(anim): toasts slide, music count-up, login entrance` | `toast.tsx`, `music-client.tsx`, `login/page.tsx` |
| 10 | *(резервний)* `fix(anim): post-review fixes` | Залишається порожнім — для виправлень після твого огляду |

---

## Acceptance Criteria (AC 4)

- [ ] Framer Motion installed, no TS errors, existing tests green.
- [ ] Background orbs visible on all three dashboard pages; move on scroll.
- [ ] Page transition fires on FEED ↔ REPORTS ↔ MUSIC nav clicks (directional).
- [ ] AI report loading panel shows scanning bar + dot wave + typewriter text.
- [ ] ApiKeyModal scales in with spring; backdrop fades; both animate out on close.
- [ ] Event feed cards stagger in on first load; hover lifts cards.
- [ ] Toast slides in from right; slides out on dismiss.
- [ ] Nav active indicator slides between links (no jump).
- [ ] Top sessions progress bars animate from 0 on mount.
- [ ] `prefers-reduced-motion` respected — animations disabled when OS requests it.
