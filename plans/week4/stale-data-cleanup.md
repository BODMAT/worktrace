# Week 4: Stale data cleanup

**Пріоритет:** high
**Залежить від:** Week 2 AC 3 (session manager), Week 2 AC 6 (музика), Week 3 AC 2 (top-sessions panel)
**Статус:** не розпочато

---

## Проблема 1 — Stale sessions (виявлено під час Week 3 AC 2)

`Session.endedAt` ставиться **тільки** коли extension явно надсилає `POST /api/v1/sessions/[id]` зі stop-маркером — або з popup'у через кнопку "■ STOP", або з auto-stop-логіки в `background/session.ts`. Якщо service worker заснув, браузер закрився, або юзер просто перестав ним користуватись — запис лишається `endedAt = NULL` назавжди.

Спостережене на dev-БД (станом 2026-05-27):
- юзер мав 2 одночасні `endedAt = NULL` сесії — одну стартовану сьогодні, другу 2 дні тому
- стара сесія мала 66 events за 1h 10m реальної активності і потрапила у `TOP 3 SESSIONS` як "активна"
- візуально у дашборді це виглядає як неточність, хоча математика правильна (`SUM(event-durations)` — точне)

**Це не баг алгоритму:** `byDay` / `topTags` / `topHostSeconds` / `totalSeconds` рахуються коректно. Це баг **lifecycle'у сесії**: live-state не синхронізується з БД при втраті екстеншна.

---

## Проблема 2 — Stale music timer (виявлено 2026-06-02)

`Track`-запис не отримує `endedAt` (або аналогічний stop-маркер) коли вкладка YouTube Music закривається, браузер завершує роботу, або service worker засинає під час відтворення.

Спостережене поведінка:
- відкрив extension наступного дня після того як YTM була закрита
- таймер на одній пісні показував **680+ хвилин** — трек "грав" всю ніч і наступний ранок
- MutationObserver в content script перестає отримувати події як тільки вкладка закрита — але останній `Track` вже записаний у `chrome.storage.local` як "поточний" і ніколи не отримав сигнал зупинки
- дашборд `/dashboard/music` рахує тривалість треку від моменту старту до `NOW()` (або до кінця сесії), тому цифри стають абсурдними

**Це симетрична проблема до Проблеми 1:** те саме відсутнє lifecycle-закриття, тільки для `Track` замість `Session`.

---

## Підходи

### Проблема 1 — Сесії

#### 1. SQL-filter "recently active" в `getTopSessionsForUser`

```sql
AND (s."endedAt" IS NOT NULL OR <last event timestamp> >= NOW() - INTERVAL '24 hours')
```

- **+** zero-cost, не чіпає БД
- **−** маскує проблему; "загублені" сесії все одно сидять у БД і впливають на майбутні агрегації

#### 2. Auto-close при кожному `GET /api/v1/sessions/top`

```sql
UPDATE "Session" SET "endedAt" = (SELECT MAX(timestamp) FROM "Event" WHERE "sessionId" = id)
WHERE "endedAt" IS NULL AND <last event> < NOW() - INTERVAL '1 hour'
```

- **+** очищує БД "by use"
- **−** write на кожному GET = поганий патерн

#### 3. Cron job (Recommended)

Окремий джоб, який раз на 15 хв пробігається через відкриті сесії і закриває ті, де `MAX(event.timestamp) < NOW() - INTERVAL '30 minutes'`.

**3a. Vercel Cron** — `vercel.json` з `crons: [{ path: "/api/cron/close-stale-sessions", schedule: "*/15 * * * *" }]`. Route Handler захищений `Authorization: Bearer ${CRON_SECRET}`. Vercel сам викликає його на schedule (free tier — 2 invocations/day, hobby — необмежено).

**3b. PostgreSQL `pg_cron`** — суто SQL-job на стороні Neon/Postgres. Не потребує route handler, але vendor-specific.

**3c. Зовнішній GitHub Actions cron** — `.github/workflows/close-stale.yml` з `schedule: cron: "*/15 * * * *"` + step що шле HTTP до Vercel-роуту.

**Рекомендовано:** 3c (GitHub Actions cron) — безкоштовно на будь-якому tier, сумісно з Vercel + Neon + Render. GitHub Actions шле HTTP GET на `/api/cron/close-stale-sessions` з `Authorization: Bearer CRON_SECRET`. Vercel route handler запускається, чистить Neon. Cold start ~200-500мс — не критично для cleanup задачі.

---

### Проблема 2 — Музика

#### 2a. Cap тривалості треку при читанні (найшвидше)

При отриманні треків з БД: якщо трек не має `endedAt` і `startedAt < NOW() - INTERVAL '2 hours'` — cap тривалість до `MIN(duration, 2*60*60*1000)` або взагалі виключити з агрегації.

- **+** одна зміна у query, нічого не чіпає extension
- **−** маскує; дані в БД лишаються некоректними

#### 2b. Extension: зупиняти трек при закритті вкладки (правильно)

Content script реєструє `window.beforeunload` → надсилає повідомлення до background → background патчить поточний трек-запис і виставляє `endedAt = Date.now()`.

Проблема: `beforeunload` часто не спрацьовує при crash/kill процесу.

#### 2c. Cron — закривати stale tracks (симетрично до сесій)

Той самий cron-роут `close-stale-sessions` додатково закриває `Track`-и де:
- `endedAt IS NULL`
- `startedAt < NOW() - INTERVAL '30 minutes'`
- `sessionId` відповідає вже закритій сесії

`endedAt` для треку = `MIN(session.endedAt, startedAt + "typical_track_duration")` або просто `session.endedAt`.

**Рекомендовано:** 2b + 2c разом — extension намагається закрити чисто, cron підбирає решту.

---

## Декомпозиція

```
1. docs(plans): move and expand stale-data-cleanup plan
2. feat(server): closeStaleSessions(thresholdMinutes) in server/sessions.ts
3. feat(server): closeStaleTracksForSession() in server/tracks.ts
4. feat(dashboard): GET /api/cron/close-stale — закриває сесії + треки, захищений CRON_SECRET
5. chore(ci): .github/workflows/close-stale.yml — cron schedule "*/15 * * * *", шле HTTP до Vercel
6. fix(extension): beforeunload → stop current track message to background
7. test: insert stale session + track → run cron → assert both closed
```

---

## Рішення

- **Поріг "stale" для треків:** 30 хв — симетрично до сесій. Трек і сесія живуть разом, крон закриває обидва одним запитом.
- **Порожні сесії (events = 0):** видаляти. Сесія без подій не несе цінності і забруднює агрегації.
- **Badge "auto-closed":** ні. Юзеру байдуже як закрилась; при потребі дебагу є `updatedAt` в БД.
- **Track schema:** є `endedAt DateTime?` і `listenedMs Int` (підтверджено `prisma/schema.prisma`). `listenedMs` накопичений коректно — чіпати не треба. Cron виставляє `endedAt = session.endedAt` для stale треків без `endedAt`.
