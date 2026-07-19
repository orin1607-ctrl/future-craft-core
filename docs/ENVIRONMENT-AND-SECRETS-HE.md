# סביבת עבודה — מדריך קבוע (Git · Supabase · Secrets · Deploy)

**גרסה:** 2026-07-19  
**פרויקט:** `orin1607-ctrl/future-craft-core`  
**עקרון:** אין ערכי Secrets במסמך הזה — רק שמות, מיקום, ייעוד, ואופן בדיקה.

---

## 1) מפת סביבות

| סביבה | Frontend | Supabase ref | שם פרויקט (Dashboard) |
|--------|----------|--------------|------------------------|
| **Staging** | https://orin1607-ctrl.github.io/future-craft-core/ | `usfeoerkpcafxxlyuldl` | dalia-staging |
| **Preview** | http://preview.dalia-car.online | `qasomfndnjuixgjmjwcm` (Prod data) | dalia-new |
| **Production** | https://dalia-car.online | `qasomfndnjuixgjmjwcm` | dalia-new |
| **Legacy (לא לשימוש)** | מקומי `.env` ישן | `kuenhflklivaxrmqbsee` | — |

**כלל:** פיתוח Incident/Alerts → Staging. Preview = build של Prod על VPS נפרד. Production = Hostinger + אותו Supabase כמו Preview.

---

## 2) Git — מבנה עבודה קבוע

| Branch | תפקיד |
|--------|--------|
| `main` | ענף העבודה לפריסות CI (Staging Pages, Preview, תור Production) |
| `production` | **Default branch ב-GitHub** (היסטורי) — לא לבלבל עם `main` |
| `feat/*` | פיצ'רים; Staging Pages גם מ-`feat/incident-alerts-staging` |

### זרימת פריסה מומלצת

```
פיתוח → push ל-main
  → Deploy Staging (GitHub Pages)     [אוטומטי]
  → Dalia CI + Preview VPS            [אוטומטי]
  → בדיקה ב-Preview / Staging
  → Deploy Production (Environment)   [דורש Approve של orin1607-ctrl]
  → Deploy Edge (workflow_dispatch)   [דורש SUPABASE_ACCESS_TOKEN תקף]
```

### חסימות מכוונות (לא באגים)

