# AC4 — Music Analytics Page (`/dashboard/music`)

**Branch:** `feature/music-analytics`
**Spec:** Week 3 AC 4 (бонус) — `/dashboard/music` з кореляцією музики і активності: топ виконавців, активність по годинах. Графіки через **Chart.js** (react-chartjs-2 — вже встановлено, узгоджено з Tech Lead).
**Залежить від:** AC 6 Week 2 (захоплення треків — виконано), AC 3 Week 3 (SQL продуктивності в report-context — переносимо).

---

## Scope

Сторінка `/dashboard/music` з:
1. Range picker (чіпи: TODAY / LAST 7D / LAST 30D / ALL TIME)
2. Рядок зведеної статистики (загальний час · виконавців · треків)
3. **Chart.js — Top Artists** — горизонтальний бар, виконавці × хвилини
4. **Chart.js — Productivity Correlation** — горизонтальний бар, треки × events/min
5. **Chart.js — Hourly Pattern** — згруповані вертикальні бари, год. 0–23 × слухання + події
6. Таблиця Top Tracks (текстовий список, без графіку)
7. Пункт MUSIC у навігації (desktop + mobile)

Поза scope: drill-down по треку, streaming, custom date range input.

---

## Data model (нові міграції не потрібні)

Всі дані — з існуючих таблиць `Track` + `Event` + `Session`.

**Поля `Track`, що використовуються:**
- `artist`, `title` — ідентифікація
- `listenedMs` — накопичений час прослуховування (PATCH від розширення)
- `capturedAt` — bucket для годинного графіку
- `endedAt` — для JOIN-вікна в productivity; fallback якщо null → `capturedAt + make_interval(secs => listenedMs/1000)` (щоб не захоплювати події до NOW())
- `sessionId → Session.userId` — фільтр по власнику

---

## Архітектура

```
dashboard/
  types/
    music-stats.ts              ← форма відповіді (MusicStats)
  server/
    music.ts                    ← всі DB query-функції (без route логіки)
    range.ts                    ← extracted resolveRange + RangePreset (рефактор)
  app/
    api/v1/music/stats/
      route.ts                  ← GET handler, Zod query params
    dashboard/
      music/
        page.tsx                ← Server Component, auth guard
        music-client.tsx        ← "use client" — TanStack Query + layout
        top-artists-chart.tsx   ← Chart.js горизонтальний бар
        productivity-chart.tsx  ← Chart.js горизонтальний бар
        hourly-chart.tsx        ← Chart.js згруповані вертикальні бари
      header-nav.tsx            ← додати MUSIC
      mobile-nav.tsx            ← додати MUSIC
```

Той самий патерн що в AC3: server module → thin route → client з TanStack Query.

---

## API endpoint

```
GET /api/v1/music/stats?range=last_7d
GET /api/v1/music/stats?range=custom&from=ISO&to=ISO
```

Query params — Zod (той самий `RangePreset` enum що в reports). Auth: cookie-first + Bearer fallback.

**Тип відповіді (`types/music-stats.ts`):**
```typescript
type TopArtist       = { artist: string; listenedMs: number; trackCount: number };
type TopTrack        = { artist: string; title: string; listenedMs: number };
type ProductivityRow = { artist: string; title: string; minutes: number; events: number; perMin: number };
type HourBucket      = { hour: number; listenedMs: number; eventCount: number };

type MusicStats = {
  topArtists:      TopArtist[];       // ≤15, sorted by listenedMs desc
  topTracks:       TopTrack[];        // ≤20, sorted by listenedMs desc
  productivity:    ProductivityRow[]; // ≤10, треки з ≥1 хв слухання
  hourlyPattern:   HourBucket[];      // завжди 24 рядки (0–23), нулі заповнені
  totalListenedMs: number;
  totalArtists:    number;
  totalTracks:     number;
  range:           { from: string; to: string; label: string };
};
```

---

## Server module (`server/music.ts`)

П'ять функцій, всі `async`, всі фільтрують по `userId`:

| Функція | SQL-підхід |
|---|---|
| `getTopArtists(userId, from, to)` | `$queryRaw` — `GROUP BY artist`, `SUM(listenedMs)`, **`COUNT(DISTINCT title)`** (Prisma groupBy не підтримує DISTINCT count) |
| `getTopTracks(userId, from, to)` | `groupBy [artist, title]`, `SUM(listenedMs) DESC LIMIT 20` — агрегація по унікальних піснях |
| `getMusicProductivity(userId, from, to)` | `$queryRaw` LEFT JOIN track windows × events; `GROUP BY artist, title` + `SUM(listenedMs)`; fallback для `endedAt = null` → `capturedAt + make_interval(secs => listenedMs/1000)` |
| `getHourlyPattern(userId, from, to)` | Два окремих Prisma-запити (треки per hour + events per hour), merge у JS для заповнення 0–23 |
| `getMusicTotals(userId, from, to)` | `SUM(listenedMs)` + distinct artists (findMany distinct) + **distinct (artist, title) pairs** (groupBy) — всі три окремо |

`getHourlyPattern` — єдина нетривіальна функція: два `$queryRaw` з `EXTRACT(HOUR FROM ...)`, результати мержаться в JS-масиві 24 елементів.

---

## Рефактор: виокремлення `resolveRange`

**Проблема:** і `server/reports.ts` і новий music route потребують `resolveRange()`. Зараз вона приватна в reports.ts.

