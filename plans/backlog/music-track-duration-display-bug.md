# Backlog: Music track duration display — incorrect behaviour on pause / popup reopen

**Виявлено:** Week 2, після AC7  
**Пріоритет:** mid — UX-баг, не критичний для функціональності  
**Scope:** extension popup only (дані в БД коректні)

---

## Опис проблеми

### Симптом 1 — Сесія на паузі або зупинена

Поки popup відкритий: таймер треку **заморожений** (тіки не йдуть) — очікувана поведінка,
бо `isSessionActive = false` → `displayDurationMs` не інкрементується.

Але якщо **закрити і знову відкрити popup** — відображуваний час **стрибає вперед**, 
хоча сесія була на паузі. Виглядає як баг із точки зору користувача.

### Симптом 2 — Музика поставлена на паузу (плеєр)

Поки popup відкритий: detection через `playbackTime` DOM-порівняння працює коректно —
якщо значення не змінилось між тіками → вважається пауза → `displayDurationMs` не росте.

Але якщо **закрити і відкрити popup** під час паузи плеєра — час теж стрибає вперед,
наче пісня грала весь цей час.

---

## Root cause

`displayDurationMs` — **локальна змінна popup-контексту** (`popup.ts`, рядок ~183).

```ts
// Ініціалізація при зміні треку:
displayDurationMs = track
  ? Math.max(0, Date.now() - new Date(track.capturedAt).getTime())
  : 0;
```

При кожному **відкритті popup** змінна ініціалізується заново як
`Date.now() - capturedAt`. `capturedAt` — це час коли трек вперше з'явився,
і він **не скидається** при паузі сесії або паузі плеєра.

Тому:
- Якщо сесія була на паузі 5 хвилин і popup перевідкрили → `displayDurationMs` = повний
  час з моменту захоплення треку, включно з паузою → **візуально стрибок**.
- Якщо плеєр стояв на паузі і popup перевідкрили → аналогічно.

Тіки (1s `setInterval`) коректно стоплять приріст поки `isSessionActive = false`
або поки `playbackTime` не міняється — але **тільки поки popup відкритий**.
При закритті popup весь стан (`displayDurationMs`, `prevPlaybackTime`) губиться.

---

## Що правильно працює

- `listenedMs` у БД (`Track` model) — акумулюється коректно через background service worker
  (`endCurrentDbTrack` → `PATCH /api/v1/tracks/:id` з реальним delta).
- Пауза/відновлення сесії → `endCurrentDbTrack` / `saveTrackToDb` → правильний listenedMs у БД.
- Відображення поточного треку в popup загалом працює поки popup відкритий.

---

## Технічний план фіксу

### Варіант A — зберігати `displayDurationMs` у `chrome.storage.local` (рекомендований)

Додати ключ `trackDisplayMs: number` у storage.

**Background:**
- При паузі сесії (`SESSION_PAUSE`) → записати поточний накопичений `displayDurationMs` у storage.
- При зупинці сесії (`SESSION_STOP`) → очистити.
- При зміні треку (`TRACK_CAPTURED`) → скинути до 0.

**Popup:**
- При `applyTrack`: якщо трек той самий що в storage — ініціалізувати `displayDurationMs`
  зі storage замість `Date.now() - capturedAt`.
- `refreshDuration` → при кожному тіку (якщо `isSessionActive && trackIsPlaying`) →
  оновлювати storage.

Мінус: зайві storage writes кожну секунду (але дані невеликі).

### Варіант B — читати `listenedMs` з БД при відкритті popup (складніший)

При `init()` → GET `/api/v1/tracks/:id` для поточного треку → взяти `listenedMs` як базу.
Мінус: потрібен API-запит при кожному відкритті popup; потребує нового Route Handler або
зміни відповіді TRACK_GET_CURRENT.

### Варіант C — зберігати `periodStartMs` у storage і рахувати delta (найточніший)

Background вже зберігає `currentPeriodStartMs` для DB-розрахунку.
Popup міг би читати `currentPeriodStartMs` і рахувати `listenedMs_from_db + (now - periodStart)`.
Але потребує передачі `listenedMs` через TRACK_GET_CURRENT response.

---

## Definition of Done (коли фіксити)

- [ ] `displayDurationMs` не стрибає при перевідкритті popup під час паузи сесії
- [ ] `displayDurationMs` не стрибає при перевідкритті popup під час паузи плеєра
- [ ] При активній сесії + грючому плеєрі таймер продовжує рости коректно
- [ ] Значення в popup після реоткриття близьке до `listenedMs` у БД (±2s)
