# תיק אבטחת מידע, נאותות ותיעוד מלא — מערכת דליה
## גרסת Production הפעילה — דוח מקצועי מבוסס ראיות

| שדה | ערך |
|-----|-----|
| תאריך הבדיקה | 2026-07-22 |
| סיווג | פנימי · מקצועי · מבוסס ראיות |
| אתר Production | https://dalia-car.online |
| Supabase Production (מאומת מ-bundle) | `qasomfndnjuixgjmjwcm` |
| מקור קוד שנבדק | `origin/main` @ `92829c778371e775ca0c7998f5f761456e681c5d` (ובדיקות נוספות על אותו ענף) |
| Bundle חי | `/assets/index-8KZoTB0x.js` · Last-Modified: 2026-07-22 16:58:34 GMT |
| מצב העבודה | **Read Only בלבד** — לא בוצעו שינויי קוד/DB/Policies/Secrets/Deploy/שליחות/חיובים במסגרת כתיבת דוח זה |
| מגבלת אמינות כללית | אין בסשן זה: Supabase CLI, psql, SSH ל-VPS, Dashboard session, GitHub secrets:read |

### מקרא רמת ודאות (חובה לכל ממצא)
| קוד | משמעות |
|-----|--------|
| **V1** | מאומת בוודאות מול Production חי |
| **V2** | מאומת חלקית מול Production (ראיה חלקית) |
| **V3** | נמצא בקוד/`main` בלבד — **לא** הוכח שזה מצב Production |
| **V4** | חשד / אינדיקציה בלבד |
| **V5** | לא ניתן לאימות ברמת ודאות מספקת |

### תיקון מתודולוגי מחייב (לפני הפרקים)
**מה נבדק:** השוואת `git log origin/production -1` מול `git log origin/main -1`, תוכן tree, ו-bundle חי.  
**ראיה:** branch בשם `production` בראש `40a145b` מתאריך 2026-06-06 **אינו** מכיל Gupshup; `main` מ-2026-07-22 כן; האתר החי מצביע ל-`qasomfndnjuixgjmjwcm` ומכיל מחרוזות Gupshup.  
**מסקנה (V1):** מקור האמת ל-Production הוא האתר החי + פרויקט Supabase `qasomfndnjuixgjmjwcm` + פריסות מ-`main`/Actions — **לא** עץ ה-git של branch בשם `production`.  
**השפעה:** דוח קודם שטען "אין Gupshup" היה שגוי בגלל בדיקת branch מיושן.

---
# שלב 1 — זיהוי מלא של המערכת (מפת מערכת)

## תקציר
מערכת דליה בפרודקשן היא SPA על Hostinger VPS + Backend Supabase, עם ספקי הודעות (Gupshup/Resend) ו-CI ב-GitHub. קיימות לפחות שלוש סביבות מופרדות ברמת פרויקט/דומיין.

## פירוט מלא

### 1.1 Production (חי)
| רכיב | ערך | ודאות |
|------|-----|--------|
| Domain | `dalia-car.online`, `www.dalia-car.online` | V1 |
| IP | `72.60.36.182` (dig A) | V1 |
| Web server | Nginx (כותרת `Server: nginx`) | V1 |
| SSL | Let's Encrypt; CN=`dalia-car.online`; תוקף עד 2026-10-04 | V1 |
| Frontend bundle | `index-8KZoTB0x.js` | V1 |
| Backend | `https://qasomfndnjuixgjmjwcm.supabase.co` | V1 |

**איך נבדק:** `dig`, `openssl s_client`, `curl -sI`, הורדת HTML+JS והרצת חיפוש מחרוזות.

### 1.2 סביבות נוספות (מתועדות + מאומתות חלקית)
| סביבה | Frontend | Supabase ref | ודאות |
|--------|----------|--------------|--------|
| Production | dalia-car.online | `qasomfndnjuixgjmjwcm` | V1 |
| Staging | `orin1607-ctrl.github.io/future-craft-core/` (לפי docs) | `usfeoerkpcafxxlyuldl` | V3 ל-URL; V2 ל-ref דרך workflows/docs + בדיקות קודמות |
| Legacy/.env בסוכן | — | `kuenhflklivaxrmqbsee` בקובץ `.env` מקומי | V1 לקיום הקובץ; **אינו** ה-Production החי |

### 1.3 חשבונות / ארגונים שזוהו בשם
| מערכת | מזהה שנמצא | ודאות |
|--------|------------|--------|
| GitHub repo | `orin1607-ctrl/future-craft-core` · **Public** · default branch=`production` | V1 (`gh repo view`) |
| Owner GitHub (מתיעוד) | `orin1607-ctrl` כ-required reviewer | V3 (docs) |
| Supabase project name (docs) | `dalia-new` לפרוד | V3 |
| Gupshup app | `DaliaVehicle` · source `972546500305` | V1 מלוג E2E 2026-07-22 |
| אימייל Owner בבדיקות | מופיע בלוגי CI — לא מועתק כאן כנתון לשיתוף חיצוני | V1 לקיום בלוג |

### 1.4 ספקים שזוהו (רשימה קצרה; פירוט בשלב 9)
Hostinger, Supabase (+Cloudflare מול supabase.co), GitHub, Gupshup, Resend, Make.com (תיעוד/workflows), PayPal (בקוד+bundle), Twilio/ElevenLabs (bundle/קוד; credentials Twilio חסרים ב-Prod לפי תשובת Edge), Lovable/Gemini (קוד), Google Fonts + site-verification, data.gov.il, Let's Encrypt.

## ראיות
- dig/openssl/curl/bundle/E2E/gh repo view כמפורט לעיל.
- `docs/ENVIRONMENT-AND-SECRETS-HE.md` על `main` למיפוי סביבות (V3 כתיעוד; חלקים אומתו ב-V1).

