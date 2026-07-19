# דוח אמת מלא — שיפור תאונות/תקלות (לפני ביצוע)

**תאריך:** 2026-07-18  
**סביבה שנבדקה:** `future-craft-core-STAGING`  
**סטטוס:** דוח + תוכנית בלבד — **אין שינוי קוד עד אישור מפורש**  
**עקרון:** התלבשות על Accidents/Faults הקיימים — ללא מודול תביעות

---

## חלק א׳ — תשובות מדויקות לסעיפי החובה (1–42)

### 1–3. כפתורי דיווח קיימים, מיקום, לאן מובילים

| מיקום | תווית | קובץ | יעד |
|--------|--------|------|-----|
| דשבורד נהג | דיווח תקלה / דיווח תאונה | `DriverDashboard.tsx` | `/faults` · `/accidents` (עם `plate`/`vehicleId` אם יש רכב) |
| Bottom nav נהג (מובייל) | תקלה | `BottomNav.tsx` | `/faults` |
| Sidebar נהג | דיווח תקלה · תאונה וחירום | `BottomNav.tsx` | `/faults` · `/accidents` |
| Sidebar מנהל | תקלות | `BottomNav.tsx` | `/faults` (אין פריט תאונות בניווט) |
| כרטיס רכב — **Vehicle Hub** | תקלה / תאונה / דיווח תאונה / תקלות | `VehicleHub.tsx` + `VehicleActionModal.tsx` | תקלה: מודאל או `/faults?…` · תאונה: `/accidents?…&action=new` |
| `VehicleDetailsPanel` | — | אין כפתור דיווח | — |
| מסך תקלות | FAB + | `Faults.tsx` | טופס באותו מסך |
| מסך תאונות | דיווח תאונה | `Accidents.tsx` | טופס באותו מסך |
| התראות / עזרה | קישורי דיווח | `Alerts.tsx`, `HelpButton.tsx` | `/faults` / `/accidents` |

**מסקנה לכרטיס רכב:** כבר קיימים כפתורי דיווח ב-**Vehicle Hub**. **אין צורך** להוסיף כפתור אדום חדש ב-`VehicleDetailsPanel` — יש להשתמש בקיים ב-Hub.

### 4–5. קבצי מסכים וטבלאות

| מסך | קובץ | טבלה |
|-----|------|------|
| תאונות | `src/pages/Accidents.tsx` | `public.accidents` |
| תקלות | `src/pages/Faults.tsx` | `public.faults` |
| טעינת היסטוריה בכרטיס רכב | `src/lib/vehicleHubData.ts` | אותן טבלאות לפי `vehicle_plate` |
| מעקב רכבים | `src/pages/VehicleTracking.tsx` + `src/lib/vehicleTrackingData.ts` | דגלים מ-`faults`/`accidents` לפי לוחית |

### 6. שדות `accidents` כיום

`id`, `date`, `vehicle_plate`, `driver_name`, `location`, `description`, `has_insurance`, `third_party`, `estimated_cost`, `images`, `status`, `notes`, `company_name`, `created_at`, `created_by`

### 7. שדות `faults` כיום

`id`, `serial_id`, `date`, `driver_name`, `vehicle_plate`, `fault_type`, `description`, `urgency`, `status`, `notes`, `company_name`, `created_at`, `created_by`, `images`,  
`towing_required`, `towing_approved`, `towing_approved_by`, `towing_approved_at`, `towing_completed`, `towing_completed_at`

### 8–11. `vehicle_id` / `driver_id`

| | תאונה | תקלה |
|--|--------|--------|
| `vehicle_id` אמיתי | **לא** — רק `vehicle_plate` טקסט | **לא** |
| `driver_id` אמיתי | **לא** — רק `driver_name` טקסט | **לא** |

### 12–13. מי פתח / הבחנה בין תפקידים

- נשמר: `created_by` (uuid משתמש).  
- **לא נשמר:** סוג משתמש שפתח (`driver` / `fleet_manager`).  
- **לא ניתן** כיום להבדיל בשורת האירוע בין:
  - מי שפתח את האירוע  
  - הנהג הקשור לאירוע  
  (שניהם יכולים להיות רק `driver_name` טקסט + `created_by`)

### 14. מה קורה בלחיצה על "שלח"

