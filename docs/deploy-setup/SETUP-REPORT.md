# דוח הגדרת Deploy — מצב נוכחי

**תאריך:** 2026-06-16  
**שרת:** `root@72.60.36.182` (Ubuntu 24.04)

---

## מה בוצע מ-Cursor (אוטומטית)

| פעולה | סטטוס |
|--------|--------|
| יצירת זוג מפתחות SSH ל-GitHub Actions | ✅ בוצע |
| נתיב מפתח פרטי (מקומי) | `C:\Users\MY-PC\.ssh\github-actions-dalia` |
| נתיב מפתח ציבורי | `docs/deploy-setup/github-actions-dalia.pub` |
| בדיקת SSH לשרת | ❌ נכשל — המפתח **לא רשום עדיין** ב-VPS |
| בדיקת PasswordAuthentication על השרת | ❌ לא ניתן — אין גישה לשרת |
| הזנת GitHub Secrets | ❌ לא ניתן — `gh` לא מחובר |
| Deploy ל-Production | ❌ **לא בוצע** |
| שינוי קבצים ב-Production | ❌ **לא בוצע** |

---

## חסימה יחידה

**יש להוסיף את המפתח הציבורי ל-VPS** — בלי זה לא GitHub Actions ולא SSH מהמחשב יעבדו.

### אפשרות א' — Hostinger Browser Terminal (מומלץ)

1. hPanel → VPS → **Browser Terminal**
2. הדבק והרץ את התוכן מ-`docs/deploy-setup/HOSTINGER-ADD-SSH-KEY.sh`

### אפשרות ב' — hPanel → SSH Keys

1. hPanel → VPS → **SSH Keys** → Add
2. הדבק את השורה מ-`docs/deploy-setup/github-actions-dalia.pub`

---

## GitHub Secrets — איפה ומה להכניס

**מיקום:** https://github.com/orin1607-ctrl/future-craft-core/settings/secrets/actions → **New repository secret**

| Secret | ערך |
|--------|-----|
| `VPS_HOST` | `72.60.36.182` |
| `VPS_USER` | `root` |
| `VPS_SSH_KEY` | תוכן **מלא** של הקובץ `C:\Users\MY-PC\.ssh\github-actions-dalia` (כולל `-----BEGIN OPENSSH PRIVATE KEY-----`) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | anon key מ-[Supabase Production API](https://supabase.com/dashboard/project/qasomfndnjuixgjmjwcm/settings/api) — אותו ערך כמו ב-`DEPLOYMENT.md` |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role מ-[אותו דף](https://supabase.com/dashboard/project/qasomfndnjuixgjmjwcm/settings/api) — **אל תשתף בצ'אט** |

---

## GitHub Environment (אישור לפני Production)

**מיקום:** https://github.com/orin1607-ctrl/future-craft-core/settings/environments

1. צור Environment בשם: `production`
2. URL: `https://dalia-car.online`
3. **Required reviewers:** המייל שלך
4. כך Deploy ל-Production **לא ירוץ** בלי אישור ידני ב-GitHub

---

## אימות: Production מוגן מ-Deploy אוטומטי

| Workflow | מתי רץ | נוגע ב-Production? |
|----------|--------|-------------------|
| `deploy-staging-pages.yml` | push `main` | ❌ רק GitHub Pages |
| `dalia-ci-preview.yml` | push `main` | ❌ רק `/var/www/future-craft-core-preview` |
| `deploy-production-vps.yml` | **רק** `workflow_dispatch` + אישור Environment | ✅ כן — **רק אחרי אישור** |
| `rollback-production-vps.yml` | **רק** `workflow_dispatch` + אישור | ✅ rollback — **רק אחרי אישור** |

**אין workflow שמעלה ל-Production אוטומטית על push.**

---

## איך לבדוק שזה עובד (אחרי הוספת המפתח ל-VPS)

### 1. מהמחשב (PowerShell)

```powershell
ssh -i "$env:USERPROFILE\.ssh\github-actions-dalia" root@72.60.36.182 "echo OK && hostname"
```

צפוי: `OK` + שם השרת

### 2. GitHub Actions — בדיקה יבשה (בלי Production)

1. הוסף את כל ה-Secrets
2. Actions → **Dalia CI — Tests + Preview** → Run workflow (אחרי commit+push של הקוד)
3. ודא ש-job `deploy-preview` עובר
4. פתח `http://preview.dalia-car.online` — bundle חדש

### 3. Production — רק כשאתה מאשר

1. Actions → **Deploy Production** → Run workflow
2. GitHub יבקש **אישור** ב-Environment `production`
3. רק אחרי Approve — יעלה ל-`dalia-car.online`

---

## מה נשאר לך ידנית (רשימה קצרה)

1. ✅ הוסף SSH public key ל-VPS (פקודה אחת ב-Browser Terminal)
2. ✅ הזן 5 Secrets ב-GitHub
3. ✅ צור Environment `production` עם Required reviewers
4. ✅ בדוק SSH מהמחשב (`echo OK`)
5. ⏳ אחרי אישורך: Commit + Push של קוד האוטומציה
6. ⏳ Supabase: migration `deploy_runs` + deploy `deploy-control` (Cursor יכול אחרי אישור)

---

## Supabase (נפרד מ-GitHub Secrets)

| פריט | איפה |
|------|------|
| `GITHUB_PAT` (לכפתור Deploy במסך) | Supabase → Edge Functions → Secrets |
| migration `deploy_runs` | Supabase SQL או `supabase db query` |

**לא נוגע בנתונים — רק טבלת מעקב Deploy.**
