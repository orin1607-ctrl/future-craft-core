# 02 — תיק ממצאים מפורט (Verified Findings Register)
**תאריך:** 2026-07-22 · **Commit main:** `92829c7` · **מגלה:** Cloud Agent audit + אימות חוזר

סיווגי סטטוס: מאומת בפרודקשן | מאומת בקוד | חשד | לא ניתן לאימות | הופרך

---

## F-META-01 — Audit על branch `production` המיושן
- **תחום:** מתודולוגיה / ניהול גרסאות
- **רכיב:** Git branch `production` vs deploy מ-`main`
- **סטטוס:** מאומת בפרודקשן + בקוד
- **ראיות:** `git log origin/production -1` → 2026-06-06; `git log origin/main -1` → 2026-07-22; Actions Deploy מ-`main`; bundle Last-Modified היום
- **הסבר פשוט:** נבדק עותק קוד ישן בשם "production" במקום הקוד שממנו באמת עולה האתר היום.
- **השפעה:** ממצאים חסרים/שגויים (למשל Gupshup)
- **רמת סיכון:** גבוה (לאיכות הביקורת)
- **חלופות:** א' תמיד לשייך Audit ל-commit של ה-bundle החי; ב' ליישר branch `production` ל-`main`; ג' לבטל את שם ה-branch המטעה
- **מומלץ:** א'+ב'

---

## F-WA-01 — Gupshup WhatsApp פעיל ב-Production (תיקון לדוח קודם)
- **סטטוס קודם:** הופרך ("אין Gupshup")
- **סטטוס מעודכן:** מאומת בפרודקשן
- **רכיב:** `send-whatsapp-message`, `gupshup-webhook`, `notify-accident-email`, טבלת `incident_notification_deliveries`
- **ראיות Prod:**
  - GET `.../functions/v1/gupshup-webhook` → 200 `{"ok":true,"service":"gupshup-webhook"}`
  - GET/POST ל-`send-whatsapp-message` ללא user JWT → 401 (הפונקציה קיימת)
  - Bundle חי מכיל `GUPSHUP` + `send-whatsapp-message`
  - Actions `29946137467`: message IDs `6556b4c6-...`, `e97319c6-...`; status sent
- **ראיות קוד:** קבצים תחת `origin/main` כמפורט ב-01
- **הסבר פשוט:** המערכת שולחת WhatsApp אמיתי דרך ספק Gupshup, לא רק קישור wa.me.
- **סיכון אם מוגדר רע:** שליחות לא מבוקרות / עלויות / דליפת תוכן הודעות לספק
- **רמת סיכון:** מידע/בינוני (עצם הקיום אינו באג; חשיפת webhook ו-secrets דורשים בקרה)
- **פיצוי זמני:** הגבלת מקבלי WA; ניטור deliveries; איסור שליחות ניסוי ללקוחות
- **הוכחת סגירה:** E2E + בדיקת DLR row מתעדכן ל-delivered/failed

---

## F-WA-02 — במקביל קיימים קישורי wa.me
- **סטטוס:** מאומת בפרודקשן (bundle) + בקוד
- **ראיה:** 12 מופעי `wa.me` ב-JS החי; `WhatsAppButton.tsx`
- **רמת סיכון:** מידע בלבד

---

## F-PAY-01 — `paypal-charge` ניתן להפעלה עם anon JWT
- **סטטוס:** מאומת בפרודקשן (partial — לא הופעל charge)
- **ראיות:**
  - POST עם `Authorization: Bearer <anon>` ו-`action=__audit_readonly_unknown__` → **400** `Unknown action` (הקוד רץ)
  - POST בלי Authorization → **401** Missing authorization header
  - בקוד main: `verify_jwt = true` — אך anon JWT עובר את ה-gateway
  - בקוד הפונקציה: אין בדיקת role לפני actions כולל `charge_all_due`
