# Plan: Week 2 AC 5 — Data Sync

**Branch:** `feature/extension-data-sync`
**Closes:** Week 2 AC 5 ([docs/Task.md L78](../../docs/Task.md#L78))
**Status:** plan, awaiting review

---

## Scope

**AC 5 — Передача даних:** зібрані події надсилаються батчами на `POST /api/v1/events` з Bearer token. Є retry-логіка при помилці мережі.

Закриває також **Gap 2, 3, 4** з [AC2-AC3-content-sessions.md](./AC2-AC3-content-sessions.md#L144) — без них AC 5 не запрацює, бо в БД `Event.sessionId` — FK на CUID, локальний UUID не пройде валідацію.

---

## Commits (ordered)

```
1. docs(plans): add week 2 AC 5 data sync plan
2. feat(dashboard): add requireUser JWT helper and apply to /api/v1/events
3. feat(dashboard): add POST and PATCH /api/v1/sessions endpoints
4. feat(extension): create DB session on SESSION_START with retry (Gap 2)
5. feat(extension): normalize pending event payload shape (Gaps 3, 4)
6. feat(extension): add batched event sync with alarm and retry (AC 5)
7. feat(extension): show sync errors and last-synced state in popup
```

---

## Files

| File | Action | Commit |
|---|---|---|
| `plans/week2/AC5-data-sync.md` | **new** | 1 |
| `dashboard/server/jwt.ts` | **new** — `requireUser(req): { id, email }` | 2 |
| `dashboard/app/api/v1/events/route.ts` | modify — call `requireUser`, restrict body to current user's sessions | 2 |
| `dashboard/server/schemas/sessions.ts` | **new** | 3 |
| `dashboard/server/sessions.ts` | **new** — `createSession`, `endSession` | 3 |
| `dashboard/app/api/v1/sessions/route.ts` | **new** — POST | 3 |
| `dashboard/app/api/v1/sessions/[id]/route.ts` | **new** — PATCH | 3 |
| `extension/src/types/session.ts` | modify — add `dbSessionId: string \| null` | 4 |
| `extension/src/background/session.ts` | modify — `startSession` triggers DB-session create with retry | 4 |
| `extension/src/types/pending.ts` | **new** — shared shape for queued events | 5 |
| `extension/src/background/index.ts` | modify — normalize payloads at enqueue time | 5 |
| `extension/src/background/sync.ts` | **new** — batching, alarms, retry | 6 |
| `extension/src/background/index.ts` | modify — wire sync, flush on `SESSION_STOP` | 6 |
| `extension/src/manifest.ts` | modify — add `"alarms"` permission | 6 |
| `extension/src/types/sync.ts` | **new** — `SYNC_GET_STATUS` message | 7 |
| `extension/src/popup/popup.ts` | modify — show last sync ts / error | 7 |
| `extension/src/popup/index.html` + `.css` | modify — sync status row | 7 |

---

## Design decisions

### 1. JWT helper — shared between sessions and events

Окремий модуль `dashboard/server/jwt.ts`:

```ts
export function requireUser(req: NextRequest): { id: string; email: string }
```

Кидає `UnauthorizedError` (новий клас) при відсутньому/невалідному токені. Route handlers ловлять і повертають 401. Сам verify через `jsonwebtoken.verify(token, JWT_SECRET)` — той самий secret, що в `server/auth.ts:issueJWT`.

**Чому окремий файл, а не middleware:** Next.js middleware на edge runtime, а нам тут потрібно перевірити `userId` проти БД у деяких флоу (наприклад: `POST /api/v1/events` повинен впевнитись, що `sessionId` належить юзеру). Реальний middleware — Week 3 AC 1 для `/dashboard/*` сторінок.

**Чому застосовуємо до `/api/v1/events` теж:** без цього будь-хто з `chrome-extension://*` Origin може писати в чужі сесії. CORS дозволяє origin, але не авторизує користувача. Краще зробити правильно зараз, ніж лишити дірку до Week 3.

**Перевірка ownership при POST /api/v1/events:** окрім JWT, переконуємось, що `event.sessionId` належить `userId` з токена. Без цього JWT-helper лише наполовину закриває проблему.

### 2. Sessions API

```
POST   /api/v1/sessions          → { id: string }            створює Session(userId from JWT, startedAt=now)
PATCH  /api/v1/sessions/:id      → { id, endedAt }           перевіряє ownership, пише endedAt=now
```

Обидва — `withCors`, обидва — через `requireUser`. Zod схеми мінімальні (POST — порожнє body, PATCH — без body).

### 3. Local Session → DB Session mapping

Розширення типу:
```ts
interface Session {
  id:            string;                  // local UUID — для popup/storage
  dbSessionId:   string | null;           // CUID з БД, null поки не дійшло
  startedAt:     number;
  totalActiveMs: number;
  pausedAt:      number | null;
}
```

**`SESSION_START` flow:**
1. створити local session (як зараз)
2. одразу зробити `POST /api/v1/sessions`. На успіх — записати `dbSessionId` у storage.
3. на помилку мережі — лишити `dbSessionId: null` і покластись на sync alarm, який спробує знову (див. §6).

**Без `dbSessionId` нічого не sync-иться.** Sync пропускає batch, якщо сесія ще не зареєстрована в БД. Це послідовно і безпечно — батч-запит або повністю успішний, або повністю відкладений.

**`SESSION_STOP` flow:** локальна частина — як зараз. Якщо є `dbSessionId` — `PATCH /api/v1/sessions/:id` для `endedAt`. Якщо немає (офлайн весь час) — не пробуємо. Втрата `endedAt` — допустима втрата.

### 4. Pending event shape — нормалізуємо при enqueue

Зараз у `pendingEvents` потрапляють два різні shape'и:
- з `PAGE_METADATA` — повний `PageMetadata` payload (`{ url, title, metaDescription, headings, timestamp }`)
- з `NOTE_ADD` — `{ url: "", title: "Note", content, tags, timestamp }`

Обидва _не співпадають_ з `Event` моделлю (`headings` нема, `metaDescription` нема, `url: ""` фейлить `z.url()`).

**Нормалізуємо одразу при enqueue.** Новий тип:
```ts
interface PendingEvent {
  url:       string;   // valid URL (для нотатки — worktrace://note/<uuid>)
  title:     string;
  content:   string | null;
  tags:      string[];
  timestamp: string;   // ISO
}
```

Перетворення:
- **PAGE_METADATA** → `content = [metaDescription, ...headings].filter(Boolean).join(" | ") || null`, `tags = []`.
- **NOTE_ADD** → `url = "worktrace://note/" + crypto.randomUUID()`, `title = text.slice(0, 80) || "Note"`, `content = text`, `tags = ["note", ...userTags]`.

`worktrace://` — кастомна URL-схема, Zod `z.url()` приймає її (URL parser спецификації не вимагає http/https).

### 5. Validation: `CreateEventInput` лишається без змін

Сторона dashboard'у не вимагає змін схеми — `url: z.url()`, `title: z.string().min(1)`, `sessionId: CUID` всі задовольняються нормалізованим payload.

Єдина зміна route handler'а — додати `requireUser` + перевірку `session.userId === user.id` через `prisma.session.findFirst({ where: { id, userId } })`.

### 6. Batching & retry — `chrome.alarms` кожні 30 секунд

```
chrome.alarms.create("sync", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(name => name === "sync" && flush());
```

**`flush()`:**
1. читаємо `activeSession` — якщо `dbSessionId == null`, спершу пробуємо `POST /api/v1/sessions`. Не вдалось — exit (наступний alarm спробує знову).
2. читаємо `pendingEvents`. Порожньо — exit.
3. беремо до `BATCH_SIZE = 50` подій (FIFO).
4. шлемо `POST /api/v1/events` _по одній_ (route handler приймає одну, не масив — поточний контракт). Кожна успішна → видаляється з черги. Помилка мережі → стоп, лишити решту в черзі.
5. при `401` → не ретраїти, очистити jwt і черга чекає (юзер залогіниться, наступний flush спрацює).
6. при `4xx` (валідація) → подія відкидається з логом — інакше "отруйна" подія заблокує всю чергу.

**Backoff per-alarm:** в межах одного `flush` — без додаткових ретраїв. Наступний alarm через 30s — це і є backoff. Простіше і достатньо для AC 5 (не CI з мільйонами реквестів).

**Flush на `SESSION_STOP`:** одразу викликаємо `flush()` (поза alarm), щоб закрити сесію з мінімальною кількістю pending events.

**Чому окремий файл `background/sync.ts`:** `index.ts` уже 300 рядків. Sync — самостійна одиниця з власним станом (lastSyncedAt, lastError). Окремий модуль = легше тестувати локально (можна замокати `apiFetch`).

### 7. Sync status у popup

Новий тип повідомлення:
```ts
{ type: "SYNC_GET_STATUS" }
  → { lastSyncedAt: number | null; lastError: string | null; queueSize: number }
```

`queueSize` — те саме що зараз показує popup (`pendingEvents.length`), просто переносимо в один RPC замість прямого читання storage. Це чистіше — popup не залежить від ключів storage.

UI: під поточним `sync-indicator` додаємо одне поле "last sync: 2 min ago" / "error: ...". Без перебудови верстки.

### 8. Чого НЕ робимо тут (out of scope)

- **JWT validation у Next.js middleware** — Week 3 AC 1. Тут тільки server-side helper для конкретних route handlers.
- **Track endpoint** — `Track` модель ще не використовується (Week 2 AC 6 бонус).
- **Forgot password / email-password auth** — окремий backlog, явно "after Week 3" ([plans/backlog/email-password-auth.md:131](../backlog/email-password-auth.md#L131)).
- **Bulk events endpoint** (`POST /api/v1/events` приймає масив) — поточний контракт приймає одну подію, міняти його — окремий рефактор. Послідовний POST з batch-обмеженням 50 достатньо для MVP.
- **Note як окрема Prisma модель** — синтетичний URL покриває потреби AC 5 без міграції.

---

## Verification checklist

### Dashboard
- [ ] `cd dashboard && npx tsc --noEmit` без помилок
- [ ] `POST /api/v1/sessions` без `Authorization` → 401
- [ ] `POST /api/v1/sessions` з валідним JWT → 201 `{ id }`, рядок у БД
- [ ] `PATCH /api/v1/sessions/<own-id>` → 200, `endedAt` записано
- [ ] `PATCH /api/v1/sessions/<other-user-id>` → 404 (не 403 — не зливаємо існування)
- [ ] `POST /api/v1/events` для чужої сесії → 404
- [ ] `POST /api/v1/events` для своєї сесії з валідним body → 201

### Extension
- [ ] `cd extension && npm run build` без помилок
- [ ] `SESSION_START` → `activeSession.dbSessionId` з'являється протягом ~1 alarm
- [ ] Офлайн + `SESSION_START` → `dbSessionId: null`, після відновлення мережі → заповнюється
- [ ] `pendingEvents` після PAGE_METADATA має формат `{ url, title, content, tags, timestamp }`
- [ ] Нотатка з'являється з `url: worktrace://note/...`, `tags: ["note", ...]`
- [ ] Alarm кожні 30s робить POST. Успіх → подія зникає з `pendingEvents`.
- [ ] 401 від API → черга лишається, після повторного login → flush очищає її
- [ ] `SESSION_STOP` → одразу POST до events для решти черги + PATCH session.endedAt
- [ ] Popup показує `last sync: ...` і `error: ...` коли актуально
