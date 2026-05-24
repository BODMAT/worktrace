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
          └── якщо сесія активна → POST /api/v1/tracks
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

### 7. Popup UI — секція "NOW PLAYING"

Додаємо між sync-indicator та notes:
```html
<div class="popup__track" id="track-section" hidden>
  <span class="popup__track-icon">♪</span>
  <div class="popup__track-info">
    <span class="popup__track-title" id="track-title">—</span>
    <span class="popup__track-artist" id="track-artist"></span>
  </div>
  <span class="popup__track-source" id="track-source"></span>
</div>
```

Оновлюється кожен тік polling-у (1s) через `TRACK_GET_CURRENT`.  
Якщо трек відсутній — секція прихована (`hidden`).

---

## Файли, що змінюються / додаються

| Файл | Дія |
|------|-----|
| `extension/src/types/music.ts` | **NEW** — TrackInfo, MusicMessage, MusicResponse |
| `extension/src/content/ytm.ts` | **NEW** — YouTube Music content script |
| `extension/src/content/soundcloud.ts` | **NEW** — SoundCloud content script |
| `extension/src/manifest.ts` | **EDIT** — додати content_scripts + host_permissions |
| `extension/src/background/index.ts` | **EDIT** — handle TRACK_CAPTURED, TRACK_GET_CURRENT |
| `extension/src/popup/index.html` | **EDIT** — секція NOW PLAYING |
| `extension/src/popup/popup.ts` | **EDIT** — sendMusic helper + poll track + відображення |
| `extension/src/popup/popup.css` | **EDIT** — стилі .popup__track |
| `dashboard/app/api/v1/tracks/route.ts` | **NEW** — POST /api/v1/tracks |
| `dashboard/server/tracks.ts` | **NEW** — createTrack бізнес-логіка |
| `dashboard/server/schemas/tracks.ts` | **NEW** — Zod schema для Track |

---

## Детальний план комітів

### Коміт 1 — docs (після апруву плану)
```
docs(plans): add AC6 music capture plan
```
Файл: `plans/week2/AC6-music-capture.md`

---

### Коміт 2 — Types
```
feat(extension): add TrackInfo types and music message definitions
```
**Файл:** `extension/src/types/music.ts`

Визначаємо:
- `TrackInfo` — основний тип з `title`, `artist`, `source`, `capturedAt`
- `MusicMessage` — discriminated union: `TRACK_CAPTURED | TRACK_GET_CURRENT`
- `MusicResponse` — відповідь background на `TRACK_GET_CURRENT`

---

### Коміт 3 — YouTube Music content script
```
feat(extension): add YouTube Music content script with MutationObserver
```
**Файл:** `extension/src/content/ytm.ts`

Логіка:
1. `parseYTMTrack(): TrackInfo | null` — читає DOM-селектори, fallback на `document.title`
2. `sendIfChanged(track)` — дедуплікація, відправляє `TRACK_CAPTURED` тільки при зміні
3. `MutationObserver` на `<title>` і `ytmusic-player-bar` — викликає `sendIfChanged`
4. Початкова відправка при завантаженні сторінки

---

### Коміт 4 — SoundCloud content script
```
feat(extension): add SoundCloud content script with MutationObserver
```
**Файл:** `extension/src/content/soundcloud.ts`

Аналогічна структура до ytm.ts, але:
- Селектори `.playbackSoundBadge__titleLink`, `.playbackSoundBadge__lightLink`
- Fallback: `document.title` regex: `/^(.+?) by (.+?) \| (?:Free|Stream|Listen)/`
- `MutationObserver` на `.playbackSoundBadge` та `<title>`

---

### Коміт 5 — Manifest update
```
feat(extension): update manifest with music content scripts and host_permissions
```
**Файл:** `extension/src/manifest.ts`

Зміни:
```ts
content_scripts: [
  // існуючий <all_urls>
  {
    matches: ["https://music.youtube.com/*"],
    js: ["src/content/ytm.ts"],
    run_at: "document_idle",
  },
  {
    matches: ["https://soundcloud.com/*"],
    js: ["src/content/soundcloud.ts"],
    run_at: "document_idle",
  },
],
host_permissions: [
  // існуючі
  "https://music.youtube.com/*",
  "https://soundcloud.com/*",
],
```

