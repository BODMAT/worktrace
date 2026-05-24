# Plan: AC6 — Music Capture (Bonus)

**Branch:** `feature/extension-music-capture`  
**PR target:** `development`  
**Scope:** Content script захоплює метадані поточного треку з YouTube Music і SoundCloud (назва, виконавець). Оновлюється в реальному часі через `MutationObserver`. Поточний трек відображається в popup. При активній сесії трек зберігається в DB через новий Route Handler.

---

## Acceptance Criteria (з Task.md)

- [x] Content script захоплює назву та виконавця на YouTube Music (`music.youtube.com`)
- [x] Content script захоплює назву та виконавця на SoundCloud (`soundcloud.com`)
- [x] Дані оновлюються в реальному часі через `MutationObserver`
- [x] Поточний трек відображається в popup
- [x] При активній сесії трек зберігається в DB (модель `Track` вже існує в schema)

## Додаткові вимоги (виявлені під час тестування)

- [x] При **паузі** сесії — зупиняти лічильник тривалості треку + відправляти `endedAt` в БД
- [x] При **відновленні** сесії — відкривати новий DB-запис для поточного треку (акумуляція `listenedMs`)
- [x] Якщо пісня вже є в сесії в БД — **акумулювати `listenedMs`** через upsert (не дублювати запис)
- [x] `endedAt` встановлюється одразу при зміні/закінченні треку
- [x] Музика зберігається в БД **тільки під час активного таймера** (не під час паузи)
- [x] Коли таймер неактивний (пауза/idle) — **підсвічувати блок музики сірим** в popup

---

## Архітектурні рішення

### 1. Окремі content scripts для кожної платформи

Замість модифікації `extension/src/content/index.ts` — додаємо два окремих файли:
- `extension/src/content/ytm.ts` — YouTube Music
- `extension/src/content/soundcloud.ts` — SoundCloud

**Чому:** URL-матчинг і DOM-структура повністю різні. Один universal script з platform-detection — більш складний і важко тестувати окремо.

### 2. Типи в окремому `extension/src/types/music.ts`

```ts
export interface TrackInfo {
  title: string;
  artist: string;
  source: "youtube-music" | "soundcloud";
  capturedAt: string; // ISO 8601
}

export type MusicMessage =
  | { type: "TRACK_CAPTURED"; payload: TrackInfo }
  | { type: "TRACK_GET_CURRENT" };

export type MusicResponse =
  | { success: true; track: TrackInfo | null }
  | { success: false; error: string };
```

### 3. Message flow (строго дотримуємось CLAUDE.md)

```
ytm.ts / soundcloud.ts
  └── chrome.runtime.sendMessage({ type: "TRACK_CAPTURED", payload })
          ↓
      background/index.ts
          ├── chrome.storage.local.set({ currentTrack })
          └── якщо сесія активна → POST /api/v1/tracks (upsert)
                  ↓ (fail → best-effort, не ламає flow)
      
popup.ts
  └── TRACK_GET_CURRENT → background → повертає currentTrack з storage
```

### 4. DOM селектори

**YouTube Music** (`music.youtube.com`):

| Елемент | Селектор |
|---------|---------|
| Назва треку | `ytmusic-player-bar .title.ytmusic-player-bar` |
| Виконавець | `ytmusic-player-bar .subtitle.ytmusic-player-bar a:first-child` |
| Fallback (title tag) | `document.title` — формат: `"Назва - Виконавець - YouTube Music"` |

MutationObserver спостерігає за `ytmusic-player-bar` або `<title>`. Якщо `<title>` змінюється — парсимо через regex: `/^(.+?) - (.+?) - YouTube Music$/`.

**SoundCloud** (`soundcloud.com`):

| Елемент | Селектор |
|---------|---------|
| Назва треку | `.playbackSoundBadge__titleLink span:not(.sc-visuallyhidden)` |
| Виконавець | `.playbackSoundBadge__lightLink` |
| Fallback (title tag) | `document.title` — формат: `"Назва by Виконавець \| SoundCloud"` |

MutationObserver спостерігає за `.playbackSoundBadge` або `<title>`.

### 5. Дедуплікація трека

Зберігаємо `previousTrack` в пам'яті content script. Відправляємо `TRACK_CAPTURED` тільки якщо `title !== previousTrack.title || artist !== previousTrack.artist`. Це запобігає flood-у повідомлень при кожній мутації DOM.

### 6. Route Handler `POST /api/v1/tracks`

Тонкий route handler: parse → Zod validate → `server/tracks.ts` → DB.

**Body schema** (похідна від `Track` моделі):
```ts
z.object({
  sessionId: z.string().cuid(),
  artist: z.string().min(1),
  title: z.string().min(1),
})
```
`capturedAt` — `@default(now())` в Prisma, не передаємо з клієнта.

