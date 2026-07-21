# אימות Secrets ב-Production — לפני «אשר Production»

**תאריך:** 2026-07-21  
**ריצה:** [Actions #29868047586](https://github.com/orin1607-ctrl/future-craft-core/actions/runs/29868047586)  
**Production ref:** `qasomfndnjuixgjmjwcm`  
**פריסת קוד:** **לא בוצעה** (רק בדיקת Secrets)

---

## תוצאה אחת ברורה

| שאלה | תשובה |
|------|--------|
| האם אין יותר חסמים טכניים ל-Production? | **לא.** עדיין יש חסם אחד קריטי. |
| אפשר לכתוב «אשר Production» עכשיו? | **לא מומלץ** עד השלמת `GUPSHUP_API_KEY` ב-Prod. |

---

## טבלת Secrets (שמות בלבד — ערכים לא נקראו ולא הודפסו)

| Secret | Production | Staging | חסם? | הערה |
|--------|------------|---------|------|------|
| `SUPABASE_ACCESS_TOKEN` (GitHub / Management API) | תקף · HTTP 200 · אורך 44 | — | **לא** | אימות פרויקטים הצליח |
| `RESEND_API_KEY` | **קיים** | קיים | **לא** | מייל מוכן ב-Prod |
| `RESEND_FROM` | חסר | חסר | **לא** | יש ברירת מחדל בקוד: `דליה מערכות <onboarding@resend.dev>` |
| `GUPSHUP_API_KEY` | **חסר** | קיים | **כן** | בלי זה WhatsApp ב-Prod לא יישלח |
| `GUPSHUP_APP_NAME` | חסר | קיים | רך | יש default בקוד (`DaliaVehicle`) — מומלץ להגדיר במפורש |
| `GUPSHUP_SOURCE` | חסר | חסר* | רך | יש default (`972546500305`) — מומלץ להגדיר במפורש |

\* Staging משתמש ב-default של המספר העסקי גם בלי Secret בשם.

### פרוב WhatsApp ב-Production

```text
configured: false
message: מפתח GUPSHUP_API_KEY לא הוגדר — הוסף אותו ב-Supabase Dashboard → Edge Functions → Secrets
app_name (default): DaliaVehicle
source (default): 972546500305
```

### מה ניסינו להשלים אוטומטית

| מקור | תוצאה |
|------|--------|
| GitHub Secrets (`GUPSHUP_API_KEY` וכו') | **לא קיימים** ב-repo secrets — אין מה להעתיק |
| סריקת VPS `.env` | SSH timeout ל-`72.60.36.182` — לא נמצא ערך |
| העתקה Staging → Prod | **בלתי אפשרית ב-API** — ערכי Secret לא ניתנים לקריאה |

---

## פעולה אחת שנשארת לך (Owner)

1. היכנס לפורטל Gupshup → app **`DaliaVehicle`** → העתק **API Key**  
   (אל תשלח בצ'אט — ראה `docs/OWNER-GUPSHUP-RECREATE-OR-RECOVER-HE.md`)
2. הדבק ב-Production בלבד:

   https://supabase.com/dashboard/project/qasomfndnjuixgjmjwcm/settings/functions

| Secret | ערך מומלץ |
|--------|-----------|
| `GUPSHUP_API_KEY` | מהפורטל (**חובה**) |
| `GUPSHUP_APP_NAME` | `DaliaVehicle` (מומלץ) |
| `GUPSHUP_SOURCE` | `972546500305` (מומלץ) |
| `GUPSHUP_APP_ID` | `496709e8-b5fc-4de9-9c75-bc87455482dd` (מומלץ) |

3. כתוב בצ'אט: **«סיימתי Gupshup»** — ואז נריץ אימות חוזר.  
4. **רק אחרי** `ready_for_production_deploy: true` — כתוב **`אשר Production`**.

---

## מה כבר מאומת (אין חסם)

- `SUPABASE_ACCESS_TOKEN` תקין ל-Management API  
- `RESEND_API_KEY` קיים ב-Production  
- `RESEND_FROM` לא נדרש כחסם (default בקוד)  
- Staging WhatsApp כבר עובד (המפתח שם קיים)  
- קוד Production **לא** נגענו בו בריצה זו  

---

## קבצי מערכת

- `public/project-001/prod-secrets-verify-summary.json`
- `public/project-001/prod-secrets-verify-result.json`
- `scripts/prod-secrets-verify.mjs`
