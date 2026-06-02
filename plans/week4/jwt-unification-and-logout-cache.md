# Week 4: JWT unification + logout cache clear

**Пріоритет:** medium
**Залежить від:** Week 3 AC 1 (auth middleware + JWT), Week 3 AC 2 (event feed, logout button)
**Статус:** не розпочато
**Гілка:** `chore/jwt-unification`

---

## Контекст

Під час self-review гілки `feature/dashboard-event-feed` виявлено два пункти, свідомо відкладені щоб PR залишився сфокусованим. Обидва зачіпають код за межами тієї гілки.

---

## 1. JWT уніфікація — `jose` всюди

### Зараз

`dashboard/server/jwt.ts` має **дві** функції верифікації:
- `verifyJwt(token)` — на `jose`, async, працює в edge (middleware) і Node
- `requireUser(req)` — на `jsonwebtoken`, sync, Node-only, використовується у всіх Route Handler'ах

`issueJWT` у `server/auth.ts` теж на `jsonwebtoken`. Результат: один HS256 секрет обслуговується двома різними бібліотеками.

**Проблеми:**
- `jsonwebtoken` + `@types/jsonwebtoken` — зайві залежності
- два місця де треба правити при зміні алгоритму або rotation logic

### Після рефактору

- `issueJWT` → `new SignJWT(...).sign(...)` з `jose`
- `requireUser(req)` → async, викликає існуючий `verifyJwt(token)` з `jose`
- Усі Route Handlers де є `requireUser` — вже `async`, просто додається `await`
- `jsonwebtoken` + `@types/jsonwebtoken` видаляються

**Ризик:** низький. HS256 підпис байт-у-байт сумісний між бібліотеками. Існуючі токени в extension залишаються валідними — нічого не ротуємо.

---

## 2. `queryClient.clear()` після logout

### Зараз

`LogoutButton` → `POST /api/auth/logout` → `router.replace("/login")` + `router.refresh()`.

`QueryClient` — singleton поки tab жива. Якщо user A вийшов і user B зайшов у тій самій вкладці — TanStack кеш не очищується. До першого рефетчу user B може побачити дані user A (50–200 мс спалах).

### Після фіксу

`queryClient.clear()` через `useQueryClient()` перед `router.replace` — один рядок.

**Ризик:** дуже низький, фронт-only.

---

## Декомпозиція комітів

```
1. docs(plans): move post-week3 tech debt plan to week4
2. refactor(server): port issueJWT and requireUser to jose
3. chore(deps): remove jsonwebtoken and @types/jsonwebtoken
4. fix(dashboard): clear TanStack cache on logout
5. fix: post-manual-test corrections (після ручного тесту від юзера)
```

**Коміт 1** — тільки цей план, без коду.
**Коміти 2–4** — реалізація, typecheck і lint чисті перед кожним.
**Коміт 5** — резервний після ручного тесту: Bearer flow з extension, cookie flow з дашборду, logout з двох акаунтів у одній вкладці.

---

## Ручний тест (перед комітом 5)

1. Extension: відправити `POST /api/v1/events` з Bearer токеном → `201`
2. Dashboard: зайти через Google → відкрити `/dashboard` → дані є
3. Dashboard: натиснути Logout → зайти іншим акаунтом → переконатись що старих даних не видно
4. `npx tsc --noEmit` (dashboard) — чисто
5. `npm run lint` (dashboard) — чисто
