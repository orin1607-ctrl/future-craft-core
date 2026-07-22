# 01 — דוח־אב פנימי וסודי — מערכת דליה
**סיווג:** פנימי · סודי · לא להעברה ללקוחות  
**תאריך בדיקה:** 2026-07-22  
**Commit ייחוס (main):** `92829c778371e775ca0c7998f5f761456e681c5d`  
**אתר Production:** https://dalia-car.online  
**Supabase Production:** `qasomfndnjuixgjmjwcm` (region מתועד: ap-south-1)  
**סוכן:** bc-0b75dfd1-7232-4477-81d9-0cf05cc55017  

---

## א. עיקרון סיווג ראיות
כל טענה מסווגת כ:
1. **עובדה מאומתת בפרודקשן**
2. **עובדה מאומתת בקוד**
3. **פער / סיכון אפשרי**
4. **דרישה משפטית אפשרית לבדיקה**
5. **המלצה מקצועית**
6. **לא ניתן לאימות**

---

## ב. תיקון מתודולוגי קריטי (ביחס לדוח הראשון)

### ב.1 מה שגוי בדוח הראשון
| נושא | מה נכתב | מה אומת עכשיו |
|------|---------|----------------|
| מקור הקוד שנבדק | Branch `production` מקומי | Branch `production` **מיושן** (HEAD מ-2026-06-06). המערכת החיה נפרסת מ-`main` (2026-07-22) |
| Gupshup | "אין Gupshup, רק wa.me" | **הופרך.** Gupshup פעיל ב-Production; שליחה חיה היום עם message IDs |
| גישה ל-Dashboard | "אין גישה ישירה" | ניסוח מוקדם מדי — לא מופו כל החיבורים לפני כן |

### ב.2 מקור האמת ל-Production (מאומת)
| ראיה | תוצאה |
|------|--------|
| Bundle חי `index-8KZoTB0x.js` | מצביע ל-`qasomfndnjuixgjmjwcm.supabase.co` ומכיל מחרוזות `GUPSHUP`, `send-whatsapp-message`, וגם `wa.me` |
| HTML חי | כותרת "דליה - ניהול צי רכב"; Last-Modified 2026-07-22 16:58:34 GMT |
| DNS A | `dalia-car.online` → `72.60.36.182` |
| SSL | Let's Encrypt; subject CN=dalia-car.online; תוקף עד 2026-10-04 |
| GitHub Actions | `E2E Notifications Live (WA + Email)` run `29946137467` ב-2026-07-22 18:19Z — הצלחה |

---

## ג. מיפוי גישות בסשן זה

### ג.1 MCP / Connectors
| מערכת | סוג | קריאה/כתיבה | נבדק? | מה ניתן לבדוק | השפעה אם לא נוצל |
|--------|-----|-------------|--------|----------------|-------------------|
| cursor-cloud MCP | API פנימי לסוכנים | קריאה | כן | run-info, environment, list-agents, batch-fetch | אין השפעה על Prod |
| MCP אחרים (Supabase/Hostinger/Google) | — | — | כן — catalog ריק מלבד cursor-cloud | אין | לא ניתן לשלוף Dashboard דרך MCP |

### ג.2 כלי מקומיים / CLI
| כלי | זמין? | קריאה/כתיבה פוטנציאלית | נוצל? | ממצא |
|-----|--------|-------------------------|--------|------|
| Git + GitHub remote | כן | כתיבה אפשרית ל-git; Audit ב-RO | כן (fetch/show/grep) | גישה ל-main/production/branches |
| `gh` CLI | כן; auth כ-`cursor` | RO לרוב; secrets=403 | כן | workflows, runs, logs |
| Supabase CLI | **לא מותקן** | — | ניסיון נכשל | אין `supabase` ב-PATH |
| `psql` | **לא מותקן** | — | ניסיון נכשל | אין שאילתות SQL ישירות |
| SSH | בינארי קיים; **אין מפתחות** ב-`~/.ssh` | כתיבה אפשרית אם היה מפתח | ניסיון RO: `Permission denied (publickey,password)` ל-`root@72.60.36.182` | אין קריאת nginx פעיל מה-VPS |
| curl/dig/openssl | כן | קריאה חיצונית | כן | HTTPS/DNS/SSL/Edge probes |
| `.env` מקומי | כן | מכיל מפתחות Vite בלבד | כן (שמות/פרויקט בלבד) | מצביע ל-`kuenhflklivaxrmqbsee` — **לא** פרויקט ה-Production החי |
| GitHub Secrets list API | 403 | — | כן | חסרות הרשאות integration לרשימת secrets |
| Browser Dashboard session | לא נמצא | — | חיפוש: אין cookies/sessions ל-Supabase/Hostinger/Gupshup portal | אין |

