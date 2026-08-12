# דוח סיום — רכבים בארכיון מחוץ לספירת צי פעיל (Staging בלבד)

**תאריך:** 2026-08-12  
**סביבה:** Oren Car Staging בלבד  
**Production / Hostinger / Production DB / Deploy לאתר פעיל:** לא בוצע

---

## 1. Repository
`future-craft-core-STAGING` → remote `https://github.com/orin1607-ctrl/future-craft-core.git`

## 2. Branch
`feat/incident-alerts-staging`

## 3. Restore Point
- **HEAD לפני השינוי:** `71dab61`
- קובץ: `docs/audit-reports/oren-car-archived-vehicle-counts/restore-point.json`

## 4. Commit
- **`ba8ee87`** — `fix(oren-car): exclude archived vehicles from active fleet counts`
- Live Staging bundle: `assets/index-VUpJ3wfN.js`
- QA script/parser hardening + דוח זה: commit נפרד (אם נכלל) אחרי PASS של הסקריפט

## 5. קבצים ששונו (מוצר)
| קובץ | תפקיד |
|------|--------|
| `src/lib/vehicleArchive.ts` | helper מרכזי: `status === 'archived'` |
| `src/lib/vehicleArchive.test.ts` | unit tests |
| `src/components/home/HomeDashboard.tsx` | ספירת «רכבים» בבית |
| `src/lib/vehicleTrackingData.ts` | מעקב רכבים + מקור ל-FleetOS KPIs |
| `src/components/DashboardCharts.tsx` | pie סטטוסים |
| `src/lib/bulkInsuranceRedHighlight.ts` | סטטיסטיקות/bulk ביטוח אדום |
| `src/lib/companyPolicyEnforcement.ts` | מכסת רכבים ללא נהג |
| `scripts/oren-car-archived-counts-qa.mjs` | QA אוטומטי 2 חברות |
| `docs/audit-reports/oren-car-archived-vehicle-counts/*` | מיפוי / restore / QA / דוח |

**לא שונו (בכוונה):**
- `Vehicles.tsx` — כבר מסתיר archived מטאב «הכל»
- `Reports.tsx` — «סה״כ רכבים» היסטורי נשאר כולל archived (יש «פעילים» בנפרד)
- `Alerts.tsx` / מנגנון התראות — **תיעוד בלבד**, ללא שינוי

## 6. איך archived מסומן במערכת
- **טבלה:** `vehicles` (אותה טבלה; לא נמחק)
- **שדה:** `status`
- **ערך:** `'archived'`
- **אין** `deleted_at` / טבלת ארכיון נפרדת
- **ארכוב:** `VehicleHub` → `update({ status: 'archived' })`
- **רשימה:** טאב «הכל» / פילטר רגיל **לא** מציג archived; טאב «ארכיון» מציג אותם

## 7. מקומות עם total / KPI רכבים (מיפוי)
ראה גם `mapping.json`.

| מקום | מקור | לפני | אחרי |
|------|------|------|------|
| HomeDashboard | count exact | כולל archived | **לא כולל** |
| Vehicle Tracking summary «סה״כ רכבים» | `loadFleetTrackingRows` | כולל | **לא כולל** |
| FleetOS KPIs | יורש מ-tracking rows | כולל | **לא כולל** |
| DashboardCharts status pie | select status | כולל slice archived | **לא כולל** |
| Vehicles tabs הכל/ארכיון | client filter | הכל כבר בלי archived | ללא שינוי |
| Reports «סה״כ רכבים» | כל הרכבים | כולל | **הושאר** (היסטורי) |
| bulkInsuranceRedHighlight | company vehicles | כולל | **לא כולל** |
| companyPolicyEnforcement quota | unassigned count | כולל | **לא כולל** |
| Alerts / fleetAlerts | load vehicles | יכול לכלול archived | **לא שונה** |

## 8. מה השתנה בכל מקום
סינון אחיד דרך `applyExcludeArchivedVehicles` / `.neq('status','archived')` על שאילתות ספירה/צי פעיל.  
אין migration, אין שינוי schema, אין מחיקת נתונים.

## 9–11. DB vs UI — 2 חברות (QA חי)

| חברה | DB total | Archived | Expected active | UI Vehicles הכל | UI ארכיון | Home | Tracking סה״כ |
|------|----------|----------|-----------------|-----------------|-----------|------|----------------|
| QA-Arch-A-* | 5 | 2 | 3 | 3 | 2 | ~3 | 3 |
| QA-Arch-B-* | 3 | 1 | 2 | 2 | 1 | ~2 | 2 |

מקור: `qa-report.json` — **OVERALL PASS**

## 12. Dashboard
Home card «רכבים» משקף צי פעיל (ללא archived). PASS

## 13. Vehicles list
- Archived **לא** מופיעים בטאב «הכל»
- יש טאב/פילטר «ארכיון»
- נגישים דרך ארכיון; counter תואם לרשימה. PASS

## 14. FleetOS / Tracking KPIs
`loadFleetTrackingRows` מסנן archived → «סה״כ רכבים» במעקב = active. PASS (desktop + mobile)

## 15. Alerts — תיעוד בלבד (לא שונה)
- `Alerts.tsx` טוען `vehicles.select('*')` **בלי** סינון `archived`
- רכב בארכיון עם תוקף/ביטוח/טסט יכול **להמשיך להופיע** בהתראות / 30·7·1 אם יש תאריכים
- **נראה לא רצוי לצי פעיל**, אבל **by current design** עד אישור נפרד
- **לא שונה** במשימה זו

## 16. Tests
- `vehicleArchive.test.ts` — יחידה לסימון/סינון
- QA Playwright: `scripts/oren-car-archived-counts-qa.mjs` — PASS

## 17. Build
בוצע במסגרת deploy ל-Staging Pages עבור `ba8ee87` (bundle `index-VUpJ3wfN.js`). אין deploy ל-Production.

## 18. Desktop
Vehicles / Home / Tracking — PASS לשתי חברות

## 19. Mobile
Company A: Vehicles / Home / Tracking — PASS

## 20. Console
403 ידוע על `dalia_form_config` (RLS / הרשאת fleet_manager) — לא חדש ממשימת הספירה; לא חוסם ספירות

## 21. Network
אין 400/500 חדשים הקשורים לספירת רכבים. 403 הנ״ל מתועד.

## 22. Performance
סינון באותה query שכבר טוענת רכבים (`.neq` על השאילתה הקיימת) — אין N+1 / query לכל רכב.

## 23. Regression (Staging QA ממוקד)
- רשימת רכבים + ארכיון: OK  
- Home count: OK  
- Tracking total: OK  
- פתיחת רכב פעיל / מארכיון: לא נשבר במנגנון (ארכיון נשאר בטבלה ובטאב)  
- Alerts / gaps / insurance toggles: **לא שונו** במשימה זו  
- אין נגיעה ב-WIP לא קשור ב-commit המוצר

## 24. PASS/FAIL
**PASS** (Staging) — ספירות צי פעיל אינן כוללות archived; ארכיון נשאר במערכת.

---

### עצירה
אין Production. אין Hostinger. אין Production DB. אין Deploy לאתר הפעיל.  
ממתין להחלטת Owner לגבי Production / האם לסנן גם Alerts מ-archived.