### 7. `PATCH /api/v1/tracks/:id` — endedAt + listenedMs

```ts
z.object({
  endedAt:    z.string().datetime(),
  listenedMs: z.number().int().min(0),
})
```

Накопичувальне: `prisma.track.update({ data: { endedAt, listenedMs: { increment: delta } } })`.

### 8. Upsert замість create

`POST /api/v1/tracks` → `prisma.track.upsert` по `@@unique([sessionId, artist, title])`.  
При повторному запуску тої самої пісні в сесії — запис оновлюється (endedAt: null), `listenedMs` акумулюється через наступний PATCH.

### 9. Облік `listenedMs` — `currentPeriodStartMs`

Background зберігає `currentPeriodStartMs = Date.now()` при POST.  
При PATCH (`endCurrentDbTrack`) — обчислює `listenedMs = Date.now() - currentPeriodStartMs`.

### 10. Popup UI — секція "NOW PLAYING"

- HTML: секція `#track-section` з `♪` іконкою, title, artist, source badge, duration
- CSS: `.popup__track--inactive { opacity: 0.35 }` — сіра підсвітка коли таймер неактивний
- TS: `displayDurationMs` — локальний лічильник, інкрементується лише при `isSessionActive = true`

---

## Файли, що змінюються / додаються

| Файл | Дія |
|------|-----|
| `extension/src/types/music.ts` | **NEW** — TrackInfo, MusicMessage, MusicResponse |
| `extension/src/content/ytm.ts` | **NEW** — YouTube Music content script |
| `extension/src/content/soundcloud.ts` | **NEW** — SoundCloud content script |
| `extension/src/manifest.ts` | **EDIT** — додати content_scripts + host_permissions |
| `extension/src/background/index.ts` | **EDIT** — handle TRACK_CAPTURED, TRACK_GET_CURRENT, pause/resume |
| `extension/src/popup/index.html` | **EDIT** — секція NOW PLAYING |
| `extension/src/popup/popup.ts` | **EDIT** — sendMusic, track timer, gray-out state |
| `extension/src/popup/popup.css` | **EDIT** — стилі .popup__track, .popup__track--inactive |
| `dashboard/prisma/schema.prisma` | **EDIT** — listenedMs field + @@unique constraint |
| `dashboard/prisma/migrations/...` | **NEW** — migration for listenedMs + unique |
| `dashboard/app/api/v1/tracks/route.ts` | **NEW** — POST /api/v1/tracks |
| `dashboard/app/api/v1/tracks/[id]/route.ts` | **NEW** — PATCH /api/v1/tracks/:id |
| `dashboard/server/tracks.ts` | **NEW** — createTrack (upsert), endTrack (increment) |
| `dashboard/server/schemas/tracks.ts` | **NEW** — Zod schema для Track |
| `dashboard/server/cors.ts` | **EDIT** — додати PATCH до Allow-Methods |

---

## Детальний план комітів

### Коміт 1 — docs (після апруву плану)
```
docs(plans): add AC6 music capture plan
```

### Коміт 2 — Types
```
feat(extension): add TrackInfo types and music message definitions
```

### Коміт 3 — YouTube Music content script
```
feat(extension): add YouTube Music content script with MutationObserver
```

### Коміт 4 — SoundCloud content script
```
feat(extension): add SoundCloud content script with MutationObserver
```

### Коміт 5 — Manifest update
```
feat(extension): update manifest with music content scripts and host_permissions
```

### Коміт 6 — Background: handle music messages + save to DB
```
feat(extension): handle TRACK_CAPTURED in background and save to DB
```

### Коміт 7 — Dashboard: POST /api/v1/tracks
```
feat(dashboard): add POST /api/v1/tracks route handler
```

### Коміт 8 — Popup: now-playing UI
```
feat(extension): display now-playing track in popup UI
```

### Коміт 9 — fix: skip sync when unauth
```
fix(extension): skip sync flush when unauthenticated to stop retry flood
```

### Коміт 10 — fix: popup visibility + auth error
```
fix(extension): fix track section visibility and show auth error in popup
```

### Коміт 11 — fix: on-demand pull
```
fix(extension): add TRACK_REQUEST on-demand pull to fix SW race condition
```

### Коміт 12 — docs: dev checklist
```
docs: add local dev checklist to CLAUDE.md
```

### Коміт 13 — fix: save on-demand pull to DB
```
fix(extension): save track to DB on on-demand TRACK_REQUEST pull
```

### Коміт 14 — feat: duration timer
```
feat(extension): show track listening duration timer in popup
```

### Коміт 15 — feat: listenedMs accumulation + pause/resume + gray-out
```
feat: accumulate listenedMs per track, pause timer, gray out music block
```

