# Owner Actions — רשימה סופית בלבד

**תאריך:** 2026-07-19  
**עקרון:** רק פעולות שדורשות את חשבון ה-Owner (Supabase / GitHub / Edge Secrets).  
כל מה שבשליטת הסוכן (Git, Workflows, Docs, Health, Rollback, Staging) — **כבר מסודר**.

לאחר שתסיים את הפעולות למטה, כתוב בצ'אט: **«סיימתי Owner Actions»** — ואז הסוכן ישלים פריסת Edge + בדיקת WhatsApp/Email האמיתית (רק אחרי אישורך לשליחה אחת).

---

## פעולה 1 — רוטציית `SUPABASE_ACCESS_TOKEN`

1. **למה נדרשת**  
   ה-Token ב-GitHub Secrets קיים אך נדחה (HTTP 401) מול Management API. בלי Token תקף אי אפשר לפרוס Edge Functions (`notify-accident-email`) ל-Staging/Production.

2. **איפה מבצעים**  
   1. https://supabase.com/dashboard/account/tokens → **Generate new token**  
   2. https://github.com/orin1607-ctrl/future-craft-core/settings/secrets/actions → Secret בשם `SUPABASE_ACCESS_TOKEN` → **Update** עם הטוקן החדש  
   3. (אופציונלי) ב-VPS: `/root/dalia-ops/.env` → אותה מפתח `SUPABASE_ACCESS_TOKEN=`

3. **כמה זמן**  
   כ־2–3 דקות.

4. **מה יקרה אחרי**  
   Actions → **Environment Health** יעבור את שלב ה-Token. הסוכן יוכל לפרוס Edge ל-Staging אוטומטית / ב-CI.

---

## פעולה 2 — Secrets של Gupshup ב-Production Edge

1. **למה נדרשת**  
   Production Edge מחזיר `GUPSHUP_API_KEY is not configured`. בלי זה WhatsApp חי לא יישלח. (העתקה מ-Staging ב-Dashboard — לא דרך צ'אט.)

2. **איפה מבצעים**  
   1. Staging: https://supabase.com/dashboard/project/usfeoerkpcafxxlyuldl/settings/functions → **Edge Function Secrets** — העתק את הערכים של:  
      `GUPSHUP_API_KEY`, `GUPSHUP_SOURCE` (או שם המקור אצלכם), `GUPSHUP_APP_NAME`  
   2. Production: https://supabase.com/dashboard/project/qasomfndnjuixgjmjwcm/settings/functions → **Secrets** → הדבק את אותם שמות  
   3. ודא שגם `RESEND_API_KEY` (ו־`RESEND_FROM` אם קיים) מוגדרים ב-Production — אם כבר קיימים, אין צורך לגעת.

3. **כמה זמן**  
   כ־3–5 דקות.

4. **מה יקרה אחרי**  
   בדיקת Health / `send-whatsapp-message` לא תדווח יותר «not configured». מוכן לשליחת WhatsApp אחרי פריסת Edge החדש.

---

## פעולה 3 — Approve לפריסת Edge ל-Production

1. **למה נדרשת**  
   Workflow `deploy-edge-incident-notify` ל-Production משתמש ב-GitHub Environment **production** עם Required reviewer. רק Owner (`orin1607-ctrl`) יכול לאשר. הסוכן לא יכול Approve.

2. **איפה מבצעים**  
   אחרי שפעולות 1–2 הושלמו והסוכן מריץ / מבקש deploy:  
   GitHub → **Actions** → הרצה ממתינה (waiting) של **Deploy Edge — incident notify** (target: production)  
   → לחץ **Review deployments** → **Approve**.

   לחלופין: הרץ ידנית  
   Actions → **Deploy Edge — incident notify** → Run workflow → `production` → ואז Approve.

3. **כמה זמן**  
   כ־1 דקה (הפריסה עצמה ~1–2 דקות אחרי האישור).

4. **מה יקרה אחרי**  
   Edge `notify-accident-email` ב-Production יהיה בגרסה החדשה (Incident Alerts). Health dry_run יראה צורה חדשה (`channels` / `would_send` וכו').

---

## פעולה 4 — אישור לשליחת בדיקה חיה אחת (WhatsApp + Email)

1. **למה נדרשת**  
   שליחה אמיתית לנמענים חיים דורשת אישור Owner מפורש. הסוכן לא ישלח בלי זה.

2. **איפה מבצעים**  
   בצ'אט Cursor, אחרי שהסוכן מאשר ש-Health ירוק ו-Edge חדש ב-Production, כתוב במפורש לדוגמה:  
   **«מאשר שליחת בדיקה אחת: WhatsApp ל-0534338601 + Email ל-orin1607@gmail.com»**

3. **כמה זמן**  
   כ־30 שניות לכתוב את האישור; השליחה עצמה דקות בודדות.

4. **מה יקרה אחרי**  
   הסוכן יריץ את הבדיקה החיה, יאמת לוגים ב-`incident_notification_deliveries`, ויסגור את המשימה עם דוח תוצאות.

---

## מה לא ברשימה (בכוונה)

| נושא | למה לא Owner |
|------|----------------|
| סידור Git / Branches / Workflows / Docs / Health | כבר בוצע ב-`main` |
| Staging Pages / Preview CI | אוטומטי מ-`main` |
| Rollback path | תוקן בקוד |
| פריסת Edge ל-Staging | הסוכן אחרי פעולה 1 |
| העתקת ערכי Secrets לצ'אט | אסור — רק Dashboard |
| שינוי Default branch ל-`main` | אופציונלי ליציבות; לא חוסם WA/Email |

---

## סדר מומלץ

```
1 Token → 2 Gupshup Prod → כתוב «סיימתי Owner Actions»
         → הסוכן: Health + Edge Staging
         → 3 Approve Edge Production
         → הסוכן: אימות Health ירוק
         → 4 אישור שליחה חיה אחת
         → סגירת משימה
```