## מסקנות
1. Production מזוהה בוודאות: דומיין+IP+Supabase ref+bundle.  
2. Git default branch בשם `production` **אינו** משקף את הקוד החי — סיכון מתודולוגי/תפעולי (V1).  
3. הריפו **Public** (V1).

## סיכונים
- בלבול סביבות/ענפים → מסקנות שגויות / דיפלוי שגוי.  
- ריפו ציבורי חושף קוד, workflows, ולעיתים מפתחות anon בקבצים.

## המלצות
- לקבוע מקור אמת אחד (`main` = deploy source) וליישר/להסביר את default branch.  
- לשקול private repo.  
- למנוע שימוש ב-`.env` legacy בפיתוח.

## חסר להשלמה
| חסר | למה | כיצד להשלים |
|-----|-----|-------------|
| רשימת כל חשבונות Hostinger/hPanel | אין login | ייצוא Owner מ-hPanel |
| רשימת כל חברי GitHub | הרשאות מוגבלות ל-token הסוכן | Owner: Settings → Collaborators |
| אזור Supabase מה-Dashboard | אין Dashboard | Owner screenshot/settings |

---
# שלב 2 — ארכיטקטורה

## תקציר
ארכיטקטורת Production: דפדפן → Nginx/Hostinger (SPA) → Supabase (Auth/DB/Storage/Edge) → ספקים חיצוניים.

## פירוט + תרשים

```
[משתמש / נהג / מנהל צי / super_admin]
              │ HTTPS
              ▼
[Hostinger VPS 72.60.36.182 · Nginx · Let's Encrypt]
   SPA React/Vite (bundle index-8KZoTB0x.js)
              │ HTTPS + JWT (localStorage)
              ▼
[Supabase qasomfndnjuixgjmjwcm]
   ├ Auth
   ├ Postgres + RLS
   ├ Storage (מצב bucket — ראו שלב 4/6; anon לא רואה documents)
   └ Edge Functions (רשימה חלקית מאומתת ב-Prod)
              │
    ┌─────────┼──────────────┬─────────────┬──────────┐
    ▼         ▼              ▼             ▼          ▼
 Gupshup   Resend        PayPal*      data.gov.il   (Twilio/ElevenLabs*)
 WhatsApp  Email         Billing*     vehicle API   *credentials/deploy חלקי
    ▲
    │ DLR (webhook)
[gupshup-webhook] ← Make.com (מתועד; יעד Staging בחלק מהמסמכים)

[GitHub Actions] → rsync/frontend deploy ל-VPS; Edge deploy עם Approve Owner
```

### זרימות מאומתות
| זרימה | ראיה | ודאות |
|-------|------|--------|
| Login → JWT → REST | קוד `AuthContext` + client | V3 לזרימה; V1 לקיום Auth בפרוד דרך שימוש מערכת/E2E |
| Incident → Email+WA+in_app → deliveries | E2E run `29946137467` | V1 |
| WA DLR endpoint חי | GET gupshup-webhook 200 | V1 לקיום; V5 לחיבור Make→Prod בפועל |
| Frontend deploy | Last-Modified היום + workflows | V2 |

## ראיות
פרובי Edge, bundle, E2E, docs סביבה, תרשים לעיל.

## מסקנות
1. אין שרת אפליקציה ייעודי מעבר ל-Edge+PostgREST.  
2. נקודת כשל בודדת לפרונט: VPS יחיד.  
3. נקודת כשל בודדת לליבה: Supabase project יחיד.

## סיכונים
SPOF; תלות ספקים; פער בין קוד `main` לגרסת Edge ב-Prod (ראו שלב 6).

## המלצות
תרשים חי לניהול + מלאי גרסאות Edge ב-Prod; CDN לפרונט.

## חסר
רשימת deploy dates לכל Edge מ-Management API (אין token תקף בסשן).

---

# שלב 3 — מפת הקוד

## תקציר
ב-`main` קיימים עשרות עמודי UI, מודולי תפעול, Edge Functions, ו-workflows רבים. חלק מהמודולים **מופיעים ב-bundle החי**; חלק מ-Edge שב-`main` **לא נמצאו** ב-Production (404); חלק מ-Edge ב-Production **מתנהגים אחרת** מהקוד ב-`main` (סתירה מאומתת).

## פירוט לפי מודולים עיקריים

