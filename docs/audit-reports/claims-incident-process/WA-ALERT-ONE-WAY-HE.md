# WhatsApp התראות חד-כיווניות — יישום Staging

**סטטוס:** ✅ עבר ב-Staging · **לא Production**  
**תאריך:** 2026-07-21  
**מנגנון חדש:** לא — חיבור רכיבים קיימים בלבד

---

## מה יושם

1. **שורת סיום בהודעת התראה** (`notify-accident-email` + preview):  
   `זוהי הודעת מערכת אוטומטית ואין להשיב לה.`

2. **בדיקת Message ID** ב-Edge הקיים `gupshup-webhook`:  
   `?check_system_alert=1&gsId=…&waId=…` → `incident_notification_deliveries`

3. **Make Whatsapp Bot `5797671`:**  
   Webhook → HTTP lookup → Normalize `alert_flag` → Router  
   - `alert_flag=yes` (Reply להתראה לפי Message ID) → SetVariable skip (בלי AI / בלי Gupshup 87)  
   - `alert_flag=no` (הודעה חדשה) → מסלול הבוט הקיים  

> הערה: `builtin:Ignore` לא בשימוש במסלול רגיל (רק ב-onerror) — Make דוחה אותו מחוץ ל-error handler.

---

## תוצאות E2E Staging (ריצה אחרונה)

| בדיקה | תוצאה |
|--------|--------|
| Reply להתראה (context Message ID) | ✅ אין AI · אין Gupshup 87 · ~1.3ש׳ · skip |
| הודעה חדשה «היי» | ✅ AI 84 + Gupshup 87 · ~4.6ש׳ |
| תרחיש Active | ✅ |
| תור Hook | ✅ ריק |
| Footer בקוד Edge | ✅ |
| Production | ✅ לא נגענו |

מקור: `public/project-001/wa-alert-one-way-result.json`

---

## Production

**לא בוצע.** ממתין לאישור מפורש.