1. `INSERT` ל-`accidents` / `faults`  
2. Trigger → `driver_notifications` לכל `fleet_manager` בחברה  
3. `notify-accident-email` (תאונה תמיד; תקלה רק urgent/critical)  
4. אופציונלי: `recordVehicleHubAction` → שורת היסטוריה ב-`vehicle_tasks` (לא רשומת תקלה כפולה)  
5. Toast; **אין** מסך אישור עם מספר אירוע  
6. **אין** WhatsApp אוטומטי

### 15–16. התראה in-app

- יצירה: DB functions `notify_managers_on_fault` / `notify_managers_on_accident`  
- נמענים: כל `fleet_manager` עם `profiles.company_name` = חברת האירוע (לא כולל את היוצר)  
- תצוגה: `/driver-notifications` · סימון `is_read`

### 17–20. מייל / Resend / Gupshup

| נושא | מיקום |
|------|--------|
| מייל תאונה | `Accidents.tsx` → `functions.invoke('notify-accident-email')` |
| מייל תקלה | `Faults.tsx` → אותו Edge, `type: 'fault'`, רק urgent/critical |
| Resend | `supabase/functions/notify-accident-email/index.ts` (`RESEND_API_KEY`) |
| Gupshup | `supabase/functions/send-whatsapp-message/index.ts` + `src/lib/whatsappClient.ts` |

### 21–24. `whatsapp_enabled`

- שדה ב-`company_settings` — **לכל חברה בנפרד**  
- UI: `EmergencySettings.tsx`  
- שימוש היום: מסתיר/מציג `WhatsAppButton` (FAB חירום ב-Faults)  
- לדיווח: **לא מחובר**  
- **איך להשתמש בלי לפגוע בחירום:** אותו מתג ישמש גם כשער לשליחת WA אחרי דיווח; כבוי = אין WA בדיווח **וגם** אין FAB חירום (התנהגות קיימת). אם רוצים הפרדה בעתיד — מתג שני; כרגע אפשר לשתף בזהירות עם תיעוד.

### 25–26. אנשי קשר / נמענים

- **אין** רשימת אנשי קשר להתראות תאונה/תקלה  
- **אין** הגדרות נמענים per-ערוץ  
- נמענים קשיחים: כל מנהלי הצי + (חירום) `emergency_categories`

### 27–29. כרטיס רכב / נהג

| מקום | מצב |
|------|------|
| היסטוריית תקלות בכרטיס רכב (Hub) | **כן** — טאב תקלות מ-`faults` לפי לוחית |
| היסטוריית תאונות בכרטיס רכב (Hub) | **כן** — טאב תאונות |
| אירועים בכרטיס נהג (`Drivers.tsx`) | **לא** — אין רשימת תקלות/תאונות |

### 30. דשבורד מנהל — אירועים פתוחים

- `HomeDashboard`: כרטיס **מעקב רכבים** עם badge (כולל תקלות/תאונות פתוחות לפי לוחית)  
- `HomeAlertsWidget`: אפשרות slot "תקלות דחופות" (לא ברירת מחדל)  
- **אין** רשימת אירועים מפורטת עם מספר אירוע בדשבורד הבית  
- מסך `/faults` הוא סדר העבודה המלא של תקלות

### 31. סמן כנקרא / בטיפול / סגור

| פעולה | קיים? | איפה |
|--------|--------|------|
| סמן כנקרא | **כן** להתראה | `driver_notifications.is_read` |
| בטיפול | **כן** לתקלה | סטטוס `in_treatment` ב-Faults |
| סגור | **כן** | Faults: `closed`/`completed` · Accidents: `closed` |
| "לקחתי לטיפול" + מטפל | **חלקי** | סטטוס בלי שדה `assignee_id` |

### 32. Realtime לדשבורד

