# Deploy Automation — הגדרה חד-פעמית

תהליך: **פיתוח → push `main` → Staging (GitHub Pages) → CI + Preview → אישור במסך Deploy → Production**

## 1. GitHub Secrets (Repository Settings → Secrets)

| Secret | ערך |
|--------|-----|
| `VPS_HOST` | `72.60.36.182` |
| `VPS_USER` | `root` |
| `VPS_SSH_KEY` | מפתח פרטי SSH ל-VPS |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | anon key של `qasomfndnjuixgjmjwcm` |
| `SUPABASE_SERVICE_ROLE_KEY` | service role production (לרישום deploy_runs) |
| `GITHUB_PAT` | Personal Access Token עם `actions:write` (ל-edge function deploy-control) |

## 2. GitHub Environment `production`

- Settings → Environments → **production**
- URL: `https://dalia-car.online`
- **Required reviewers**: המייל שלך
- כך כפתור "מאשר העלאה" מפעיל workflow עם אישור GitHub

## 3. Supabase (production `qasomfndnjuixgjmjwcm`)

```bash
# החל migration
npx supabase db query --linked -f supabase/migrations/20260617120000_deploy_runs.sql

# Edge function
npx supabase functions deploy deploy-control --project-ref qasomfndnjuixgjmjwcm
```

Secrets ב-Edge Functions:
- `GITHUB_PAT` — אותו PAT
- `GITHUB_REPO` — `orin1607-ctrl/future-craft-core` (אופציונלי)

## 4. VPS (כבר קיים)

- Preview: `/var/www/future-craft-core-preview` → `preview.dalia-car.online`
- Production: `/var/www/future-craft-core` → `dalia-car.online`
- nginx SPA fallback על שני ה-vhosts

## 5. Workflows

| קובץ | מתי רץ |
|------|--------|
| `deploy-staging-pages.yml` | push `main` → GitHub Pages (Staging) |
| `dalia-ci-preview.yml` | push `main` → build + smoke + Preview VPS |
| `deploy-production-vps.yml` | workflow_dispatch / כפתור Deploy |
| `rollback-production-vps.yml` | workflow_dispatch / כפתור Rollback |

## 6. מסך Deploy

`/dalia-settings/deploy` — super_admin בלבד

- מציג Staging / Preview / Production builds
- כפתור **מאשר העלאה ל-Production**
- כפתור **Rollback**

## זרימה (5 דקות)

1. `git push origin main`
2. המתן ~3 דק' — CI + Preview מתעדכן
3. בדוק `http://preview.dalia-car.online`
4. Dalia Settings → Deploy → **מאשר העלאה**
5. אשר ב-GitHub Environment (אם מוגדר)
6. דוח בטבלת deploy_runs + GitHub Actions

**אין ZIP · אין SSH ידני · אין WinSCP**
