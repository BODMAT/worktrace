# Backlog: Stale-session auto-cleanup

**Пріоритет:** medium, після MVP demo
**Залежить від:** Week 2 AC 3 (session manager), Week 3 AC 2 (top-sessions panel)
**Статус:** не розпочато

---

## Проблема (виявлено під час Week 3 AC 2)

`Session.endedAt` ставиться **тільки** коли extension явно надсилає `POST /api/v1/sessions/[id]` зі stop-маркером — або з popup'у через кнопку "■ STOP", або з auto-stop-логіки в `background/session.ts`. Якщо service worker заснув, браузер закрився, або юзер просто перестав ним користуватись — запис лишається `endedAt = NULL` назавжди.

Спостережене на dev-БД (станом 2026-05-27):
- юзер мав 2 одночасні `endedAt = NULL` сесії — одну стартовану сьогодні, другу 2 дні тому
- стара сесія мала 66 events за 1h 10m реальної активності і потрапила у `TOP 3 SESSIONS` як "активна"
- візуально у дашборді це виглядає як неточність, хоча математика правильна (`SUM(event-durations)` — точне)

**Це не баг алгоритму:** `byDay` / `topTags` / `topHostSeconds` / `totalSeconds` рахуються коректно. Це баг **lifecycle'у сесії**: live-state не синхронізується з БД при втраті екстеншна.

---

## Підходи (від найдешевшого до найповнішого)

### 1. SQL-filter "recently active" в `getTopSessionsForUser`

```
AND (s."endedAt" IS NOT NULL OR <last event timestamp> >= NOW() - INTERVAL '24 hours')
```

- **+** zero-cost, не чіпає БД
- **−** маскує проблему; "загублені" сесії все одно сидять у БД і впливають на майбутні агрегації

### 2. Auto-close при кожному `GET /api/v1/sessions/top`

`UPDATE "Session" SET "endedAt" = (SELECT MAX(timestamp) FROM "Event" WHERE "sessionId" = id) WHERE "endedAt" IS NULL AND <last event> < NOW() - INTERVAL '1 hour'`

- **+** очищує БД "by use"
- **−** write на кожному GET читачі = поганий патерн (особливо для cold-cache scenarios), porno-write при високому traffic

### 3. Cron job (Recommended)

Окремий джоб, який раз на 15 хв пробігається через відкриті сесії і закриває ті, де `MAX(event.timestamp) < NOW() - INTERVAL '30 minutes'`. Реалізації:

**3a. Vercel Cron** — `vercel.json` з `crons: [{ path: "/api/cron/close-stale-sessions", schedule: "*/15 * * * *" }]`. Route Handler захищений `Authorization: Bearer ${CRON_SECRET}`. Vercel сам викликає його на schedule (free tier — 2 invocations/day, hobby — необмежено).

**3b. PostgreSQL `pg_cron`** — суто SQL-job на стороні Neon/Postgres. Не потребує route handler, але vendor-specific (на локальному Postgres треба установлювати extension).

**3c. Зовнішній GitHub Actions cron** — `.github/workflows/close-stale.yml` з `schedule: cron: "*/15 * * * *"` + step що шле HTTP до Vercel-роуту. Працює для будь-якого хосту, але GH-Actions schedule не гарантує точність (може спізнитись на 10+ хв при високому навантаженні).

**Рекомендовано:** 3a (Vercel Cron) — найменше movable parts, інфра вже на Vercel.

### 4. Client-side keepalive + server-side TTL

Extension шле `PUT /api/v1/sessions/[id]/heartbeat` кожні 5 хв доки активна. Серверний крон закриває сесії без heartbeat'а за останні 15 хв. Близько до 3, але потребує і клієнтських змін.

---

## Декомпозиція (для майбутнього плану)

```
1. docs(plans): stale-session cleanup plan
2. feat(server): add closeStaleSessions(thresholdMinutes) in server/sessions.ts
3. feat(dashboard): add /api/cron/close-stale-sessions route + CRON_SECRET env
4. chore: register vercel.json cron schedule */15 * * * *
5. test: write down end-to-end check (insert stale session → run cron → assert closed)
```

---

## Open questions

- Який поріг "stale"? 30 хв безактивності — здається безпечним. Менше — ризик закрити активного юзера що зробив паузу
- Що робити з повністю "порожніми" сесіями (`startedAt` є, events = 0)? Видаляти чи закривати з `endedAt = startedAt`?
- Чи показувати у дашборді сесії що були закриті cron'ом інакше (badge "auto-closed")?
