# Plan: AC8 — Parsing Modes

**Branch:** `feature/extension-parsing-modes`  
**Scope:** Extension only — no dashboard changes needed.

---

## Мета

Надати користувачу контроль над тим, **що саме** content script витягує зі сторінки:

| Режим | Що збирається | Use-case |
|---|---|---|
| `full` | title + metaDescription + h1–h3 | дефолт; максимум контексту |
| `headings` | title + h1–h3 | статті/docs — структура важливіша за мету |
| `meta` | title + metaDescription | легкий режим; ніяких заголовків |

Режим зберігається в `chrome.storage.local`, застосовується в content script **після** фільтра blocklist, і перемикається прямо з popup.

---

## Аналіз поточного стану

| Точка | Файл | Поточна поведінка |
|---|---|---|
| Content script | `content/index.ts` | `parseMetadata()` завжди збирає title + metaDescription + всі h1–h3 |
| Background | `background/index.ts` | обробляє `PAGE_METADATA` — про режим не знає |
| Popup | `popup/index.html` + `popup.ts` | немає жодного контролю режиму |

---

## Архітектурні рішення

### 1. Де зберігати режим

`chrome.storage.local`, ключ `"parsingMode"`, дефолт `"full"` — зворотна сумісність.

### 2. Де застосовувати режим

**Тільки в content script** — `parseMetadata()` стає mode-aware. Background не знає про режим, отримує вже відфільтровані дані. Одне місце логіки.

### 3. Порядок перевірок у `sendMetadata()`

1. Читає `blockedDomains` + `parsingMode` **одним** `chrome.storage.local.get()` — один I/O замість двох
2. Перевіряє blocklist → заблоковано? → `return`
3. Визначає `effectiveMode`: якщо hostname в `MUSIC_HOSTNAMES` → завжди `"full"`, інакше — значення зі storage

### 4. Виняток для музичних сайтів

`music.youtube.com` і `soundcloud.com` **завжди парсяться у `full`** незалежно від глобального режиму.  
Реалізується як константа-множина в content script — нуль нових storage reads, нуль нових message types.

**Чому:** general content script збирає контекст сторінки на цих доменах (назва плейлиста, опис альбому), доповнюючи музичні content scripts. Обрізати цей контекст без користі для privacy немає сенсу.

### 5. `PageMetadata` — не змінюється

При `meta`-режимі `headings = []`, при `headings`-режимі `metaDescription = null`. Background, API та Prisma schema без змін.

### 6. Messages між popup і background

Два нові типи повідомлень: `PARSING_MODE_GET` та `PARSING_MODE_SET`. Патерн той самий що у blocklist.

### 7. UI у popup — сегментований контрол

Нова секція **CAPTURE** після PRIVACY/Blocklist з трьома кнопками у flex-ряд.  
Активна кнопка — cyan border + glow (стиль відповідає START-кнопці).  
Натиск оновлює UI оптимістично та надсилає `PARSING_MODE_SET`.  
`refreshParsingMode()` викликається в `init()` та в `setInterval` разом з `refreshBlocklist`.

---

## Нові файли

| Файл | Що містить |
|---|---|
| `extension/src/types/parsing.ts` | `ParsingMode` = `"full" \| "headings" \| "meta"`, union `ParsingModeMessage` (`GET`/`SET`), `ParsingModeResponse` |
| `extension/src/background/parsing.ts` | `getParsingMode()` — читає storage, повертає `"full"` за замовчуванням; `setParsingMode(mode)` — записує в storage |

---

## Зміни у існуючих файлах

### `extension/src/content/index.ts`

- `parseMetadata()` приймає `mode: ParsingMode` — при `meta` не збирає headings, при `headings` не збирає metaDescription
- `sendMetadata()` — об'єднаний storage read (blocklist + mode), логіка `MUSIC_HOSTNAMES` override, видалення окремої `isCurrentHostnameBlocked()`

### `extension/src/background/index.ts`

- Імпорти `ParsingModeMessage`, `ParsingModeResponse`, `getParsingMode`, `setParsingMode`
- `IncomingMessage` union розширюється `| ParsingModeMessage`
- Нові handlers `PARSING_MODE_GET` і `PARSING_MODE_SET` (після блоку blocklist-handlers)

### `extension/src/popup/index.html`

- Нова секція `<!-- Parsing Mode -->` після `<!-- Privacy / Blocklist -->`
- Мітка `CAPTURE` + три кнопки з `data-mode` атрибутом: `full`, `headings`, `meta`

### `extension/src/popup/popup.ts`

- Імпорт `ParsingMode` і нових message-типів
- DOM ref на групу кнопок
- `sendParsingMode()` — helper за патерном `sendBlocklist`
- `refreshParsingMode()` — викликає `PARSING_MODE_GET`, ставить клас `--active` на потрібну кнопку
- Delegated `click` на групі кнопок → `PARSING_MODE_SET` + оптимістичний UI update
- `refreshParsingMode()` викликається в `init()` та `setInterval`

### `extension/src/popup/popup.css`

- `.popup__parsing` — секція (flex column, gap, border-top як у інших секцій)
- `.popup__parsing-group` — flex row, gap між кнопками
- `.popup__parsing-btn` — кнопка зі стилем як у `.btn` але `flex: 1`, менший padding
- `.popup__parsing-btn--active` — cyan border + background + glow

---

## Порядок реалізації та коміти

| Коміт | Повідомлення | Файли |
|---|---|---|
| ✅ вже є | `docs(backlog): music track duration display bug` | — |
| 2 | `docs(plans): add AC8 parsing modes plan` | `plans/week2/AC8-parsing-modes.md` |
| 3 | `feat(extension): parsing mode storage module and background message handlers` | `types/parsing.ts`, `background/parsing.ts`, `background/index.ts` |
| 4 | `feat(extension): apply parsing mode in content script metadata collection` | `content/index.ts` |
| 5 | `feat(extension): add parsing mode segmented control to popup` | `popup/index.html`, `popup/popup.css`, `popup/popup.ts` |
| 6+ | `fix(extension): <конкретний опис після тестування>` | — |

> **Можливі edge cases для fix-комітів:** event delegation (`e.target` vs `currentTarget`) на кнопках; режим не підхоплюється content script при SPA-навігації; race між `setParsingMode` і наступним `sendMetadata`.

---

## Що НЕ змінюється

- Dashboard, Prisma schema, `background/sync.ts` — жодних змін
- `content/ytm.ts`, `content/soundcloud.ts` — не знають про `parsingMode`, завжди збирають тільки трек
- Manifest — нових permissions не потрібно (`storage` вже є)

---

## Definition of Done

- [ ] `"parsingMode"` зберігається в storage; дефолт `"full"`
- [ ] `full` — title + metaDescription + h1–h3
- [ ] `headings` — title + h1–h3; metaDescription = null
- [ ] `meta` — title + metaDescription; headings = []
- [ ] `music.youtube.com` і `soundcloud.com` завжди парсяться у `full`
- [ ] Content script читає blocklist + mode одним storage call
- [ ] Popup: сегментований контрол, активна кнопка виділена cyan
- [ ] Зміна режиму — миттєвий оптимістичний UI + збереження в storage
- [ ] Режим зберігається між перезавантаженнями extension
- [ ] TypeScript strict — немає `any`; `npm run build` без помилок
