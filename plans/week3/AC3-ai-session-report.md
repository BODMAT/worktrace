# Plan: Week 3 AC 3 — AI Session Report

**Branch:** `feature/ai-session-report`
**Closes:** Week 3 AC 3 ([docs/Task.md L89](../../docs/Task.md#L89))
**Status:** plan, awaiting review

---

## Scope

Окрема сторінка `/dashboard/reports`, де користувач:

1. **Обирає діапазон** для якого генерувати звіт: `today` / `yesterday` / `last 7 days` / `last 30 days` / `all time` / `custom from–to`.
2. **(Опційно)** через **modal-портал** вводить свій власний Groq API key. Якщо ключа немає → бекенд бере дефолтний `GROQ_API_KEY` з `.env`.
3. **Натискає "Generate report"** → POST на Route Handler → бекенд:
   - Витягує події, треки, метадані сесій по діапазону.
   - **Алгоритмічно скейлить контекст** під token budget (підхід нижче у "Design decisions §5").
   - Викликає **Groq** (`llama-3.3-70b-versatile`, 128K context, OpenAI-compatible API).
   - Повертає структурований Markdown.
4. Бачить рендер Markdown'у на сторінці (react-markdown).
5. Може **завантажити `.md` файл** (`worktrace-report-<range>-<date>.md`).

**Музична аналітика** йде в LLM-контекст як окремий блок: топ-артисти по часу прослуховування + кореляція `events/min` під час кожного треку (proxy на "яка музика підвищує продуктивність"). Це **не окремий чарт** — це частина контексту, який LLM аналізує і коментує у фінальному звіті.

---

## Commits (ordered)

```
1. docs(plans): add week 3 AC 3 ai session report plan
2. feat(dashboard): add UserSetting model and encrypted groq api key endpoints
3. feat(dashboard): add groq client and report context builder with token-budget sampling
4. feat(ai): add reports/generate route and /dashboard/reports page with markdown render and download
5. feat(dashboard): add api key modal portal on reports page
6. fix(dashboard): address review feedback for week 3 AC 3   ← reserved, only if review requests changes
```

> Commit 1 — план. Commit 6 — резерв під правки після код-рев'ю PR. Якщо рев'юер апрувить без зауважень — 6-й комміт не створюється.

---

## Files

| File | Action | Commit |
|---|---|---|
| `plans/week3/AC3-ai-session-report.md` | **new** — цей план | 1 |
| `dashboard/prisma/schema.prisma` | modify — додати `UserSetting` model | 2 |
| `dashboard/prisma/migrations/<ts>_add_user_setting/migration.sql` | **new** | 2 |
| `dashboard/server/crypto.ts` | **new** — AES-256-GCM encrypt/decrypt API ключів | 2 |
| `dashboard/server/user-settings.ts` | **new** — `getUserSettings(userId)`, `setGroqApiKey(userId, key \| null)` | 2 |
| `dashboard/server/schemas/user-settings.ts` | **new** — Zod для `SetApiKeyInput` | 2 |
| `dashboard/app/api/v1/user/settings/route.ts` | **new** — `GET` (повертає `{ hasGroqApiKey, last4 }` — ніколи сам ключ), `PUT` (set/clear) | 2 |
| `dashboard/.env.example` | modify — `GROQ_API_KEY`, `GROQ_MODEL`, `REPORTS_ENCRYPTION_KEY` | 2 |
| `dashboard/server/groq.ts` | **new** — fetch-обгортка до `api.groq.com/openai/v1/chat/completions` | 3 |
| `dashboard/server/report-context.ts` | **new** — будує LLM-input з DB + token-budget sampling + music-аналітика | 3 |
| `dashboard/server/reports.ts` | **new** — orchestration: resolveRange → buildContext → callGroq → return markdown | 3 |
| `dashboard/server/schemas/reports.ts` | **new** — Zod для `GenerateReportInput` (range / from / to) | 3 |
| `dashboard/types/report.ts` | **new** — `RangePreset`, `GenerateReportResponse`, `ReportContextStats` (внутрішній DTO) | 3 |
| `dashboard/app/api/v1/reports/generate/route.ts` | **new** — `POST` | 4 |
| `dashboard/app/dashboard/reports/page.tsx` | **new** — Server Component (auth check + рендер форми) | 4 |
| `dashboard/app/dashboard/reports/report-form.tsx` | **new** — Client: range picker, generate, мутація, рендер | 4 |
| `dashboard/app/dashboard/reports/markdown-view.tsx` | **new** — wrapper над `react-markdown` + `remark-gfm` зі стилями нашої палітри | 4 |
| `dashboard/app/dashboard/reports/reports-client.ts` | **new** — fetcher'и (`generateReport`, `getApiKeyStatus`, `saveApiKey`) | 4 |
| `dashboard/app/dashboard/app-header.tsx` | modify — додати nav links: `FEED` / `REPORTS` | 4 |
| `dashboard/app/dashboard/reports/api-key-modal.tsx` | **new** — Client, React Portal через `createPortal` у `document.body` | 5 |
| `dashboard/package.json` | modify — `react-markdown`, `remark-gfm` | 4 |

---

## Design decisions

### 1. Provider: Groq (OpenAI-compatible)

- Endpoint: `https://api.groq.com/openai/v1/chat/completions`
- Default model: `llama-3.3-70b-versatile` (128K context, ~32K вихідних токенів, безкоштовний tier станом на дату плану)
- Authentication: `Authorization: Bearer <key>`
- Контракт payload'у — OpenAI Chat Completions: `{ model, messages: [{role, content}], temperature, max_tokens }`

Дефолтний ключ — `process.env.GROQ_API_KEY` (server-only). Якщо у юзера є власний (`UserSetting.groqApiKey` після decrypt) → береться його ключ. Модель не оверайдиться юзером (один `GROQ_MODEL` для всіх).

**Чому не OpenAI/Gemini:** Task.md прямо рекомендує Groq у free-tier альтернативах ([docs/Task.md L35](../../docs/Task.md#L35)), API сумісне з OpenAI → мінімальна обгортка, 128K контексту достатньо щоб у більшості випадків взагалі не зрізати дані.

### 2. Storage власного API key — `UserSetting` + AES-256-GCM

Нова модель:
```prisma
model UserSetting {
  userId           String   @id
  groqApiKey       String?   // ciphertext, base64(iv || authTag || data)
  groqApiKeyLast4  String?   // зберігаємо open для UI ("sk-…abcd")
  updatedAt        DateTime  @updatedAt
  user             User      @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

- `@id` на `userId` → 1-до-1 з `User`, не плодимо PKs.
- `groqApiKey` — **шифровка**, не plaintext. Майстер-ключ — окрема env-змінна `REPORTS_ENCRYPTION_KEY` (32 байти, base64). Не реюзаємо `JWT_SECRET` — rotation policies різні.
- `crypto.ts` використовує `node:crypto.createCipheriv("aes-256-gcm", key, iv)` — нативний модуль, без нових деп.
- `groqApiKeyLast4` — зручність для UI ("**** **** **** XYZ4"); самостійно нічого не розкриває.
- При `PUT` із порожнім тілом — clearцієм обидва поля → бекенд знов вертатиме дефолтний ключ.

API:
```
GET  /api/v1/user/settings  → { hasGroqApiKey: boolean, last4: string | null }
PUT  /api/v1/user/settings  → body { groqApiKey: string } → { hasGroqApiKey: true, last4 }
PUT  /api/v1/user/settings  → body { groqApiKey: null }   → { hasGroqApiKey: false, last4: null }
```

**Ніколи не повертаємо** plaintext ключ через API. Якщо юзер хоче його змінити — вводить заново.

### 3. Range presets — централізована резолюція

`server/reports.ts → resolveRange(input): { from: Date; to: Date; label: string }`:

| Preset | from | to | Тип діапазону |
|---|---|---|---|
| `today` | `startOfDay(now)` | `now` | вузький |
| `yesterday` | `startOfDay(now - 1d)` | `endOfDay(now - 1d)` | вузький |
| `last_7d` | `now - 7d` | `now` | середній |
| `last_30d` | `now - 30d` | `now` | широкий |
| `all_time` | `min(Session.startedAt)` для userId | `now` | будь-який |
| `custom` | `input.from` (валід Zod) | `input.to` | будь-який |

Всі обчислення — у UTC server-side. У UI показуємо preset-кнопки + два date-input'и для `custom`.

### 4. Контекст для LLM — structured JSON-like Markdown, не raw JSON

LLM працює якісніше з людино-читабельним структурованим input'ом. Будуємо такий шаблон:

```
# Range
Mon Apr 21 → Sun Apr 27 (last 7 days), timezone UTC

# Summary
- Sessions: 12 (3 active, 9 ended)
- Total work time: 14h 22m
- Events captured: 287
- Distinct domains: 23
- Distinct tags: 18

# Sessions
- 2026-04-21 09:14 → 11:48 (2h 34m), top: github.com (1h 12m)
- ...

# Top domains by time
1. github.com — 4h 18m, 89 events
2. localhost:3000 — 2h 50m, 54 events
3. ...

# Top tags
react (47), typescript (39), bug (22), ...

# Music
Top artists by listening time:
- Tame Impala — 1h 42m
- Bon Iver — 58m
- ...
Productivity proxy (events logged per minute while track was playing):
- "Currents" by Tame Impala — 0.8 events/min over 42m
- "Holocene" by Bon Iver — 0.3 events/min over 18m
- ...

# Notable events (sample)
- 2026-04-22 14:08 — "Fix prisma adapter migration" — github.com — tags: bug, prisma
  content: "Investigating why the adapter-pg ..."
- ...
```

**Чому шаблон, а не raw JSON dump:** менше токенів на роздільниках/синтаксисі, легше для моделі.

### 5. Token-budget sampling — алгоритм

Constants:
```
INPUT_TOKEN_BUDGET = 30_000          // 30K — ~24% від 128K контексту; решта на system prompt + response
CHARS_PER_TOKEN    = 4               // heuristic для llama-tokenizer (точне рахування — overkill для MVP)
```

Алгоритм (у `report-context.ts`):

```
1. Завантажуємо з БД ВСЕ що треба для діапазону:
   - сесії (id, startedAt, endedAt)
   - події (id, sessionId, url, title, content, tags, timestamp)
   - треки (artist, title, listenedMs, capturedAt, endedAt, sessionId)

2. Будуємо стискальні шари (fallback chain):
   LEVEL 0 — full:        кожна подія з повним content
   LEVEL 1 — no_content:  content → null, лишається title + url + tags
   LEVEL 2 — daily_only:  події групуються по днях; для кожного дня — count, top 5 hosts, top 5 tags. Нотатки (events з пустим url або content > 200) лишаються окремо як "highlights" (≤ 20 шт.)
   LEVEL 3 — stats_only:  тільки summary блок + Music. Подієвий зріз відсутній.

3. Серіалізуємо контекст у Markdown-шаблон (вище).
4. Estimate = ceil(chars / 4). Якщо ≤ INPUT_TOKEN_BUDGET — повертаємо.
5. Інакше — деградуємо level (0 → 1 → 2 → 3) і повторюємо.
6. На LEVEL 3 завжди влазимо (фіксований розмір).

Повертаємо: { markdown, level, estimatedTokens, range }
```

LLM на верхньому рівні system promp'ту отримує: "Context detail level: 2 (daily aggregate). Individual events were too numerous to include." — щоб модель знала які узагальнення робити.

**Edge cases:**
- 0 подій у діапазоні → одразу LEVEL 3 + явне "No events in range" → LLM має написати "There is no activity to report for this range."
- 0 треків → музичний блок просто пропускається у шаблоні; LLM не отримує сигнал писати про музику.

### 6. Music analytics — як рахуємо

**Топ-артисти по часу:** `SUM(Track.listenedMs) GROUP BY artist ORDER BY DESC LIMIT 10`. Фільтр: `Track.capturedAt` у діапазоні.

**Events/min під час треку (productivity proxy):**
```
для кожного треку T (artist, title, capturedAt, endedAt, listenedMs):
  N = COUNT(Event) WHERE Event.timestamp BETWEEN T.capturedAt AND COALESCE(T.endedAt, T.capturedAt + T.listenedMs)
                     AND Event.session.userId = userId
  ratio = N / (T.listenedMs / 60000)
повертаємо топ-5 за ratio (тільки де listenedMs > 60_000 — менш ніж 1 хв безкорисно для статистики)
```

Реалізуємо одним `$queryRaw` (Postgres підтримує всі ці JOIN/GROUP). Не запихаємо це у `getEventStatsForUser` — він на іншій ціні. Новий `getMusicCorrelationForUser(userId, from, to)` у `report-context.ts` (helper-функція, не публічний `server/` API — використовується тільки звітами).

### 7. System prompt — фіксований, у `server/reports.ts`

```
Role: senior productivity coach analyzing a developer's work session log.

You will receive a structured context about the user's activity:
sessions, events (urls/titles/tags), and music listening with productivity correlation.

Output a single Markdown report with these sections in order:
1. ## Overview — 2–3 sentence summary of the range.
2. ## Focus areas — bullets: top domains and top tags with brief interpretation.
3. ## Sessions — short narrative across the major sessions (limit to top 5 by duration).
4. ## Music & productivity — IF music data present: which artists/tracks
   correlated with higher events/min, vs lower. Avoid clickbait causality —
   call it "correlation in this range".
5. ## Highlights — 3–5 most interesting events (by content or unusual tags).
6. ## Recommendations — 2–4 concrete suggestions based on visible patterns
   (e.g. "you spent 2h on Stack Overflow tagged 'prisma' — consider docs
   bookmark"). Skip if data is too sparse.

Rules:
- Be specific. Quote concrete numbers and names from the context, never invent.
- If context.detailLevel >= 2, acknowledge that detail was aggregated and avoid
  per-event commentary.
- No preamble like "Here is the report"; start directly with "## Overview".
- ≤ 600 words total.
```

User message — Markdown-контекст з §4 + явний service-блок:
```
detailLevel: 1
estimatedContextTokens: 18452
```

### 8. Route Handler — `POST /api/v1/reports/generate`

```
1. requireUser(req) → userId
2. Zod validate body → { range: "today" | ... | "custom", from?, to? }
3. resolveRange(input, userId) → { from, to, label }
4. buildReportContext(userId, from, to) → { markdown, level, estimatedTokens }
5. apiKey = (await getUserSettings(userId)).groqApiKey ?? process.env.GROQ_API_KEY
6. groqChat({ apiKey, model, system, user: contextMarkdown }) → response text
7. return { markdown: response, range: label, contextLevel: level, estimatedInputTokens, model }
```

Помилки:
- 401 — нема auth
- 400 — невалідний range / custom без `from`/`to` / `from > to`
- 402 — Groq повертає 401 (юзерський ключ протух) — кажемо "Invalid API key — clear it in settings or set a new one"
- 502 — Groq повертає 5xx / network failure → "AI provider unavailable, try again"
- 504 — fetch timeout (60s ABORT) → "AI request timed out"

CORS пар-handler `OPTIONS` додаємо для консистентності з іншими `/api/v1/*`, навіть якщо роут поки що не викликається з extension.

### 9. UI: `/dashboard/reports` page

**Layout** успадковується від `/dashboard/layout.tsx` (sticky header вже є з AC2). Додаю у `app-header.tsx` дві nav-кнопки (`FEED` → `/dashboard`, `REPORTS` → `/dashboard/reports`) — стиль той самий монохром-кібер як у решті дашборду.

**`report-form.tsx`** (Client Component):
- 6 preset-чіпів зверху + collapsible "Custom dates" з двома `<input type="date">`
- Праворуч від presets — маленька кнопка `⚙ API KEY` → відкриває modal
- Кнопка `▶ GENERATE REPORT` (disabled при loading)
- Під формою:
  - `loading` state — animated stripe + "Asking the model… this can take 10–30s"
  - `error` state — карточка з повідомленням і "Retry"
  - `success` state — `MarkdownView` + кнопки `↓ DOWNLOAD .MD` і `🔁 NEW REPORT`

Стан зберігається у `useState` тільки на сторінці — без TanStack Query (генерація — одноразова дія, не cache-friendly). Тримаємо як `useMutation` з TanStack? — ні, простий `fetch` + `useState({status, data, error})` достатньо; екосистема query-кешу тут не дає виграшу.

**Завантаження `.md`:**
```ts
const blob = new Blob([markdown], { type: "text/markdown" });
const url  = URL.createObjectURL(blob);
const a    = document.createElement("a");
a.href     = url;
a.download = `worktrace-report-${rangeSlug}-${YYYYMMDD}.md`;
a.click();
URL.revokeObjectURL(url);
```

### 10. UI: API Key modal — React Portal

`api-key-modal.tsx`:
- `createPortal(<dialog>, document.body)` — щоб overlay не клавіш на layout dashboard'у.
- Backdrop + центрована карточка. Закриття: `Esc` / клік по backdrop / кнопка `✕`.
- Поля:
  - `<input type="password">` для нового ключа
  - кнопка `SAVE` — `PUT /api/v1/user/settings` з `{ groqApiKey }`
  - кнопка `CLEAR KEY` (показується тільки якщо `hasGroqApiKey === true`) → `PUT` з `{ groqApiKey: null }`
- Зверху статус: "Currently using your own key (•••• abcd)" або "Currently using the shared default key"
- При успішному save → закриваємо modal, оновлюємо локальний стан.
- Без TanStack Query — самостійний fetch + local state.

**Чому Portal, а не звичайний абсолют-div:** sticky header має `z-10` і `backdrop-blur` → overlay усередині layout'у трапить підлеглим. Portal у `body` дає чистий top-level rendering без z-index війн.

### 11. Markdown render — `react-markdown` + `remark-gfm`

- `react-markdown` рендерить markdown у safe React tree (без `dangerouslySetInnerHTML`).
- `remark-gfm` — GitHub-flavored Markdown (таблиці, todo-checkboxes).
- Кастомні mappings — h1/h2/h3 у нашу палітру (cyan для h2, purple для h3), inline code у `--c-surface` фон.

**Без подальших ремарків** (без `rehype-highlight` etc.) — звіт це проза, не код. Простір на bundle економимо.

### 12. Чому не Server Action

- Server Actions — для form-submit'ів без JSON-API. Наш роут потенційно буде дёргатись з extension у майбутньому (Week 4 ідея) → REST-консистентність з іншими `/api/v1/*` корисніша.
- Прогрес-бар / cancellation / retry — простіше через звичайний fetch.

### 13. Безпека: ніяк не сипати ключі у логи / response

- При помилці Groq — у respondі **тільки** generic-повідомлення; точну причину логуємо `console.error("[groq]", err)`.
- `apiKey` ніколи не серіалізується у respondі.
- Validation в `crypto.ts.encrypt()`: якщо `REPORTS_ENCRYPTION_KEY` не виставлено → throw старт-up error (фейл-фаст на dev).

---

## Verification checklist

### Backend
- [ ] `cd dashboard && npx tsc --noEmit` — без помилок
- [ ] `npm run build` — без помилок
- [ ] `npx prisma migrate dev --name add_user_setting` — міграція проходить, БД має таблицю `UserSetting`
- [ ] `GET /api/v1/user/settings` без cookie → 401
- [ ] `GET /api/v1/user/settings` з cookie, без ключа → `{ hasGroqApiKey: false, last4: null }`
- [ ] `PUT /api/v1/user/settings` `{ groqApiKey: "test123…" }` → 200, `last4 === "…cdef"` (адекватний хвіст)
- [ ] У БД `UserSetting.groqApiKey` — НЕ plaintext (видно base64-сміття)
- [ ] `PUT /api/v1/user/settings` `{ groqApiKey: null }` → 200, `last4: null`, у БД `null`
- [ ] `POST /api/v1/reports/generate` без cookie → 401
- [ ] `POST /api/v1/reports/generate` з `{ range: "today" }` → 200, `markdown` починається з `## Overview`
- [ ] `POST /api/v1/reports/generate` з `{ range: "custom", from: <ISO>, to: <ISO> }` де `from > to` → 400
- [ ] `POST /api/v1/reports/generate` коли подій 0 → 200, markdown містить "no activity"-фразу (тобто LLM правильно зрозумів)
- [ ] `POST /api/v1/reports/generate` з `{ range: "all_time" }` на акаунті з 1000+ подій → 200, у логах видно `level: 2` або `level: 3` (sampling спрацював)
- [ ] Невалідний user-key → 402 з людським повідомленням
- [ ] Mock-fail Groq URL → 502

### Token-budget sampling (unit-feel checks)
- [ ] При вузькому діапазоні з малим content'ом — використовується LEVEL 0 (повний)
- [ ] При штучно гігантському діапазоні — деградується щонайменше до LEVEL 2 і `estimatedTokens ≤ INPUT_TOKEN_BUDGET`
- [ ] На LEVEL 3 контекст-маркдаун має фіксовану структуру (тільки `## Summary` + `## Music`) і влазить ~< 2000 токенів

### UI / стилі
- [ ] `/dashboard/reports` без cookie → 307 → `/login`
- [ ] Header показує nav `FEED | REPORTS`, активний має акцентний колір
- [ ] Preset-кнопки (`TODAY`, `YESTERDAY`, …) — клік перемикає state, активна виділяється
- [ ] `Custom` секція показує два date-input'и тільки після кліку на preset `CUSTOM`
- [ ] `GENERATE` дізейблений під час loading, текст індикатора видно
- [ ] Після генерації markdown рендериться з нашою палітрою (h2 cyan, code у surface)
- [ ] `DOWNLOAD .MD` створює файл з ім'ям `worktrace-report-<range>-YYYYMMDD.md`, контент = згенерований markdown
- [ ] `NEW REPORT` ресетає стан до пустої форми

### API key modal
- [ ] Кнопка `⚙ API KEY` відкриває overlay поверх header'а (Portal працює)
- [ ] `Esc` і клік по backdrop закривають
- [ ] Введений ключ маскується (`type=password`)
- [ ] Save → закриває modal, бейдж "Using your own key (••••XYZ4)" з'являється на сторінці
- [ ] Clear → бейдж зникає, повертається "Using shared default key"
- [ ] Перезавантаження сторінки → стан зберігається з БД (`GET /api/v1/user/settings` на mount)

### End-to-end
- [ ] Логін через Google → перейти на `/dashboard/reports` → preset `LAST 7 DAYS` → `GENERATE` → за ~10–30s видно повноцінний звіт із заголовками + Music секція (якщо є треки)
- [ ] Завантажити `.md` → відкрити у VS Code → це валідний Markdown
- [ ] Налаштувати свій ключ → згенерувати знов → у `Network` видно `200` (доводить що бекенд використав інший ключ; перевіримо також на сторінці Groq console)
- [ ] Регресія: `/dashboard` (feed з AC2) і `/login` (AC1) не зламались

---

## Out of scope

- Збереження історії згенерованих звітів у БД (download'ом достатньо для MVP; колись додамо `Report` model)
- Шаринг звіту по URL / public link
- Стрімінг відповіді з Groq (SSE) — синхронний request/response достатній; UI показує "generating…" splash
- Per-session report (буквальна кнопка на сторінці конкретної сесії) — `/dashboard/sessions/[id]` сторінки не існує; reports працюють по range-у
- Custom system-prompt / template editor для юзера
- Підтримка кількох провайдерів одночасно (OpenAI/Gemini/Groq toggle) — тільки Groq у цьому AC
- Підрахунок токенів через справжній tokenizer (`tiktoken` / `llama-tokenizer-js`) — heuristic chars/4 достатньо для sampling гейту
- Cost tracking / quota — free-tier Groq, ліміти не моніторимо
- Animations переходів між станами loading→success — Week 4 бонус AC 4
- Rate-limit на `POST /api/v1/reports/generate` per-user — post-MVP, коли побачимо abuse
