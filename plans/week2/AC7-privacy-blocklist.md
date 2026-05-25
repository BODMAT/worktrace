# Plan: AC7 — Privacy / Domain Blocklist

**Branch:** `feature/extension-privacy-blocklist`  
**Scope:** Extension only — no dashboard changes needed.

---

## Мета

Реалізувати чорний список доменів у Chrome-розширенні:
- сторінки зі списку **не парсяться** (content script мовчить)
- **не відправляються** (background service worker ігнорує)
- фільтрація відбувається **локально**, до будь-якої мережевої передачі

---

## Аналіз поточного стану

| Точка | Файл | Що відбувається зараз |
|---|---|---|
| Content script (general) | `content/index.ts` | Завжди парсить + надсилає `PAGE_METADATA` |
| Content script (YTM) | `content/ytm.ts` | Завжди надсилає `TRACK_CAPTURED` |
| Content script (SoundCloud) | `content/soundcloud.ts` | Завжди надсилає `TRACK_CAPTURED` |
| Background — PAGE_METADATA | `background/index.ts` | Одразу ставить у чергу без перевірки |
| Background — TRACK_CAPTURED | `background/index.ts` | Одразу зберігає без перевірки |

**Проблема:** жодної перевірки домену немає — будь-яка сторінка парситься і відправляється.

---

## Архітектурні рішення

### 1. Де зберігати список

`chrome.storage.local` під ключем `"blockedDomains": string[]`.  
Причина: той самий storage, що і решта стану розширення; доступний з усіх контекстів; не втрачається при перезавантаженні SW.

### 2. Де фільтрувати (два рівні захисту)

**Рівень 1 — Content script (основний фільтр):**  
До відправлення будь-якого повідомлення content script читає `chrome.storage.local["blockedDomains"]` і перевіряє `window.location.hostname`. Якщо домен заблокований — повідомлення **не надсилається** взагалі.

**Рівень 2 — Background service worker (захист від витоку):**  
При отриманні `PAGE_METADATA` або `TRACK_CAPTURED` background також перевіряє домен з `payload.url`. Якщо заблокований — ігнорує, не ставить у чергу.

> Два рівні — бо MV3 content scripts не можуть бути 100% надійними (edge cases: race conditions при першому завантаженні). Background є кінцевою гарантією.

### 3. Зіставлення доменів

`hostname === blocked || hostname.endsWith(`.${blocked}`)`

Приклад: заблокований `google.com` → також блокуються `mail.google.com`, `docs.google.com`.

### 4. UI у popup

Секція **PRIVACY** складається з двох частин:

#### 4а. Основний тоггл — поточний сайт

Рядок з назвою домену поточної вкладки (з `chrome.tabs.query({ active: true, currentWindow: true })`) та тогглом праворуч:

```
PRIVACY
──────────────────────────────────
github.com                  [●──]   ← toggle вкл/викл блокування
```

- Домен береться з активної вкладки при кожному відкритті popup та в polling-циклі
- Тоггл: **ON** (червоний `--c-pink`) = заблокований, **OFF** (сірий `--c-muted`) = дозволений
- При перемиканні — надсилає `BLOCKLIST_ADD` або `BLOCKLIST_REMOVE` до background

#### 4б. Випадаючий список заблокованих доменів

Кнопка-акордеон `▾ N BLOCKED` (де N — кількість заблокованих доменів) розкриває список:

```
▾ 2 BLOCKED
  ┌────────────────────────────────┐
  │ google.com          [●──]     │  ← тоггл для кожного (вимикає = видаляє з списку)
  │ facebook.com        [●──]     │
  └────────────────────────────────┘
```

- Якщо список порожній — акордеон прихований або показує `▾ 0 BLOCKED` (не розкривається)
- Кожен тоггл навпроти домену: виключити тоггл = `BLOCKLIST_REMOVE` (видаляє домен зі списку)
- Список оновлюється при кожному `refreshBlocklist()` call

> `chrome.tabs.query` можна викликати з popup напряму — це внутрішній Chrome API, а не dashboard fetch.  
> Dashboard fetch — тільки через background (правило CLAUDE.md).

---

## Нові файли

### `extension/src/types/blocklist.ts`

```ts
export type BlocklistMessage =
  | { type: "BLOCKLIST_GET" }
  | { type: "BLOCKLIST_ADD"; domain: string }
  | { type: "BLOCKLIST_REMOVE"; domain: string };

export type BlocklistResponse =
  | { success: true; domains: string[] }
  | { success: true }
  | { success: false; error: string };
```

