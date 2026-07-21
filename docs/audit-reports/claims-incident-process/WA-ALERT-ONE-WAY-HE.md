# WhatsApp התראות חד-כיווניות — יישום Staging

**סטטוס:** מיושם ב-Staging · ממתין לתוצאות CI / אישור Owner לפני Production  
**תאריך:** 2026-07-21  
**מנגנון חדש:** לא — רק חיבור רכיבים קיימים

---

## מה יושם

1. **שורת סיום בהודעת התראה** (Edge `notify-accident-email` + preview ב-`incidentNotify.ts`):  
   `זוהי הודעת מערכת אוטומטית ואין להשיב לה.`

2. **בדיקת Message ID** ב-Edge הקיים `gupshup-webhook` (GET):  
   `?check_system_alert=1&gsId=…&waId=…`  
   → חיפוש ב-`incident_notification_deliveries` לפי `provider_message_id` (לא לפי טלפון/תוכן).

3. **Make Whatsapp Bot `5797671`:** אחרי Webhook → HTTP lookup → Router  
   - Reply להתראת מערכת (`is_system_alert=true`) → `builtin:Ignore` (בלי AI / בלי Gupshup תשובה)  
   - אחרת → מסלול הבוט הקיים

---

## בדיקות Staging (CI: `wa-alert-one-way.yml`)

| בדיקה | יעד |
|--------|-----|
| Reply להתראה (context.gsId = Message ID) | אין AI · אין שליחת Gupshup 87 |
| הודעה חדשה «היי» | בוט ממשיך (AI / Gupshup) |
| תרחיש Active | כן |
| תור Hook | ריק אחרי הבדיקה |

תוצאות: `public/project-001/wa-alert-one-way-summary.json`

---

## Production

**לא בוצע.** אין deploy ל-Production עד אישור מפורש.