### ג.3 גישות Production שנעשה בהן שימוש (קריאה בלבד)
1. HTTPS ל-`dalia-car.online` / `www` — headers, HTML, JS bundle.
2. DNS/SSL לדומיין.
3. Supabase REST/Storage/Functions endpoints על `qasomfndnjuixgjmjwcm` — GET/OPTIONS/POST לא-מזיקים בלבד (לא charge, לא send message חדש, לא upload).
4. GitHub Actions logs של E2E שכבר רץ היום (קריאת לוגים בלבד).
5. קוד `origin/main` כולל Edge Functions ו-migrations.

### ג.4 גישות שלא נוצלו / חסרות (עם פירוט)
| גישה שחיפשתי | היכן | מה נמצא | מה חסר | הרשאת RO נדרשת | למה אי אפשר להשלים בלעדיה |
|--------------|------|---------|--------|-----------------|---------------------------|
| Supabase Management API | docs + env + CLI | אין ACCESS_TOKEN תקף בסשן; docs ב-main מציינים token שפג/401 ב-CI | token RO ל-Management | רשימת functions+deploy dates+secrets names+Auth URL config רשמיים |
| Supabase Dashboard | אין session דפדפן | אין | login Owner | Auth settings, backups UI, policies live export |
| PostgreSQL metadata | אין psql + אין DB URL בסשן | — | DB connection RO או SQL editor export | RLS/policies/tables live dump |
| SSH VPS / nginx פעיל | ניסיון SSH | Permission denied | deploy key RO | קובץ nginx בפועל, logs, ops env names |
| Hostinger hPanel | אין | אין | credentials RO | backups VPS, DNS UI, billing |
| Gupshup portal | אין | אין | Owner login | logs פורטל, templates UI |
| Make.com API/UI | קיים בקוד/docs/workflows; אין token בסשן | — | Make API RO | תרחישי DLR פעילים בפועל |
| Resend Dashboard | אין | אין | API RO / dashboard | domains, logs |
| Google Workspace/OAuth admin | מחרוזות marketing-google בקוד main; 404 על חלק מה-functions בפרוד | — | — | האם Google sync פעיל ב-Prod |

---

## ד. ארכיטקטורה (מאומתת מעורבת)

```
Browser → https://dalia-car.online (Hostinger VPS 72.60.36.182, Nginx, Let's Encrypt)
       → Supabase qasomfndnjuixgjmjwcm (Auth, Postgres+RLS, Storage, Edge)
            → Gupshup WhatsApp API (api.gupshup.io)
            → Resend Email
            → PayPal (אם מוגדר)
            → (אופציונלי) Twilio/ElevenLabs/Lovable AI
            → gupshup-webhook ← Make.com DLR (מתועד; יעד Staging מתועד במפורש בחלק מהמסמכים)
GitHub main → Actions → Deploy frontend VPS / Edge deploy workflows
```

**עובדה מאומתת בפרודקשן:** הפרונט החי + Edge `send-whatsapp-message` + `gupshup-webhook` על אותו project-ref.

---

## ה. ספקים (סיכום — פירוט ב-04)
Hostinger, Supabase (+Cloudflare מול supabase.co), GitHub, Gupshup, Resend, Make.com (DLR), PayPal, Twilio (קוד קיים; credentials לא מוגדרים לפי תשובת Edge ב-Prod), ElevenLabs, Lovable AI/Gemini, Google Fonts + site verification, data.gov.il, Let's Encrypt.

---

## ו. WhatsApp / Gupshup — תיקון מלא
ראו גם קובץ זה §ז ו-`02-VERIFIED-FINDINGS-REGISTER.md` ממצא F-WA-01.

### ו.1 היכן הקוד
| רכיב | נתיב ב-`main` |
|------|----------------|
| שליחה | `supabase/functions/send-whatsapp-message/index.ts` |
| DLR webhook | `supabase/functions/gupshup-webhook/index.ts` |
| התראות תקלה/תאונה כולל WA | `supabase/functions/notify-accident-email/index.ts` (שולח גם WhatsApp דרך Gupshup) |
| UI | `src/lib/whatsappClient.ts`, `src/components/settings/GupshupWhatsAppSection.tsx`, `src/pages/WhatsAppSettingsPage.tsx` |
| wa.me (deep link חירום) | `src/components/faults/WhatsAppButton.tsx` — **מקביל**, לא מחליף Gupshup |