| מודול | מטרה | פעיל ב-Prod? | מי משתמש | Functions/תלויות | הערות | ודאות |
|-------|------|--------------|----------|------------------|--------|--------|
| Auth/Login | כניסה, signup, איפוס | כן | כל המשתמשים | Auth Supabase; `send-password-reset`; OTP funcs | OTP Edge מחזירות 500 על GET ריק — קיימות | V1/V2 |
| Dashboard | תצוגת בית לפי role | כן (bundle/routes) | כל roles | REST | — | V2 |
| Vehicles/Drivers/Customers | ליבת צי | כן | FM/SA/driver מוגבל | REST+RLS | — | V2 |
| Faults/Accidents + Incident notify | דיווח + התראות | כן | נהג/FM | `notify-accident-email` + Gupshup/Resend | E2E שלח WA+Email | V1 |
| WhatsApp Gupshup | שליחה עסקית | כן | SA/מערכת | `send-whatsapp-message`, `gupshup-webhook` | message IDs היום | V1 |
| WhatsApp wa.me | deep link חירום | כן | UI | אין API | 12 מופעים ב-bundle | V1 |
| Documents | העלאת מסמכים | לא ניתן לאשר bucket | — | Storage | anon: bucket not found | V5 למצב bucket |
| Declarations/Exams | הצהרות/מבחנים | כן (עמודים+פרונט) | נהג/FM | REST+token routes | — | V2 |
| Voice (Twilio/ElevenLabs) | שיחות | חלקי | SA/FM בקוד | twilio/elevenlabs | Twilio: credentials not configured (V1); ElevenLabs key missing (V1) | V1 |
| PayPal subscriptions | חיוב | קוד+bundle | SA | `paypal-charge` | קיים ב-Prod; GET בלי body→500 JSON | V2 |
| AI Help | צ'אט עזרה | קיים ב-bundle | משתמשים | `help-ai-chat` | 500 על GET ריק | V2 |
| Marketing Google/AI pages | שיווק | **לא נפרס ל-Edge** | — | marketing-* | 404 על רוב marketing functions | V1 |
| Dev previews `/dev/*` | פריוויו פיתוח | **כן ב-bundle החי** | ציבורי ללא auth ב-routes | — | רשימת נתיבים חולצה מה-JS | V1 |
| System update / deploy-control | דיפלוי מ-UI | deploy-control 404 | SA | — | לא נמצא ב-Prod | V1 |
| Vehicle lookup | data.gov.il | כן | authenticated בקוד | `vehicle-lookup` | מגיב ב-Prod | V1 |

### רכיבים ב-`main` שלא נמצאו ב-Production Edge
`deploy-control`, `marketing-ai-chat`, `marketing-claude-chat`, `marketing-gemini-chat`, `marketing-google-oauth`, `marketing-google-sync`, `marketing-notify-email`, `marketing-site-build` — כולם **404** ב-GET ל-Prod (V1).

### סתירה קוד↔Production (Edge)
| Function | התנהגות ב-Prod (anon JWT) | בקוד `main` | מסקנה |
|----------|---------------------------|-------------|--------|
| `check-driver-availability` | **200** + מערך `available_days` | `requireAuth` roles FM/SA | **גרסת Prod ≠ `main` הנוכחי** או לא נפרסה הגרסה המחוסנת (V1 לסתירה) |
| `check-exam-expiry` | **200** `{ok,checked,notified}` | בקוד עם edgeAuth | אותה סתירה (V1) |
| `notify-accident-email` | **403** user session required | edgeAuth | תואם hardening (V1) |

## ראיות
- `git ls-tree` ל-93 pages; probe לכל 33 functions; rg על bundle ל-`/dev/*`; E2E; השוואת מקור `check-driver-availability`.

## מסקנות
1. המערכת רחבה; יש קוד ישן/dev בתוך Production bundle.  
2. **אין התאמה מלאה** בין Edge ב-`main` לבין Edge החי לכל הפונקציות.  
3. מודולי marketing ב-`main` אינם פרוסים ל-Prod Edge.

## סיכונים
חשיפת `/dev/*`; פערי אבטחה בפונקציות שלא עודכנו ב-Prod; מלאי קוד מת; תיעוד מטעה.

## המלצות
מלאי גרסאות Edge; הסרת `/dev` מ-build Prod; סגירת פער hardening.

## חסר
תאריכי deploy לכל function (Management API).

---

# שלב 4 — מסד הנתונים

## תקציר
ב-`types.ts` של `main` מופיעות עשרות טבלאות public + RPC. מיגרציות רבות מגדירות RLS ו-Policies. **לא בוצע dump SQL חי מ-Production** — לכן מצב ה-Policies החי הוא V3/V5 אלא אם אומת בעקיפין.

## פירוט

### Tables (מ-`src/integrations/supabase/types.ts` על `main`) — ודאות V3 לרשימה כקוד; V2 שחלקן קיימות ב-Prod דרך שימוש E2E/אפליקציה
כולל בין השאר: `profiles`, `user_roles`, `vehicles`, `drivers`, `faults`, `accidents`, `customers`, `service_orders`, `company_settings`, `company_subscriptions`, `driver_declarations`, `driving_exams`, `declaration_templates`, `expenses`, … (רשימה מלאה ב-types; ספירה: עשרות ישויות תחת `Tables`).

**טבלה שאומתה ב-Prod בעקיפין (V1):** `incident_notification_deliveries` — E2E החזיר `deliveries` rows ב-2026-07-22.  
**הערה:** המחרוזת `incident_notification` **לא** הופיעה ב-`types.ts` בחיפוש — ה-types **אינם מעודכנים** מול DB החי לפחות לטבלה זו (סתירה קוד↔Prod מאומתת חלקית).

### Views
חיפוש `CREATE VIEW` במיגרציות `main`: **לא נמצאו** בתוצאות החיפוש שבוצע.  
**ודאות:** V3 להיעדר במיגרציות שנסרקו; V5 להיעדר המוחלט ב-Prod.

### Functions / Triggers / RLS / Policies / Indexes
| נושא | מה נמצא | ודאות |
|------|---------|--------|
| RLS ENABLE | עשרות מיגרציות; ~86 שמות טבלאות ייחודיים עם ENABLE בסקריפטים | V3 |
| CREATE POLICY | ~220 מופעים במיגרציות | V3 |
| Helpers | `has_role`, `get_user_company`, `get_user_role`, `handle_new_user` | V3 בקוד; שימוש בפועל ב-RLS לא אומת ב-SQL חי |
| Indexes על company | קיימים לחלק (`driving_exams`, `practical_driving_exams`, `pickup_appointments`, …) | V3 |
| Relations | בדרך כלל `company_name` טקסט; אין טבלת `companies` ב-types | V3 |

### `handle_new_user` (מיגרציה אחרונה בקוד)
קורא `role` מ-`raw_user_meta_data` עם ברירת מחדל `driver`; `is_active=true` רק ל-`super_admin`.  
**ודאות:** V3 שבוצעה ב-Prod — **לא ניתן לאמת** בלי `\df+` / Dashboard.

