# דוח סופי — מודול רכב Dalia (dalia-staging)

**תאריך:** 2026-06-08  
**פרויקט:** dalia-staging · `usfeoerkpcafxxlyuldl`  
**סטטוס:** קוד מוכן · **ממתין לאישור Push + Migrations**

---

## אישורי בטיחות

| פעולה | סטטוס |
|--------|--------|
| Deploy ל-production | ❌ לא בוצע |
| Merge ל-production | ❌ לא בוצע |
| נגיעה ב-dalia-new (`qasomfndnjuixgjmjwcm`) | ❌ לא |
| נגיעה ב-dalia-car.online | ❌ לא |
| Push ל-GitHub | ❌ לא בוצע (ממתין לאישורך) |
| Migrations על DB | ❌ לא הורצו (ממתין לאישורך) |

---

## סיכום משימות (10/10 בקוד)

| # | משימה | סטטוס |
|---|--------|--------|
| 1 | חיבור שדות Dalia (291 מורחב / 102 ייחודיים) | ✅ |
| 2 | Vehicle Hub מלא | ✅ |
| 3 | עריכה מלאה דרך Dalia | ✅ |
| 4 | `vehicle_color` — עמודה ישירה + fallback | ✅ בקוד |
| 5 | `end_or_scrap_date` — עמודה ישירה + fallback | ✅ בקוד |
| 6 | מסמכים וקבצים (`documents` bucket) | ✅ בקוד |
| 7 | חזרה לכרטיס רכב מכל המסכים | ✅ |
| 8 | בידוד נתונים (חברה + רכב) | ✅ |
| 9 | תיקוני עברית | ✅ |
| 10 | בדיקות E2E | ✅ יחידה + סקריפטים (חי = SKIP ללא credentials) |

---

## שדות — הסבר 291 vs 102

| מדד | ערך | הסבר |
|-----|-----|------|
| שדות ייחודיים בטופס React (`name=`) | **102** | `VehicleNewFormDalia.tsx` + `vehicleNewDaliaBlocks.tsx` |
| שדות נשמרים end-to-end | **102/102** | 63 עמודות ישירות + 38 JSON + 1 (`assigned_driver` → `assigned_driver_id`) |
| מלאי מורחב 291 | **כיסוי מלא** | כולל וריאציות מסלול בעלות (9 מסלולים), שדות מותנים, מסמכים, מחלקות, JSON מקונן — נשמרים ב-`import_buffer` / `insurances` / `finance_details` / `maintenance_details` |

**מיפוי persist:** `npm run audit:dalia` → `directColumnMapped: 63`, `jsonOverflowPacked: 38`, `remainingUnmapped: 1` (`assigned_driver` → מזהה נהג ב-`assigned_driver_id`).

---

## טבלאות / אחסון מושפעים (לאחר Migration)

| משאב | שינוי |
|------|--------|
| `public.vehicles` | עמודות חדשות: `vehicle_color`, `end_or_scrap_date` |
| `storage.buckets` | bucket חדש: `documents` |
| `storage.objects` | מדיניות RLS: upload/read/delete |
| `document_metadata` | קיים — שימוש בהעלאות מ-`Documents.tsx` וטופס Dalia |
| `drivers` | קריאה לשיוך `assigned_driver_id` בשמירה |
| `vehicle_event_log` | לוג אירועי שמירה/עריכה |

---

## קבצים ששונו / נוספו

### ליבת מודול רכב
- `src/lib/daliaVehiclePersist.ts` — persist מלא, עמודות ישירות, שיוך נהג
- `src/lib/daliaVehicleLoad.ts` — טעינה, תצוגת Hub, תוויות עברית
- `src/lib/daliaVehiclePersist.test.ts` — בדיקות יחידה
- `src/pages/VehicleDaliaFlow.tsx` — זרימה מאוחדת חדש+עריכה
- `src/pages/Vehicles.tsx` — רשימה + Hub, עברית
- `src/components/vehicles/VehicleHub.tsx` — Hub מלא + קישור מסמכים
- `src/components/vehicles/VehicleDaliaFullPanel.tsx` — כל השדות
- `src/components/vehicles/VehicleBackToCardButton.tsx`
- `src/components/vehicles/vehicleNewDalia/VehicleNewFormDalia.tsx`
- `src/integrations/supabase/types.ts`

