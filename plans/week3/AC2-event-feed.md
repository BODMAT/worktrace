# Plan: Week 3 AC 2 — Event Feed

**Branch:** `feature/dashboard-event-feed`
**Closes:** Week 3 AC 2 ([docs/Task.md L88](../../docs/Task.md#L88))
**Status:** plan, awaiting review

---

## Scope

Сторінка `/dashboard` показує хронологічну стрічку подій поточного юзера з фільтрацією по даті та тегах. Дані тягнуться через TanStack Query (вимога AC). Auth — та сама cookie `wt_session` з Week 3 AC 1.

Додатково — згідно з умовами:
1. **Візуальна узгодженість з extension.** Виносимо токени з `extension/src/popup/popup.css` у `dashboard/app/globals.css` (CSS variables: `--c-cyan`, `--c-purple`, `--c-yellow`, `--c-pink`, `--c-bg`, `--c-surface`, `--c-border`, `--c-text`, `--c-muted`) + `Courier New` monospace. Tailwind v4 `@theme` мапить ці змінні у utility-класи (`bg-bg`, `text-cyan`, `border-border`), щоб користуватись Tailwind, а не сирим CSS. Старі `bg-zinc-*`/`dark:` класи у `/login` та `/dashboard/page.tsx` замінюються на нову палітру.
2. **Фіксована шапка.** Новий `dashboard/app/dashboard/layout.tsx` зі sticky `<header>`: ліворуч лого `⬡ WORKTRACE` (як у popup), праворуч — аватар (`picture` з Google) + email + кнопка logout. Хедер видно тільки на залогінених сторінках, відсутній на `/login`.
3. **2 графіки (Chart.js).** На головній `/dashboard` під фільтрами рендеримо два маленькі чарта над feed'ом:
   - **Events per day** (line chart) — активність по днях у вибраному інтервалі. Допомагає юзеру побачити свої "робочі" та "тихі" дні.
   - **Top tags** (doughnut chart) — топ-7 тегів за кількістю подій у поточному фільтрі. Допомагає зрозуміти, на що йде увага.

Обидва чарта читають той самий кеш TanStack Query (`["events", filters]`), тобто реагують на фільтри без додаткового запиту.

---

## Commits (ordered)

```
1. docs(plans): update week 3 AC 2 event feed plan
2. style(dashboard): port extension color tokens and add sticky app header
3. feat(dashboard): allow cookie auth in requireUser and add GET /api/v1/events
4. feat(dashboard): render event feed on /dashboard with tanstack query
5. feat(dashboard): add events-per-day and top-tags charts above the feed
6. fix(dashboard): address review feedback for week 3 AC 2   ← reserved
```

> Commit 1 — план. Commit 6 — резерв під правки після рев'ю PR. Якщо рев'юер апрувить без зауважень — 6-й комміт не створюється.

---

## Files

| File | Action | Commit |
|---|---|---|
| `plans/week3/AC2-event-feed.md` | **rewrite** | 1 |
| `dashboard/app/globals.css` | modify — додати extension-токени + `@theme inline` mapping для Tailwind v4 | 2 |
| `dashboard/app/layout.tsx` | modify — прибрати Geist (залишити Geist Mono як `--font-mono`), `<body>` фоном `bg-bg text-text` | 2 |
| `dashboard/app/login/page.tsx` | modify — замінити zinc/dark на нову палітру | 2 |
| `dashboard/app/login/google-button.tsx` | modify — кнопка тим самим стилем що `btn btn--primary` у popup | 2 |
| `dashboard/app/dashboard/layout.tsx` | **new** — sticky header (logo + email + avatar + logout); `<main>` нижче | 2 |
| `dashboard/app/dashboard/app-header.tsx` | **new** — Server Component, читає cookie → `verifyJwt` → `findUser`, рендерить header | 2 |
| `dashboard/server/users.ts` | **new** — `findUserById(id): { email, name, picture }` (для аватарки в header) | 2 |
| `dashboard/app/dashboard/logout-button.tsx` | modify — `btn btn--logout` стиль, той самий що в popup | 2 |
| `dashboard/server/jwt.ts` | modify — `requireUser` fallback на cookie `wt_session` (Bearer → cookie → 401) | 3 |
| `dashboard/server/schemas/events.ts` | modify — додати `EventListFilters` (from/to/tags) | 3 |
| `dashboard/server/events.ts` | modify — додати `listEventsForUser(userId, filters)` | 3 |
| `dashboard/app/api/v1/events/route.ts` | modify — додати GET handler | 3 |
| `dashboard/types/event.ts` | **new** — `EventDTO` (DTO для client+server) | 3 |
| `dashboard/app/providers.tsx` | **new** — Client `QueryClientProvider` через `useState(() => new QueryClient(...))` | 4 |
| `dashboard/app/layout.tsx` | modify — обернути `{children}` у `<Providers>` | 4 |
| `dashboard/app/dashboard/page.tsx` | **rewrite** — auth + prefetch `["events", filters]` + `<HydrationBoundary>` | 4 |
| `dashboard/app/dashboard/event-feed.tsx` | **new** — Client `useQuery` + список + empty/loading/error states | 4 |
| `dashboard/app/dashboard/event-filters.tsx` | **new** — Client форма (from, to, tags) → controlled state у parent | 4 |
| `dashboard/app/dashboard/event-card.tsx` | **new** — рендер одного event-row (картка у стилі `popup__sync` / `popup__track`) | 4 |
| `dashboard/app/dashboard/charts.tsx` | **new** — Client wrapper: `useQuery` тих самих `["events", filters]` + рендер двох канвасів | 5 |
| `dashboard/app/dashboard/events-by-day-chart.tsx` | **new** — Client Chart.js `Line` + хелпер `bucketByDay(events, from, to)` | 5 |
| `dashboard/app/dashboard/top-tags-chart.tsx` | **new** — Client Chart.js `Doughnut` + хелпер `topNTags(events, n=7)` | 5 |
| `dashboard/package.json` | modify — `chart.js`, `react-chartjs-2` | 5 |

---

## Design decisions

### 1. Auth у `requireUser` — extend, не дублювати

Web викликає `/api/v1/events` з браузера → є тільки cookie. Extension викликає з service worker → є тільки `Authorization: Bearer`. Один endpoint обслуговує обидва.

Розширюю існуючий `requireUser(req)`:
```
1. Якщо є Authorization: Bearer …  → поточна гілка через jsonwebtoken
2. Інакше — читаємо cookie wt_session. Якщо є → той самий verify
3. Інакше → UnauthorizedError
```

Той самий секрет, той самий формат, той самий публічний API → жодних змін у інших роутах і у extension.

### 2. Дизайн-токени з extension — у Tailwind, не у сирому CSS

В `globals.css` додаю `:root` блок з тими ж 9 змінних з `popup.css`, плюс `@theme inline { --color-cyan: var(--c-cyan); ... }` — це Tailwind v4 синтаксис, що породжує utility-класи `bg-bg`, `text-cyan`, `border-border` тощо. Шрифт — `Courier New` як у extension (через `--font-mono` змінну, що вже існує у layout).

Чому так, а не `<style>` з класами `popup__*` у дашборді: потрібно реактивно стилізувати чарти і нові компоненти, чарти й самі є React-ами — Tailwind utility-класи інтегруються одразу. БЕМ-класи з extension'a залишаються у самому extension (popup є HTML/CSS, дашборд — JSX).

### 3. Sticky хедер — у `/dashboard/layout.tsx`, не у root layout

Хедер потрібен **лише** на залогінених сторінках. `/login` має бути без нього (як і зараз — повноекранна форма). Створюю `dashboard/app/dashboard/layout.tsx` — Next App Router автоматично оборачує всі `/dashboard/*` сторінки в нього. Так `/login` лишається чистим.

`<header className="sticky top-0 z-10 ...">` + `<main className="...">{children}</main>`. Аватарка з `picture` юзера (поле вже є у Prisma-моделі `User`, заповнюється у `authenticateGoogleUser` з `verifyIdToken` payload).

### 4. Аватарка — `<img>` з Google CDN, не `next/image`

`next/image` потребує налаштування `images.remotePatterns` для `lh3.googleusercontent.com` і додає runtime overhead для тривіальної 32px іконки. Звичайний `<img src={user.picture}>` із fallback'ом (ініціал email у кружечку, якщо `picture === null`) — простіше і без додаткової конфігурації.

### 5. Графіки — Chart.js (`react-chartjs-2`), не D3

D3 у стеці на тиждень 3 бонус AC 4 (музична аналітика). Для двох простих чартів над feed'ом — Chart.js достатній: 50 рядків коду на чарт замість 200, треекшейкається до `LineController` + `DoughnutController`. D3 лишимо для бонусу AC 4 де потрібні нестандартні візуалізації (наприклад "heatmap by hour").

Реєстрація скейлів — у `dashboard/app/dashboard/charts.tsx` один раз (`ChartJS.register(...)`). Кожен чарт-компонент — окремий клієнтський островок, бо Chart.js потребує DOM.

### 6. Дані для чартів — той самий queryKey, без додаткових fetch'ів

```
event-feed.tsx      useQuery(["events", filters])  → fetchEvents
events-by-day-chart useQuery(["events", filters])  → fetchEvents   ← cache hit
top-tags-chart      useQuery(["events", filters])  → fetchEvents   ← cache hit
```

TanStack Query дедуплікує по `queryKey`, тому реально летить **один** запит за фільтр. Це й мотивація використати TanStack Query (а не Server Action) — без нього довелось би прокидати props з parent'а, або кешувати руками.

Біз-логіку агрегації (bucketByDay, topNTags) тримаю в самих чарт-компонентах — це не "бізнес-логіка" в сенсі CLAUDE.md (там йдеться про DB-доступ і auth), це візуалізаційна агрегація даних, які вже на клієнті.

### 7. Tag filter: `hasEvery` (AND)

Якщо юзер обрав `["react", "next"]` — показуємо події з **обома**. Для feed'а AND — корисніший фільтр (звужує до перетину інтересів), OR — практично те саме, що "усі події". Prisma: `tags: { hasEvery: input.tags }`. Якщо `tags` порожній — фільтр не застосовуємо.

### 8. Дати + cap 200

```
where:    { session: { userId }, timestamp: { gte: from, lte: to }, tags: tags.length ? { hasEvery: tags } : undefined }
orderBy:  { timestamp: "desc" }
take:     200
```

Pagination не входить у AC. Без cap великий діапазон може втягнути тисячі рядків + важко рендерити чарти. 200 — комфортний верхній bound. Це коментується одним рядком у `listEventsForUser` як єдиний legitimate коментар у файлі.

### 9. TanStack Query: SSR prefetch + client hydrate

Server Component `/dashboard/page.tsx`:
1. Verify cookie → userId (як зараз)
2. `const qc = new QueryClient()`
3. `await qc.prefetchQuery({ queryKey: ["events", filters], queryFn: () => listEventsForUser(userId, defaultFilters) })` — **прямий виклик server-модулю, без HTTP**
4. `<HydrationBoundary state={dehydrate(qc)}>` обгортає feed + charts

Це канонічний патерн Next App Router + TanStack: швидкий first paint без spinner + клієнтська реактивність на фільтри.

### 10. QueryClient — `defaultOptions` під SSR

```
queries: { staleTime: 30_000, refetchOnWindowFocus: false }
```

`useState(() => new QueryClient(...))` у `providers.tsx` — щоб у StrictMode не пересоздавався.

### 11. DTO для event'у — окремий тип, не реекспорт Prisma

```ts
// dashboard/types/event.ts
export type EventDTO = {
  id:        string;
  sessionId: string;
  url:       string;
  title:     string;
  content:   string | null;
  tags:      string[];
  timestamp: string;   // ISO; Date серіалізується для client bundle
};
```

### 12. URL-state vs local — local

MVP — `useState` фільтрів. Не серіалізуємо у URL. Share-link / back-forward для фільтрів — out of scope.

### 13. Tags input — comma-separated, як у popup

`<input placeholder="react, typescript" />` → `.split(",").map(t => t.trim()).filter(Boolean)`. Узгоджено з `popup__field-input` (TAGS) у extension.

### 14. Empty / loading / error states

- **Loading** (тільки після зміни фільтрів — перший рендер з prefetch) — три skeleton-картки кольору `--c-surface`
- **Empty** — повідомлення + підказка очистити фільтри
- **Error** — повідомлення `--c-pink` + кнопка `refetch()`

### 15. Чарти — стан коли подій 0

`events-by-day` показує всі дні діапазону з `0` (line на нулі). `top-tags` — рендерить пусту doughnut + плейсхолдер "No tags in range". Це краще, ніж приховувати чарти при empty filter — UI лишається стабільним.

---

## Verification checklist

### Backend
- [ ] `cd dashboard && npx tsc --noEmit` — без помилок
- [ ] `npm run build` — без помилок
- [ ] `GET /api/v1/events` без cookie і без Bearer → 401
- [ ] `GET /api/v1/events` з невалідною cookie → 401
- [ ] `GET /api/v1/events` з валідною cookie → 200, події **тільки** поточного юзера
- [ ] `GET /api/v1/events` з extension Bearer token → 200 (регрес: один endpoint для обох)
- [ ] `GET /api/v1/events?from=...&to=...` — повертає лише події у діапазоні
- [ ] `GET /api/v1/events?tags=react,typescript` — повертає події з ОБОМА тегами
- [ ] `POST /api/v1/events` все ще працює (без регресу від `requireUser` змін)

### UI / стилі
- [ ] `/dashboard` без cookie → 307 → `/login` (regression від AC 1)
- [ ] `/dashboard` з cookie → рендер feed без спіннера (prefetch ок)
- [ ] Sticky хедер видно при скролі feed'а
- [ ] Хедер показує email + аватарку Google (або fallback-ініціал)
- [ ] `/login` — без хедера, кольори у новій палітрі
- [ ] Logout працює, після logout редірект на `/login` (regression від AC 1)

### Чарти
- [ ] Events-per-day line чарт відображає дні діапазону
- [ ] При зміні `from`/`to` чарт перемальовується без додаткового мережевого запиту (DevTools → Network)
- [ ] Top-tags doughnut показує топ-7 тегів з легендою
- [ ] При `tags=react,next` фільтрі чарт показує лише ці теги (тривіальний випадок)
- [ ] При empty result — чарти не падають, показують пусті стани

### Feed
- [ ] Зміна `from` → запит летить, оновлений список
- [ ] Введення `react, next` у tags → запит з `tags=react%2Cnext`, лишаються події з обома
- [ ] Empty state видно коли фільтр нічого не дав
- [ ] Error state видно при `fetch` помилці (вимкнути сервер → змінити фільтр)

---

## Out of scope

- Pagination / infinite scroll — cap 200
- Tag autocomplete / chips UI — comma input достатній
- Share / URL-state для фільтрів — local state
- Realtime push подій з extension (WebSocket / SSE) — Week 4 polish, якщо взагалі
- Bonus AC 5 (error toasts) — наступний AC у тижні
- Сесійні групи / групування подій по сесії — feed чисто хронологічний
- Анімації появи карток / переходів між сторінками — Week 4 бонус AC 4
- Музична аналітика і D3 — Week 3 бонус AC 4