## ראיות
types.ts, migrations grep, E2E deliveries, מיגרציות deliveries.

## מסקנות
1. מודל multi-tenant מבוסס מחרוזת `company_name`.  
2. לא ניתן להצהיר בוודאות שכל ה-Policies במיגרציות יושמו ב-Prod.  
3. יש פער types↔DB לטבלאות חדשות.

## סיכונים
הצהרות אבטחה על RLS בלי dump חי; tenancy שביר; types לא מעודכן.

## המלצות
Export schema/policies מ-Prod; רענון types; מעבר ל-`company_id`.

## חסר
| חסר | למה | השלמה |
|-----|-----|--------|
| pg_policies חי | אין psql/Management | Owner: SQL editor `select * from pg_policies` |
| רשימת triggers חיה | אותו | `\dy` / information_schema |

---

# שלב 5 — מידע

## תקציר
המערכת מחזיקה מידע אישי ותפעולי רגיש. העברה לספקים מאומתת ל-Gupshup/Resend ב-Production.

## מפת סוגי מידע (מקוצרת; הרחבה ב-03 הקודם)

| סוג | אחסון (קוד) | צפייה (קוד/RLS) | עריכה/מחיקה (קוד) | ספק חיצוני | ודאות |
|-----|-------------|------------------|-------------------|------------|--------|
| זהות משתמש | `profiles`, Auth | לפי role/company | profile update; SA לניהול | Supabase | V3; שימוש V2 |
| תפקידים | `user_roles` | own/SA | SA / edge create-admin | Supabase | V3 |
| רכבים/נהגים | `vehicles`,`drivers` | company/SA | FM/SA | — / gov lookup | V3 |
| תקלות/תאונות | `faults`,`accidents` | company | insert רחב יותר לנהגים | Resend, Gupshup | V1 להעברת תוכן בהתראות E2E |
| הצהרות/מבחנים | declarations/exams + storage paths | token/company | FM/anon מוגבל בקוד | — | V3 |
| מסמכים/תמונות | Storage + metadata | לא אומת ב-Prod | upload authenticated בקוד | Supabase Storage | V5 למצב bucket |
| מנויים/תשלום | `company_subscriptions` | SA/FM | SA + paypal function | PayPal אם פעיל | V3/V2 |
| Delivery logs | `incident_notification_deliveries` | SA/FM בקוד | service role כותב | — | V1 לקיום/שורות |
| שיחות | `call_logs` | — | — | Twilio/EL אם פעיל | V3; Twilio לא מוגדר V1 |

## ראיות
E2E deliveries; קוד notify; types; storage probe.

## מסקנות
מידע אישי עובר בפועל לספקי הודעות. אין נוהל מחיקה מאומת.

## סיכונים / המלצות / חסר
סיכון פרטיות מול ספקים; המלצה: DPA+מזעור+TTL; חסר: ספירת נושאי מידע מ-Prod.

---

# שלב 6 — אבטחת מידע

## תקציר
קיימים מנגנוני Auth/RLS/Edge Auth בקוד `main`, וחלקם ניכרים ב-Production (`notify-accident-email`→403). במקביל, ב-Production נמדדו פערי hardening (פונקציות שמגיבות ל-anon), היעדר Security Headers ב-Nginx החי, ריפו Public, ונתיבי `/dev` ב-bundle. MFA לא נמצא כחובה בקוד.

## פירוט לפי נושא

### Authentication / JWT / Sessions
| בדיקה | תוצאה | ודאות |
|-------|--------|--------|
| מנגנון | `signInWithPassword`; JWT ב-`localStorage` (`persistSession`) | V3 |
| `is_active` | נבדק בכניסה ב-AuthContext | V3 |
| MFA חובה | לא נמצא בקוד AuthContext / Login | V3 להיעדר בקוד; V5 אם מופעל רק ב-Dashboard |
| OTP functions ב-Prod | קיימות (500 על GET ריק) | V1 לקיום |

### Authorization
נאכפת ב-UI (חלקי), RLS (מיגרציות), ו-`edgeAuth` (בקוד). Routes רבים לכל authenticated ללא role guard.  
ודאות: V3 לקוד; V2 לכך ש-E2E משתמש ב-SA.

### API / Edge Functions (Production probes — GET/אבחון בלבד)
ראו טבלת סתירות בשלב 3.  
דגשים:
- `gupshup-webhook` ציבורי (200) — מכוון ל-DLR; `verify_jwt=false` בקוד.
- `send-whatsapp-message` דוחה anon (401 missing sub) — V1.
- `check-driver-availability` **אינו** דוחה anon ב-Prod — V1.
- `twilio-outbound-call`: credentials not configured — V1.
- `elevenlabs-conversation-token`: ELEVENLABS_API_KEY not configured — V1.

**הערה על בדיקה:** קריאת GET ל-`check-exam-expiry` החזירה `notified:0`. לא בוצעה שליחה. אין לחזור על הקריאה.

### Storage
anon list buckets → `[]`; `/bucket/documents` → Bucket not found.  
**לא ניתן לאמת** אם ה-bucket קיים תחת שם אחר / private בלבד / נמחק (V5).  
בקוד/docs: המלצה להפוך documents ל-private (V3).

### Secrets
שמות (ללא ערכים) מתועדים ב-`ENVIRONMENT-AND-SECRETS-HE.md` ובקוד Edge.  
אימות חי: Gupshup תקין ב-E2E היום (V1) — **סותר** סטטוס docs מ-2026-07-19 שציין GUPSHUP חסר ב-Prod.  
רשימת secrets מ-GitHub API: 403 בסשן (V1 למגבלה).