---

### Коміт 6 — Background: handle music messages + save to DB
```
feat(extension): handle TRACK_CAPTURED in background and save to DB
```
**Файли:** `extension/src/background/index.ts`

Додаємо в `onMessage.addListener`:

```ts
if (message.type === "TRACK_CAPTURED") {
  await chrome.storage.local.set({ currentTrack: message.payload });
  // Best-effort save to DB if session is active
  const session = await getSession();
  if (session && !session.pausedAt) {
    void saveTrackToDb(message.payload, session.dbSessionId);
  }
  return false;
}

if (message.type === "TRACK_GET_CURRENT") {
  const { currentTrack } = await chrome.storage.local.get("currentTrack");
  sendResponse({ success: true, track: currentTrack ?? null });
  return true;
}
```

`saveTrackToDb` — приватна функція, викликає `apiFetch("/api/v1/tracks", ...)`. Помилки ігноруються (best-effort).

---

### Коміт 7 — Dashboard: POST /api/v1/tracks
```
feat(dashboard): add POST /api/v1/tracks route handler
```
**Файли:**
- `dashboard/server/schemas/tracks.ts`
- `dashboard/server/tracks.ts`
- `dashboard/app/api/v1/tracks/route.ts`

Реалізуємо тонкий Route Handler. Body: `{ sessionId, artist, title }`. Auth через `verifyJwt` з `server/jwt.ts`. Validation via Zod. Запис через `server/tracks.ts → db.track.create(...)`.

---

### Коміт 8 — Popup: now-playing UI
```
feat(extension): display now-playing track in popup UI
```
**Файли:** `popup/index.html`, `popup/popup.ts`, `popup/popup.css`

- HTML: секція `#track-section` з `♪` іконкою, title, artist, source badge
- CSS: `.popup__track` у стилі існуючого `.popup__sync` — той самий `var(--c-surface)` + border. Source badge: `YTM` у cyan, `SC` у помаранчевому (`#ff5500`)
- TS: `sendMusic` helper, `refreshTrack()` функція, виклик у `startPolling` тік

---

## Ризики та рішення

| Ризик | Рішення |
|-------|---------|
| YouTube Music змінить DOM між версіями | Fallback на `document.title` + обидва підходи спочатку |
| SoundCloud не оновлює `<title>` при зміні треку | Observer на обидва: `<title>` + `.playbackSoundBadge` |
| Content script injection race (page not loaded) | `run_at: "document_idle"` + initial send при завантаженні |
| DB save failing silently | Best-effort: помилки логуються в console, не ламають UX |
| MutationObserver spam | Дедуплікація за `title+artist` в `previousTrack` |

---

## Що НЕ входить в цей PR

- Dashboard сторінка `/dashboard/music` з аналітикою — це Week 3 AC 4 (окремий PR)
- Ретрай-черга для треків — tracks є best-effort, на відміну від events
- Відображення треку в event feed — не частина AC 6

---

## Кількість комітів: 14 (8 план + 4 фікси під час тестування + 2 доповнення)

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

## Виявлені баги під час тестування та їх рішення

| Баг | Причина | Рішення |
|-----|---------|---------|
| ERR_CONNECTION_REFUSED на auth | Dashboard не запущений / Docker не стартував | Документовано в CLAUDE.md |
| Retry flood при відсутності JWT | sync alarm кожні 30 сек навіть без auth | `checkAuth()` guard у `flush()` |
| `♪ —` завжди видима | CSS `.popup__track { display:flex }` перекриває `[hidden]` | `style.display` через JS |
| Трек не відображається після reload | SW race: content script надіслав до SW при inactive SW | `TRACK_REQUEST` on-demand pull via `chrome.tabs.sendMessage` |
| `chrome.tabs.query({ active, currentWindow })` повертає не YTM | SW не має "current window" | Пошук по URL: `{ url: "https://music.youtube.com/*" }` |
| On-demand pull не зберігав у БД | `queryActiveTabForTrack` тільки писав у storage | Додано `saveTrackToDb` у on-demand flow |
