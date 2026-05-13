> **Оригінал:** https://gist.github.com/yana-kozlova/7ff680fbe3deb3104f9fcdd7773b37e3

---

# 🚀 Практичний проєкт: WorkTrace

**WorkTrace** — браузерне розширення та веб-платформа для автоматичного збору і AI-аналізу контексту розробника під час робочих сесій.

**Головна мета практики:** Навчитися працювати з сучасним Next.js App Router стеком та Chrome Extension Manifest V3, опанувати підхід **AI-Assisted Development** (цикл Plan → Review → Implement) за допомогою Claude Code або аналогічних інструментів.

---

## 🛠 Технологічний стек

### Chrome Extension
- **Manifest:** V3 (background service worker, content scripts)
- **Popup UI:** HTML + CSS + vanilla JS
- **Стан розширення:** chrome.storage.local

### Web Dashboard (Next.js)
- **Framework:** Next.js 15 (App Router, Server Components, Server Actions)
- **UI:** React 19 + Tailwind CSS v4
- **Анімації:** Framer Motion
- **Графи / Аналітика:** D3.js
- **Стан / Запити:** TanStack Query v5

### Backend
- **API:** Next.js Route Handlers (використовується і дашбордом, і extension)
- **ORM:** Prisma
- **База даних:** PostgreSQL — Neon (production) / Docker (локально)
- **Auth:** google-auth-library (верифікація Google token) + jsonwebtoken (власний JWT)
- **Валідація:** Zod

### AI
- **LLM:** OpenAI API (GPT-4o-mini) або безкоштовні альтернативи: Groq (llama-3, безкоштовний tier), Google Gemini API (безкоштовний tier), OpenRouter (агрегатор з безкоштовними моделями)
- **Підхід:** Route Handler генерує AI-звіт по сесії та повертає структурований Markdown

### Інфраструктура
- **Deploy:** Vercel (dashboard, `Root Directory: dashboard`) + `.zip` для локального завантаження extension
- **Контейнеризація:** Docker + docker-compose (PostgreSQL локально)
- **CI:** GitHub Actions (lint, typecheck на кожен PR)
- **Моніторинг:** Vercel Analytics

---

## 📋 План розробки та Acceptance Criteria

### Тиждень 1: Фундамент + AI-асистент

**Мета:** два окремих проекти підняті, зв'язані між собою, Claude Code налаштований.

**Dashboard (Next.js)**
- **AC 1 (Ініціалізація):** Створено Next.js 15 застосунок з App Router. Встановлено всі базові пакети: Tailwind CSS v4, Prisma, Zod, TanStack Query, Framer Motion, D3.js, google-auth-library, jsonwebtoken. Змінні середовища задокументовані у `.env.example`.
- **AC 2 (База даних та Docker):** Створено `docker-compose.yml` з PostgreSQL для локальної розробки. Підключено Neon для production. Створено Prisma-моделі: `User`, `Session`, `Event` (url, title, content, tags, timestamp), `Track` (artist, title, sessionId). Виконано першу міграцію.
- **AC 3 (CORS):** У Route Handlers налаштовано `Access-Control-Allow-Origin` для `chrome-extension://*`. Перевірено через Postman — запит проходить без помилок.

**Chrome Extension**
- **AC 4 (Ініціалізація):** Створено Chrome Extension з Manifest V3. Є фоновий service worker, базовий content script та порожній HTML popup. Розширення завантажується у Chrome без помилок (`chrome://extensions` → Load unpacked).
- **AC 5 (Структура репо):** Dashboard і Extension живуть в одному репо у папках `/dashboard` і `/extension`. У Vercel налаштовано `Root Directory: dashboard`. Є кореневий `README.md` з інструкцією `docker-compose up` і як запустити extension локально.

**AI-асистент**
- **AC 6 (CLAUDE.md + Skills):** Створено `CLAUDE.md` з правилами (бізнес-логіка у `/server`, Zod для валідації, `any` заборонено, не змішувати імпорти extension і dashboard, API запити з extension тільки через background service worker, auth логіка тільки у Route Handlers і middleware). Створено `.claude/skills/` з файлами `api-route.md`, `prisma-model.md`, `extension-message.md`.
- **AC 7 (Тест ШІ):** Використовуючи Claude Code, згенеровано Route Handler `POST /api/v1/events` з Zod-валідацією який пише у БД. AI не поліз з логікою в компонент.

### Тиждень 2: Chrome Extension — збір контексту

**Мета:** розширення реально збирає дані і відправляє на бекенд.

- **AC 1 (Auth Extension → Dashboard):** Extension реалізує повний auth flow у service worker:
  1. `chrome.identity.launchWebAuthFlow` → отримуємо Google OAuth token
  2. `POST /api/auth/extension` передає Google token на Next.js Route Handler
  3. Route Handler верифікує token через `google-auth-library` → видає власний підписаний JWT
  4. JWT зберігається у `chrome.storage.local` (тільки в service worker, не в content script і не в popup)
  5. Всі подальші запити до API йдуть через background service worker з цим JWT у хедері `Authorization: Bearer`