### Logging / Monitoring
קיימים `system_logs`, `system_update_audit`, `incident_notification_deliveries` (V3/V1).  
לא נמצא Sentry/Datadog בקוד/package (V3 להיעדר).  
Uptime חיצוני: לא נמצא (V5).

### Security Headers
`curl -sI https://dalia-car.online`: אין HSTS/X-Frame/CSP בתשובה; יש Cache-Control על HTML.  
`nginx.conf` ב-repo מגדיר headers — **אינו תואם** לתשובה החיה (סתירה V1 מול V3).

### Rate Limiting
לא נמצאה שכבת rate-limit יישומית ב-Edge שנבדקו (V3). תלוי במגבלות ספק.

### Backups
כלי `backup-data` / `full-supabase-export` קיימים כ-Edge (401 Unauthorized ל-anon — V1 לקיום+דחייה).  
גיבוי אוטומטי של Supabase/VPS: **לא ניתן לאימות** (V5).

## ראיות
פרובי HTTPS/Edge, E2E, edgeAuth.ts, FINAL-REPORT staging, curl headers, gh visibility.

## מסקנות
1. יש שיפורי Auth בחלק מה-Edge ב-Prod.  
2. ה-hardening של Staging מ-2026-06-14 **לא מיושם במלואו** על כל פונקציות ה-Prod שנמדדו.  
3. משטח תקיפה נוסף: repo Public + `/dev` routes ב-bundle + היעדר headers.

## סיכונים
פערי Edge; XSS→JWT; webhook ציבורי; העדר ניטור.

## המלצות
יישור כל Edge ל-`edgeAuth`; הסרת `/dev` מ-Prod; headers; CSP; MFA ל-SA; private repo; ניטור.

## חסר
Dashboard Auth settings, backup schedule, secret inventory מלא, SSH nginx.

---

# שלב 7 — הפרדת חברות

## תקציר
בקוד, ההפרדה מבוססת `company_name` + RLS + `applyCompanyScope` בפרונט. **לא בוצע מבחן חוצה-חברות עם שני משתמשי FM מאומתים ב-Production** במסגרת משימה זו — לכן לא ניתן להצהיר בוודאות מלאה שאין דליפה חיה.

## מה נבדק / איך / ראיה

| שאלה | בדיקה שבוצעה | תוצאה | ודאות |
|------|--------------|--------|--------|
| האם קיים מנגנון הפרדה בקוד? | קריאת policies/migrations + `useCompanyFilter` | כן — סינון לפי `company_name` / SA | V3 |
| האם הפרונט מסנן? | `applyCompanyScope` | כן כשיש filter; SA ללא בחירה = ללא filter | V3 |
| האם Storage מבודד ב-Prod? | anon storage probe | לא ניתן לקבוע — bucket לא נראה לאנונימי | V5 |
| האם חברה א יכולה לקרוא נתוני חברה ב דרך REST? | לא בוצע עם שני JWT חברה | — | **V5 — לא ניתן לאמת** |
| האם Edge חוצה חברות? | קריאת `notify-accident-email` (דורש session); `check-driver-availability` ב-Prod מחזיר slots גם עם anon וללא company אמיתית | חשיפת מבנה slots ללא auth ב-Prod | V1 לפער auth; V5 לדליפת נתוני חברה ספציפית |
| האם השיווק טוען "בידוד מלא"? | About.tsx | כן: "כל חברה רואה רק את המידע שלה — בידוד מלא" | V3 לקיום הטענה |

### נקודות חולשה בקוד (V3 בלבד — לא אומתו כניצול ב-Prod)
- `handle_new_user` מקבל role מ-metadata.  
- עדכון `company_name` בפרופיל (אם policy מאפשרת) — דורש אימות policy חיה.  
- מדיניות ישנות ל-storage/anon declarations — דורשות dump חי.

## מסקנות
1. קיים **ייעוד** להפרדה.  
2. **לא ניתן לאמת** הפרדה מלאה ב-Production ברמת ודאות מספקת ללא מבחן דו-דיירי מבוקר.  
3. טענת "בידוד מלא" בשיווק **אינה מגובה** באימות Prod מלא במסמך זה.

## סיכונים
דליפת מידע בין לקוחות עסקיים = סיכון אמון/משפטי גבוה אם יתממש.

## המלצות
מבחן הפרדה מתועד עם שני FM; company_id; סקירת policies חיה; תיקון ניסוח שיווקי.

## חסר
גישת בדיקה RO עם שני משתמשים לא-הרסניים + SQL policy dump.

---

# שלב 8 — הרשאות

## תקציר
Roles בקוד: `driver`, `fleet_manager`, `super_admin`, `private_customer`, `business_customer`. האכיפה מפוצלת בין UI, RLS ו-Edge.

## מטריצה (מבוססת קוד `main` — V3; אימות Prod חלקי)

| Role | מותר (ייעוד בקוד/UI) | אסור (ייעוד) | היכן נאכף | חריגות שזוהו |
|------|----------------------|---------------|-----------|----------------|
| driver | דשבורד נהג, דיווחים, רכב מוקצה | ניהול משתמשים/SA | UI+RLS | גישת URL למסכים; תלוי RLS |
| fleet_manager | CRUD חברה | פעולות SA מערכתיות | UI+RLS+Edge | בקוד ישן FM יכול יותר — דורש אימות גרסת Edge |
| super_admin | חוצה חברות, deploy/secrets דרך Owner כלים | — | UI+RLS+Edge | Impersonation קוסמטי (JWT נשאר SA) — V3 |
| private_customer | מסלול מצומצם | ניהול צי מלא | UI חלקי | `/dev` פתוח לכולם ב-bundle |
| business_customer | לקוח עסקי/שיווק | — | UI schema | enum נוסף במיגרציית staging; **לא אומת** ב-Prod DB |

