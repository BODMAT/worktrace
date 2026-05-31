# AC5 — Error Handling (Week 3 Bonus)

## Критерій

> Усі Route Handlers повертають типізовані помилки. UI показує toast-нотифікації при
> помилках мережі або валідації. Extension показує статус помилки синхронізації в popup.

---

## Аналіз поточного стану

### Route Handlers
Всі хендлери вже повертають `{ error: string | ZodTree }` з правильними HTTP-статусами,
але форма **не стандартизована**:
- Auth помилки: `{ error: string }` зі статусом 401
- Zod помилки: `{ error: z.treeifyError(parsed.error) }` — об'єкт замість рядка
- Domain помилки (SessionNotFoundError): `{ error: "Session not found" }` без коду
- Groq помилки: різні рядки, немає машино-читабельного `code` поля

Проблема: клієнт не може програмно розрізнити тип помилки без парсингу рядка.

### Dashboard UI
Вже є інлайн-стани помилок:
- `event-feed.tsx` → `<ErrorState>` (показує "Failed to load events" + Retry)
- `report-form.tsx` → `<ErrorPanel>` (показує повідомлення + Retry)
- Немає **глобального toast-провайдера** для ephemeral-нотифікацій

### Extension
**Вже виконано:** `popup.ts` показує `syncMeta` з текстом `error: ${res.lastError}` та
CSS-класом `popup__sync-meta--error`. Критерій AC5 для extension **вже задоволений**.

---

## Що робимо

### 1. Стандартизація API-помилок (server)

Новий файл `dashboard/server/api-error.ts`:

```typescript
export type ErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "SERVER_ERROR";

export interface ApiErrorBody {
  error: string;
  code: ErrorCode;
}
```

Хелпер `apiError(code, message, status)` → `NextResponse<ApiErrorBody>`.

Всі route handlers оновлюються:
| Ситуація | До | Після |
|---|---|---|
| `UnauthorizedError` | `{ error: msg }` 401 | `{ error: msg, code: "UNAUTHORIZED" }` 401 |
| Zod validation | `{ error: z.treeifyError(...) }` 400 | `{ error: "Validation failed", code: "VALIDATION_ERROR" }` 400 |
| `SessionNotFoundError` | `{ error: "Session not found" }` 404 | `{ error: "Session not found", code: "NOT_FOUND" }` 404 |
| Groq помилки | різні рядки | `{ error: msg, code: "SERVER_ERROR" }` з відповідним статусом |

Тип `ApiErrorBody` виноситься у `dashboard/types/api.ts` — shared між server і client.

### 2. Toast-система (dashboard UI)

**Один файл:** `dashboard/components/toast.tsx`

Містить:
- `ToastProvider` — context + стейт + рендер stack
- `useToast` — хук `{ error(msg), success(msg) }`
- `Toast` — UI компонент (fixed bottom-right, auto-dismiss 4s, max 3)

Стилі:
- `error` variant → рамка/текст `pink`
- `success` variant → рамка/текст `cyan`

**Wire-up у `dashboard/app/providers.tsx`:**
```typescript
// TanStack Query v5 — глобальний onError через QueryCache
const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => toast.error(error.message),
  }),
});
```

`ToastProvider` обгортає `QueryClientProvider` (щоб `useToast` був доступний всередині).

**Wire-up у компонентах:**
- `report-form.tsx` — при `status.kind === "error"` додатково викликати `toast.error(message)` (інлайн `ErrorPanel` залишається)
- `event-feed.tsx` — залишити `<ErrorState>`, тости приходять автоматично через QueryCache

### 3. Extension sync error (вже готово)

Стан помилки синхронізації вже відображається в popup:
```typescript
// popup.ts (рядок 178-183) — вже є
if (res.lastError) {
  syncMeta.textContent = `error: ${res.lastError}`;
  syncMeta.classList.add("popup__sync-meta--error");
}
```
Додаткових змін не потрібно.

---

## Файли для зміни / створення

| Файл | Дія |
|---|---|
| `dashboard/server/api-error.ts` | **create** — ErrorCode, ApiErrorBody, apiError() |
| `dashboard/types/api.ts` | **create** — re-export ApiErrorBody для client-side |
| `dashboard/app/api/auth/extension/route.ts` | update — apiError() |
| `dashboard/app/api/auth/google/route.ts` | update — apiError() |
| `dashboard/app/api/v1/events/route.ts` | update — apiError() |
| `dashboard/app/api/v1/sessions/route.ts` | update — apiError() |
| `dashboard/app/api/v1/tracks/route.ts` | update — apiError() |
| `dashboard/app/api/v1/tracks/[id]/route.ts` | update — apiError() |
| `dashboard/app/api/v1/sessions/[id]/route.ts` | update — apiError() |
| `dashboard/app/api/v1/sessions/top/route.ts` | update — apiError() |
| `dashboard/app/api/v1/events/stats/route.ts` | update — apiError() |
| `dashboard/app/api/v1/music/stats/route.ts` | update — apiError() |
| `dashboard/app/api/v1/user/settings/route.ts` | update — apiError() |
| `dashboard/app/api/v1/reports/generate/route.ts` | update — apiError() |
| `dashboard/components/toast.tsx` | **create** — ToastProvider, useToast, Toast UI |
| `dashboard/app/providers.tsx` | update — ToastProvider + QueryCache.onError |
| `dashboard/app/dashboard/reports/report-form.tsx` | update — toast.error() при помилці |

---

## Commit-план

```
feat(server): add typed API error helper and standardize route handlers   ← commit 2
feat(dashboard): add toast notification system                            ← commit 3
fix(...): post-review fixes після тестування                              ← commit 4+
```

> Commit 1 — цей план: `docs(plans): AC5 error handling plan`

---

## Обмеження / рішення

- **Zod treeifyError** вилучається з відповідей API — клієнт не повинен парсити
  вкладену zod-структуру. Замість цього: простий рядок + `code: "VALIDATION_ERROR"`.
- **Toast не замінює інлайн-стани** (ErrorPanel, ErrorState залишаються) —
  toast додатковий шар для ephemeral-нотифікацій і фонових помилок.
- **Без зовнішніх бібліотек** (react-hot-toast тощо) — мінімальна реалізація
  щоб не збільшувати bundle і лишатись в стилі проєкту.
- **Extension не змінюється** — sync error вже відображається.