### `extension/src/background/blocklist.ts`

Утилітарний модуль для роботи з blocklist storage:

```ts
export const BLOCKLIST_KEY = "blockedDomains";

export function extractHostname(url: string): string | null  // new URL(url).hostname
export async function getBlocklist(): Promise<string[]>
export async function addDomain(domain: string): Promise<void>
export async function removeDomain(domain: string): Promise<void>
export async function isDomainBlocked(url: string): Promise<boolean>
// Перевіряє: hostname === blocked || hostname.endsWith(`.${blocked}`)
```

---

## Зміни у існуючих файлах

### `extension/src/content/index.ts`

`sendMetadata()` стає `async`:
1. Читає `chrome.storage.local.get("blockedDomains")`
2. Перевіряє `window.location.hostname`
3. Якщо заблокований → `return` (нічого не надсилає)
4. Якщо ні → надсилає `PAGE_METADATA` як раніше

### `extension/src/content/ytm.ts` та `soundcloud.ts`

У функції що надсилає `TRACK_CAPTURED`:
1. Перевіряє `chrome.storage.local.get("blockedDomains")`
2. Якщо `music.youtube.com` / `soundcloud.com` заблокований → не надсилає

### `extension/src/background/index.ts`

1. Імпортує `isDomainBlocked` з `./blocklist`
2. У handlers `PAGE_METADATA` та `TRACK_CAPTURED` — до `enqueuePending` / `saveTrackToDb` додає перевірку `isDomainBlocked(url)`
3. Додає handlers для нових message types: `BLOCKLIST_GET`, `BLOCKLIST_ADD`, `BLOCKLIST_REMOVE`

Новий `IncomingMessage` union:
```ts
type IncomingMessage = AuthMessage | SessionMessage | ContentMessage | SyncMessage | MusicMessage | BlocklistMessage;
```

### `extension/src/popup/index.html`

Нова секція `<!-- Blocklist -->` після `<!-- Notes -->`:
```html
<section class="popup__blocklist" id="blocklist-section">

  <!-- 4а: основний тоггл — поточний сайт -->
  <div class="popup__blocklist-header">
    <span class="popup__field-label">PRIVACY</span>
  </div>
  <div class="popup__blocklist-current">
    <span class="popup__blocklist-domain" id="current-domain">—</span>
    <label class="popup__toggle">
      <input type="checkbox" id="toggle-current-domain" />
      <span class="popup__toggle-track"></span>
    </label>
  </div>

  <!-- 4б: акордеон зі списком заблокованих -->
  <button class="popup__blocklist-accordion" id="btn-blocklist-accordion" hidden>
    <span id="blocklist-count-label">▾ 0 BLOCKED</span>
  </button>
  <div class="popup__blocklist-list" id="blocklist-list" hidden>
    <!-- dynamically filled: one .popup__blocklist-item per domain -->
  </div>

</section>
```

### `extension/src/popup/popup.ts`

1. Нові DOM refs: `currentDomainEl`, `toggleCurrentDomain`, `btnAccordion`, `blocklistCountLabel`, `blocklistList`
2. `sendBlocklist(msg: BlocklistMessage): Promise<BlocklistResponse>` — helper за патерном `sendAuth`/`sendSession`
3. `refreshBlocklist(currentHostname: string)`:
   - Викликає `BLOCKLIST_GET` → отримує масив заблокованих доменів
   - Оновлює `currentDomainEl.textContent = currentHostname`
   - Встановлює `toggleCurrentDomain.checked = domains.includes(currentHostname)`
   - Рендерить `blocklistList`: по одному `<div class="popup__blocklist-item">` на домен зі своїм `<input type="checkbox" checked>` та `<span>hostname</span>`
   - Оновлює `blocklistCountLabel` та показує/ховає акордеон
4. `toggleCurrentDomain` `change` handler:
   - `chrome.tabs.query({ active: true, currentWindow: true })` → hostname
   - `checked` → `BLOCKLIST_ADD`, `!checked` → `BLOCKLIST_REMOVE`
5. Делегований `change` на `blocklistList` для checkbox-ів кожного домену → `BLOCKLIST_REMOVE` при `!checked`
6. `btnAccordion` click → toggle `hidden` на `blocklistList`
7. `refreshBlocklist()` викликається у `init()` (одноразово при відкритті popup) та всередині `setInterval` у `startPolling()` — разом з іншими refresh-ами