- **הסבר פשוט:** מפתח ציבורי של האפליקציה מספיק כדי להגיע ללוגיקת החיוב; לא בוצע חיוב בבדיקה.
- **תרחיש:** תוקף ללא התחברות משתמש, עם anon key מה-bundle, קורא ל-`charge_all_due`
- **רמת סיכון:** קריטי (אם PayPal secrets מוגדרים) / גבוה-חשד אם secrets חסרים
- **לא אומת:** האם `PAYPAL_*` מוגדרים כרגע ב-Prod secrets
- **חלופות:** א' בדיקת super_admin + cron secret; ב' הסרת charge_all_due מה-endpoint הציבורי; ג' Billing service נפרד עם IAM
- **פיצוי זמני:** הסרת/רוטציית PayPal secrets עד תיקון; ניטור PayPal

---

## F-MAIL-01 — `send-vehicle-file-report` רץ עם anon ומבקש to/html
- **סטטוס:** מאומת בפרודקשן
- **ראיה:** POST `{}` עם anon → 400 `Missing 'to' or 'html'` (לא 401)
- **רמת סיכון:** קריטי (open relay פוטנציאלי אם RESEND מוגדר)
- **לא בוצע:** שליחת מייל

---

## F-TWILIO-01 — Twilio Edge קיים; credentials לא מוגדרים ב-Prod לפי תשובה
- **סטטוס:** מאומת בפרודקשן (תשובת שגיאה)
- **ראיה:** GET `twilio-outbound-call` → 500 `Twilio credentials are not configured`
- **רמת סיכון:** נמוך כרגע תפעולית; קוד עדיין מסוכן אם יוזנו secrets בלי auth חזק
- **מאומת בקוד:** אין auth יישומי בגרסאות ישנות; ב-main `verify_jwt=true` אך anon עלול לעבור

---

## F-HDR-01 — Security Headers לא מופיעים בתשובת האתר החי
- **סטטוס:** מאומת בפרודקשן
- **ראיה:** `curl -sI https://dalia-car.online` — אין HSTS/X-Frame/CSP; יש `Server: nginx`
- **מאומת בקוד:** `nginx.conf` מגדיר headers — **לא תואם** לתשובה החיה
- **רמת סיכון:** בינוני-גבוה
- **לא ניתן לאימות:** תוכן הקובץ ב-VPS (SSH denied)

---

## F-STOR-01 — מצב bucket `documents` ב-Prod לא אומת במלואו
- **סטטוס:** לא ניתן לאימות / חשד
- **חיפוש:** GET `/storage/v1/bucket/documents` עם anon → 400 Bucket not found; list buckets → `[]`
- **קוד:** migrations ישנות + staging migration יוצרות bucket public
- **E2E/UI:** העלאות מסמכים בשימוש מוצרי — סטטוס bucket חי דורש service_role או Dashboard
- **רמת סיכון:** לא מדורג סופית עד אימות

---

## F-RLS-01 — Signup מקבל role מ-metadata
- **סטטוס:** מאומת בקוד (`handle_new_user` ב-migrations)
- **לא ניתן לאימות:** האם הפונקציה ב-Prod זהה למיגרציה האחרונה בלי SQL dump
- **רמת סיכון:** קריטי (אם זהה ב-Prod)

---

## F-RLS-02 — Tenancy על `company_name` טקסט
- **סטטוס:** מאומת בקוד + אינדיקציה ב-Prod דרך התנהגות אפליקציה
- **רמת סיכון:** גבוה ארכיטקטונית

---

## F-AUTH-01 — JWT ב-localStorage
- **סטטוס:** מאומת בקוד (`src/integrations/supabase/client.ts` ב-main)
- **רמת סיכון:** בינוני-גבוה בשילוב XSS/אין CSP

---

## F-EXPORT-01 — `full-supabase-export` עלול לכלול מפתחות
- **סטטוס:** מאומת בקוד
- **Prod:** OPTIONS/קיום הפונקציה אומת בעבר; לא הורד ייצוא
- **רמת סיכון:** קריטי אם SA נפרץ