### ו.2 איזה פרויקט מריץ
**Production:** `qasomfndnjuixgjmjwcm`  
ראיה: E2E log `const url = 'https://qasomfndnjuixgjmjwcm.supabase.co'` + GET חי ל-functions.

### ו.3 טבלת Delivery
`public.incident_notification_deliveries`  
Migrations: `20260719080000_incident_notification_deliveries.sql`, `20260721080000_gupshup_dlr_deliveries.sql`, `20260721090000_delivery_status_history.sql`  
**מאומת בפרודקשן** ע"י E2E שקרא rows אחרי שליחה (2026-07-22 18:19Z).

### ו.4 Webhook סטטוס
Edge `gupshup-webhook` — GET חי מחזיר `{"ok":true,"service":"gupshup-webhook"}`.  
`verify_jwt=false` בקוד main.  
Make.com מתועד כמגשר DLR (לעיתים ל-Staging URL). **האם Make מצביע ל-Prod webhook כרגע — לא ניתן לאימות ללא Make login.**

### ו.5 ראיית שליחה היום (Production)
מתוך Actions run `29946137467`:
- `provider_message_id` (בדיקה): `6556b4c6-fb13-463d-90b3-98c6cade5696`
- `provider_message_id` (incident notify WA): `e97319c6-cc60-4383-a506-4889a2a0ed83`
- `gupshup_verified` / מפתח תקין: success
- App: `DaliaVehicle`, source: `972546500305`

### ו.6 מדוע לא הופיע בדוח הראשון
1. ה-checkout היה על branch בשם `production` ש**אינו** מכיל את קוד Gupshup (אין קבצים).
2. חיפוש `gupshup` על ה-tree המקומי החזיר ריק.
3. לא בוצע מיפוי branches/`main`/Actions לפני המסקנה.
4. לא בוצעה בדיקת קיום Edge `send-whatsapp-message` / `gupshup-webhook` על ה-URL החי לפני המסקנה.

**מסקנה מתוקנת:** Gupshup **קיים ופעיל ב-Production**. במקביל עדיין קיימים קישורי `wa.me` למקרי חירום/שיתוף ידני.

---

## ז. ממצאים לפי קטגוריית ראיה (תמצית)
פירוט מלא ב-02. סיכום:
- מאומת Prod: Gupshup send, webhook endpoint חי, Resend בשימוש ב-E2E, paypal-charge רץ עם anon JWT (unknown action), send-vehicle-file-report רץ עם anon, security headers חסרים בתשובת nginx, Twilio credentials missing ב-Prod לפי תשובת הפונקציה.
- מאומת קוד: RLS migrations, signup role metadata, storage policies ישנות, tenancy ב-company_name.
- לא ניתן לאימות בסשן: dump מלא של policies חי, Auth redirect URLs ב-Dashboard, backups Supabase, nginx file על VPS, רשימת secrets names מ-Dashboard, האם documents bucket קיים (anon מחזיר bucket not found / list ריק).

---

## ח. Secrets — שמות בלבד (ממסמכים + קוד + E2E)
`GUPSHUP_API_KEY`, `GUPSHUP_SOURCE`, `GUPSHUP_APP_NAME`, `GUPSHUP_APP_ID` (default בקוד), `RESEND_API_KEY`, `RESEND_FROM`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`/`PUBLISHABLE`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`, `TWILIO_*`, `ELEVENLABS_*`, `LOVABLE_API_KEY`, `OPS_WEBHOOK_URL`, `OPS_WEBHOOK_SECRET`, `GITHUB_PAT`, `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, Make credentials (ב-GitHub/Make — לא נקראו ערכים).

---

## ט. אזהרת סביבות
| סביבה | Project ref | הערה |
|--------|-------------|------|
| Production חי | `qasomfndnjuixgjmjwcm` | Bundle + E2E |
| Staging | `usfeoerkpcafxxlyuldl` | Pages + DLR docs |
| `.env` מקומי בסוכן | `kuenhflklivaxrmqbsee` | **לא** ה-Production החי |
| Branch git בשם `production` | קוד ישן מ-יוני | עלול להטעות Audit |

---

*סוף קובץ 01. אין ערכי סודות / אין PII מעבר למזהי בדיקה שכבר הופיעו בלוגי CI של Owner.*
