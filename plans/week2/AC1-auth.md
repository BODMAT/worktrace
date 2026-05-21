# Plan: Week 2 AC 1 — Auth Extension → Dashboard

**Branch:** `feature/extension-auth-google-oauth`
**Closes:** Week 2 AC 1 ([docs/Task.md L69](../../docs/Task.md#L69))
**Status:** plan, awaiting review

---

## Scope

Full authentication flow між Chrome Extension і Next.js Dashboard:

1. `chrome.identity.launchWebAuthFlow` → Google ID token
2. `POST /api/auth/extension` → dashboard верифікує token, повертає власний JWT
3. JWT зберігається в `chrome.storage.local` (service worker only)
4. Всі наступні API-запити йдуть через `apiFetch()` у service worker з `Authorization: Bearer <jwt>`

---

## Commits (ordered)

```
chore: update .env.example files with auth vars          ✅ done
feat(dashboard): add auth schema, server module and /api/auth/extension route
feat(extension): implement google oauth flow in service worker
feat(extension): add auth status and login/logout to popup
```

---

## Files

| File | Action | Commit |
|---|---|---|
| `dashboard/.env.example` | updated | ✅ done |
| `extension/.env.example` | updated | ✅ done |
| `dashboard/server/schemas/auth.ts` | **new** | commit 2 |
| `dashboard/server/auth.ts` | **new** | commit 2 |
| `dashboard/app/api/auth/extension/route.ts` | **new** | commit 2 |
| `extension/src/types/auth.ts` | **new** | commit 3 |
| `extension/src/manifest.ts` | modify — add `"identity"` | commit 3 |
| `extension/src/background/index.ts` | **rewrite** | commit 3 |
| `extension/src/popup/index.html` | modify | commit 4 |
| `extension/src/popup/popup.ts` | modify | commit 4 |

---

## Design decisions

### 1. Google OAuth: `launchWebAuthFlow` з `response_type=id_token`

`chrome.identity.getAuthToken` повертає access token — не верифікується через `google-auth-library.verifyIdToken()` без додаткового round-trip до Google.

`launchWebAuthFlow` з OIDC params дає справжній JWT ID token, що верифікується локально через публічні ключі Google. Redirect URL: `chrome.identity.getRedirectURL("auth")` → `https://<ext-id>.chromiumapp.org/auth`. ID token повертається у hash fragment.

```
const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
// response_type=id_token, scope=openid email profile, nonce=crypto.randomUUID()
```

### 2. JWT зберігається тільки в service worker

Popup і content script ніколи не бачать JWT — тільки надсилають повідомлення типу `AUTH_LOGIN / AUTH_LOGOUT / AUTH_GET_STATUS` до background і отримують статус.

### 3. Token expiry + auto-refresh в `ensureAuthenticated()`

При кожному `apiFetch` перевіряємо `jwtExpiresAt - 60s < now()`. Якщо прострочений — повний OAuth flow. Без окремого background timer (service worker зупиняється між запитами в MV3).

### 4. Dashboard: `server/auth.ts` — фасад з трьох кроків

```
verifyGoogleToken()  →  upsertUser()  →  issueJWT()
```

Публічний API — один метод `authenticateExtensionUser(googleIdToken): Promise<string>`. Route handler тільки парсить, валідує і викликає його.

### 5. `GOOGLE_CLIENT_SECRET` — не потрібен для AC 1

`OAuth2Client.verifyIdToken()` верифікує підпис через публічні JWK ключі Google. Secret знадобиться у Week 3 для authorization code flow в web dashboard.

---

## Verification checklist

### Dashboard
- [ ] `cd dashboard && npx tsc --noEmit` — без помилок
- [ ] `POST /api/auth/extension` без body → 400
- [ ] `POST /api/auth/extension` з невалідним токеном → 401
- [ ] `POST /api/auth/extension` з валідним Google ID token → 200 `{ token: "eyJ..." }`
- [ ] User з'явився/оновився в БД
- [ ] `OPTIONS /api/auth/extension` з extension origin → 204 + CORS headers

### Extension
- [ ] `cd extension && npm run build` — без помилок
- [ ] Розширення завантажується в `chrome://extensions` без помилок
- [ ] Клік Login → Google OAuth popup → авторизація → статус змінюється
- [ ] `chrome.storage.local.get(["jwt"])` у DevTools service worker → JWT присутній
- [ ] Повторний клік Login (JWT свіжий) → не відкриває OAuth popup
- [ ] Клік Logout → JWT видалено зі storage

---

## Out of scope

- JWT верифікація у Route Handlers (окрім `/api/auth/extension`) — Week 3 middleware
- Refresh token / sliding session — `7d` JWT достатньо для MVP
- Error toast у popup — Week 3 бонус AC 5