- `faults` ב-publication — **אין** subscription ברשימה  
- `fault_messages` — כן (צ'אט)  
- `driver_notifications` — polling 30 שנ'  
- `accidents` — לא ב-Realtime

### 33–34. סוגי תקלות

**קיים ב-UI (`Faults.tsx`):**  
מנוע · בלמים · צמיגים · חשמל · מיזוג · פחחות · תאורה · **אחר**

**"אחר":** כן קיים כערך ב-select; **אין** שדה טקסט נפרד לפרט ידני — נשמר כ-`fault_type='אחר'` והפירוט רק ב-`description` אם המשתמש כתב.

### מיפוי לרשימה הנדרשת

| נדרש | קיים? | פעולה מוצעת |
|------|--------|-------------|
| הרכב לא מניע | לא | הוספה לרשימה |
| הרכב נכבה | לא | הוספה |
| נורת אזהרה | לא | הוספה |
| התחממות מנוע | לא (יש מנוע) | הוספה ייעודית |
| תקלה במצבר | לא | הוספה |
| פנצ'ר | לא (יש צמיגים) | הוספה |
| תקלה בבלמים | כן כ"בלמים" | השאר / יישור תווית |
| תקלה בהגה | לא | הוספה |
| תקלה בגיר | לא | הוספה |
| תקלה במזגן | כן כ"מיזוג" | השאר |
| רעש חריג | לא | הוספה |
| נזילת שמן או מים | לא | הוספה |
| תקלה חשמלית | כן כ"חשמל" | השאר |
| נזק לרכב | כן כ"פחחות" בקירוב | הוספה / מיפוי |
| נדרשת גרירה | שדה `towing_required` נפרד | אפשר גם כסוג |
| הרכב מושבת | לא כסוג | הוספה |
| אחר + טקסט | אחר בלי שדה ייעודי | להוסיף `fault_type_other` או שימוש ב-description חובה |

**אין למחוק** את הערכים הקיימים — להרחיב את הרשימה ולמפות ישנים.

### 35–36. מספר סידורי / `serial_id`

- תאונות: **אין** מספר סידורי  
- תקלות: עמודה `serial_id` קיימת, **ריקה תמיד ביצירה**, משמשת רק אם איכשהו מולאה — **לא** מספר אירוע אוטומטי

### 37. מה כבר עובד — לא לשבור

- מסכי `/faults`, `/accidents`  
- כפתורי דיווח בדשבורד נהג + Hub  
- שמירה ל-DB + RLS לפי חברה  
- תמונות `MultiImageUpload`  
- in-app למנהלי צי  
- מייל Resend  
- סטטוסים/צ'אט/גרירה בתקלות  
- היסטוריה ב-Vehicle Hub לפי לוחית  
- מעקב רכבים קורא מאותה טבלת `faults`  
- `whatsapp_enabled` לחברה  
- Gupshup Edge

### 38. חיבורים חסרים (פערים)

1. `vehicle_id`, `driver_id`, `opened_by_role`  
2. מספר אירוע אוטומטי (`serial_id` / עמודה מקבילה לתאונות)  
3. מסך אישור אחרי שליחה  
4. מילוי אוטומטי מלא לנהג (טלפון, datetime מדויק IL)  
5. רשימת דיווחים אחרונים בדשבורד נהג  
6. היסטוריית אירועים בכרטיס נהג  
7. הגדרות ערוצים + נמענים לחברה  
8. WhatsApp אחרי דיווח (מאחורי המתג)  
9. תוכן התראות עם מספר אירוע + קישור עמוק  
10. deep-link אחרי login לאירוע  
11. assignee / "לקחתי לטיפול" מלא  
12. Realtime לרשימות (אופציונלי)  
13. יישור סטטוס `opened` מול מעקב רכבים (**באג קיים** — ראה חלק ג׳)  
14. מניעת כפילות שליחה חזקה + לוג ב-`system_logs`  
15. פרטי דליה במקום מרכזי אחד

### 39. קבצים צפויים לשינוי (כשיאושר)

`Faults.tsx`, `Accidents.tsx`, `VehicleActionModal.tsx`, `VehicleHub.tsx` / `vehicleHubData.ts` (תצוגת מספר אירוע), `Drivers.tsx` או פאנל נהג, `DriverDashboard.tsx`, `HomeDashboard` / alerts (מינימלי), `EmergencySettings.tsx` או `AlertSettings.tsx` / `companySettings`, `notify-accident-email`, אפשר Edge קטן להתראות, migration SQL, קבוע דליה מרכזי, `Login.tsx`/`App.tsx` ל-deep link, `vehicleTrackingData.ts` (יישור סטטוסים), `useDriverVehicle` / הרשאות רכב

### 40. טבלאות/שדות צפויים (migration)

**על `faults` + `accidents` (מומלץ):**  
`vehicle_id uuid`, `driver_id uuid`, `opened_by_role text`, `event_number text` (או שימוש ב-`serial_id` לתקלות + עמודה לתאונות), `reporter_phone text` (אופציונלי), `fault_type_other text`, אולי `assignee_id`

**על `company_settings`:**  
`incident_notify_in_app bool`, `incident_notify_email bool`, `incident_notify_whatsapp bool`,  
`incident_email_recipients text` / jsonb, `incident_whatsapp_recipients text` / jsonb  

או טבלת `company_incident_alert_settings` — מינימלית.

**לא:** טבלת `claims`.

### 41–42. מניעת כפילויות / מקור אחד

- כפתורים: שימוש ב-Hub הקיים + דשבורד נהג — **בלי** כפתור חדש אם לא חייבים  
- רשומה: רק `INSERT` אחד ל-`faults`/`accidents`; Hub/Tracking/דשבורד **קוראים** מאותה טבלה  
- `recordVehicleHubAction` נשאר לוג היסטוריה נפרד (לא תקלה שנייה) — לא ליצור insert כפול ל-`faults`  
- מספור: sequence/RPC אטומי per company+year+prefix

---

## חלק ב׳ — סעיף 28: מעקב רכבים → תקלות

### ממצאים

1. **כיצד תקלה נכנסת למעקב:**  
   `vehicleTrackingData.ts` טוען את כל `faults` של החברה; אם `status` בסטטוסי "פתוח" ולוחית תואמת → `has_open_fault=true` על הרכב. סינון "תקלות" במעקב מציג רכבים עם הדגל.

2. **האם הדיווח כבר יוצר רשומה שמופיעה שם:**  
   **כן בכוונה** — אותה רשומת `faults`. **אבל:** טופס `/faults` שומר `status: 'opened'`, בעוד רשימת הפתוחים במעקב היא  
   `new, open, in_progress, pending, חדש, פתוח, בטיפול` — **בלי `opened`**.  
   → דיווח חדש מהטופס עלול **לא** להופיע כתקלה פתוחה במעקב. זה באג/פער לתיקון ביישור סטטוסים.

3. **כפילות דיווח מול מעקב:**  
   אין רשומת תקלה כפולה. יש לוג היסטוריה ב-`vehicle_tasks` בנוסף — לא אותו דבר.

4. **מספר פנימי:**  
   `vehicles.internal_number` ("מספר פנימי"). מוצג במעקב ובכרטיס רכב.

5. **האם בכל החברות:**  
   השדה אופציונלי (`null`); לא כל רכב/חברה ממלאים.

6. **חיבור בלי רשומה נוספת:**  
   כבר מחובר דרך לוחית. אחרי הוספת `vehicle_id` — עדיף לקשר גם ב-id; בינתיים לתקן התאמת סטטוס `opened`.

7. **שינוי סטטוס במעקב:**  
   מעקב הוא **תצוגה**; שינוי סטטוס נעשה ב-`/faults` (או Hub). אחרי שינוי, רענון מעקב/Hub יראה את אותו סטטוס (אין עותק נפרד). Realtime מלא לדשבורד — חלקי.

**עיקרון מאושר:** דיווח תקלה = אותה רשומה במעקב → תקלות; אין הזנה כפולה.

---

## חלק ג׳ — הבהרות נוספות (27)

| נושא | מצב / המלצה |
|------|-------------|
| אישור לפני קוד | ממתין לאישורך המפורש |
| בידוד חברה | RLS לפי `company_name` — נשמר |
| מנהל צי ראשי | **לא מוגדר** במערכת; יש רק רשימת `fleet_manager`. לבחירת נמענים: להוסיף דגל `is_primary_fleet_manager` או רשימת אנשי קשר |
| מסך אישור אחרי שליחה | **חסר** — לבנות על המסך הקיים (dialog/view) בלי route חדש |
| Deep link אחרי login | **חסר** — `Login` תמיד ל-`/dashboard` |
| נהג בלי רכב | חלקי — להקשיח: בלי ניחוש, רק רכבים מורשים |
| לחיצה כפולה | `loading` בלבד — לחזק |
| Migration | חובה לפני שדות חדשים |
| מובייל | עדיפות; כפתורים קיימים בדשבורד/bottom nav |
| timezone IL | חלש — לתקן המרות תצוגה/שמירה |
| RLS | קיים; לעדכן עם עמודות חדשות |
| מייל/טלפון לא תקין | לא מטופל — לדלג + לוג |
| Secrets | Resend/Gupshup ב-Edge secrets — לא בקוד |
| בדיקות ללא שליחה אמיתית | Preview / flag `dry_run` / כבוי `VITE_ALLOW_REAL_WHATSAPP` |

---

## חלק ד׳ — רשימת פערים מדויקת (מול המטרה)

| # | דרישה | מצב |
|---|--------|-----|
| A | מספר אירוע אוטומטי | חסר |
| B | שיוך `vehicle_id` / `driver_id` | חסר |
| C | הבחנה פותח vs נהג קשור | חסר |
| D | מסך אישור עם מספר אירוע | חסר |
| E | מילוי אוטומטי מלא (טלפון, זמן IL) | חלקי |
| F | כרטיס נהג — היסטוריית אירועים | חסר |
| G | דשבורד נהג — דיווחים אחרונים | חסר |
| H | דשבורד מנהל — רשימת אירועים מפורטת | חלקי (מעקב/alerts/faults) |
| I | הגדרות ערוצים + נמענים | חסר |
| J | WA אחרי דיווח + מתג | חסר חיבור |
| K | תוכן מייל/WA עם מספר+קישור | חלקי (מייל בסיסי) |
| L | לוג שליחות | תשתית `system_logs` לא מחוברת |
| M | מעקב: סטטוס `opened` | **באג** |
| N | סוגי תקלות מורחבים + אחר עם טקסט | חלקי |
| O | Deep link | חסר |
| P | כפתור דיווח ב-Hub | **קיים — לא להוסיף כפול** |

---

## חלק ה׳ — תוכנית ביצוע קצרה (רק אחרי אישור)

### עקרונות
1. אין מסך תביעות / אין כפתורים כפולים ב-Hub.  
2. מקור אמת: `faults` / `accidents`.  
3. Staging + Git בלבד; אין שליחת WA/Email אמיתית בבדיקה.  
4. Preview הודעות במקום שליחה חיה.

### שלבים מוצעים
| שלב | תוכן | Migration? |
|-----|------|------------|
| 1 | Migration: FK ids, event_number/serial, opened_by_role, הגדרות התראה בחברה, יישור סטטוסים למעקב | כן |
| 2 | יצירת מספר אירוע אטומית + תצוגה בטפסים/רשימות/Hub | — |
| 3 | מילוי אוטומטי נהג + מניעת רכב לא מורשה + נעילת שליחה + מסך אישור | — |
| 4 | הרחבת סוגי תקלות + שדה "אחר" | — |
| 5 | כרטיס נהג + דיווחים אחרונים בדשבורד נהג (קריאה מאותן טבלאות) | — |
| 6 | חיבור התראות: הגדרות ב-Emergency/AlertSettings + Edge (מייל/WA) + לוג + dry-run | — |
| 7 | Deep link אחרי login | — |
| 8 | בדיקות Demo מובייל+דסקטופ, Preview הודעות, Commit+Push Git, **ללא Production** | — |

### מספור מומלץ
- פורמט: `ACC-2026-000001` / `FLT-2026-000001`  
- **נפרד לכל חברה + שנה** (מונע דליפת מספור בין לקוחות; ייחודיות עם unique על `(company_name, event_number)`)  
- תקלות: למלא `serial_id` באותו ערך **או** עמודה `event_number` בשתי הטבלאות לאחידות

### פרטי דליה
קובץ קבועים אחד לדוגמה `src/lib/daliaIncidentNotifyContacts.ts` (email + phone) — לא ב-UI לנהג; עריכה רק ל-super_admin דרך הגדרות/secrets לפי החלטה בביצוע.

### הערכת סיכון
בינוני-נמוך אם נשארים על טבלאות קיימות; הסיכון העיקרי הוא migration + תאימות לאחור לנתונים ישנים (ללא `vehicle_id` — backfill לפי לוחית כשאפשר).

---

## חלק ו׳ — מה לא ייעשה בביצוע זה

- מודול תביעות / שמאי / פוליסה / צד ג' מורחב  
- מסך הגדרות חדש אם אפשר להרחיב קיים  
- כפתור אדום חדש בכרטיס רכב (אלא אם Hub ייחשב לא נגיש — כרגע **לא**)  
- Deploy ל-Production / Hostinger  
- שליחת WhatsApp/Email אמיתית בבדיקה  
- מחיקת נתונים קיימים

---

## חלק ז׳ — החלטות שממתינות לאישורך

1. **לאשר תוכנית זו לביצוע ב-Staging?** (כן/לא)  
2. מספור: per-company+year (מומלץ) מול גלובלי?  
3. האם לשתף את `whatsapp_enabled` גם לדיווח (מומלץ) או מתג נפרד?  
4. היכן להוסיף הגדרות התראה: `EmergencySettings` / `AlertSettings` / שניהם?  
5. האם להוסיף דגל "מנהל צי ראשי" או רק רשימת אנשי קשר חופשית?

---

**אין שינוי קוד במסגרת דוח זה. ממתין לאישור מפורש לפני שלב הביצוע.**
