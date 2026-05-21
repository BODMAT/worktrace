# Backlog: Email + Password Auth (альтернатива Google OAuth)

**Пріоритет:** обов'язково, після Week 2–3
**Залежить від:** Week 3 AC 1 (middleware + JWT вже є)
**Статус:** не розпочато

---

## Мета

Дати можливість реєструватись і логінитись через email + пароль без Google акаунту. Один акаунт на один email. Реєстрація підтверджується листом на пошту.

---

## Scope

### Dashboard (Next.js)

**Нові Route Handlers:**

| Endpoint                         | Що робить                                                                    |
| -------------------------------- | ---------------------------------------------------------------------------- |
| `POST /api/auth/register`        | Реєстрація: email + password → хеш → User у БД → надсилає verification email |
| `POST /api/auth/verify-email`    | Приймає токен з листа → позначає email як підтверджений                      |
| `POST /api/auth/login`           | email + password → перевіряє хеш → видає JWT                                 |
| `POST /api/auth/login/extension` | Те саме але для extension (повертає JWT в тілі відповіді)                    |

**Зміни в Prisma-схемі:**
```prisma
model User {
  // ... існуючі поля
  passwordHash      String?   // null якщо реєстрація через Google
  emailVerified     Boolean   @default(false)
  verificationToken String?   // одноразовий токен для підтвердження
  verificationExp   DateTime? // термін дії токену
}
```
→ потрібна міграція

**Нові server-модулі:**
- `dashboard/server/password.ts` — `hashPassword`, `verifyPassword` (bcrypt або argon2)
- `dashboard/server/mailer.ts` — SMTP клієнт (nodemailer), `sendVerificationEmail`

### Extension

Альтернативний UI в popup: форма email + password замість (або поруч з) "Sign in with Google".

---

## Технічний стек

| Що                | Пакет                                       |
| ----------------- | ------------------------------------------- |
| Хешування паролів | `bcryptjs` (pure JS, без native deps)       |
| SMTP              | `nodemailer`                                |
| Email-провайдер   | Mailtrap (dev) / Resend або SendGrid (prod) |

---

## SMTP — що треба налаштувати

**Dev (Mailtrap):**
```env
SMTP_HOST=sandbox.smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=<mailtrap-user>
SMTP_PASS=<mailtrap-pass>
SMTP_FROM=noreply@worktrace.dev
```
Mailtrap перехоплює всі листи — не відправляє реальним юзерам. Безпечно для розробки.

**Prod (Resend — безкоштовний tier: 3000 листів/міс):**
```env
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=<resend-api-key>
```

---

## Сценарій: реєстрація з підтвердженням email

```
1. Юзер вводить email + password → POST /api/auth/register
2. Сервер: bcrypt.hash(password) → зберігає User { emailVerified: false, verificationToken: uuid, verificationExp: now+24h }
3. Сервер: nodemailer надсилає лист з посиланням:
   https://worktrace.app/api/auth/verify-email?token=<uuid>
4. Юзер клікає посилання → GET /api/auth/verify-email?token=...
5. Сервер: перевіряє token + exp → User.emailVerified = true, видаляє token
6. Юзер логіниться: POST /api/auth/login → email + password → bcrypt.compare → JWT
```

---

## Сценарій: логін в extension

```
1. Popup показує форму: email + password
2. Юзер вводить → popup надсилає NOTE_ADD (або новий тип) до background
3. Background: POST /api/auth/login/extension { email, password }
4. Dashboard: верифікує → повертає { token: JWT }
5. Background: зберігає JWT в chrome.storage.local (той самий формат що і Google OAuth)
```

---

## Зміни в popup

Додати вкладки або toggle:
```
[Google] [Email]
─────────────────
Email:    [__________]
Password: [__________]
          [Sign In]
          [Register]
```

---

## Out of scope для цього backlog-item

- Forgot password / reset (окремий backlog)
- 2FA
- OAuth провайдери крім Google
- Rate limiting на auth endpoints (хоча бажано)

---

## Коли робити

Після Week 3 (коли middleware і JWT flow вже стабільні). Не блокує Week 2–3.
Орієнтовно: між Week 3 і Week 4, або як окремий PR після Week 4.
