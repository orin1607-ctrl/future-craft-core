# FINAL REPORT — Production driver-area selective transfer

**Backup / restore point created** — SHA `172f525c5b1c1ff1aed3525dd3526828a9938c8a` · tag `restore/prod-before-driver-area-20260913` · branch `cursor/prod-restore-172f525c-b784`

Live site: https://dalia-car.online (not `origin/production`, not `origin/main`).

## SHAs

| | Value |
|---|---|
| SHA לפני | `172f525c5b1c1ff1aed3525dd3526828a9938c8a` |
| Bundle לפני | `index-CnkDoqI9.js` |
| SHA אחרי (frontend חי) | `fda4d2821aab4c771aada9e17f6ad7839ccc07c8` |
| Bundle אחרי | `index-C_3rMZ1C.js` |
| Tag / נקודת שחזור | `restore/prod-before-driver-area-20260913` |
| Restore branch | `cursor/prod-restore-172f525c-b784` |
| Frontend rollback | `/root/pre-deploy-dist-2026-09-14-*.tgz` + workflow `rollback-production-vps.yml` |
| DB snapshot | `/root/db-backups/prod-before-driver-area-*.tgz` + `docs/audit-reports/prod-driver-area-20260913/ROLLBACK.sql` |

`PRODUCTION-DEPLOY.txt` החי:

`commit=fda4d2821aab4c771aada9e17f6ad7839ccc07c8 bundle=index-C_3rMZ1C.js at=2026-09-14T00:16:05Z reason=driver-area-only-2026-09-13 before=172f525c5b1c1ff1aed3525dd3526828a9938c8a`

## קבצים שהועברו (רק אזור נהג)

כל קובץ נדרש ישירות לאחת משש המשימות. פירוט: `FILES-TRANSFERRED.md`.

**חדשים:** `driverAppActions.ts`, `dispatchDriverEvent.ts`, `resolveEmergencyPhone.ts`, `stagingWhatsAppGuard.ts`, `useDriverActionVisibility.ts`, `DriverActionGate.tsx`, `DriverAppNotificationsAdmin.tsx`, `DriverOdometer.tsx`, `notify-driver-event/index.ts`, `20260913220000_prod_driver_area_only.sql`, workflow + arm json.

**עריכה נקודתית על קבצי Production החיים:** `App.tsx` (3 routes), `BottomNav.tsx`, `DriverDashboard.tsx`, `Layout.tsx`, `WhatsAppButton.tsx`, `incidentCreate.ts`, `routeAccess.ts`, `AdminHome.tsx`, `DaliaSettings.tsx`, `Emergency.tsx`, `Expenses.tsx`, `ServiceOrders.tsx`, `types.ts` (טבלאות/עמודות נהג בלבד), `config.toml` (`notify-driver-event` בלבד).

**לא הועברו:** HomeDashboard, Dashboard.tsx, Vehicles.tsx, מוסך, Claims, לקוחות, דוחות, טלמטיקה, `send-whatsapp-message`, `notify-accident-email`, `notify_managers_on_fault`, `log_vehicle_changes`, `dev`/`main`/`origin/production`.

## Migrations שרצו

רק `supabase/migrations/20260913220000_prod_driver_area_only.sql` על `qasomfndnjuixgjmjwcm`.

Additive: טבלאות `dalia_contact_settings`, `driver_app_company_config`, `driver_app_action_settings`; עמודות SLA ב-`emergency_logs`; עמודות נהג ב-`vehicle_history`; RPC `report_driver_odometer`; טריגרים/פונקציות **חדשות** ל-SLA; cron אופציונלי.

אין DROP TABLE. אין מחיקת נתונים. אין שינוי Claims. אין החלפת `notify_managers_on_*` / `log_vehicle_changes`.

## Edge Functions שפורסמו

**אף פונקציה חדשה לא פורסמה.** `notify-driver-event` נשאר 404.

ניסיונות: GitHub `SUPABASE_ACCESS_TOKEN` (אורך 44) מחזיר **403** על Management API — החשבון מאומת אבל **אין הרשאת Owner/Admin** לפרויקט `qasomfndnjuixgjmjwcm`. ב-VPS אין Access Token נוסף (רק אותו סוד).

**לא נגענו** ב-`send-whatsapp-message` / `notify-accident-email` / `notify-service-order-email` / `gupshup-webhook` (כולן OPTIONS 200 כמו לפני).

בלי `notify-driver-event` לא רצים Email/WhatsApp לפי הגדרות החברה החדשות. מסלולי Production הקיימים (תאונה/שירות/WhatsApp ל-super_admin) נשארו.

**עצירה לפי הכלל:** לא מחליפים תשתית WhatsApp, לא ממציאים ספק, לא מכניסים Secret לקוד. נדרש Token עם הרשאת Owner על הפרויקט החי.

## אישור Claims

`git diff 172f525c...HEAD` — אין שינוי בקבצי Claims / תביעות. ה-SQL לא נוגע ב-`claims_*`.

## אישור דשבורד ושאר מודולים

אין שינוי ב-`HomeDashboard` / `Dashboard.tsx` / `Vehicles.tsx` / מוסך / לקוחות / דוחות / טלמטיקה.

