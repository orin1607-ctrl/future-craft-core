# כרך ד' – ספקים (Security Due Diligence)
## מערכת דליה — Production בלבד · Read Only · מבוסס ראיות

| שדה | ערך |
|-----|-----|
| תאריך איסוף | 2026-07-23 |
| Production | https://dalia-car.online |
| Supabase Production | `qasomfndnjuixgjmjwcm` (מאומת מ-bundle חי) |
| מקור קוד להשוואה | `origin/main` |
| Bundle חי | `/assets/index-8KZoTB0x.js` |
| מצב עבודה | **Read Only** — אין Deploy / שינוי Secrets / שליחות / חיובים במסגרת משימה זו |

### מקרא ודאות
| קוד | משמעות |
|-----|--------|
| **V1** | מאומת בוודאות מול Production חי |
| **V2** | מאומת חלקית מול Production |
| **V3** | נמצא בקוד/`main`/docs בלבד — לא הוכח כפעיל ב-Production |
| **V4** | אזכור בלבד / חשד |
| **V5** | לא ניתן לאמת |

### כלל הפרדה
- **ספק פעיל ב-Production** = יש ראיה חיה (HTTP/DNS/SSL/E2E/bundle מצביע על שימוש runtime).
- **ספק בקוד בלבד** = מופיע ב-`main` או ב-secrets-names, אך Edge/שירות ב-Prod לא אומת כפעיל (למשל 404).
- **אין הכללת ספקים שלא נמצאו.**

---

# א. טבלה מסכמת — ספקים שאומתו מול המערכת

| # | ספק | סוג שירות | תפקיד | פעיל ב-Prod? | היכן השימוש | ודאות |
|---|-----|-----------|--------|--------------|-------------|--------|
| 1 | Hostinger | VPS / DNS hosting | אחסון SPA + DNS | כן | IP `72.60.36.182`, NS `*.dns-parking.com`, Nginx, workflows SSH/`dalia-ops` | V1 |
| 2 | Let's Encrypt | CA / TLS | תעודת SSL | כן | openssl issuer YE2 על `dalia-car.online` | V1 |
| 3 | Supabase | BaaS | Auth, DB, Storage, Edge | כן | Bundle URL `qasomfndnjuixgjmjwcm.supabase.co` + Edge חיים | V1 |
| 4 | Cloudflare | CDN/Edge (דרך Supabase) | תעבורת API Supabase | כן (כחלק מתשתית Supabase) | כותרות `server: cloudflare`, `cf-ray` על supabase.co | V1 |
| 5 | GitHub | SCM + CI/CD | קוד, Actions, Deploy | כן | repo `orin1607-ctrl/future-craft-core`, workflows, bundle מפנה גם ל-Pages | V1 |
| 6 | Gupshup | WhatsApp BSP / API | שליחת WhatsApp עסקי + DLR webhook | כן | Edge `send-whatsapp-message`, `gupshup-webhook`, `notify-accident-email`; E2E 2026-07-22 | V1 |
| 7 | WhatsApp (Meta) — ערוץ הודעות | Messaging channel | קבלת הודעות אצל המשתמש | כן (דרך Gupshup + wa.me) | E2E שליחה; 12× `wa.me` ב-bundle | V1 לערוץ; **אין** אינטגרציית Meta Cloud API ישירה בקוד |
| 8 | Resend | Transactional email | אימיילים (איפוס/התראות) | כן | E2E email `status:sent` + message_id; קריאות `api.resend.com` בקוד | V1 |
| 9 | PayPal | Payments | חיוב מנויים | Edge קיים; פעילות חיוב **לא אומתה** | `paypal-charge` מגיב ב-Prod; Live API בקוד | V2 |
| 10 | Twilio | Voice/SMS API | שיחות יוצאות | **לא מוגדר** ב-Prod | Edge קיים; תשובה: credentials not configured | V1 לאי-הגדרה |
| 11 | ElevenLabs | Conversational AI / Voice | טוקן שיחה / יציאה קולית | **מפתח לא מוגדר** ב-Prod | Edge קיים; תשובה: ELEVENLABS_API_KEY not configured; SDK ב-package | V1 לאי-הגדרת מפתח |
| 12 | Lovable (AI gateway + build heritage) | AI gateway / scaffolding | `help-ai-chat` → `ai.gateway.lovable.dev` | Edge קיים; הצלחת שיחה חיה **לא אומתה** | Bundle + Edge `help-ai-chat` 500 על GET ריק (קיום); meta Lovable ב-HTML | V2 |
| 13 | Google (Fonts / Site Verification / GCS assets) | Web assets / SEO | גופנים, אימות אתר, תמונות OG | כן | HTML חי: fonts.googleapis.com, google-site-verification, storage.googleapis.com | V1 |
| 14 | data.gov.il | Open data API | איתור רכב | כן (proxy) | `vehicle-lookup` ב-Prod מחזיר 400 למספר לא תקין (הפונקציה חיה) | V1 |
| 15 | Make.com | iPaaS / Webhooks | DLR/בוט WhatsApp (תיעוד) | **לא ניתן לאמת** פעילות נוכחית מול Prod | Docs + workflows + JSON תוצאות; יעד מתועד ל-**Staging** webhook | V3 לקיום אינטגרציה מתועדת; V5 למצב חי נוכחי ל-Prod |

