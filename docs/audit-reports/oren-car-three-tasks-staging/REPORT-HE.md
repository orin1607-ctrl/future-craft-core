# Oren Car — 3 משימות Staging — דוח התאמה (v2)

**תאריך:** 2026-08-08  
**סביבה:** Staging בלבד (`usfeoerkpcafxxlyuldl`)  
**ענף:** `feat/incident-alerts-staging`  
**Build:** `index-CdY9Tx4D.js` — הצלחה  
**Unit tests:** 40/40 עברו (כולל `vehicleExpiryReminders.test.ts`)  
**Migration / Deploy / Push:** **לא בוצעו** — ממתינים לאישור נפרד

---

## סיכום מנהלים

| משימה | סטטוס קוד | הערה |
|-------|-----------|------|
| 1 — ניווט מדויק + UUID | ✅ מיושם | תאונה: רק לטאב (אין ID ב-Hub) |
| 2 — טסט 30/7/1 בלבד | ✅ מיושם | 57 יום לטסט → **אין** התראת טסט |
| 3 — מתג ביטוח | ✅ מיושם | כולל FleetOS; ממתין ל-Migration לעמודה ב-DB |

---

## משימה 1 — ניווט מדויק (UUID)

### התנהגות לפי סוג התראה

| סוג | יעד deep-link | מזהה |
|-----|---------------|------|
| **טסט** | כרטיס רכב → בית → גיליון `ביטוחים ורישיונות` → פוקוס `test` | `vehicleId` (UUID) |
| **ביטוח** | אותו גיליון → פוקוס `insurance` | `vehicleId` |
| **רישיון** | גיליון `מסמכים` → פוקוס `license` | `vehicleId` |
| **תקלה** | `/faults?id=FAULT_UUID&vehicleId=...` | `fault.id` + `vehicleId` |
| **ליקוי** | `/vehicle-tasks?id=TASK_UUID&vehicleId=...` | `vehicle_tasks.id` |
| **טיפול** | `/service-orders?orderId=ORDER_UUID&vehicleId=...` | `service_orders.id` |
| **חוסר** | גיליון `חוסרים והתראות` + `hubEntityId=GAP_TASK_UUID` | `vehicle_tasks.id` |
| **שינוע** | גיליון `שינוע` | `vehicleId` |
| **תאונה** | כרטיס רכב → פעולות → טאב `accidents` | `vehicleId` בלבד |

**מגבלה ידועה — תאונה:** אין כיום מסך תאונה בודד בתוך Hub; הקישור הכי מדויק האפשרי בלי מערכת חדשה הוא טאב התאונות של הרכב.

**מסכים:** מעקב רכב (`TrackingFleetList`), דף התראות (`Alerts.tsx`), FleetOS — כולם משתמשים ב-UUID לניווט.

### רכב 917 — חקירה עסקית

**שני רכבים נפרדים** עם `internal_number = "917"` בקיבוץ בארי:

| UUID | לוחית | טסט | ימים לטסט |
|------|-------|-----|-----------|
| `3e1c6145-d7c0-4224-bf99-29272f591633` | 8080064 | 2026-12-11 | 125 |
| `3378a2db-6492-44d8-82e9-577444c49794` | 15094302 | 2026-10-04 | **57** |

**מסקנות:**
- **שניהם שייכים לקיבוץ בארי** — `company_name = 'קיבוץ בארי'` בשני הרשומות.
- **אין אילוץ ייחודיות** על `internal_number` ב-DB (לא UNIQUE per company).
- **18 קבוצות** של מספרים פנימיים כפולים בבארי (למשל 13, 30, 31, 42, 43, 917…) — **בעיית איכות נתונים**, לא באג כפילות התראות.
- **מספר פנימי אמור להיות ייחודי?** מבחינה עסקית — כן, בדרך כלל; מבחינה טכנית — המערכת מאפשרת כפילות (ייבוא/הזנה ידנית).
- **לא נמחק שום רכב.** ניווט והתראות משתמשים ב-**UUID** — לחיצה על התראה של 15094302 תפתח את הרכב הנכון לפי לוחית/UUID, לא לפי "917" בלבד.

