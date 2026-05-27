# Backlog: Tech debt from Week 3 AC 2 review

**Пріоритет:** low/medium, ергономіка та чистота коду
**Залежить від:** Week 3 AC 2 (merged)
**Статус:** не розпочато

---

## Контекст

Під час self-review гілки `feature/dashboard-event-feed` виявлено два пункти, які доцільно зробити **поза цією гілкою** — бо вони зачіпають код, що написаний раніше, або міняють контракт відразу в кількох роутах. Свідомо відкладено, щоб PR залишився сфокусованим на AC 2.

---

## 1. JWT-bibліотека уніфікація — `jose` всюди

### Зараз
- `dashboard/server/jwt.ts` має **дві** функції верифікації:
  - `verifyJwt(token)` — на `jose`, async, працює і в edge (middleware), і у Node (Server Components)
  - `requireUser(req)` — на `jsonwebtoken`, sync, Node-only, використовується у всіх Route Handler'ах (`/api/v1/events`, `/api/v1/sessions`, `/api/v1/tracks`)
- Один і той самий HS256 секрет валідується двома різними бібліотеками. Це працює (HMAC-SHA256 — стандарт), але:
  - `jsonwebtoken` + `@types/jsonwebtoken` — зайва runtime + типова залежність
  - дві шляхи верифікації — два місця де треба поправити при зміні алгоритму чи rotation logic
  - issue/sign все одно на `jsonwebtoken` (`server/auth.ts:issueJWT`) — половинчасто

### Бажано
- `requireUser(req)` стає `async`, всередині викликає `verifyJwt(token)` з `jose`
- Усі route handlers додають `await` (вони вже `async`)
- `issueJWT` переписується на `new SignJWT(...)` з `jose`
- `jsonwebtoken` + `@types/jsonwebtoken` видаляються з `package.json`

### Ризик
- Низький: підпис байт-у-байт сумісний (HS256 над тим самим секретом)
- Існуючий extension з валідним токеном залишається працювати — нічого не ротуємо
- Тестується через існуючий `POST /api/v1/events` з Bearer токеном extension'а

### Декомпозиція
```
1. refactor(server): port issueJWT and requireUser to jose
2. chore(deps): remove jsonwebtoken and @types/jsonwebtoken
3. test: regression — Bearer-flow from extension, cookie-flow from dashboard
```

---

## 2. QueryClient `.clear()` після logout

### Зараз
- `dashboard/app/dashboard/logout-button.tsx` шле `POST /api/auth/logout` → `router.replace("/login")` + `router.refresh()`
- `QueryClient` живе у `dashboard/app/providers.tsx` через `useState(() => new QueryClient(...))` — це singleton поки tab live
- Якщо user A вийшов, user B зайшов **у тій самій вкладці без перезавантаження** — TanStack кеш не очищується. user B на момент першого пасивного рендеру може побачити кеш від user A (доки `staleTime` не вийшов)

На практиці `router.refresh()` робить full Server Components re-render → новий prefetch → новий hydrate → старий кеш переписується. Але:
- Перед першим прибуттям свіжих даних може спалахнути stale UI (на 50-200 мс)
- TanStack-кеш для `["top-sessions"]` теж зберігається, бо queryKey не залежить від userId

### Бажано
- У `LogoutButton.onClick` додати `queryClient.clear()` (через `useQueryClient()`) перед `router.replace`
- Або (стійкіше): мати у QueryClient subscriber на `wt_session` cookie change і автоматично clear

### Ризик
- Дуже низький — це фронт-only
- Один новий рядок коду

### Декомпозиція
```
1. fix(dashboard): clear tanstack cache on logout
```

---

## Чому не зробили зараз

- **JWT**: зачіпає 4+ route handlers поза scope AC 2. PR має бути сфокусованим на стрічці подій. Окремий PR `chore: jwt unification` рев'юється легше і не блокує feature merge.
- **QueryClient clear**: код у `logout-button.tsx` фактично не змінений у цій гілці (тільки стиль кнопки). Логіка logout — це AC 1 territory. Краще додати окремою fix-гілкою щоб не розмивати focus AC 2.
