# Plan: Week 2 AC 4 — Popup UI

**Branch:** `feature/extension-popup`
**Closes:** Week 2 AC 4 ([docs/Task.md L77](../../docs/Task.md#L77))
**Status:** plan, awaiting review

---

## Scope

**AC 4 — Popup UI:** відображає статус сесії, таймер, індикатор синхронізації, кнопку паузи, поле нотаток і тегів.

Також закриває **Gap 1** з AC 3 плану: `SESSION_PAUSE` / `SESSION_RESUME` — логіка в `session.ts`, тригер у попапі.

---

## Commits (ordered)

```
docs(plans): add week 2 AC 4 popup UI plan
feat(extension): add session pause/resume to session manager (Gap 1 from AC 3)
feat(extension): implement popup UI with session controls, timer, notes and tags (AC 4)
```

---

## Files

| File | Action | Commit |
|---|---|---|
| `plans/week2/AC4-popup.md` | **new** | commit 1 |
| `extension/src/types/session.ts` | modify — add `pausedAt`, `SESSION_PAUSE/RESUME` | commit 2 |
| `extension/src/background/session.ts` | modify — add `pauseSession`, `resumeSession` | commit 2 |
| `extension/src/background/index.ts` | modify — add PAUSE/RESUME message handlers | commit 2 |
| `extension/src/popup/index.html` | **rewrite** | commit 3 |
| `extension/src/popup/popup.css` | **rewrite** | commit 3 |
| `extension/src/popup/popup.ts` | **rewrite** | commit 3 |

---

## Design decisions

### 1. Pause/Resume — розширення Session

```ts
interface Session {
  id:            string;
  startedAt:     number;    // Unix ms, null поки на паузі
  totalActiveMs: number;    // накопичений час до паузи
  pausedAt:      number | null; // null = активна, число = на паузі
}
```

При паузі: `totalActiveMs += Date.now() - startedAt`, `pausedAt = Date.now()`, `startedAt` зберігаємо (для відновлення).
При відновленні: `startedAt = Date.now()`, `pausedAt = null`.

`getElapsedMs` враховує стан паузи:
```
якщо pausedAt → повертаємо totalActiveMs (фіксований)
інакше        → totalActiveMs + (Date.now() - startedAt)
```

### 2. Таймер у popup — polling через `setInterval`

Popup не може підписатися на зміни storage. Найпростіше рішення: `setInterval` кожну секунду надсилає `SESSION_GET_STATE` і оновлює DOM. Інтервал очищається при закритті попапа (`window.addEventListener("unload")`).

Альтернатива — `chrome.storage.onChanged` — складніша і надлишкова для таймера.

### 3. Нотатки — надсилаються як `NOTE_ADD` повідомлення

Кнопка "Додати нотатку" → `chrome.runtime.sendMessage({ type: "NOTE_ADD", text, tags })` → background зберігає в `pendingEvents` як `{ ...note, tags: ["note", ...userTags], timestamp }`. Вже узгоджено з Gap 3 з AC 3 плану.

Нотатка надсилається тільки якщо сесія активна (не на паузі і не зупинена).

### 4. Теги — comma-separated input

Поле `<input placeholder="tag1, tag2">` → `value.split(",").map(t => t.trim()).filter(Boolean)`. Прості, без autocomplete (AC 4 MVP).

### 5. Індикатор синхронізації

Відображає кількість `pendingEvents` з `chrome.storage.local` — це показує скільки подій чекають на AC 5 sync. Формат: `⏳ 12 events pending`. Оновлюється разом з таймером (той самий `setInterval`).

### 6. Структура popup HTML

```
┌─────────────────────────┐
│ WorkTrace          [●]  │  ← статус (active / paused / idle)
├─────────────────────────┤
│ 00:12:34                │  ← таймер
│ [▶ Start] [⏸ Pause]    │  ← або [■ Stop] залежно від стану
├─────────────────────────┤
│ ⏳ 5 events pending     │  ← sync indicator
├─────────────────────────┤
│ Note:  [____________]   │
│ Tags:  [____________]   │
│        [+ Add note]     │
└─────────────────────────┘
```

---

## Verification checklist

- [ ] `npx tsc --noEmit` — без помилок
- [ ] `npm run build` — без помилок
- [ ] Start → таймер тікає, статус "active"
- [ ] Pause → таймер зупиняється на поточному значенні, статус "paused"
- [ ] Resume → таймер продовжує з того ж місця
- [ ] Stop → таймер скидається, статус "idle"
- [ ] `SESSION_PAUSE` → `pausedAt` з'являється в `chrome.storage.local`
- [ ] Note + tags → з'являються в `pendingEvents` з `tags: ["note", ...]`
- [ ] Sync indicator показує реальну кількість `pendingEvents`

---

## Out of scope

- Фактична відправка подій на API — AC 5
- Стилізація анімацій — Week 4
- Autocomplete для тегів — Week 4