| מנגנון | למה | איך מסדרים נכון |
|--------|-----|------------------|
| GitHub Environment **Production** + Required reviewers (`orin1607-ctrl`) | מונע deploy חי בלי אישור Owner | Owner לוחץ Approve ב-Actions; או מוסיף reviewer נוסף |
| `cursor[bot]` לא יכול Approve / `workflow_dispatch` | הרשאות GitHub App | לא לעקוף; להשתמש ב-push ל-`main` או Approve ידני |
| `owner-golive-production.yml` | מסלול חירום (מאושר בצ'אט) בלי Environment gate | להשאיר ל-`workflow_dispatch` בלבד — לא כברירת מחדל |

### Workflows קבועים (ייצור)

| Workflow | טריגר | תפקיד |
|----------|--------|--------|
| `deploy-staging-pages.yml` | push `main` / feature | Staging frontend |
| `dalia-ci-preview.yml` | push `main` | Build Prod + Preview VPS |
| `deploy-production-vps.yml` | push `main` + Environment | Production Hostinger |
| `deploy-edge-incident-notify.yml` | paths / `workflow_dispatch` | Edge `notify-accident-email` |
| `rollback-production-vps.yml` | `workflow_dispatch` | Rollback |
| `environment-health.yml` | push `main` + ידני | בדיקת תקינות Secrets (בלי ערכים) |
| `daily-marketing-engine.yml` | cron | שיווק |

Workflows מסוג `probe-*` / `test-wa-*` / ניסויים — **ידניים בלבד** (`workflow_dispatch`), לא רצים על כל push.

---

## 3) מטריצת Secrets (שמות בלבד)

### A) GitHub Repository Secrets

| שם | היכן | למי / מתי | למה | בדיקת תקינות |
|----|------|-----------|-----|---------------|
| `VPS_HOST` | GitHub → Settings → Secrets | CI Preview/Prod | כתובת Hostinger | `environment-health` / Preview deploy מצליח |
| `VPS_USER` | GitHub Secrets | CI | משתמש SSH | כנ״ל |
| `VPS_SSH_KEY` | GitHub Secrets | CI | מפתח SSH ל-rsync | כנ״ל |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | GitHub Secrets | Build Prod/Preview | anon key של Production | Bundle מצביע על `qasomfndnjuixgjmjwcm` |
| `SUPABASE_SERVICE_ROLE_KEY` | GitHub Secrets | CI (Prod בלבד) | deploy_runs / בדיקות API | JWT `role=service_role` + `ref=qasomfndnjuixgjmjwcm` |
| `SUPABASE_ACCESS_TOKEN` | GitHub Secrets | Edge deploy / Management API | `supabase functions deploy` | `npx supabase projects list` ≠ 401 |
| `GITHUB_PAT` | GitHub Secrets (+ Edge) | `deploy-control` | הפעלת workflow מתוך האפליקציה | dispatch מצליח |

**סטטוס ידוע (2026-07-19):**  
`SUPABASE_ACCESS_TOKEN` — **דורש טיפול** (קיים אך 401 Unauthorized).

### B) Supabase Edge Secrets — Staging (`usfeoerkpcafxxlyuldl`)

| שם | היכן | למה | בדיקה |
|----|------|-----|--------|
| `GUPSHUP_API_KEY` | Dashboard → Edge → Secrets | WhatsApp | `send-whatsapp-message` → `configured: true` |
| `GUPSHUP_SOURCE` / `GUPSHUP_APP_NAME` | כנ״ל | מקור/אפליקציה | כנ״ל |
| `RESEND_API_KEY` | כנ״ל | Email | notify / send-* לא מחזיר «not configured» |
| `RESEND_FROM` | כנ״ל | שולח | אופציונלי |
| `SUPABASE_SERVICE_ROLE_KEY` | אוטומטי בפרויקט | Edge פנימי | — |
| `GITHUB_PAT` | Edge (deploy-control) | Deploy UI | — |

**סטטוס ידוע:** Gupshup אמור להיות מוגדר ב-Staging (תיעוד קודם).

### C) Supabase Edge Secrets — Production (`qasomfndnjuixgjmjwcm`)

| שם | היכן | למה | בדיקה |
|----|------|-----|--------|
| `GUPSHUP_API_KEY` | Dashboard → Edge → Secrets | WhatsApp חי | `configured: true` |
| `GUPSHUP_SOURCE` / `GUPSHUP_APP_NAME` | כנ״ל | — | — |
| `RESEND_API_KEY` / `RESEND_FROM` | כנ״ל | Email חי | Edge לא נכשל על missing key |
| `GITHUB_PAT` | כנ״ל | deploy-control | — |

**סטטוס ידוע (2026-07-19):**  
`GUPSHUP_API_KEY` — **דורש טיפול** (`configured: false` ב-Production).  
`RESEND_API_KEY` — **כנראה תקין** ב-Edge ישן (הפונקציה עוברת את בדיקת המפתח).

### D) VPS Hostinger (`/root/dalia-ops/.env`)

| שם | היכן | למה | בדיקה |
|----|------|-----|--------|
| `SUPABASE_DB_PASSWORD` | VPS בלבד | Migrations דרך pooler | `psql` / `migrate.sh` מצליח |
| `SUPABASE_ACCESS_TOKEN` | VPS (אופציונלי) | CLI על השרת | `supabase projects list` |
| `OPS_*` | VPS | dalia-ops API | service פעיל על :7700 |

**סטטוס ידוע:** DB password קיים; Access Token ב-VPS ריק.

### E) מקומי (מחשב Orin / Cursor Desktop)

| קובץ / משתנה | ייעוד |
|--------------|--------|
| `.env.local` (מומלץ) | Staging או Prod לפי עבודה — **לא** legacy `kuenhfl…` |
| `SUPABASE_ACCESS_TOKEN` ב-shell profile | CLI מקומי לפריסת Edge |
| אין commit של service_role / access token | חובה |

---

## 4) מה היה חסר (סיכום אבחון)

1. `SUPABASE_ACCESS_TOKEN` ב-GitHub — פג תוקף / לא תקף → חוסם פריסת Edge.  
2. `GUPSHUP_API_KEY` לא מוגדר ב-Production Edge Secrets → חוסם WhatsApp חי.  
3. Default branch `production` מול pipelines על `main` → בלבול.  
4. עשרות workflows מסוג probe רצו על כל push → רעש וסיכון.  
5. `.env` מקומי מצביע לפרויקט legacy.  
6. אין מסמך Secrets אחד קנוני + בדיקת בריאות אוטומטית.  
7. מסלול `owner-golive` לצד Environment gate — צריך גבולות ברורים.

---

## 5) מה סודר במסמך / בקוד הזה

- מדריך קבוע זה + מטריצת Secrets.  
- `scripts/check-environment-health.mjs` — בדיקה בלי הדפסת ערכים.  
- Workflow `environment-health.yml`.  
- Edge deploy עם preflight Token.  
- Workflows מסוג probe/test → `workflow_dispatch` בלבד.  
- `owner-golive-production` → ידני בלבד.  
- דוגמאות `.env.staging.example` / `.env.production.example`.  
- עדכון `docs/deploy-automation-setup.md` עם קישור לכאן.

---

## 6) מה נשאר לטפל (Owner — פעם אחת, קבוע)

### חובה לפריסת Edge + WhatsApp Production

1. **Supabase Account → Access Tokens → Generate**  
   עדכן GitHub Secret `SUPABASE_ACCESS_TOKEN` (ואופציונלי VPS `dalia-ops/.env`).  
   בדיקה: Actions → Environment Health → Access Token = OK.

2. **Production Edge Secrets**  
   העתק מ-Staging (ב-Dashboard, לא דרך צ'אט) את:  
   `GUPSHUP_API_KEY`, `GUPSHUP_SOURCE`, `GUPSHUP_APP_NAME`  
   וודא `RESEND_API_KEY`.  
   בדיקה: `send-whatsapp-message` / `check_connection` → `configured: true`.

3. **פריסת Edge חדש**  
   Actions → Deploy Edge — incident notify → `production` (אחרי Approve אם נדרש)  
   או Staging קודם ואז Production.

### מומלץ ליציבות

4. ליישר Default branch ל-`main` **או** לתעד במפורש ש-`production` הוא רק archive.  
5. במחשב Orin: `.env.local` לפי `.env.staging.example` + `supabase login`.  
6. להוסיף GitHub Secret נפרד `STAGING_SUPABASE_SERVICE_ROLE_KEY` אם רוצים בדיקות Staging מ-CI (אופציונלי).

---

## 7) איך בודקים שהכול תקין (בלי Secrets בצ'אט)

```bash
# מקומי / CI
node scripts/check-environment-health.mjs

# או Actions
# Workflow: Environment Health Check → Run workflow
```

פלט צפוי כשהכול מסודר:
- `access_token: ok`
- `gupshup_production: configured`
- `frontend_production: new_bundle` (לא BlJXIgah)
- `edge_notify: new_or_live`

---

## 8) אנשי קשר לבדיקות שליחה

| ערוץ | נמען | הערה |
|------|------|------|
| WhatsApp | 0534338601 | דליה Owner |
| Email | orin1607@gmail.com | דליה Owner |

שליחות אמיתיות — רק אחרי Health ירוק + אישור Owner מפורש לדוגמה אחת.