- **AC 2 (Content Script):** Content script парсить технічний контент сторінки (title, meta description, заголовки h1–h3, URL).
- **AC 3 (Сесії):** Реалізовано менеджер сесій: старт/стоп вручну, таймер активної роботи, збереження у `chrome.storage.local`.
- **AC 4 (Popup UI):** HTML popup відображає: статус сесії та таймер, індикатор синхронізації, кнопку паузи збору, поле для швидких нотаток і тегів.
- **AC 5 (Передача даних):** Зібрані події надсилаються батчами на `POST /api/v1/events` з Bearer token. Є retry-логіка при помилці мережі.
- **⭐ AC 6 (Музика) — бонус:** Content script захоплює метадані поточного треку з YouTube Music і SoundCloud (назва, виконавець). Оновлюється в реальному часі через MutationObserver. Поточний трек відображається в popup.
- **⭐ AC 7 (Приватність) — бонус:** Реалізовано чорний список доменів. Сторінки зі списку не парсяться і не відправляються. Фільтрація відбувається локально до будь-якої передачі даних.
- **⭐ AC 8 (Режими парсингу) — бонус:** Content script підтримує режими: повний текст / лише заголовки / лише мета-теги. Режим налаштовується в popup.

### Тиждень 3: Web Dashboard — аналітика та AI

**Мета:** повноцінний дашборд з стрічкою подій, графіками і AI-звітами.

- **AC 1 (Auth):** Реалізовано middleware (`middleware.ts`) який перевіряє JWT на всіх `/dashboard/*` роутах. Неавторизований юзер редіректиться на `/login`. Сторінка логіну запускає Google OAuth flow — той самий що і в extension — юзер залогінений в обох місцях через один JWT.
- **AC 2 (Стрічка подій):** Сторінка `/dashboard` відображає хронологічну стрічку подій поточного юзера. Є фільтрація по даті та тегах. Дані підтягуються через TanStack Query.
- **AC 3 (AI-звіт):** Кнопка "Згенерувати звіт" на сторінці сесії викликає Route Handler → LLM отримує контекст сесії (події, треки, нотатки) як system prompt → повертає структурований Markdown. Результат відображається на сторінці і доступний для завантаження як `.md` файл.
- **⭐ AC 4 (Аналітика музики) — бонус:** Сторінка `/dashboard/music` показує кореляцію між музикою і активністю: топ виконавців, активність по годинах. Графіки через D3.js. *(Залежить від бонусного AC 6 тижня 2)*
- **⭐ AC 5 (Error Handling) — бонус:** Усі Route Handlers повертають типізовані помилки. UI показує toast-нотифікації при помилках мережі або валідації. Extension показує статус помилки синхронізації в popup.

### Тиждень 4: Polish + Deploy

**Мета:** стабільний, задеплоєний продукт готовий до демо.

- **AC 1 (CI/CD):** GitHub Actions запускає lint + typecheck на кожен PR до `development` і `main`. PR не можна змерджити якщо checks не пройшли. При мерджі в `main` — автодеплой на Vercel.
- **AC 2 (Deploy):** Dashboard задеплоєно на Vercel з підключеним Neon. Extension упаковано у `.zip` з інструкцією для локального завантаження. `.env.example` актуальний.
- **AC 3 (Демо):** Записано Loom демо: розширення збирає сесію → дані з'являються у стрічці → AI генерує звіт → експорт у Markdown.
- **⭐ AC 4 (Анімації) — бонус:** Framer Motion анімації на ключових переходах: поява карток у стрічці подій, індикатор завантаження AI-звіту, transition між сторінками дашборду.

---

## 🌿 Git воркфлоу

### Гілки

Проєкт має дві захищені гілки:

- `main` — production. Прямі пуші заборонені. Мерджиться тільки з `development` після фінального рев'ю.
- `development` — основна гілка розробки. Прямі пуші заборонені. Всі фічі мерджаться сюди через PR.

### Правила захисту гілок (налаштувати у GitHub → Settings → Branches)

Для обох гілок (`main` та `development`):
- ✅ Require a pull request before merging
- ✅ Require status checks to pass before merging (lint, typecheck)
- ✅ Do not allow bypassing the above settings

### Робочий процес

Кожна задача — окрема гілка від `development`:

```
development → feature/[назва] → PR → code review → merge до development
development → fix/[назва]     → PR → code review → merge до development
development → chore/[назва]   → PR → code review → merge до development
```

Після завершення етапу: `development → PR → main`.

### Назви гілок

```
feature/extension-auth-google-oauth
feature/dashboard-event-feed
feature/ai-session-report
fix/extension-sync-retry
chore/update-prisma
```

---

## ✍️ Commit messages (Conventional Commits)

Формат: `<type>(<scope>): <short description>`

**Типи:**

- `feat` — нова функціональність
- `fix` — виправлення бага
- `chore` — оновлення залежностей, конфіги, без змін логіки
- `refactor` — рефакторинг без зміни поведінки
- `style` — форматування, CSS, без змін логіки
- `test` — додавання або виправлення тестів
- `docs` — зміни у документації

**Приклади:**

```
feat(extension): add content script for page metadata parsing
feat(extension): implement session manager with chrome.storage
feat(dashboard): implement event feed with TanStack Query
feat(ai): add session report generator with llm api
feat(export): add markdown download route handler
fix(extension): retry failed event sync on network error
fix(popup): fix session timer reset on service worker restart
chore(deps): update Prisma to 5.14
refactor(server): extract event queries to separate module
docs(readme): add extension local install instructions
```

**Правила:**
- Опис — англійською, lowercase, без крапки в кінці
- Довжина першого рядка — до 72 символів
- Якщо потрібен контекст — додавай тіло через порожній рядок

---

## 💡 Головне правило воркфлоу

Не проси AI одразу "написати фічу". Використовуй пайплайн:

1. `Plan` — AI аналізує файли проєкту, CLAUDE.md і генерує markdown-файл із технічним планом у папку `/plans`.
2. `Review` — Ти як Tech Lead перевіряєш план і даєш апрув.
3. `Implement` — AI пише код по затвердженому плану.