### ספקים / שירותים שנמצאו ב-`main` אך **לא אומתו כפעילים ב-Production Edge** (404 ב-GET)

| שם | מקור | סטטוס Prod | ודאות |
|----|------|------------|--------|
| OpenAI | `marketing-ai-chat`, `marketing-site-build` | 404 | V3 בקוד; V1 לאי-פריסה |
| Anthropic / Claude | `marketing-claude-chat`, secrets names | 404 | V3/V1 |
| Google Gemini / Google OAuth Ads/Analytics/GSC | `marketing-gemini-chat`, `marketing-google-*` | 404 | V3/V1 |
| Figma / Webflow / Plasmic / Runway / v0 / Builder.io / WordPress | `marketing-site-build` env names | 404 ל-function | V3 |
| Deepgram | טקסט ב-UI SettingsTab בלבד | אין Edge/API | V4 אזכור בלבד — **לא ספק מאומת** |

**WhatsApp Business API כספק נפרד מ-Meta ישירות:** לא נמצא קוד שקורא ל-`graph.facebook.com` לשליחת הודעות. הגישה העסקית המאומתת היא דרך **Gupshup** (`api.gupshup.io`). במסמכי Gupshup מופיע מספר WABA/source `972546500305`.

---

# ב. פרקים מפורטים לפי ספק

---

## 1) Hostinger

### פרטי הספק
| שדה | ערך |
|-----|-----|
| שם | Hostinger |
| סוג | VPS + DNS hosting |
| תפקיד | מארח את ה-SPA של Production; DNS לדומיין |
| פעיל כיום | כן |
| היכן | DNS NS `hyperion/atlas.dns-parking.com`; A→`72.60.36.182`; Nginx; workflows עם SSH ל-VPS ו-`/root/dalia-ops` |
| ודאות | **V1** |