**Рішення (Commit 2):** Перенести `resolveRange` + `RangePreset` + допоміжні функції дат (`startOfDay`, `endOfDay`, `shiftDays`) у `server/range.ts`. Імпортувати у `reports.ts` (поведінка не змінюється) і в новий route. Це чистий рефактор без зміни API-контракту.

---

## Chart.js компоненти

Всі три — `"use client"` компоненти з react-chartjs-2. Chart.js вже зареєстрований у `charts.tsx` (фід), тому нові компоненти реєструють тільки потрібні модулі.

Палітра кольорів з CSS vars проєкту: `#00e5b0` (cyan), `#a855f7` (purple), `#eab308` (yellow).

### Top Artists chart — `Bar` (горизонтальний, `indexAxis: 'y'`)
- Y: назви виконавців (≤15)
- X: хвилини прослуховування
- Колір: cyan

### Productivity chart — `Bar` (горизонтальний, `indexAxis: 'y'`)
- Y: "Назва треку / Виконавець" (≤10)
- X: events/min
- Колір: purple
- Empty state якщо `perMin === 0` для всіх

### Hourly Pattern chart — `Bar` (вертикальний, згрупований)
- X: години 0–23
- Y: два датасети — listening min (cyan) + event count (purple)
- `datasets[0]` — listening, `datasets[1]` — events

---

## Лейаут сторінки

```
h1: MUSIC ANALYTICS

[range chips: TODAY | LAST 7D | LAST 30D | ALL TIME]

[summary: Xh Ym listened · Y artists · Z tracks]

grid 2-col (lg):
  [Top Artists — horiz bar]   [Productivity — horiz bar]

full-width:
  [Hourly Pattern — grouped bar]

[Top Tracks — ranked text list: rank · title · artist · Xm Ys]
```

Loading: skeleton pulse divs (як на фіді).
Empty state (немає треків у діапазоні): "NO MUSIC DATA FOR THIS RANGE".

---

## Nav update

Додати `{ href: "/dashboard/music", label: "MUSIC" }` в `ITEMS` у `header-nav.tsx` і `mobile-nav.tsx`.

---

## Commits

| # | Повідомлення | Що змінюється |
|---|---|---|
| 1 | `docs(plans): add week 3 AC4 music analytics plan` | цей файл |
| 2 | `refactor(server): extract resolveRange to server/range.ts` | новий `server/range.ts`, оновлений імпорт у `server/reports.ts` |
| 3 | `feat(music): server module, types, and GET /api/v1/music/stats route` | `types/music-stats.ts`, `server/music.ts`, `app/api/v1/music/stats/route.ts`, `getMusicProductivity` перенесено |
| 4 | `feat(music): /dashboard/music page with Chart.js charts` | `music/page.tsx`, `music-client.tsx`, три chart-компоненти |
| 5 | `feat(nav): add MUSIC to header nav` | `header-nav.tsx`, `mobile-nav.tsx` |
| 6 | `fix(music): deduplicate top tracks (groupBy)` | `getTopTracks` → `groupBy [artist, title]` + `SUM(listenedMs)` |
| 7 | `fix(music): correct logic in music queries` | `getTopArtists` → `COUNT(DISTINCT title)` via raw SQL; `getMusicProductivity` → `GROUP BY artist, title` + `SUM` + правильний `endedAt` fallback; `getMusicTotals.totalTracks` → унікальні (artist, title) пари |

---

## Ключові рішення

- **Chart.js замість D3** — погоджено з Tech Lead. Chart.js вже встановлено і використовується на фіді; єдиний інструмент для графіків у проєкті — менше cognitive overhead.
- **Виокремлення `resolveRange`** — дрібний рефактор, що усуває дублювання і потенційний circular import.
- **Hourly chart = два Prisma-запити + JS merge** — уникаємо `generate_series` (PostgreSQL-розширення, що не гарантується) і зберігаємо читабельність коду.
- **`COUNT(DISTINCT title)` через `$queryRaw`** — Prisma `groupBy` підтримує лише `_count: { field }` (all rows), DISTINCT count потребує raw SQL.
- **`getMusicProductivity` GROUP BY по `(artist, title)`, не по `(artist, title, listenedMs)`** — трек `@@unique([sessionId, artist, title])` означає по одному рядку на трек на сесію; без агрегації той самий трек з'являвся б окремим рядком за кожну сесію.
- **`endedAt` null → `capturedAt + make_interval`** — fallback на `NOW()` розтягував JOIN-вікно до поточного моменту і захоплював усі наступні події як "під час цього треку".
- **`getMusicProductivity` → `server/music.ts`** — це бізнес-логіка про музику, не про рендеринг звіту. `report-context.ts` імпортує її звідти.
- **TanStack Query на клієнті** — той самий патерн що й фід: `page.tsx` — Server Component з auth guard, `MusicClient` — "use client" з фільтрами і даними.
- **Без нових Prisma-моделей/міграцій** — вся аналітика виводиться з існуючих даних.

---

## Verification checklist

- [ ] `npx tsc --noEmit` (dashboard) — clean
- [ ] `npm run lint` (dashboard) — clean
- [ ] Manual: `/dashboard/music` завантажується з коректними даними для LAST 7D
- [ ] Manual: перемикання чіпів range перезапитує і перерендерить всі три графіки
- [ ] Manual: empty state при відсутності треків у діапазоні
- [ ] Manual: пункт MUSIC підсвічується активним на music-сторінці
- [ ] Manual: MUSIC видно у мобільному burger dropdown