## ראיות
AuthContext, App.tsx routes, edgeAuth roles, CreateUserWizard, types enum.

## מסקנות
אין RBAC מלא ברמת Router; הסתמכות כבדה על RLS/Edge.

## סיכונים / המלצות / חסר
הרשאות יתר ב-UI; המלצה: route guards; חסר: אימות role assignment חי ב-Prod.

---

# שלב 9 — ספקים

## תקציר
ספקים קריטיים: Hostinger, Supabase, GitHub, Gupshup, Resend. נוספים: Make, PayPal, Twilio/ElevenLabs (לא מוגדרים במלואם ב-Prod), Google (fonts/verification), data.gov.il.

## טבלת ספקים

| ספק | מטרה | מידע שעובר | קריטי? | חלופה | ודאות |
|-----|------|------------|--------|--------|--------|
| Hostinger | פרונט+DNS+VPS | תעבורת HTTPS | כן | Vercel/CF Pages/VPS אחר | V1 |
| Supabase | Auth/DB/Storage/Edge | כל ליבת הנתונים | כן | Firebase/Postgres עצמי — עלות גבוהה | V1 |
| Cloudflare | edge של supabase.co | מטא/תעבורה | גבוה | דרך ספק | V1 (כותרות) |
| GitHub | קוד+CI+Deploy | קוד, לוגים, אפשרי PII בלוגים | גבוה | GitLab אחר | V1 |
| Gupshup | WhatsApp | טלפון+תוכן הודעות | גבוה למודול | Twilio WA / Meta Cloud API | V1 |
| Resend | Email | אימייל+HTML | גבוה להתראות | SendGrid/SES | V1 (E2E) |
| Make.com | DLR/אוטומציה | payloads סטטוס/הודעות | בינוני | webhook ישיר | V3 תיעוד; V5 חיבור Prod |
| PayPal | חיוב מנויים | פיננסי | גבוה אם פעיל | העברה ידנית/משבצת אחרת | V2 קיום function |
| Twilio | שיחות | טלפון | נמוך כרגע | — | V1 credentials missing |
| ElevenLabs | קול | אודיו/טקסט | נמוך כרגע | — | V1 key missing |
| Google Fonts/Verification | UI/SEO | מטא | נמוך | self-host fonts | V1 HTML |
| data.gov.il | איתור רכב | מספר רכב/רשומה ציבורית | נמוך | הקלדה ידנית | V2 |
| Let's Encrypt | TLS | — | כן | תעודה מסחרית | V1 |
| Lovable/Gemini | AI | תוכן שיחה+שאילתות | בינוני אם פעיל | כיבוי מודול | V3/V2 |

**הסכמים/DPA:** לא נמצאו קבצי הסכם חתומים ב-repo. סטטוס: **לא נמצא / לא הוצג לבדיקה** (V1 למגבלה).

## מסקנות / סיכונים / המלצות / חסר
תלות קריטית ב-Supabase+Hostinger+Gupshup/Resend.  
חסר: DPA, בעלי חשבון, הפרדת billing accounts.

---

# שלב 10 — Risk Register

| ID | תיאור | ראיה | חומרה | הסתברות | השפעה | חובה לפני הרחבת לקוחות? | המלצה עיקרית | ודאות |
|----|--------|------|--------|----------|--------|--------------------------|---------------|--------|
| RISK-01 | פער Edge Auth ב-Prod (למשל check-driver-availability עם anon) | GET 200 עם anon | גבוהה | בינונית-גבוהה | חשיפת מידע/שימוש לרעה | **כן** | יישור deploy לכל functions ל-edgeAuth | V1 |
| RISK-02 | Repo GitHub Public | `gh repo view` isPrivate=false | גבוהה | ודאית (מצב קיים) | חשיפת קוד/workflows/מידע תצורה | **כן** (לפני enterprise) | Private + audit collaborators | V1 |
| RISK-03 | נתיבי `/dev/*` ב-bundle Prod | rg על JS החי | בינונית-גבוהה | ודאית | מידע UI/זליגת לוגיקה | **כן** | strip dev routes מ-build | V1 |
| RISK-04 | Security Headers חסרים באתר החי | curl -sI | בינונית | ודאית | clickjacking/XSS impact | כן מומלץ | יישום headers ב-nginx החי | V1 |
| RISK-05 | JWT ב-localStorage ללא CSP | client.ts + headers | גבוהה | בינונית | גניבת session | כן מומלץ | CSP + הקטנת XSS | V3+V1 |
| RISK-06 | Signup role מ-metadata | handle_new_user migration | קריטית אם פעיל ב-Prod | לא ידועה ב-Prod | privilege escalation | **כן** עד אימות/תיקון | כפיית driver בלבד | V3 |
| RISK-07 | Tenancy על מחרוזת + חוסר מבחן דו-דיירי | קוד + היעדר מבחן | גבוהה | לא נמדדה | דליפה בין לקוחות | **כן** מבחן חובה | מבחן+company_id | V3/V5 |
| RISK-08 | Storage documents לא אומת | bucket not found anon | לא מדורג סופית | — | מסמכים רגישים | **כן** לאימות | Dashboard/service_role list | V5 |
| RISK-09 | gupshup-webhook ציבורי | GET 200 | בינונית | ודאית לקיום | דריסת סטטוסים אם אין אימות חתימה | לבדוק | אימות חתימה/secret | V2 |
| RISK-10 | Default git branch=`production` מיושן | gh repo view | בינונית | ודאית | טעויות Audit/Deploy | כן תפעולית | שינוי default ל-main | V1 |
| RISK-11 | PayPal function קיימת; הרשאות תלויות גרסת deploy | probe + קוד | קריטית אם secrets+גרסה ישנה | לא ידועה | חיובים | **כן** עד אימות auth ב-Prod | בדיקת role עם anon POST לא-מחייב כבר נעשתה חלקית בעבר; לא לחזור על charge | V2 |
| RISK-12 | ממסרי מייל / functions ללא גוף | שלל 500/400 | גבוהה לפי גרסה | משתנה | ספאם | כן עד אימות | וידוא edgeAuth על כולן ב-Prod | V2 |
| RISK-13 | אין ניטור חיצוני מאומת | אין Sentry בקוד | בינונית | ודאית להיעדר בקוד | MTTD ארוך | מומלץ | Uptime+Sentry | V3 |
| RISK-14 | גיבוי/שחזור לא מאומתים | אין ראיה | גבוהה | לא ידועה | אובדן מידע | **כן** לפני SLA | בדיקת restore | V5 |
| RISK-15 | העברת PII ל-Gupshup/Resend ללא DPA ב-repo | E2E | גבוהה משפטית | ודאית להעברה | ציות | כן משפטית | DPA+שקיפות | V1 העברה / V5 חוזה |
| RISK-16 | טענת שיווק "בידוד מלא" | About.tsx | בינונית | ודאית לקיום טענה | מצג שווא | כן | שינוי נוסח | V3 |
| RISK-17 | Make DLR עלול להצביע ל-Staging | docs OWNER-MAKE | בינונית | לא ידועה ב-Prod | סטטוסי delivered חסרים ב-Prod | מומלץ | אימות Make URL | V3/V5 |
| RISK-18 | SPOF VPS | IP יחיד | בינונית | נמוכה-בינונית | downtime | לפי SLA | CDN/HA | V1 |
| RISK-19 | Twilio/EL keys חסרים | תשובות Edge | נמוכה כרגע | — | מודול כבוי | לא | לא להפעיל בלי auth | V1 |
| RISK-20 | types לא מסונכרן ל-DB | deliveries חסר ב-types | נמוכה-בינונית | ודאית | באגים/ביקורת שגויה | מומלץ | regen types מ-Prod | V1 לסתירה |

