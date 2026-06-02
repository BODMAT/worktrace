# Week 4 AC 1–2: Deploy polish

**Пріоритет:** high — фінальний стан репо перед демо
**Залежить від:** всі попередні PR merged до development
**Статус:** не розпочато
**Гілка:** `feat/week4-deploy-polish`

---

## Scope

### AC 1 — CI/CD (залишок)
GitHub Actions `ci.yml` вже є і покриває lint + typecheck. Branch protection rules налаштовані вручну. Автодеплой Vercel підключений через GitHub integration.
→ **Нічого робити в коді.**

### AC 2 — Deploy (залишок у коді)

1. **Extension `.zip`** — скрипт пакування `dist/` у `worktrace-extension.zip` + npm script `zip`
2. **README оновлення:**
   - Прибрати `jsonwebtoken` з tech stack (замінено на `jose`)
   - Прибрати "AI — LLM provider TBD (Week 3)" — вже використовується Groq
   - Оновити секцію **Deploy** — реальні інструкції як завантажити `.zip` в Chrome
   - Прибрати "Chrome Web Store packaging is scheduled for Week 4 AC 2" — не робимо
   - Прибрати Week 1-specific коментарі з Setup секції
3. **`.env.example` перевірка** — вже актуальний (CRON_SECRET додано в попередньому PR)

---

## Декомпозиція комітів

```
1. docs(plans): add week4 deploy-polish plan
2. chore(extension): add zip script to package.json, gitignore *.zip
3. docs(readme): update tech stack, deploy instructions, remove stale Week 1 notes
```

---

## Деталі реалізації

### Zip script (крок 2)

В `extension/package.json` додати:
```json
"zip": "npm run build && cd dist && zip -r ../worktrace-extension.zip ."
```

На Windows `zip` може не бути — використати cross-platform альтернативу через Node або PowerShell.
Варіант: `"zip": "npm run build && node ../scripts/zip-extension.js"` — окремий скрипт.

Або простіше — просто задокументувати в README як зробити zip вручну (одна команда), без додаткового скрипту.

**Рішення:** додати `zip` script через `bestzip` (cross-platform npm пакет, нуль конфігурації).

### README зміни (крок 3)

**Tech stack — до:**
```
- **Backend** — ..., `jsonwebtoken`
- **AI** — LLM provider TBD (Week 3): OpenAI / Groq / Gemini / OpenRouter
```

**Tech stack — після:**
```
- **Backend** — ..., `jose`
- **AI** — Groq (llama-3.3-70b-versatile), з можливістю вказати власний API ключ
```

**Deploy — додати:**
```
### Завантажити extension локально
1. Скачай `worktrace-extension.zip` з Releases
2. Розпакуй у будь-яку папку
3. chrome://extensions → Developer mode → Load unpacked → обери розпаковану папку
```

---

## Рішення

- **`bestzip` для zip** — один пакет, працює на Windows/Mac/Linux без системного `zip`
- **Zip не комітимо** — додати `*.zip` в `.gitignore` (або `worktrace-extension.zip`), артефакт генерується локально перед деплоєм
- **GitHub Releases** — zip завантажується вручну як release asset після деплою, не через CI (поза scope)