### ניווט מבודד (scoped)
- `src/pages/Faults.tsx`, `Accidents.tsx`, `Documents.tsx`, `ServiceOrders.tsx`
- `src/pages/VehicleTasks.tsx`, `VehicleInspections.tsx`, `PrivateVehicleInspection.tsx`
- `src/pages/AttachCar.tsx`, `VehicleExchange.tsx`
- `src/lib/entityNavContext.ts`, `src/lib/vehicleScopedUi.ts`

### Migrations (לא הורצו)
- `supabase/migrations/20260608120000_vehicle_color_end_or_scrap.sql`
- `supabase/migrations/20260608130000_documents_bucket_staging.sql`
- `scripts/apply-staging-migrations.mjs`

### בדיקות וצילומים
- `scripts/e2e-dalia-vehicle-save.mjs`
- `scripts/test-vehicle-upload.mjs`
- `scripts/capture-hebrew-fix.mjs`
- `scripts/capture-staging-visual-proof.mjs`
- `docs/screenshots/hebrew-fix/` (3 צילומים)
- `docs/screenshots/staging-visual-proof/` (8 צילומים)

---

## צילומי מסך

### עברית (רשימה, Hub, כרטיס)
`docs/screenshots/hebrew-fix/`
- `01-vehicles-list-hebrew.png`
- `02-vehicle-hub-hebrew.png`
- `03-vehicle-card-full-panel-hebrew.png`

### זרימה מלאה (preview localhost)
`docs/screenshots/staging-visual-proof/`
- `01-new-vehicle-opening.png` … `08-save-reload-edit-hub-flow.png`

**הערה:** צילומים חיים מ-GitHub Pages יידרשו **אחרי Push** + התחברות staging.

---

## בדיקות

| בדיקה | תוצאה |
|--------|--------|
| `npm test` (Vitest) | ✅ 7/7 |
| `npm run build` | ✅ |
| `npm run audit:dalia` | ✅ 102 שדות |
| `npm run e2e:dalia-save` | ⏭ SKIP — חסר `TEST_EMAIL`/`TEST_PASSWORD` בסביבה |
| `npm run e2e:vehicle-upload` | ⏭ SKIP — אותו סיבה |

---

## Migrations ממתינות לאישור

```bash
# אחרי אישור — dalia-staging בלבד:
node scripts/apply-staging-migrations.mjs
```

1. `20260608120000` — `vehicle_color`, `end_or_scrap_date`
2. `20260608130000` — bucket `documents` + מדיניות

---

## דברים שעדיין לא הושלמו (דורשים אישור / סביבה)

1. **Push** ל-GitHub staging branch
2. **הרצת Migrations** על `usfeoerkpcafxxlyuldl`
3. **E2E חי** עם credentials (מחוץ לצ'אט) — `TEST_EMAIL` + `TEST_PASSWORD`
4. **אימות bucket `documents`** בהעלאה אמיתית אחרי migration
5. **צילומים חיים** מ-`https://orin1607-ctrl.github.io/future-craft-core/` אחרי deploy staging
6. **שמירת סעיף בודד** — רק שמירה מלאה ("שמור רכב") פעילה; "שמור סעיף" = UI בלבד
7. **שיוך נהג** — התאמה לפי `full_name` מדויק; לא autocomplete מ-dropdown

---

## לאחר אישורך

1. אשלים Push ל-staging בלבד
2. אריץ migrations על dalia-staging בלבד
3. אשלח קישור לבדיקה + צילומים חיים

**קישור בדיקה (לאחר Push):**  
https://orin1607-ctrl.github.io/future-craft-core/