### פירוט השימוש
| נושא | ממצא | ודאות |
|------|------|--------|
| למה | הגשת Frontend סטטי | V1 |
| מודולים תלויים | כל ה-UI החי | V1 |
| מידע שעובר | תעבורת HTTPS של משתמשים לדפדפן (לא מאגר יישומי) | V1 לתעבורה; V5 אם נשמרים לוגים בשרת |
| מידע אישי? | עשוי להופיע בלוגי גישה של השרת | **לא ניתן לאמת** תוכן לוגים (אין SSH) |
| מידע עסקי? | לא כמאגר אפליקטיבי | V5 ללוגים |
| נשמר אצל הספק? | קבצי dist ב-web root; לוגים — לא ניתן לאמת | V2/V5 |
| אימות מולו | SSH deploy key (CI); אין API Hostinger שנבדק | V3 ל-SSH מתיעוד/workflows |
| Secrets קשורים (שמות) | `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`; ב-VPS: `dalia-ops/.env` (`OPS_*`, וכו') לפי docs/workflows | V3 לשמות בdocs; V5 לערכים |

### ניתוח
- **יתרונות:** שליטה מלאה בפרונט; עלות נמוכה יחסית.
- **חסרונות:** SPOF; אין גישת RO ל-nginx/logs בסשן Audit זה.
- **רמת תלות:** קריטית לפרונט.
- **סיכונים:** downtime אתר; קונפיג nginx שלא תואם לקובץ ב-repo (headers).
- **חלופות:** Cloudflare Pages / Vercel / Netlify / VPS אחר.
- **המלצות:** גישת RO לביקורת nginx; CDN; גיבוי webroot.
- **אימות נוסף נדרש:** כן — SSH RO / hPanel backups.

---

## 2) Let's Encrypt

### פרטי הספק
| שדה | ערך |
|-----|-----|
| שם | Let's Encrypt (ISRG) |
| סוג | Certificate Authority |
| תפקיד | TLS ל-`dalia-car.online` |
| פעיל | כן |
| היכן | openssl: issuer `O = Let's Encrypt, CN = YE2` |
| ודאות | **V1** |

### פירוט השימוש
- מידע: מטא-נתוני דומיין בתהליך ACME — **לא ניתן לאמת** פרטי חשבון Certbot ב-VPS ללא SSH.
- Secrets: אין secret יישומי של דליה ל-LE מעבר לתעודות בשרת.
- תלות: גבוהה ל-HTTPS תקין; חידוש אוטומטי **לא ניתן לאמת** בסשן זה (V5), אך תעודה בתוקף עד 2026-10-04 (V1).

### ניתוח
יתרון: חינם/סטנדרטי. סיכון: כשל חידוש → אזהרות דפדפן. חלופה: תעודה מסחרית. המלצה: בדיקת `certbot renew --dry-run` ע״י Owner.

---

## 3) Supabase

### פרטי הספק
| שדה | ערך |
|-----|-----|
| שם | Supabase |
| סוג | Backend-as-a-Service |
| תפקיד | Auth, PostgreSQL, Storage, Edge Functions, Realtime (אם בשימוש) |
| פעיל | כן |
| היכן | Bundle: `https://qasomfndnjuixgjmjwcm.supabase.co`; עשרות Edge; REST |
| ודאות | **V1** |

### פירוט השימוש
| נושא | ממצא | ודאות |
|------|------|--------|
| מודולים | כל הליבה העסקית | V1 |
| מידע | פרופילים, רכבים, נהגים, תקלות, תאונות, מסמכים, deliveries, Auth users | V2/V3 לפי טבלאות; deliveries V1 ב-E2E |
| מידע אישי | כן | V1/V2 |
| מידע עסקי | כן | V1/V2 |
| נשמר אצל הספק | כן — זה מאגר הליבה | V1 |
| אימות | JWT משתמש / anon key / service_role ב-Edge | V3 לקוד; V1 להתנהגות חלקית ב-Edge |
| Secrets (שמות) | `SUPABASE_URL`, `SUPABASE_ANON_KEY`/`PUBLISHABLE`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_JWKS`, … | V3 בקוד/docs |

### ניתוח
- תלות: **קריטית מוחלטת**.
- סיכונים: נפילת ספק; פער RLS; service_role ב-Edge; אזור ענן (מתועד docs כ-ap-south-1 — **לא אומת מ-Dashboard**, V5).
- חלופות: Postgres עצמי + Auth חלופי — עלות/מורכבות גבוהות.
- המלצות: DPA; dump policies חי; גיבוי+restore מאומת; הפרדת Staging/Prod (קיימת ברמת project refs — V3/V2).

---

## 4) Cloudflare (כחלק מתשתית Supabase)

### פרטי הספק
| שדה | ערך |
|-----|-----|
| שם | Cloudflare |
| סוג | CDN / reverse proxy |
| תפקיד | מופיע מול `*.supabase.co` |
| פעיל | כן מול API Supabase |
| היכן | תשובות HTTP מ-supabase.co עם `server: cloudflare`, `cf-ray` |
| ודאות | **V1** לנוכחות; **V5** לשאלה אם לדליה יש חשבון Cloudflare נפרד |

**לא ניתן לאמת** האם קיים חוזה Cloudflare נפרד לדליה, או שזו רק שכבה של Supabase.

---

## 5) GitHub

### פרטי הספק
| שדה | ערך |
|-----|-----|
| שם | GitHub (Microsoft) |
| סוג | Git hosting + Actions |
| תפקיד | מקור קוד, CI/CD, Environments, Secrets Actions |
| פעיל | כן |
| היכן | `orin1607-ctrl/future-craft-core` (Public); עשרות workflows; E2E logs |
| ודאות | **V1** |

### פירוט השימוש
- מידע: קוד מקור; בלוגי Actions הופיעו אימיילים/טלפונים בבדיקות E2E (V1 לקיום בלוג — אין להפיץ).
- Secrets שמות מתועדים: `VPS_*`, `VITE_SUPABASE_*`, `SUPABASE_*`, וכו' (V3 docs; list API 403 בסשן).
- תלות: גבוהה ל-deploy; האתר יכול להמשיך לרוץ גם אם GitHub נופל.
- סיכון: repo **Public** (V1) חושף קוד ו-workflows.
- חלופות: GitLab/Bitbucket עצמי.
- המלצה: private repo; ניקוי PII מלוגים; branch protection.

---

## 6) Gupshup

### פרטי הספק
| שדה | ערך |
|-----|-----|
| שם | Gupshup |
| סוג | WhatsApp Business Solution Provider (BSP) / Messaging API |
| תפקיד | שליחת הודעות WhatsApp; קבלת DLR ב-webhook |
| פעיל ב-Prod | **כן** |
| היכן | `supabase/functions/send-whatsapp-message`, `gupshup-webhook`, `notify-accident-email` (שולח ל-`api.gupshup.io`); UI `GupshupWhatsAppSection` |
| ודאות | **V1** |

### פירוט השימוש
| נושא | ממצא | ודאות |
|------|------|--------|
| למה | התראות תקלה/תאונה, בדיקות, שליחה יזומה | V1 E2E |
| מודולים | Incident notify, WhatsApp settings, deliveries | V1/V2 |
| מידע מועבר | מספרי טלפון, תוכן הודעה, מזהי הודעה | V1 |
| מידע אישי | כן (טלפון + תוכן) | V1 |
| מידע עסקי | כן (פרטי אירוע בתקציר) | V2 |
| נשמר אצל הספק | לפי מדיניות Gupshup — **לא ניתן לאמת** שמירה אצלם בסשן זה | V5 |
| אימות | `GUPSHUP_API_KEY` ב-header `apikey` מול `api.gupshup.io` | V3 קוד; V1 מפתח תקין ב-E2E |
| Secrets שמות | `GUPSHUP_API_KEY`, `GUPSHUP_SOURCE`, `GUPSHUP_APP_NAME`, `GUPSHUP_APP_ID` | V3 |
| מזהים שנצפו | App `DaliaVehicle`; source `972546500305`; message IDs ב-E2E | V1 |

### ניתוח
- תלות: קריטית למודול WhatsApp העסקי.
- סיכונים: דליפת תוכן הודעות לספק; עלויות; webhook ציבורי (`gupshup-webhook` GET 200); תלות ב-BSP.
- חלופות: Meta Cloud API ישיר; Twilio WhatsApp; ספק BSP אחר.
- המלצות: DPA; אימות חתימת webhook; ניטור DLR; מזעור תוכן.
- אימות נוסף: portal logs של Gupshup; האם Make מעביר DLR ל-Prod.

---

## 7) WhatsApp (ערוץ Meta) — לא BSP נפרד בקוד

### פרטי הספק
| שדה | ערך |
|-----|-----|
| שם | WhatsApp / Meta Platforms (ערוץ קצה) |
| סוג | אפליקציית הודעות למשתמש הקצה |
| תפקיד | הצגת/קבלת הודעות אצל נהג/מנהל |
| פעיל | כן כערוץ |
| שימוש בקוד | (א) API דרך Gupshup; (ב) deep links `wa.me` ב-UI | 
| ודאות | **V1** לערוץ; **V1** לכך שאין קריאות ישירות ל-Meta Graph API לשליחה בקוד שנבדק |

### פירוט
- **WhatsApp Business API** ממומש בפועל דרך Gupshup (UI מציין "WhatsApp Business API"; docs מציינים WABA/source).
- `wa.me` = קישורי לקוח בדפדפן — לא חוזה ספק נפרד עם Meta בקוד.
- אין להציג "ספק WhatsApp Business" כאילו יש אינטגרציית Meta ישירה — **לא נמצאה**.

### ניתוח
תלות המשתמש ב-WhatsApp כערוץ; הסיכון החוזי/API הוא מול **Gupshup** (+ מדיניות Meta דרך ה-BSP).

---

## 8) Resend

### פרטי הספק
| שדה | ערך |
|-----|-----|
| שם | Resend |
| סוג | Email API |
| תפקיד | שליחת אימיילים תפעוליים |
| פעיל ב-Prod | כן |
| היכן | `notify-accident-email`, `send-password-reset`, `send-supplier-order-email`, וכו'; E2E שלח email עם `provider_message_id` | 
| ודאות | **V1** |

### פירוט השימוש
| נושא | ממצא | ודאות |
|------|------|--------|
| מידע | כתובות אימייל, נושא, HTML (עלול לכלול פרטי אירוע) | V1/V2 |
| אישי | כן | V1 |
| Secrets | `RESEND_API_KEY`, `RESEND_FROM` | V3 |
| אימות | Bearer ל-`api.resend.com` | V3 קוד; V1 הצלחת שליחה ב-E2E |

### ניתוח
תלות גבוהה להתראות/איפוס. סיכון: open-relay אם Edge לא נעול; דומיין שולח — בגרסאות ישנות הופיע `onboarding@resend.dev` בתיעוד hardening (**לא אומת** שולח נוכחי ב-Prod ללא Dashboard, V5).  
חלופות: Amazon SES, SendGrid, Postmark.  
המלצה: דומיין מותג מאומת + DPA + נעילת Edge.

---

## 9) PayPal

### פרטי הספק
| שדה | ערך |
|-----|-----|
| שם | PayPal |
| סוג | תשלומים |
| תפקיד | חיוב מנויי חברה |
| פעיל | Edge `paypal-charge` **קיים** ב-Prod; האם secrets מוגדרים וחיובים רצים — **לא ניתן לאמת** במלואו בלי Dashboard / בלי פעולת חיוב |
| היכן | `supabase/functions/paypal-charge` → `api-m.paypal.com` (Live, לא sandbox בקוד) |
| ודאות | **V2** לקיום; **V5** לפעילות כספית שוטפת |

### Secrets שמות
`PAYPAL_CLIENT_ID`, `PAYPAL_SECRET` (V3 בקוד).

### ניתוח
תלות גבוהה **אם** המנוי מבוסס עליו. סיכון אבטחה: בעבר נמדד ש-anon יכול להגיע ללוגיקת הפונקציה (בדיקות קודמות); במשימה זו GET החזיר 500 על JSON ריק — מוכיח קיום בלבד.  
**לא בוצע** `charge_all_due`.  
המלצה: אימות auth+role ב-Prod לפני שימוש ללקוחות; sandbox vs live.

---

## 10) Twilio

### פרטי הספק
| שדה | ערך |
|-----|-----|
| שם | Twilio |
| סוג | Communications API |
| תפקיד בקוד | שיחות יוצאות (+ אינטגרציה עם ElevenLabs) |
| פעיל ב-Prod | **לא** — credentials חסרים |
| ראיה | GET `twilio-outbound-call` → `Twilio credentials are not configured` |
| ודאות | **V1** |

### Secrets שמות בקוד
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` (V3).

### ניתוח
תלות נוכחית: נמוכה (מודול כבוי תפעולית). סיכון עתידי אם יוזנו secrets בלי auth מספק. חלופות: ספקי VoIP אחרים. המלצה: לא להפעיל לפני נעילת Edge+תקציב.

---

## 11) ElevenLabs

### פרטי הספק
| שדה | ערך |
|-----|-----|
| שם | ElevenLabs |
| סוג | AI Voice / Conversational AI |
| תפקיד | טוקן שיחה; outbound דרך Twilio |
| פעיל ב-Prod | **מפתח לא מוגדר** |
| ראיה | GET `elevenlabs-conversation-token` → `ELEVENLABS_API_KEY is not configured`; SDK ב-`package.json`; URL `api.elevenlabs.io` ב-bundle |
| ודאות | **V1** לאי-הגדרה; **V3** לקוד |

### Secrets שמות
`ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_AGENT_PHONE_NUMBER_ID` (V3).

---

## 12) Lovable (gateway + מורשת בנייה)

### פרטי הספק
| שדה | ערך |
|-----|-----|
| שם | Lovable |
| סוג | AI gateway / פלטפורמת בנייה |
| תפקיד | `help-ai-chat` קורא ל-`https://ai.gateway.lovable.dev/v1/chat/completions`; מטא-תגיות HTML |
| פעיל | Edge קיים ב-Prod; שיחה מוצלחת חיה **לא אומתה** במשימה זו |
| ודאות | **V2** |

### Secrets
`LOVABLE_API_KEY` (V3).

### מידע
תוכן שיחת עזרה + כלי DB בצד השרת (בקוד) — עלול לכלול נתוני צי אם מופעל (V3 לקוד; V5 לשימוש חי נוכחי).

---

## 13) Google (שכבת אתר — מאומתת ב-Prod)

### פרטי הספק
| שדה | ערך |
|-----|-----|
| שם | Google |
| סוג | Fonts, Site Verification, Cloud Storage (נכסי OG) |
| תפקיד | UI fonts; SEO verification; אחסון תמונת שיתוף |
| פעיל | כן ב-HTML החי |
| ודאות | **V1** |

### מה **לא** אומת כפעיל ב-Prod
מודולי Google Ads/Analytics/GSC/OAuth ב-Edge `marketing-google-*` — **404** ב-Production (V1 לאי-פריסה).  
אין לכלול אותם כספקי Production פעילים.

### מידע
Fonts/verification: מטא/בקשות דפדפן.  
GCS path לתמונות OG נראה ב-HTML (V1). תוכן מאגר עסקי לא עובר שם כחלק מהליבה.

---

## 14) data.gov.il

### פרטי הספק
| שדה | ערך |
|-----|-----|
| שם | data.gov.il (ממשלת ישראל — מאגרי מידע פתוחים) |
| סוג | Open Data API |
| תפקיד | איתור פרטי רכב |
| פעיל | כן (proxy Edge) |
| ראיה | `vehicle-lookup` ב-Prod מגיב; קוד → `datastore_search` |
| ודאות | **V1** |

### מידע
מספר רכב בשאילתה; תשובה מרשומה ציבורית.  
Secrets: אין.

---

## 15) Make.com

### פרטי הספק
| שדה | ערך |
|-----|-----|
| שם | Make.com |
| סוג | Automation / iPaaS |
| תפקיד מתועד | קבלת webhooks מ-Gupshup; בוט; העברת DLR ל-Supabase |
| פעיל מול Prod כעת | **לא ניתן לאמת** |
| היכן | Docs Owner-Make-*; JSON תחת `public/project-001/`; workflows Make-* |
| יעד מתועד | Staging `usfeoerkpcafxxlyuldl` … `/gupshup-webhook` |
| ודאות | **V3** לתיעוד אינטגרציה; **V5** למצב חי נוכחי |

### Secrets
`MAKE_API_TOKEN` מוזכר בdocs — **לא נקרא ולא אומת** בסשן זה.

### ניתוח
סיכון: DLR לא מגיע ל-Prod; עיבוד הודעות בצד שלישי.  
המלצה: Owner לאמת תרחישי Make פעילים ו-URL יעד.  
**אין להציג כספק Production מאומת ללא בדיקת חשבון Make.**

---

# ג. סיכומים נדרשים

## ספקים קריטיים (תלות גבוהה לזמינות/ליבה)
1. **Supabase** — ליבת נתונים ו-Auth (V1)  
2. **Hostinger** — פרונט Production (V1)  
3. **GitHub** — שרשרת שחרור (V1)  
4. **Gupshup** — WhatsApp עסקי (V1)  
5. **Resend** — אימייל תפעולי (V1)  
6. **Let's Encrypt** — HTTPS (V1)

## ספקים שאפשר להחליף (טכנית; דורש תכנון)
| ספק | חלופה אפשרית | הערה |
|-----|---------------|------|
| Hostinger | Cloudflare Pages / Vercel / VPS אחר | פרונט סטטי |
| Gupshup | Meta Cloud API / BSP אחר | דורש WABA מחדש |
| Resend | SES / SendGrid / Postmark | דומיין+DKIM |
| PayPal | ספק סליקה אחר / העברה | אם בכלל בשימוש |
| Lovable gateway | קריאה ישירה למודל / ספק AI אחר | אם help-ai בשימוש |
| Make.com | webhook ישיר ל-`gupshup-webhook` | אם Make פעיל |

## ספקים עם סיכון גבוה (אבטחה/פרטיות/תפעול)
| ספק | סיכון | בסיס |
|-----|--------|------|
| Supabase | מאגר מלא + service_role ב-Edge | ארכיטקטורה V1 |
| Gupshup | PII+תוכן הודעות אצל צד ג׳; webhook ציבורי | E2E + Edge V1 |
| Resend | תוכן אימיילים; relay אם Edge פרוץ | E2E V1 |
| GitHub | Repo Public; לוגים עם נתוני בדיקה | `gh repo view` V1 |
| PayPal | פונקציית Live billing קיימת | Edge V2 |
| Make.com | עיבוד webhook מחוץ לשליטה ישירה — מצב לא מאומת | V5 |

## ספקים שדורשים ביקורת נוספת
| ספק | מה חסר לאימות מלא | גישת RO נדרשת |
|-----|---------------------|----------------|
| Hostinger | לוגים, backups, nginx החי | SSH/hPanel |
| Supabase | אזור, backups, Storage buckets, רשימת secrets | Dashboard / Management API |
| Gupshup | portal delivery logs; תנאי שמירה | Gupshup portal |
| Make.com | תרחישים פעילים + URL יעד | Make login / API token |
| PayPal | האם secrets מוגדרים; האם יש חיובים בפועל | PayPal + Edge secrets UI |
| Resend | דומיין שולח מאומת; לוגים | Resend Dashboard |
| Google marketing stack | לא רלוונטי ל-Prod עד deploy | — |
| Cloudflare | האם חשבון נפרד | Owner |

---

# ד. ראיות — אינדקס קצר

| מזהה | ראיה | תומך ב |
|------|------|--------|
| Ev-D1 | dig A/NS + curl Nginx + IP | Hostinger |
| Ev-D2 | openssl issuer Let's Encrypt | LE |
| Ev-D3 | bundle Supabase URL | Supabase |
| Ev-D4 | cf-ray על supabase.co | Cloudflare layer |
| Ev-D5 | gh repo view Public | GitHub |
| Ev-D6 | E2E run `29946137467` Gupshup+email | Gupshup, Resend |
| Ev-D7 | GET gupshup-webhook 200 | Gupshup webhook |
| Ev-D8 | GET twilio/elevenlabs errors | Twilio/EL לא מוגדרים |
| Ev-D9 | GET paypal-charge קיים | PayPal Edge |
| Ev-D10 | HTML fonts + verification + GCS | Google web |
| Ev-D11 | vehicle-lookup 400 | data.gov.il proxy |
| Ev-D12 | marketing-* 404 | ספקי marketing לא ב-Prod |
| Ev-D13 | OWNER-MAKE docs → Staging URL | Make מתועד ל-Staging |
| Ev-D14 | Deno.env.get names ב-main | מלאי secret names |

---

# ה. הצהרות סיום

1. **לא הומצאו ספקים.** כל ספק בטבלה הראשית מגובה בראיה.  
2. ספקים שמופיעים רק ב-`main` ואינם ב-Prod Edge סומנו במפורש כלא-פעילים ב-Production.  
3. **Deepgram** אינו ספק מאומת — אזכור UI בלבד.  
4. **WhatsApp Business** כערוץ מאומת דרך **Gupshup**, לא דרך Meta Cloud API ישיר.  
5. לא בוצע שינוי במערכת; לא נחשפו ערכי Secrets.

*סוף כרך ד' – ספקים.*