### `extension/src/popup/popup.css`

Нові стилі:
- `.popup__blocklist` — секція (gap, border-top як у інших секцій)
- `.popup__blocklist-current` — flex row, `justify-content: space-between`, `align-items: center`
- `.popup__blocklist-domain` — `color: var(--c-text)`, truncate довгі домени (`max-width`, `overflow: hidden`, `text-overflow: ellipsis`)
- `.popup__toggle` / `.popup__toggle-track` — CSS-only toggle: pill `background: var(--c-muted)`, checked → `var(--c-pink)` (заблокований = червоний)
- `.popup__blocklist-accordion` — кнопка-рядок без border, `color: var(--c-muted)`, cursor pointer
- `.popup__blocklist-list` — стек `.popup__blocklist-item`
- `.popup__blocklist-item` — flex row між `<span>` доменом та `<label class="popup__toggle">`

---

## Порядок реалізації та коміти

### Коміт 1 — документація (апрув плану)
```
docs(plans): add AC7 privacy blocklist plan
```
Файли: `plans/week2/AC7-privacy-blocklist.md`

---

### Коміт 2 — storage-модуль + background handlers
```
feat(extension): blocklist storage module and background message handlers
```
Файли:
- `extension/src/types/blocklist.ts` — нові типи `BlocklistMessage` / `BlocklistResponse`
- `extension/src/background/blocklist.ts` — `getBlocklist`, `addDomain`, `removeDomain`, `isDomainBlocked`, `extractHostname`
- `extension/src/background/index.ts` — handlers `BLOCKLIST_GET/ADD/REMOVE` + подвійна перевірка у `PAGE_METADATA` та `TRACK_CAPTURED`

---

### Коміт 3 — фільтри у content scripts
```
feat(extension): filter blocked domains in content scripts before sending
```
Файли:
- `extension/src/content/index.ts` — `sendMetadata()` → async, перевірка blocklist до відправки
- `extension/src/content/ytm.ts` — перевірка blocklist до `TRACK_CAPTURED`
- `extension/src/content/soundcloud.ts` — перевірка blocklist до `TRACK_CAPTURED`

---

### Коміт 4 — popup UI
```
feat(extension): add privacy blocklist section to popup
```
Файли:
- `extension/src/popup/index.html` — секція PRIVACY (тоггл поточного сайту + акордеон)
- `extension/src/popup/popup.css` — CSS toggle pill, стилі секції та списку
- `extension/src/popup/popup.ts` — `sendBlocklist`, `refreshBlocklist`, handlers тогглів і акордеону

---

### Коміт 5+ — фікси (можливо кілька)
```
fix(extension): <конкретний опис після тестування>
```
> Можливо кілька fix-комітів після ручного тестування у Chrome (наприклад: race condition при першому завантаженні content script, некоректний hostname для chrome:// сторінок, тоггл не оновлюється при навігації між вкладками тощо).

---

## Що НЕ змінюється

- Dashboard (`/dashboard`) — жодних змін; blocklist — суто локальна функція розширення
- Manifest (`manifest.ts`) — жодних нових permissions; `storage` і `tabs` вже є
- Prisma schema — жодних змін; blocklist не синхронізується з сервером
- `background/sync.ts` — жодних змін; перевірка відбувається до потрапляння у чергу

---

## Definition of Done

- [ ] `blockedDomains` зберігається в `chrome.storage.local`
- [ ] Content script **не надсилає** `PAGE_METADATA` для заблокованих доменів
- [ ] Background **не ставить у чергу** `PAGE_METADATA`/`TRACK_CAPTURED` для заблокованих доменів
- [ ] Popup показує поточний статус (blocked/allowed) для активного сайту
- [ ] Popup показує назву домену поточної вкладки з тогглом (ON=червоний=заблокований)
- [ ] Тоггл поточного сайту блокує/розблоковує домен одним кліком
- [ ] Акордеон "▾ N BLOCKED" розкриває список всіх заблокованих доменів
- [ ] Напроти кожного домену у списку є тоггл — вимкнути тоггл = видалити домен зі списку
- [ ] `TypeScript strict` — немає `any`
- [ ] Збірка: `npm run build` у `/extension` проходить без помилок