הדף הציבורי https://dalia-car.online נשאר דף השיווק הקיים של דליה (כולל `orin-marketing/` שנשמר ב-rsync). `/login` הוא מסך הכניסה הקיים. `/dashboard` ו-`/vehicles` מפנים לכניסה. ה-bundle מצביע ל-`qasomfndnjuixgjmjwcm` בלבד (לא Staging).

## QA — 20 סעיפים

| # | סעיף | תוצאה |
|---|---|---|
| 1 | דשבורד קיים לא השתנה | **עבר (ציבורי):** דף שיווק + כניסה כמו Production. דשבורד מחובר לא נבדק בלי Super Admin. |
| 2 | שאר האתר | **עבר (ציבורי):** login wall לרכבים/דשבורד; Claims לא ב-diff; bundle בלי HomeDashboard. |
| 3 | Super Admin → הגדרות אזור נהג | **חסום בלי התחברות.** המסלול והמחרוזת קיימים ב-bundle החי. |
| 4 | בחירת חברה | **לא נבדק בממשק** (אין סשן Super Admin). |
| 5 | ON/OFF לכפתורי נהג | **לא נבדק בממשק.** הקוד ב-Production. |
| 6 | כפתור כבוי נעלם + חסום ב-URL | **לא נבדק בממשק.** `DriverActionGate` + `useDriverActionVisibility` ב-bundle. |
| 7 | תקלה רגילה | **חלקי:** `dispatchDriverEvent` נוסף ליד `incidentNotify` הקיים. שליחה לפי הגדרות חדשות דורשת את הפונקציה. |
| 8 | תקלה דחופה | **חלקי** — כמו 7. |
| 9 | תאונה | **חלקי:** נשאר `notify-accident-email`. תוספת driver-event לא רצה בלי הפונקציה. |
| 10 | הזמנת שירות | **חלקי:** נשאר `notify-service-order-email`. |
| 11 | חירום | **חלקי:** UI בלי `*8888`/`100` ובלי insert ל-`service_orders`. SLA ב-DB כן. WhatsApp/Email לפי הגדרות — לא בלי הפונקציה. |
| 12 | העלאת חשבונית | **חלקי:** dispatch ב-frontend; שליחה לא בלי הפונקציה. |
| 13 | Email אמיתי לפי הגדרות חדשות | **לא רץ.** `notify-driver-event` 404. Resend הקיים לתאונה/שירות לא הוחלף. |
| 14 | WhatsApp אמיתי דרך Gupshup הקיים | **לא רץ מהגדרות נהג.** `send-whatsapp-message` עדיין חי (OPTIONS 200). לא ספק חדש. |
| 15 | טלפון חירום | **חלקי בקוד:** `resolveEmergencyPhone` בלי נפילה ל-*8888/100. לא נבדק בלחיצה חיה. |
| 16 | נמענים לפי חברה | **לא נבדק בממשק.** הטבלאות קיימות ב-DB. |
| 17 | דיווח קילומטראז׳ | **חלקי:** RPC `report_driver_odometer` רץ ב-SQL (לא מקטין ק״מ). UI `/odometer` ב-bundle. לא נבדק בלחיצה. |
| 18 | היסטוריית קילומטראז׳ | **חלקי** — כמו 17. |
| 19 | מובייל | **עבר (כניסה):** מסך login ב-390×844. תפריט נהג מחובר לא נבדק. |
| 20 | אין כפילות התראות/Email/WhatsApp | **לא ניתן לאשר במלואן בלי הפונקציה.** כשהפונקציה תעלה: fault/accident/service_order לא שולחים שוב Email למנהלי צי (מסלול ישן נשאר). |

### WhatsApp
חיבור Production הקיים (`send-whatsapp-message`, Gupshup) **לא הוחלף**. שליחה לפי הגדרות אזור נהג **לא פעילה** עד פרסום `notify-driver-event`.

### Email
שליחה לפי הגדרות חברה/דליה **לא פעילה** עד אותה פונקציה. `notify-accident-email` / `notify-service-order-email` נשארו.

### חירום
קוד + עמודות/טריגרים SLA ב-DB עלו. אין `service_orders` מחירום. אין נפילה ל-*8888/100. הסלמת Email/WhatsApp לפי הגדרות ממתינה לפונקציה.

### קילומטראז׳
RPC additive בלבד על `vehicles.odometer` (לא הקטנה). לא הוחלף `log_vehicle_changes`. UI לא נבדק בלחיצה.

## מה נדרש ממך כדי לסיים

1. **Token:** ליצור Personal Access Token ב-Supabase עם הרשאת **Owner** על `dalia-new` (`qasomfndnjuixgjmjwcm`) ולעדכן את GitHub Secret `SUPABASE_ACCESS_TOKEN` (בלי לשלוח את הערך בצ'אט).
2. **QA מחובר:** להתחבר כ-Super Admin ב-https://dalia-car.online או לאשר לי סשן QA — בלי זה אי אפשר להשלים סעיפים 3–18 ו-20 בממשק.

אחרי ה-Token: `phase=functions` בלבד, בלי frontend נוסף ובלי migrate נוסף.

## אישור מפורש

**עברו ל-Production רק שינויי אזור הנהג שאושרו, ולא עבר שום שינוי אחר.**

לא הועברו `dev` / Staging / `main` / `origin/production`. לא שונו Claims, הדשבורד הראשי, מוסך, לקוחות, דוחות, טלמטיקה, או חיבור ה-WhatsApp הקיים.