Зміни:
- `dashboard/prisma/schema.prisma` — `listenedMs Int @default(0)` + `@@unique([sessionId, artist, title])`
- `dashboard/prisma/migrations/...` — нова міграція
- `dashboard/server/schemas/tracks.ts` — `UpdateTrackInput` додає `listenedMs`
- `dashboard/server/tracks.ts` — `createTrackForUser` → upsert; `endTrackForUser` → `listenedMs: { increment }`
- `dashboard/server/cors.ts` — `PATCH` в `Allow-Methods`
- `extension/src/background/index.ts` — `currentPeriodStartMs`, `SESSION_PAUSE` → `endCurrentDbTrack`, `SESSION_RESUME` → `saveTrackToDb`
- `extension/src/popup/popup.ts` — `isSessionActive`, `displayDurationMs`, gray-out toggle
- `extension/src/popup/popup.css` — `.popup__track--inactive`

---

## Ризики та рішення

| Ризик | Рішення |
|-------|---------|
| YouTube Music змінить DOM між версіями | Fallback на `document.title` + обидва підходи спочатку |
| SoundCloud не оновлює `<title>` при зміні треку | Observer на обидва: `<title>` + `.playbackSoundBadge` |
| Content script injection race (page not loaded) | `run_at: "document_idle"` + initial send при завантаженні |
| DB save failing silently | Best-effort: помилки логуються в console, не ламають UX |
| MutationObserver spam | Дедуплікація за `title+artist` в `previousTrack` |
| Подвійні записи для тої самої пісні | `@@unique([sessionId, artist, title])` + upsert в Prisma |
| listenedMs не рахується при паузі | `currentPeriodStartMs` reset on pause, re-save on resume |

---

## Що НЕ входить в цей PR

- Dashboard сторінка `/dashboard/music` з аналітикою — це Week 3 AC 4 (окремий PR)
- Ретрай-черга для треків — tracks є best-effort, на відміну від events
- Відображення треку в event feed — не частина AC 6

---

## Кількість комітів: 15 (8 план + 4 фікси під час тестування + 2 доповнення + 1 складний фіча-коміт)

| # | Type | Scope | Description | Статус |
|---|------|-------|-------------|--------|
| 1 | docs | plans | add AC6 music capture plan | ✅ |
| 2 | feat | extension | add TrackInfo types and music message definitions | ✅ |
| 3 | feat | extension | add YouTube Music content script with MutationObserver | ✅ |
| 4 | feat | extension | add SoundCloud content script with MutationObserver | ✅ |
| 5 | feat | extension | update manifest with music content scripts and host_permissions | ✅ |
| 6 | feat | extension | handle TRACK_CAPTURED in background and save to DB | ✅ |
| 7 | feat | dashboard | add POST /api/v1/tracks route handler | ✅ |
| 8 | feat | extension | display now-playing track in popup UI | ✅ |
| 9 | fix | extension | skip sync flush when unauthenticated to stop retry flood | ✅ |
| 10 | fix | extension | fix track section visibility and show auth error in popup | ✅ |
| 11 | fix | extension | add TRACK_REQUEST on-demand pull to fix SW race condition | ✅ |
| 12 | docs | — | add local dev checklist to CLAUDE.md | ✅ |
| 13 | fix | extension | save track to DB on on-demand TRACK_REQUEST pull | ✅ |
| 14 | feat | extension | show track listening duration timer in popup | ✅ |
| 15 | feat | — | accumulate listenedMs per track, pause timer, gray out music block | ⏳ |

## Виявлені баги під час тестування та їх рішення

| Баг | Причина | Рішення |
|-----|---------|---------|
| ERR_CONNECTION_REFUSED на auth | Dashboard не запущений / Docker не стартував | Документовано в CLAUDE.md |
| Retry flood при відсутності JWT | sync alarm кожні 30 сек навіть без auth | `checkAuth()` guard у `flush()` |
| `♪ —` завжди видима | CSS `.popup__track { display:flex }` перекриває `[hidden]` | `style.display` через JS |
| Трек не відображається після reload | SW race: content script надіслав до SW при inactive SW | `TRACK_REQUEST` on-demand pull via `chrome.tabs.sendMessage` |
| `chrome.tabs.query({ active, currentWindow })` повертає не YTM | SW не має "current window" | Пошук по URL: `{ url: "https://music.youtube.com/*" }` |
| On-demand pull не зберігав у БД | `queryActiveTabForTrack` тільки писав у storage | Додано `saveTrackToDb` у on-demand flow |
| PATCH повертає CORS error | `cors.ts` мав тільки GET/POST/OPTIONS | Додано PATCH до `Access-Control-Allow-Methods` |
| listenedMs рахується під час паузи | Timer tick не знав про стан сесії | `isSessionActive` flag у popup, `endCurrentDbTrack` при паузі |