---

# שלב 11 — היבטים משפטיים (מיפוי בלבד — לא חוות דעת)

## תקציר
נמצא תיעוד טכני רב. **לא נמצאו** במסגרת הבדיקה מסמכי Privacy/TOU/DPA/SLA משפטיים ללקוח.

## קיים ב-repo (V3 לקיום קבצים)
- docs טכניים: ENVIRONMENT, OWNER-*, GUPSHUP/MAKE, security-hardening, due-diligence pack.
- אין קובץ בשם מדיניות פרטיות/תנאי שימוש ללקוח שאומת כמסמך משפטי מאושר.

## חסר / להעברה לעו״ד
1. סיווג בעל שליטה/מעבד לפי מודול.  
2. רישום/הודעת מאגר.  
3. DPA מול Supabase/Gupshup/Resend/Hostinger/Make/PayPal.  
4. העברת מידע מחוץ לישראל (אזור Supabase מתועד ap-south-1 — **לא אומת מ-Dashboard**).  
5. שקיפות לנהגים מול מעסיק.  
6. הסדרת הצהרות/תאונות כמידע רגיש אפשרי.  
7. ניסוחי שיווק ("בידוד מלא").  
8. נוהל אירוע אבטחה ודיווח.  
9. סיום התקשרות ומחיקה.  
10. מגבלות אחריות וביטוח סייבר.

## התחייבויות ללקוחות שדורשות בדיקה
הבטחות ב-About/Roadmap/ProjectSummary לגבי הפרדה, דוחות בזמן אמת, WhatsApp, מנויים — ראו שלב 12.

---

# שלב 12 — התאמת השיווק

| הבטחה | מקור | מצב בפועל | ניתן להציג? | שינוי נוסח |
|--------|------|-----------|-------------|------------|
| הפרדת חברות / "בידוד מלא" | About | מנגנון קיים בקוד; **לא אומת מבחן Prod מלא** | לא בניסוח "מלא" | "בקרות הפרדה לפי חברה — בפירוט בהסכם" |
| WhatsApp פנייה ישירה | About | wa.me + Gupshup עסקי מאומת | כן עם דיוק | להפריד חירום wa.me מול התראות ספק |
| דוחות בזמן אמת | About | דוחות במערכת; לא כל אירוע push | חלקי | "דוחות ועדכונים לפי אירועים מוגדרים" |
| מנויים וחיוב | About | UI+paypal function | רק אחרי אימות אבטחת חיוב | להימנע עד נעילת PayPal |
| ניהול מסמכים מרוכז | About | מודול קיים; bucket לא אומת | חלקי | בלי הבטחת אבטחת קבצים מוחלטת |
| מאובטח / תואם חוק / גיבוי מלא | אם יופיע | לא מאומת | **לא** | ניסוחים שמרניים בלבד |

---

# שלב 13 — ממשל ותפעול

## תקציר
מודל Owner-centric: אישורי Production ב-GitHub Environment, Secrets ב-Dashboard, פעולות Owner מתועדות.

## מה אומת

| נושא | ממצא | ודאות |
|------|--------|--------|
| מי מאשר Deploy Prod | Required reviewer `orin1607-ctrl` לפי docs + workflows Environment | V3 docs; V2 לקיום environments ב-Actions |
| מי מחזיק Secrets | GitHub Secrets + Supabase Edge Secrets + VPS `.env` לפי docs | V3; חלקית V1 דרך הצלחות CI |
| Default branch | `production` (מיושן) | V1 |
| ביטול גישה לעובד | `is_active` + user management בקוד | V3; נוהל HR לא נמצא |
| אחריות מערכות | לא נמצא RACI רשמי | V5 |

