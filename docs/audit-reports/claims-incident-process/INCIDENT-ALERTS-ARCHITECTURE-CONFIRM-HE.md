# אישור ארכיטקטורה — מנגנון התראות אירועים (Staging)

**תאריך:** 2026-07-21  
**הקשר:** אחרי E2E UI מוצלח (`FLT-2026-000003`)  
**סביבה:** Staging בלבד · **לא Production**  
**עיקרון:** לא נבנה מנגנון חדש — רק שימוש / חיבור / תיקון של קיים

---

## 1. רכיבים קיימים ששימשו בבדיקת ה-E2E

| שכבה | רכיב קיים | נתיב / סמל |
|------|-----------|------------|
| מסך הגדרות | הגדרות התראות אירועים | `/alert-settings` · `src/pages/AlertSettings.tsx` |
| מסך יצירה | דיווח תקלה | `/faults` · `src/pages/Faults.tsx` |
| יצירת רשומה | שמירת תקלה + מספר אירוע | `createFaultIncident` · `src/lib/incidentCreate.ts` |
| שיגור התראות | קריאת הגדרות חברה + invoke | `dispatchIncidentNotifications` · `src/lib/incidentNotify.ts` |
| אנשי קשר דליה | מייל / WA קבועים | `DALIA_INCIDENT_CONTACTS` · `src/lib/daliaIncidentNotifyContacts.ts` |
| Edge | שליחת Email + WhatsApp + in-app | `notify-accident-email` · `supabase/functions/notify-accident-email/index.ts` |
| Email | Resend | API קיים בתוך אותו Edge |
| WhatsApp | Gupshup session text | אותו Edge → `api.gupshup.io/wa/api/v1/msg` · app `DaliaVehicle` · מקור `972546500305` |
| DB | אירוע | טבלה `faults` |
| DB | הגדרות | `company_settings.incident_notify_*` |
| DB | לוג משלוחים | `incident_notification_deliveries` |
| In-app מקביל | טריגר DB | `notify_managers_on_fault` (קיים) |
| DLR (אופציונלי) | Make → Edge | תרחיש DLR + `gupshup-webhook` |

**מה שהסקריפט עשה:** רק Playwright על הממשק (כמו משתמש) + אימות DB/רשת.  
**מה שהסקריפט לא עשה:** קריאה ישירה ל-Edge / Gupshup / Resend כשליחה.

---

## 2. האם נבנה מנגנון התראות חדש?

**לא.**

- אין Edge Function חדשה להתראות.
- אין טבלת משלוחים חדשה.
- אין מסלול UI חדש ל«התראות».
- אין אינטגרציה חדשה ל-WhatsApp/Email.
- בדיקת ה-E2E והדוחות/תורים (`wa-ui-alert-e2e-*`) הם כלי אימות בלבד — לא מנגנון התראות.

---

## 3. האם המסלול מבוסס רק על מה שכבר היה?

**כן.** המסלול הקנוני היה קיים לפני הבדיקה:

```text
UI (תקלה / תאונה)
  → createFaultIncident / createAccidentIncident
  → INSERT faults | accidents
  → dispatchIncidentNotifications
  → Edge notify-accident-email
  → Resend + Gupshup + driver_notifications
  → incident_notification_deliveries
```

מה שבוצע סביב הבדיקה: חיבור הגדרות חברה במסך (`אכבים` + ערוצים), אימות שרשרת, ותיקוני תשתית בוט/CI נפרדים — **לא** ארכיטקטורת התראות חדשה.

---

## 4. דוח שימוש — איפה במערכת מפעילים את אותו מנגנון?

### פעיל היום (אותו מנגנון: `dispatchIncidentNotifications` → `notify-accident-email`)

| מקום במערכת | מסלול | סטטוס |
|-------------|--------|--------|
| **פתיחת תקלה** | `/faults` → `createFaultIncident` | ✅ פעיל — זה מה שנבדק ב-E2E |
| **פתיחת תאונה** | `/accidents` → `createAccidentIncident` | ✅ פעיל — אותו Edge / אותן הגדרות |
| **תקלה/תאונה ממודאל רכב** | `VehicleActionModal` → אותם creators | ✅ פעיל |

הגדרות משותפות: `/alert-settings` → `incident_notify_in_app` / `incident_notify_email` / `incident_notify_whatsapp` + נמענים (`dalia` / `fleet_managers` / `both`).

### לא על אותו מנגנון (קיים אחרת / לא קיים)

| מקום | מה באמת קורה | אותו מנגנון? |
|------|----------------|---------------|
| **פתיחת תביעה** | אין מודול תביעות-אירוע שמפעיל `notify-accident-email` | ❌ לא קיים במסלול הזה |
| **אירוע חירום** | `/emergency` + `WhatsAppButton` → `wa.me` + `emergency_logs` | ❌ מנגנון נפרד (שיחה ידנית) |
| תזכורות תוקף / צי | `reminder_*` / התראות בית | ❌ לא `notify-accident-email` |
| בדיקת Gupshup בהגדרות | `send-whatsapp-message` | ❌ Edge אחר (בדיקה/פרוב) |
| בוט WhatsApp (צ'אט) | Make «Whatsapp Bot» `5797671` | ❌ מסלול נכנס נפרד (אותו מספר עסקי) |

### סיכום שימוש

המנגנון הנוכחי מוגדר ל־**אירועי צי: תקלה ותאונה** בלבד.  
תביעה / חירום **לא** עוברים דרכו היום. חיבור עתידי אליהם = הרחבה על אותו Edge/הגדרות — לא מנגנון חדש — ורק אחרי אישור Owner.

---

## 5. הפרדה נוכחית: התראות מערכת מול בוט צ'אט

| ממד | התראת מערכת | בוט צ'אט |
|-----|-------------|----------|
| כיוון | יוצא מ-Edge | נכנס → Make → AI → Gupshup |
| מספר עסקי | `0546500305` | **אותו מספר** |
| אפליקציית Gupshup | `DaliaVehicle` | **אותה אפליקציה** |
| תרחיש Make | DLR (סטטוסים) | Whatsapp Bot (הודעות) |

לכן תשובה להתראה עלולה כיום להיכנס לבוט — זו הסיבה לבקשת «חד-כיווני». אפיון השינוי: מסמך נפרד לאישור (ללא יישום עד אישור).
