# ביקורת גישה למפתחות — בדיקת WhatsApp Demo (Staging)

**תאריך:** 2026-07-18  
**סביבת סוכן:** Cursor Cloud (`bc-65bcd742-902c-4c49-8c53-03309d5afcf9`)  
**מטרה:** לבדוק אם כבר קיימת גישה ל-Staging בלי לבקש Secrets בצ'אט  
**Production / Hostinger:** לא נגע

## 1. איפה נבדק

| מקום | תוצאה |
|------|--------|
| משתני סביבה בתהליך הסוכן | אין `SUPABASE_*` / `SERVICE_ROLE` / `ACCESS_TOKEN` / `GUPSHUP_*` / `TEST_*` |
| `/workspace/.env` | קיים — מצביע ל-`kuenhflklivaxrmqbsee` (לא Staging) · רק `VITE_*` anon |
| `/workspace/.env.local` | **לא קיים** |
| `/workspace/.env.staging` | **לא קיים** |
| `/workspace/.env.production` | **לא קיים** |
| `scripts/audit-local-secrets-presence.mjs` | כל מפתחות ה-Supabase/Gupshup מדווחים `false` |
| סריקת JWT בכל `/workspace`, `/home/ubuntu`, `/opt/cursor`, `/tmp` | Staging: רק `anon` · **אין** `service_role` · **אין** `sbp_` |
| `npx supabase projects list` / login | אין `SUPABASE_ACCESS_TOKEN` · אין session ב-`~/.supabase` |
| Cursor Cloud Environment (`environment-info`) | `environment: null` — אין Secrets מוזרקים לסביבה |
| GitHub Secrets | `gh secret list` → HTTP 403 · לא קריא לסוכן |
| GitHub Workflows | `SUPABASE_SERVICE_ROLE_KEY` קשור ל-**Production** (`qasomfndnjuixgjmjwcm`) — אסור לשימוש בבדיקת Staging |
| Deploy Staging Pages | רק Staging **anon** (ציבורי) בקובץ ה-workflow |
| Hostinger / VPS secrets | רק ב-workflows של Production/Preview · אסור לגעת לפי Owner |
| Supabase Edge Secrets (Gupshup) | נמצאים בצד השרת של Staging (לא בסוכן) — נדרש JWT `super_admin` כדי להפעיל |

## 2. מה נמצא

**יש גישה ל:**
- Staging anon key (ציבורי) — מספיק לקריאות מוגבלות; RLS חוסם faults/drivers/vehicles
- אימות ש-RPC `allocate_incident_event_number` קיים ב-Staging

**אין גישה ל:**
- Staging `service_role`
- `SUPABASE_ACCESS_TOKEN`
- `TEST_EMAIL` / `TEST_PASSWORD` של `super_admin`
- קריאת GitHub Secrets
- סביבת Cursor עם Secrets מוגדרים
- מפתח Gupshup מקומי (לא נדרש מקומית אם Edge מוגדר — אבל אין JWT להפעלה)

## 3. איזה מפתח חסר

אחד מהבאים (Staging בלבד `usfeoerkpcafxxlyuldl`):

1. **מועדף:** `SUPABASE_ACCESS_TOKEN` — מאפשר לסקריפט למשוך service_role בעצמו  
2. **או:** Staging `SUPABASE_SERVICE_ROLE_KEY`  
3. **או:** זוג `TEST_EMAIL` + `TEST_PASSWORD` של משתמש `super_admin` ב-Staging (פחות מועדף, אבל מספיק לשליחת Edge)

## 4. למה זה נדרש

| שלב | למה בלי מפתח זה נחסם |
|-----|----------------------|
| יצירת תקלת Demo | RLS — anon לא יכול insert/select על `faults` |
| הקצאת מספר אירוע | RPC דורש `auth.uid()` |
| אימות מעקב/כרטיסים/דשבורדים | קריאות DB מלאות דורשות הרשאה |
| שליחת WhatsApp | Edge `send-whatsapp-message` דורש Bearer של `super_admin` |

`GUPSHUP_API_KEY` עצמו כבר אמור להיות ב-Supabase Edge Secrets של Staging — **לא** צריך להעתיק אותו לצ'אט.

## 5. דרכים לבצע בלי לחשוף Secrets בצ'אט

1. **הזרקה לסביבת Cursor (מומלץ):** להוסיף את Staging token/key כ-Secret בסביבת Cloud Agent / Environment — בלי להדביק בצ'אט. הסוכן יקרא מ-env.  
2. **הרצה מקומית על Orin STAGING:** במחשב שבו כבר יש `.env.local` (היסטורית: clone `future-craft-core-STAGING`) להריץ  
   `node scripts/staging-demo-fault-whatsapp-once.mjs`  
3. **לא להשתמש ב:** GitHub `SUPABASE_SERVICE_ROLE_KEY` של Production · Hostinger · העתקת מפתחות לצ'אט.

## מסקנה

לאחר בדיקה מלאה בסביבת Cloud הנוכחית: **אין** מפתח Staging עם הרשאת כתיבה/super_admin.  
שליחת WhatsApp האחת ממתינה להזרקת Secret לסביבה או להרצה מקומית — בלי חשיפת מפתחות בצ'אט.
