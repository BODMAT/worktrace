# Plan: Week 2 AC 2+3 — Content Script + Session Manager

**Branch:** `feature/extension-content-sessions`
**Closes:** Week 2 AC 2, AC 3 ([docs/Task.md L75–L77](../../docs/Task.md#L75))
**Status:** implemented — gaps identified, see section below

---

## Scope

**AC 2 — Content Script:** парсить технічний контент поточної сторінки (url, title, meta description, h1–h3) і надсилає до service worker.

**AC 3 — Session Manager:** старт/стоп сесії вручну, таймер активного часу, збереження стану у `chrome.storage.local` з відновленням після рестарту service worker.

Разом вони формують **pipeline збору даних**: content script знає *що* зібрати, session manager знає *коли* це актуально. AC 5 (Data Sync) з'єднає їх з API.

---

## Commits (ordered)

```
docs(plans): add week 2 AC 2+3 content script and session manager plan
feat(extension): add content script page metadata parser (AC 2)
feat(extension): add session manager with start/stop/timer and storage (AC 3)
```

---

## Files

| File | Action | Commit |
|---|---|---|
| `plans/week2/AC2-AC3-content-sessions.md` | **new** | commit 1 |
| `extension/src/types/content.ts` | **new** | commit 2 |
| `extension/src/content/index.ts` | **rewrite** | commit 2 |
| `extension/src/types/session.ts` | **new** | commit 3 |
| `extension/src/background/session.ts` | **new** | commit 3 |
| `extension/src/background/index.ts` | modify — add session message handlers | commit 3 |

---

## Design decisions

### AC 2 — Content Script

#### 1. Що парсимо і як

```
url             → window.location.href
title           → document.title
metaDescription → document.querySelector('meta[name="description"]')?.content ?? null
headings        → Array.from(document.querySelectorAll("h1, h2, h3"))
                       .map(el => el.textContent?.trim())
                       .filter(Boolean)
```

Все в один об'єкт `PageMetadata`, надсилається через `chrome.runtime.sendMessage`.

#### 2. Коли надсилати

- При завантаженні (`document_idle` — вже є в manifest)
- При зміні URL у SPA: слухаємо `popstate` + `hashchange`

Без polling — event-driven підхід, без зайвих запитів.

#### 3. Чи відправляємо якщо немає активної сесії?

Ні — background ігнорує `PAGE_METADATA` якщо `session === null`. Це означає content script завжди надсилає (дешево), а фільтрація на стороні background.

---

### AC 3 — Session Manager

#### 4. Структура Session

```ts
interface Session {
  id:            string;   // crypto.randomUUID()
  startedAt:     number;   // Unix ms
  totalActiveMs: number;   // накопичений активний час (для паузи в AC 4)
}
```

Таймер **не зберігає `endedAt`** — поточний elapsed розраховується як:
```
elapsed = totalActiveMs + (Date.now() - startedAt)
```

Це безпечно після рестарту SW: значення `startedAt` і `totalActiveMs` є в storage.

#### 5. Persistence: чому storage, а не тільки пам'ять

MV3 service worker може бути зупинений браузером у будь-який момент. Якщо сесія тільки в пам'яті — після рестарту вона зникає. Тому `Session` одразу пишеться в `chrome.storage.local` і читається при старті.

#### 6. Модульність: `background/session.ts` окремо від `index.ts`

`index.ts` залишається orchestrator (слухає повідомлення, делегує). Вся логіка сесій — у `session.ts`. Так само `apiFetch` / auth — теж уже там. Це підготовка до AC 5 де буде ще батчинг подій.

#### 7. `chrome.storage.local` ключі для сесії

```
activeSession: Session | null
```

Один ключ із повним об'єктом — атомарний read/write, без race conditions між кількома `set` викликами.

#### 8. Message types

```ts
type SessionMessage =
  | { type: "SESSION_START" }
  | { type: "SESSION_STOP" }
  | { type: "SESSION_GET_STATE" };

type SessionResponse =
  | { success: true; session: Session | null }
  | { success: false; error: string };
```

Popup (AC 4) використовуватиме `SESSION_GET_STATE` для відображення таймера і статусу.

---

## Verification checklist

- [ ] `cd extension && npx tsc --noEmit` — без помилок
- [ ] `npm run build` — без помилок
- [ ] `SESSION_START` → session з'являється в `chrome.storage.local`
- [ ] `SESSION_STOP` → `activeSession: null` в storage
- [ ] `SESSION_GET_STATE` → повертає поточну сесію або null
- [ ] `PAGE_METADATA` надсилається при load і при навігації в SPA
- [ ] `PAGE_METADATA` ігнорується якщо сесія не активна

---

## Out of scope

- Пауза сесії — AC 4 (потрібна кнопка в popup)
- Відправка зібраних подій на API — AC 5
- Відображення таймера і статусу — AC 4

---

## ⚠️ Gaps identified after implementation (впливають на AC 4 і AC 5)

### Gap 1 — PAUSE/RESUME відсутні в session.ts → блокер для AC 4

AC 4 вимагає "кнопку паузи збору". Логіка паузи — в `background/session.ts`, а не в попапі. `totalActiveMs` вже готовий для цього, але `SESSION_PAUSE` / `SESSION_RESUME` повідомлень і методів у `session.ts` немає.

**Рішення для AC 4:** у тому самому `session.ts` додати:
```ts
export async function pauseSession(): Promise<Session | null>
export async function resumeSession(): Promise<Session | null>
```
При паузі: `totalActiveMs += Date.now() - startedAt`, `startedAt = null`.
При відновленні: `startedAt = Date.now()`.
Потрібно розширити тип `Session` полем `pausedAt: number | null`.

---

### Gap 2 — Немає `POST /api/v1/sessions` → блокер для AC 5

Task.md не описує цей endpoint, але він необхідний: `Event.sessionId` — FK до `Session` у БД. Локальний `session.id = crypto.randomUUID()` ≠ CUID з БД.

**Рішення для AC 5:**
- Додати `POST /api/v1/sessions` (створює Session в БД, повертає `{ id }`)
- Додати `PATCH /api/v1/sessions/:id` (закриває сесію — записує `endedAt`)
- При `SESSION_START` у service worker → одразу викликати `apiFetch("/api/v1/sessions", { method: "POST" })` і зберегти DB-шний `sessionId` поруч з локальною сесією

Розширення локального типу:
```ts
interface Session {
  id:            string; // локальний UUID
  dbSessionId:   string | null; // CUID з БД, null до першого sync
  ...
}
```

---

### Gap 3 — Нотатки з AC 4 popup нікуди не потраплять

AC 4: "поле для швидких нотаток і тегів". Модель `Session` не має поля `notes`. Модель `Event` має `content: String?` і `tags: String[]`.

**Рішення:** нотатку зберігати як окремий `Event` з `tags: ["note"]` і `content: <текст нотатки>`. Не потрібна міграція схеми.

---

### Gap 4 — Формат `Event.content` не визначено

`Event.content: String?` є в схемі, але Task.md не описує що туди класти. По логіці з `PageMetadata`:

```
content = [metaDescription, ...headings].filter(Boolean).join(" | ")
```

Фіксуємо цей формат тут, щоб AC 5 і Week 3 dashboard читали однаково.
