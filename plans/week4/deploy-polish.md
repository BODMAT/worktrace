# Week 4 AC 1–2: Deploy polish

**Пріоритет:** high — фінальний стан репо перед демо
**Залежить від:** всі попередні PR merged до development
**Статус:** в процесі
**Гілка:** `feat/week4-deploy-polish`

---

## Scope

### AC 1 — CI/CD (залишок)
GitHub Actions `ci.yml` вже є і покриває lint + typecheck. Branch protection rules налаштовані вручну. Автодеплой Vercel підключений через GitHub integration.
→ **Нічого робити в коді.**

### AC 2 — Deploy (залишок у коді)

1. **Extension `.zip`** — npm script `zip` в `extension/package.json` ✅
2. **README оновлення** ✅
3. **GitHub Actions release** — при мерджі в `main` автоматично білдить zip і публікує GitHub Release з asset
4. **`.env.example` перевірка** — вже актуальний (CRON_SECRET додано в попередньому PR) ✅

---

## Декомпозиція комітів

```
1. docs(plans): add week4 deploy-polish plan                      ✅
2. chore(extension): add zip script via PowerShell Compress-Archive ✅
3. docs(readme): update tech stack, zip instructions              ✅
4. chore(ci): release-extension.yml — auto GitHub Release on merge to main
```

---

## Деталі реалізації

### Zip script

`extension/package.json`:
```json
"zip": "npm run build && powershell -Command \"Compress-Archive -Path dist/* -DestinationPath worktrace-extension.zip -Force\""
```

`powershell` (Windows PowerShell) — доступний локально. У CI використовується `pwsh` (PowerShell Core) — доступний на ubuntu-latest.

### GitHub Actions release workflow

`.github/workflows/release-extension.yml`:
- Тригер: `push` до `main`
- Runner: `ubuntu-latest`
- Кроки: checkout → setup-node → `npm ci` → build → zip через `pwsh` → `gh release create`
- Тег: `extension-build-${{ github.run_number }}`
- Asset: `extension/worktrace-extension.zip`
- `GITHUB_TOKEN` — вбудований, не потрібен додатковий secret

---

## Рішення

- **PowerShell Compress-Archive** — системний інструмент, нуль залежностей; локально `powershell`, у CI `pwsh`
- **Zip не комітимо** — `*.zip` вже в кореневому `.gitignore`
- **GitHub Releases через CI** — `gh release create` вбудованою CLI, тег на основі `run_number`; кожен merge до `main` = новий release з актуальним zip
