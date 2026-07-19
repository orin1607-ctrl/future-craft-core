# Deploy Automation — הגדרה חד-פעמית

תהליך: **פיתוח → push `main` → Staging (GitHub Pages) → CI + Preview → אישור במסך Deploy → Production**

> **מקור אמת לסביבות + Secrets (שמות בלבד, סטטוס, בדיקות):**  
> [`docs/ENVIRONMENT-AND-SECRETS-HE.md`](./ENVIRONMENT-AND-SECRETS-HE.md)  
> בדיקת בריאות: `node scripts/check-environment-health.mjs` או Actions → **Environment Health**.

## 1. GitHub Secrets (Repository Settings → Secrets)

| Secret | ערך (לא לשמור בצ'אט) |
|--------|----------------------|
| `VPS_HOST` | כתובת VPS Hostinger |
| `VPS_USER` | משתמש SSH (לרוב `root`) |
| `VPS_SSH_KEY` | מפתח פרטי SSH ל-VPS |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | anon/publishable key של Production `qasomfndnjuixgjmjwcm` (Preview + Production builds) |
| `SUPABASE_SERVICE_ROLE_KEY` | service role production (לרישום deploy_runs) |
| `SUPABASE_ACCESS_TOKEN` | Personal Access Token של Supabase (CLI / Edge deploy) — חייב לעבור Management API |
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
- Production web root: `/root/future-craft-core/dist` → `dalia-car.online` (כפי ב-nginx + `deploy-production-vps.yml`)
- Backups לפני deploy: `/root/pre-deploy-dist-*.tgz`
- nginx SPA fallback על שני ה-vhosts

## 5. Workflows

| קובץ | מתי רץ |
|------|--------|
| `deploy-staging-pages.yml` | push `main` → GitHub Pages (Staging) |
| `dalia-ci-preview.yml` | push `main` → build + smoke + Preview VPS |
| `deploy-production-vps.yml` | push `main` + Environment Approve / Deploy UI |
| `deploy-edge-incident-notify.yml` | paths על Edge/migrations או `workflow_dispatch` (עם preflight Token) |
| `environment-health.yml` | push `main` + ידני — בדיקת Secrets/Edge בלי ערכים |
| `rollback-production-vps.yml` | `workflow_dispatch` / כפתור Rollback |
| `owner-golive-production.yml` | **ידני בלבד** — מסלול חירום מאושר Owner |
| `probe-*` / `test-*` | **ידני בלבד** — לא רצים על push |

## 5b. Edge Secrets (Staging + Production)

Dashboard → Project → Edge Functions → Secrets:

| Secret | Staging | Production |
|--------|---------|------------|
| `GUPSHUP_API_KEY` (+ SOURCE/APP) | נדרש ל-WA | **חובה** ל-WA חי |
| `RESEND_API_KEY` (+ FROM) | נדרש ל-Email | נדרש ל-Email חי |

פירוט מלא: `docs/ENVIRONMENT-AND-SECRETS-HE.md` §3.

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