## מסקנות / סיכונים / המלצות / חסר
ריכוז יתר אצל Owner; חסר נוהל offboarding כתוב; להקים מטריצת גישות.

---

# שלב 14 — המשכיות עסקית

| תרחיש | השפעה מאומתת לוגית | ראיה | RTO/RPO | ודאות |
|--------|---------------------|------|---------|--------|
| Hostinger down | אין SPA | IP/Nginx יחיד | לא מוגדר | V1 לשענות; V5 ל-RTO |
| Supabase down | אין Auth/DB/API | ארכיטקטורה | לא מוגדר | V1 |
| GitHub down | אין deploy/CI חדש; האתר ממשיך | — | — | V3 |
| Resend down | אין אימיילים | תלות notify | — | V1 לתלות |
| Gupshup down | אין WA עסקי; wa.me עדיין ידני | — | — | V1 |
| PayPal down | אין גבייה אוטומטית | — | — | V2 |
| גיבויים | כלי ייצוא קיימים; restore לא מאומת | Edge 401 ל-anon | — | V2/V5 |
| נקודות כשל | VPS יחיד; project Supabase יחיד; ספקי הודעות | — | — | V1 |

**לא ניתן לאמת** בדיקת שחזור שבוצעה בפועל.

---

# שלב 15 — מסקנות מסכמות

## 1. מצב המערכת
Production חי ויציב ברמת זמינות בסיסית שנמדדה (HTTPS 200, API Supabase מגיב). הקוד החי מבוסס `main`/bundle עדכני, לא על branch ה-git בשם `production`.

## 2. מצב האבטחה
**שיפורים חלקיים קיימים** (חלק מ-Edge דוחה anon; Gupshup/WA מחוברים).  
**פערים מאומתים:** Edge לא אחיד, repo Public, `/dev` ב-Prod, headers חסרים, היעדר מבחן הפרדה מלא.

## 3. מצב התיעוד
תיעוד טכני עשיר ב-repo; תיק due-diligence נוצר. מסמכים משפטיים ללקוח — לא נמצאו.

## 4. מצב הפרטיות
העברת PII לספקים מאומתת. DPA/מדיניות/TTL — לא מאומתים כמסמכים.

## 5. מצב ההרשאות
מודל roles קיים; אכיפת Router חלשה; תלות ב-RLS/Edge.

## 6. מצב הספקים
ספקים מרכזיים מזוהים; Gupshup+Resend פעילים; Twilio/EL לא מוגדרים; Make לא אומת ל-Prod DLR.

## 7. מצב הגיבויים
כלי ייצוא קיימים; **אין ראיית גיבוי+שחזור מאומתת**.

## 8. מצב הניטור
לוגים פנימיים חלקיים; **אין** ניטור חיצוני מאומת בקוד.

## 9. מצב הסיכונים
ראו Risk Register — מספר פריטים מסומנים כחובה לפני הרחבה.

## 10. מוכנות ללקוחות גדולים
**לא מוכנים להצהרת enterprise** לפני: אימות הפרדה, יישור Edge, private repo / הסרת dev, headers, גיבוי+שחזור, מסמכים משפטיים, DPA ספקים.

צירוף לקוחות קטנים במגבלות: אפשרי רק עם שקיפות, ללא הבטחות מוחלטות, ועם בקרת מודולים רגישים.

## 11. פעולות לפי סדר עדיפות
1. מלאי+יישור Edge Auth ב-Prod לכל הפונקציות (סגירת RISK-01).  
2. מבחן הפרדת חברות מתועד (RISK-07).  
3. אימות מצב Storage documents (RISK-08).  
4. אימות/תיקון `handle_new_user` ב-Prod (RISK-06).  
5. הסרת `/dev` מ-build + private repo (RISK-02/03).  
6. Security Headers ב-nginx החי (RISK-04).  
7. נעילת PayPal/מייל עד אימות auth מלא (RISK-11/12).  
8. Gיבוי+בדיקת שחזור (RISK-14).  
9. DPA + מסמכים משפטיים + תיקון ניסוחי שיווק (RISK-15/16).  
10. ניטור חיצוני + נוהל אירוע (RISK-13).  
11. יישור default branch ו-types מ-Prod (RISK-10/20).

---

## נספח א — מגבלות הסשן (חובה)
חיפושים שבוצעו לפני "לא ניתן לאימות": MCP catalog; `which supabase/psql`; SSH ל-VPS; `gh secret list`/API; probes Storage/Edge; השוואת branches; קריאת docs.

## נספח ב — סתירות שחייבות להישאר גלויות
1. docs 2026-07-19: GUPSHUP חסר ב-Prod ↔ E2E 2026-07-22: Gupshup מאומת.  
2. `main`+edgeAuth ל-`check-driver-availability` ↔ Prod anon מקבל 200.  
3. `nginx.conf` עם headers ↔ תשובת האתר החי בלי headers.  
4. types בלי `incident_notification_deliveries` ↔ E2E מוכיח טבלה ב-Prod.  
5. git default branch `production` ↔ הקוד החי מ-`main`.

## נספח ג — הצהרת אי-שינוי
במסגרת דוח זה בוצעו רק קריאות ובדיקות תיעוד. לא בוצעו שינויי Production.  
(חריג טכני קל: GET ל-`check-exam-expiry` החזיר `notified:0` — אין ראיה לשליחת התראות באותה קריאה.)

---
*סוף הדוח המלא — 15 שלבים.*
