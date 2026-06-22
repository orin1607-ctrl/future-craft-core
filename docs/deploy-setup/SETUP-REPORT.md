# דוח הגדרת Deploy — מצב נוכחי

**תאריך:** 2026-06-16 (עודכן אחרי הוספת מפתח)  
**שרת:** `root@72.60.36.182` (Ubuntu 24.04)  
**Commit:** `0a6786b` על `main` (נדחף ל-GitHub)

---

## מה בוצע מ-Cursor (אוטומטית)

| פעולה | סטטוס |
|--------|--------|
| יצירת זוג מפתחות SSH ל-GitHub Actions | ✅ |
| בדיקת SSH מהמחשב אחרי הוספת מפתח | ❌ **עדיין נדחה** — השרת לא מקבל את המפתח |
| הזנת GitHub Secrets | ❌ `gh` לא מחובר — דורש `gh auth login` |
| Environment `production` | ❌ לא נוצר — דורש `gh auth login` |
| Commit + Push קוד אוטומציה | ✅ `0a6786b` |
| Deploy ל-Production | ❌ **לא בוצע** |

---

## חסימה #1 — SSH (דחוף)

המחשב שולח מפתח `SHA256:LtTQ3mIOtB/Ke4iQAaXflVsDj5ONGo7uufDpCoEaIB8` אבל השרת דוחה אותו.

**הרץ ב-Browser Terminal את:** `docs/deploy-setup/HOSTINGER-FIX-SSH-KEY.sh`  
(מתקן הרשאות, מסיר שורות שבורות, מוסיף מחדש את המפתח הנכון)

אחרי זה מהמחשב:
```powershell
ssh -i "$env:USERPROFILE\.ssh\github-actions-dalia" root@72.60.36.182 "echo OK"
```

---

## חסימה #2 — GitHub Secrets + Environment

`gh` לא מחובר במחשב. אחרי `gh auth login` הרץ:

```powershell
cd C:\Users\MY-PC\Desktop\future-craft-core
.\docs\deploy-setup\set-github-secrets.ps1
```

או ידנית ב-[Secrets](https://github.com/orin1607-ctrl/future-craft-core/settings/secrets/actions):

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