**שורש הבעיה המקורית:** קוד ישן במעקב השתמש בסף **60 יום** קבוע לטסט; 15094302 (~57 יום) הופיע. זה **לא ביטוח**.

---

## משימה 2 — טסט: 30 / 7 / 1 בלבד

### מנגנון (`expiryReminderTier`)

```
ימים לתפוגה > 30  →  אין התראת טסט
ימים 30–8         →  צ'יפ "טסט · התראת 30 יום"
ימים 7–2          →  צ'יפ "טסט · תזכורת 7 ימים"
ימים 1, 0, שלילי  →  צ'יפ "טסט · תזכורת יום אחד"
```

**מה המשתמש רואה בין השלבים:**
- **בין 30 ל-7:** מוצגת **התראת 30** (טקסט וצ'יפ ברמת 30) — ההתראה נשארת גלויה, אבל **התווית משתנה** ל-7 כשמגיעים ליום 7, ול-1 ביום האחרון.
- **בין 7 ל-1:** מוצגת **תזכורת 7** — עד יום 2 כולל.
- **יום 1 ומטה:** **תזכורת יום אחד** (כולל פג תוקף).

**אין 60. אין 90.** `alert_days_before` בבארי נשאר **30** — Migration **לא** משנה אותו.

### רכב 917 / 15094302

- 57 ימים לטסט → `expiryReminderTier(57)` = `null` → **לא מופיע** בהתראות טסט.
- Unit test מאשר: 57, 60, 90 → `null`.

### היכן מיושם

| מקום | 30/7/1 |
|------|--------|
| `vehicleTrackingAlerts.ts` | ✅ |
| `Alerts.tsx` (טסט/ביטוח) | ✅ |
| `fleetosData.ts` (מ-alert_items) | ✅ |
| `fleetAlerts.ts` (וידג'ט בית) | סף לפי `daysBefore` בהעדפות (ברירת מחדל 30) |

---

## משימה 3 — מתג התראות ביטוח

### כשהמתג כבוי (`insurance_alerts_enabled = false`)

| מקום | התנהגות |
|------|---------|
| `vehicleTrackingAlerts` | ללא התראת `insurance` |
| `vehicleTrackingData` / מעקב רכב | ללא ביטוח ב-alert_items |
| `Alerts.tsx` | מדלג על ביטוח חובה/מקיף/צד ג׳ |
| `fleetAlerts.ts` | מדלג על סלוטי ביטוח |
| `fleetosData.ts` | **רק** `alert_items` מסוג insurance **וגם** `insurance_alerts_enabled` |
| `VehicleDashboard` | ללא `hasInsuranceGap`, ללא ספירת מסמכי ביטוח באדום |
| `vehicleDashboardData.buildInsuranceGaps` | מחזיר `[]` |
| `vehicleDashboardData.buildMissingDocuments` | לא מוסיף חוסרי פוליסת ביטוח |
| `VehicleDetailsPanel` | תאריכים נשארים; צבע אזהרה ניטרלי (לא אדום) |
| `Vehicles.tsx` (התראות push פנימיות) | מדלג על שדות ביטוח |

**נשאר גלוי:** תאריכי ביטוח, מסמכים, פרטי רכב — ללא מחיקה.

**לא מושפע:** טסט, רישיון, תקלות, טיפולים, שינוע, חוסרים אחרים.

### קיבוץ בארי

לאחר Migration (טרם הוחל): כל 299 הרכבים יקבלו `insurance_alerts_enabled = false` כברירת מחדל.

---

## Migration (מוכן — לא הורץ)

**קובץ:** `supabase/migrations/20260808120000_vehicle_insurance_alerts_toggle_staging.sql`

```sql
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS insurance_alerts_enabled boolean NOT NULL DEFAULT true;
UPDATE vehicles SET insurance_alerts_enabled = false WHERE company_name = 'קיבוץ בארי';
-- alert_days_before ללא שינוי
```

**סטטוס DB:** עמודה `insurance_alerts_enabled` **עדיין לא קיימת** ב-Staging (אומת 2026-08-08).

---

## Build / Tests

| בדיקה | תוצאה |
|-------|--------|
| `npm run build` | ✅ |
| `npm test` | ✅ 40/40 |
| Baseline JSON | `docs/audit-reports/oren-car-three-tasks-staging/report.json` |

---

## QA חי (ממתין)

Deploy + Migration נדרשים לבדיקה חיה ב-Staging Pages. קוד מקומי מוכן; לא נדחף.

---

## אישור בטיחות

| משאב | שונה? |
|------|-------|
| Production / Hostinger / VPS / Nginx | **לא** |
| Production DB / dalia-car.online | **לא** |
| Migration Staging | **לא** (מוכן בלבד) |
| Deploy Staging | **לא** |

---

# מבנה דוח עדכון

## מה נבנה

1. **ניווט מדויק** — כל סוג התראה מקשר לאזור/פריט הרלוונטי עם **UUID**; סינון לפי סוג במעקב.
2. **טסט 30/7/1** — מנגנון `expiryReminderTier` בכל שכבות ההתראות; 57 יום = ללא התראת טסט.
3. **מתג ביטוח per-vehicle** — שער `isInsuranceAlertsEnabled` בכל נקודות חישוב/הצגה/שליחה של ביטוח, כולל FleetOS.

## איפה זה נמצא

- `src/lib/vehicleExpiryReminders.ts` + tests
- `src/lib/vehicleTrackingAlerts.ts`
- `src/lib/vehicleInsuranceAlerts.ts`
- `src/lib/entityNavContext.ts` (deep links)
- `src/pages/Alerts.tsx`, `src/modules/fleetos/fleetosData.ts`
- `src/components/vehicle-tracking/*`, `VehicleHub`, `VehicleDashboard`
- Migration: `supabase/migrations/20260808120000_vehicle_insurance_alerts_toggle_staging.sql`
- דוח: `docs/audit-reports/oren-car-three-tasks-staging/`

## איך משתמשים

- **מעקב רכב → התראות:** לחיצה על צ'יפ → מגיעים ישירות לטסט/ביטוח/תקלה/טיפול/חוסר.
- **טסט:** התראה רק ב-30/7/1 ימים לפני; מעל 30 — שקט.
- **ביטוח:** מתג בכרטיס רכב → ניהול; בארי — כבוי לכל הרכבים אחרי Migration.

## איך זה עובד

- `expiryReminderTier(daysLeft, thresholds)` — tier אחד פעיל בכל רגע (30 → 7 → 1).
- `buildVehicleTrackingAlerts` — בונה צ'יפים + `hubLink` עם UUID.
- `isInsuranceAlertsEnabled` — `!== false` (ברירת מחדל true עד Migration).

## מה השתנה לעומת אתמול

- תוקן דוח שגוי על 90 יום — **נשאר 30** ב-DB.
- הוסף tier 30/7/1 אמיתי (לא "מ-30 ועד סוף" בלי הבחנה).
- `fleetosData` — ביטוח רק מ-`alert_items` + מתג.
- `Alerts.tsx` — deep links עם fault/task/order UUID.
- חקירת 917: 18 קבוצות מספר פנימי כפול בבארי.

## מה אתה עושה עכשיו

**עצירה.** הקוד תואם לשלוש הדרישות ברמת קוד + unit tests. ממתין לאישורכם ל:
1. Migration ב-Staging SQL
2. Commit + Push + Deploy Staging
3. QA חי (דסקטופ/מובייל)

## מה מחכה לי

- **אישור Migration** — `20260808120000_vehicle_insurance_alerts_toggle_staging.sql`
- **אישור Deploy** — commit + push ל-Staging Pages
- **אישור התנהגות tier** — האם תווית "התראת 30" בימים 30–8 מתאימה לכם (לפני מימוש חי)
