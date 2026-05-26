# Plan: Week 3 AC 1 — Dashboard Auth (middleware + Google login)

**Branch:** `feature/dashboard-auth-google-oauth`
**Closes:** Week 3 AC 1 ([docs/Task.md L87](../../docs/Task.md#L87))
**Status:** plan, awaiting review

---

## Scope

Веб-юзер логіниться у дашборд через **той самий** Google OAuth, що і extension у [Week 2 AC 1](../week2/AC1-auth.md), і отримує **JWT того ж формату** (HS256, payload `{ sub, email }`, секрет `JWT_SECRET`). Різниця тільки в transport-у: extension зберігає JWT у `chrome.storage.local`, дашборд — у HttpOnly cookie.

Сторінка `/login` запускає Google Identity Services (GIS) "Sign in with Google" → backend верифікує Google ID token і ставить cookie з нашим JWT. Middleware перевіряє cookie на кожному запиті до `/dashboard/*` і редіректить неавторизованих на `/login`.

---

## Commits (ordered)

```
1. docs(plans): add week 3 AC 1 dashboard auth plan
2. feat(dashboard): extract google-auth helper and add /api/auth/google + /api/auth/logout
3. feat(dashboard): add /login page with google identity services button
4. feat(dashboard): add middleware guarding /dashboard and a placeholder /dashboard page
5. fix(dashboard): address review feedback for week 3 AC 1   ← reserved, only if review requests changes
```

> **Convention** — commit 1 is "plan only", commit 5 is reserved для правок після код-рев'ю PR. Якщо рев'юер апрувить без зауважень — 5-й комміт не створюється.

---

## Files

| File | Action | Commit |
|---|---|---|
| `plans/week3/AC1-dashboard-auth.md` | **new** | 1 |
| `dashboard/server/auth.ts` | modify — rename `authenticateExtensionUser` → `authenticateGoogleUser` (extension-agnostic) | 2 |
| `dashboard/app/api/auth/extension/route.ts` | modify — update import name only | 2 |
| `dashboard/server/cookies.ts` | **new** — `SESSION_COOKIE`, `sessionCookieOptions()`, `clearedCookieOptions()` | 2 |
| `dashboard/app/api/auth/google/route.ts` | **new** — POST, web login (sets HttpOnly cookie) | 2 |
| `dashboard/app/api/auth/logout/route.ts` | **new** — POST, clears cookie | 2 |
| `dashboard/server/schemas/auth.ts` | modify — додати alias `WebAuthInput` = той самий шейп `{ googleToken }` | 2 |
| `dashboard/.env.example` | modify — додати `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | 2 |
| `dashboard/app/login/page.tsx` | **new** — Server Component layout + Client island for GIS button | 3 |
| `dashboard/app/login/google-button.tsx` | **new** — Client Component (renders GIS, posts to `/api/auth/google`, redirects) | 3 |
| `dashboard/types/google-identity.d.ts` | **new** — мінімальні types для `window.google.accounts.id` (замість `any`) | 3 |
| `dashboard/middleware.ts` | **new** — guard `/dashboard/:path*`, verify JWT via `jose`, redirect | 4 |
| `dashboard/server/jwt.ts` | modify — додати `verifyJwt(token: string)` (для middleware через `jose`) | 4 |
| `dashboard/app/dashboard/page.tsx` | **new** — placeholder (привітання + logout button) | 4 |
| `dashboard/app/dashboard/logout-button.tsx` | **new** — Client Component, POST `/api/auth/logout` → router.push("/login") | 4 |
| `dashboard/package.json` | modify — add `jose` | 4 |

---

## Design decisions

### 1. Той самий JWT для web і extension

`authenticateGoogleUser(googleIdToken): Promise<string>` — єдиний фасад на бекенді. Обидва вхідні роути (`/api/auth/extension` і `/api/auth/google`) викликають його однаково. JWT-payload не змінюється: `{ sub, email }`. Це й означає "один JWT" з ТЗ — токени фізично різні (різні сесії), але формат, секрет і authorize-логіка спільні: будь-який наш JWT валідний на будь-якому `/api/v1/*` через `requireUser()`.

### 2. JWT у HttpOnly cookie, не localStorage

```
Name:     wt_session
HttpOnly: true        // не доступний з JS — захист від XSS
Secure:   prod only   // dev на http://localhost
SameSite: lax         // дозволяє редіректи з GIS (top-level navigation)
Path:     /
MaxAge:   JWT_EXPIRES_IN у секундах (default 7d)
```

`maxAge` cookie і `expiresIn` JWT — однакові; рахуються через `ms()` хелпер (`ms` уже транзитивна залежність `jsonwebtoken`).

### 3. Google Sign-In: Google Identity Services (GIS), не OAuth redirect flow

GIS-бібліотека (`https://accounts.google.com/gsi/client`) рендерить кнопку "Sign in with Google" і повертає **готовий ID token** у JS-колбек. Це дозволяє:

- **повторно використати** наявний `verifyIdToken()` через `google-auth-library` (один і той самий `GOOGLE_CLIENT_ID`)
- **не плодити** callback роутів, authorization-code обміну, redirect-URI у Google Console
- `GOOGLE_CLIENT_SECRET` все ще **не потрібен** (як і у Week 2 AC 1)

Google Console required (manual setup, не в коді):
- існуючий `GOOGLE_CLIENT_ID` — вже **Web application** type, переюзаємо як є
- **Authorized JavaScript origins:** додати `http://localhost:3000` (dev) і `https://<vercel-url>` (prod)
- redirect URI не потрібні взагалі (GIS працює без них)

Клієнтська сторона потребує client ID у `<script>`-ініціалізації GIS — тому додамо `NEXT_PUBLIC_GOOGLE_CLIENT_ID` у `.env.example` (значення = `GOOGLE_CLIENT_ID`; дублювання нормальне, бо `NEXT_PUBLIC_*` експонується клієнту, а серверний — ні). Backend `verifyIdToken({ audience: GOOGLE_CLIENT_ID })` валідує його ж.

### 4. Middleware: edge runtime + `jose` для верифікації

`jsonwebtoken` — Node-only (`Buffer`, `node:crypto`), у edge runtime не запускається. Middleware за замовчуванням edge → потрібна edge-compatible JWT-бібліотека.

**`jose`** — бібліотека на Web Crypto API, працює і у Node, і у browser, і у edge. HS256-підпис, який видає `jsonwebtoken.sign`, валідується через `jose.jwtVerify(token, secret)` 1-в-1 (той самий HMAC-SHA256 над `JWT_SECRET`). На стороні видачі нічого не змінюється.

Розподіл:
- **видача** JWT — у Route Handlers (Node, `jsonwebtoken.sign` у `server/auth.ts:issueJWT`) — без змін
- **верифікація для API роутів** — Node, `jsonwebtoken.verify` у `requireUser(req)` — без змін
- **верифікація для middleware** — edge, новий експорт `verifyJwt(token)` у `server/jwt.ts` на `jose`

Один секрет `JWT_SECRET` обслуговує обидва шляхи верифікації. `jose` — єдине нове dep, імпортується тільки у `verifyJwt` (tree-shake до самого `jwtVerify`, ~12 KB у bundle).

### 5. Matcher і редірект

```ts
export const config = {
  matcher: ["/dashboard/:path*"],   // тільки /dashboard/* — login, /api, /, static — поза охороною
};
```

Якщо JWT відсутній/невалідний → `NextResponse.redirect(new URL("/login", req.url))`.
На сторінці `/login` додатково перевіряємо cookie у Server Component: якщо валідна — `redirect("/dashboard")` (щоб залогінений юзер не бачив форми логіну).

### 6. Logout

`POST /api/auth/logout` — лише ставить `wt_session` з `maxAge: 0`. Не торкається БД (JWT stateless, інвалідація через short TTL). Якщо колись знадобиться примусово вибивати юзера — додаємо `tokenVersion` у `User` і у JWT-claims; зараз out of scope.

### 7. `/dashboard` placeholder — мінімум

AC 1 закриває **тільки** auth, не event feed (це AC 2). Тому `/dashboard/page.tsx` — Server Component, який читає cookie, decode-ить (через `verifyJwt`), показує `Hello, ${email}` + кнопку Logout. Це достатньо щоб задемонструвати middleware і повний цикл login → guarded page → logout у demo.

---

## Verification checklist

### Backend
- [ ] `cd dashboard && npx tsc --noEmit` — без помилок
- [ ] `npm run build` — без помилок (включно з типами middleware)
- [ ] `POST /api/auth/google` без body → 400
- [ ] `POST /api/auth/google` з невалідним токеном → 401, cookie **не** виставляється
- [ ] `POST /api/auth/google` з валідним GIS credential → 200, `Set-Cookie: wt_session=…; HttpOnly; SameSite=Lax`
- [ ] `POST /api/auth/logout` → 200, `Set-Cookie: wt_session=; Max-Age=0`
- [ ] Існуючий `POST /api/auth/extension` — без регресій (той самий контракт, повертає `{ token }`)

### Middleware / pages
- [ ] `GET /dashboard` без cookie → 307 → `/login`
- [ ] `GET /dashboard` з expired/підробленим cookie → 307 → `/login` + cookie очищується
- [ ] `GET /dashboard` з валідним JWT → 200, рендер placeholder
- [ ] `GET /login` коли вже залогінений → 307 → `/dashboard`
- [ ] `GET /` (root) і `/api/*` — middleware **не** запускається (matcher)

### End-to-end
- [ ] Перший вхід через GIS button → cookie встановлено → редірект на `/dashboard` → ім'я/email юзера видно
- [ ] Той самий JWT (з DevTools → Application → Cookies → `wt_session`) використати як `Authorization: Bearer …` для `POST /api/v1/events` → 200 (доводить "один JWT" з ТЗ)
- [ ] Logout → cookie очищене → `/dashboard` знову редіректить на `/login`
- [ ] User у БД (`prisma studio`) — той самий запис, що і коли логіниться extension з того ж Google акаунту (`googleId` matches)

---

## Out of scope

- Event feed на `/dashboard` — Week 3 AC 2
- AI session report — Week 3 AC 3
- Sign-out на стороні extension при logout у вебі — JWT stateless, синхронізації не буде; додамо `tokenVersion` коли знадобиться (post-MVP)
- Refresh token / sliding session — 7d TTL достатньо для MVP (як домовлено у Week 2 AC 1)
- Error toasts на сторінці логіну — Week 3 бонус AC 5
- Animations переходів — Week 4 бонус AC 4