---

## F-ACCESS-01 — אין SSH / אין Supabase CLI / אין Management token בסשן
- **סטטוס:** מאומת (ניסיונות כושלים מתועדים)
- **השפעה:** פערים ב-policies חיות, nginx, backups, secret inventory רשמי

---

## טבלת R1–R23 מעודכנת

| ID | נושא | סטטוס אימות | ראיה ישירה | עדכון מול דוח #1 |
|----|------|-------------|------------|-------------------|
| R1 | PayPal ללא הגנת role | מאומת Prod חלקית | anon מריץ פונקציה | עדיין בתוקף; gateway דורש header אך anon מספיק |
| R2 | Open email relays | מאומת Prod ל-`send-vehicle-file-report` | 400 Missing to/html | בתוקף |
| R3 | Twilio unauth call | קוד מסוכן; Prod credentials חסרים | 500 credentials not configured | חומרת ניצול **ירדה זמנית** |
| R4 | Storage public/open policies | מאומת קוד; Prod bucket לא אומת | bucket not found באנונימי | **לא סופי** |
| R5 | Signup role injection | מאומת קוד | migrations | דורש SQL Prod לאימות סופי |
| R6 | Anon declarations leak | מאומת קוד | migrations | דורש SQL Prod |
| R7 | Profile company hop | מאומת קוד | migrations/policies | דורש SQL Prod |
| R8 | full-export secrets | מאומת קוד | function source | לא הורד מ-Prod |
| R9 | סיסמאות נהגים דטרמיניסטיות | מאומת קוד | Drivers.tsx patterns ב-main | — |
| R10 | FM password/role escalation | מאומת קוד | edge functions | — |
| R11 | Voice/AI endpoints | מאומת קוד; חלק קיימים ב-Prod | probes | — |
| R12 | Security headers חסרים | מאומת Prod | curl -sI | בתוקף |
| R13 | אין rate limit reset | מאומת קוד | send-password-reset | — |
| R14 | JWT localStorage + no CSP | מאומת קוד+Prod headers | client.ts + curl | בתוקף |
| R15 | Soft tenancy | מאומת קוד | schema | — |
| R16 | Practical exams cross-tenant | מאומת קוד | migrations | דורש SQL Prod |
| R17 | Driver full vehicle update | מאומת קוד | migrations | דורש SQL Prod |
| R18 | אין monitoring חיצוני | מאומת בקוד/repo | אין Sentry | — |
| R19 | SPOF VPS | מאומת Prod | IP יחיד | — |
| R20 | בלבול סביבות | מאומת | .env vs live vs branch | **מחוזק** |
| R21 | CORS * | מאומת קוד + Edge responses | ACAO * | — |
| R22 | private_customer nav | מאומת קוד | App/BottomNav | — |
| R23 | Missing company indexes | מאומת קוד | migrations | — |
| **R24 חדש** | Gupshup/Make/webhook surface | מאומת Prod | webhook 200, E2E send | **חדש — הופרך "אין Gupshup"** |
| **R25 חדש** | Branch `production` ≠ Prod חי | מאומת | git log + Actions | **חדש** |

---

## כרטיסי חלופות — תבנית קצרה לכל ממצא קריטי
לכל ממצא קריטי (R1,R2,R5,R6,R7,R8,F-PAY-01,F-MAIL-01):  
**א' מינימלי:** auth/role/secret gate + כיבוי זמני.  
**ב' מומלץ:** תיקון קוד+RLS+בדיקות E2E שליליות.  
**ג' אסטרטגי:** הפרדת שירותי billing/notify, company_id, WAF, pen-test.

פיצוי זמני כללי לפני הרחבת לקוחות: לא להפעיל PayPal חי; להגביל Edge רגישים; לא לצרף ציים גדולים עד אימות RLS חי.
