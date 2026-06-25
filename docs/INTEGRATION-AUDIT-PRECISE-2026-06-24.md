# דוח אינטגרציות מדויק — Orin Car Staging

**תאריך בדיקה:** 24 ביוני 2026  
**מקורות:** קריאת קוד, `public/project-001/dashboard.json`, `scripts/google/google-integration-audit.mjs`, `scripts/audit-local-secrets-presence.mjs` (ללא חשיפת ערכי מפתחות)  
**לא בוצע:** קריאת Supabase Edge Secrets מרחוק (דורש `supabase secrets list` / בדיקת login חי)

## מקרא

| סימון | משמעות |
|--------|---------|
| ✅ | מחובר ועובד בפועל — יש נתונים אמיתיים או API שעובד (נבדק) |
| 🟡 | מוכן לחיבור — קוד/תשתית קיימים; חסר מפתח, OAuth, secret בשרת, או אישור Google |
| 🔴 | לא מחובר — אין מימוש API או אין חיבור כלל |

**שני מסלולי נתונים (חשוב):**

1. **מסלול CLI / `dashboard.json`** — מחשב העבודה + `npm run project-001:sync-and-export` → אתר רשמי `dalia-c-official`
2. **מסלול Supabase Edge** — `marketing-google-sync` + טבלאות `marketing_*` → לקוחות ב-Staging אחרי login Super Admin

---

## Google

### Search Console — 🟡 (CLI ✅ / Edge 🟡)

| | |
|--|--|
| **מה עובד בפועל** | סנכרון CLI: `dashboard.json` מ-21.6.2026 — `connections.searchConsole.ok: true`, 2 מילות מפתח, 10 דפים, `lastSync.ok: true` |
| **מה חסר** | **Edge Staging:** לא אומת שה-secrets הועלו ל-`usfeoerkpcafxxlyuldl`. **Token:** `token.json` קיים אך access token כנראה פג תוקף — נדרש refresh (`npm run google:auth` או sync) |
| **איפה מוגדר** | CLI: `scripts/project-001/_lib/gsc-pull.mjs`, `project-001-sync.mjs` · Edge: `supabase/functions/marketing-google-sync/index.ts` · UI: `coco-claude-data.js`, `dalia-site-config.js` |
| **מפתח במחשב** | ✅ `integrations/google/credentials.oauth.json` + `integrations/google/token.json` (refresh קיים) |
| **פעולה נדרשת** | 1) `npm run project-001:sync-and-export` לרענון נתונים · 2) `node scripts/setup-marketing-google-secrets.mjs` + deploy edge — לאימות סנכרון ל-Supabase |

### Google Analytics 4 — 🟡 (CLI ✅ / Edge 🟡)

| | |
|--|--|
| **מה עובד** | `dashboard.json`: `analytics4.ok: true`, **250 סשנים**, **410 צפיות**, 48 עמודים מובילים |
| **מה חסר** | כמו GSC — Edge secrets + בדיקת sync חיה ל-`marketing_metrics` |
| **איפה** | CLI: `_lib/ga4-pull.mjs` · Edge: `fetchGa4Summary` ב-`marketing-google-sync` · property: `properties/427711798` |
| **מפתח במחשב** | אותו OAuth כמו GSC |
| **פעולה** | כמו GSC |

### Google Business Profile — 🟡

| | |
|--|--|
| **מה עובד** | קוד: `project-001-gbp-sync.mjs`, `_lib/gbp.mjs` |
| **מה חסר** | **`pending_google_api_approval`** — אישור Google ל-Business Profile API (quota=0) |
| **איפה** | `dashboard.json` → `connections.businessProfile`, `gbp.pendingApproval` |
| **מפתח במחשב** | OAuth scope `business.manage` ב-token; **אין אישור API מ-Google** |
| **פעולה** | **אישור Google בלבד** (לא מפתח מקומי) — `npm run project-001:gbp-probe` אחרי אישור |

### Google Ads — 🟡

| | |
|--|--|
| **מה עובד** | קוד CLI: `project-001-ads-sync.mjs`, `_lib/ads.mjs` |
| **מה חסר** | `dashboard.json`: **`pending_developer_token`** — אין קמפיינים/מטריקות ב-UI. Edge: **רק בדיקת סטטוס**, ללא Ads API sync |
| **איפה** | `.env.ads` · `scripts/project-001/_lib/ads-env.mjs` · Edge שורות 127-136 בלבד |
| **מפתח במחשב** | ✅ `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CUSTOMER_ID`, `LOGIN_CUSTOMER_ID` ב-`.env.ads` — **אך הסנכרון עדיין נכשל/ממתין** (ייתכן token לא מאושר Basic→Standard) |
| **פעולה** | אישור Developer Token ב-Google Ads API Center + `npm run project-001:ads-sync` |

### Google Tag Manager — 🔴

| | |
|--|--|
| **מה קיים** | שורה ב-`marketing_connections`, סטטוס ב-edge (`ready` אם יש OAuth — **מטעה**) |
| **מה חסר** | **אין קוד Tag Manager API** בשום script |
| **איפה** | `marketing-google-sync` שורה 138 — סטטוס בלבד |
| **מפתח** | לא רלוונטי עד שייכתב sync |
| **פעולה** | פיתוח מודול GTM + scope — **לא רק אישור** |

### Google Sheets — ✅ (CLI) / 🔴 (UI)

| | |
|--|--|
| **מה עובד** | CLI כותב GSC/GA4/Ads ל-Sheet: `spreadsheet_id` ב-`dashboard.json` lastSync |
| **מה חסר** | אין חיבור ישיר במנהל השיווק |
| **איפה** | `project-001-sync.mjs` |
| **מפתח** | OAuth Sheets scope ב-token |
| **פעולה** | אופציונלי — רק אם רוצים Sheet ב-UI |

### Google Drive — ✅ (CLI) / 🔴 (UI)

| | |
|--|--|
| **מה עובד** | `dashboard.json` drive.connected; תיקיות ב-`integrations/google/config.json` |
| **מה חסר** | לא מוצג/לא מסונכרן במנהל שיווק |
| **איפה** | `scripts/google/google-setup-drive.mjs` |
| **מפתח** | OAuth |
| **פעולה** | לא נדרש לשיווק יומיומי |

### Google Docs — 🟡

| | |
|--|--|
| **מה עובד** | Probe יצר test doc (`connections.docs.ok: true`) |
| **מה חסר** | אין workflow ייצור מסמכים בפרודקשן |
| **איפה** | `project-001-connections-probe.mjs` |
| **מפתח** | OAuth |
| **פעולה** | הגדרת תהליך עסקי אם נדרש |

### Gmail — 🟡

| | |
|--|--|
| **מה עובד** | OAuth scope + probe: `connections.gmail.ok` |
| **מה חסר** | **`GMAIL_SEND_ENABLED` לא מוגדר** — אין שליחה אמיתית מ-marketing. Edge: סטטוס בלבד, **אין Gmail API ב-edge** |
| **איפה** | `project-001-complete.mjs` · scopes ב-`integrations/google/scopes.json` |
| **מפתח** | OAuth במחשב; שליחה דרך **Resend** בפועל בדליה |
| **פעולה** | אם רוצים Gmail: `GMAIL_SEND_ENABLED=1` + מדיניות שליחה |

---

## AI

### OpenAI — 🟡

| | |
|--|--|
| **מה עובד** | Edge: `marketing-ai-chat` · מקומי: `scripts/ai-marketing/api-server.mjs` |
| **מה חסר** | **לא אומת E2E מ-Staging** אחרי login. Edge דורש `MARKETING_OPENAI_API_KEY` או `OPENAI_API_KEY` **ב-Supabase secrets** |
| **איפה** | `supabase/functions/marketing-ai-chat` · `AiMarketingPage.tsx` → `marketingChatUrl` |
| **מפתח במחשב** | ✅ `OPENAI_API_KEY` ב-`.env.openai` |
| **פעולה** | העלאת מפתח ל-Supabase: `supabase secrets set MARKETING_OPENAI_API_KEY=...` + deploy. בדיקה: login Super Admin → שאלה ב-AI במנהל שיווק |

### Gemini — 🟡

| | |
|--|--|
| **מה עובד** | Edge: `marketing-gemini-chat` · routing ב-`coco-marketing-unified.js` |
| **מה חסר** | `GEMINI_API_KEY` / `GOOGLE_AI_API_KEY` — **לא נמצא בקבצי .env מקומיים**; לא אומת ב-Supabase |
| **איפה** | `supabase/functions/marketing-gemini-chat` |
| **מפתח במחשב** | 🔴 לא ב-`.env*` |
| **פעולה** | מפתח מ-Google AI Studio → Supabase secret + deploy |

### Claude — 🔴

| | |
|--|--|
| **מה קיים** | UI בלבד (`coco-claude-*`) |
| **מה חסר** | אין `ANTHROPIC_API_KEY`, אין edge function, אין קריאות API |
| **איפה** | `marketing-google-sync` מחזיר `claude: not_configured` |
| **מפתח** | 🔴 לא קיים |
| **פעולה** | מפתח Anthropic + edge function חדש (פיתוח) |

---

## Supabase — ✅ (אפליקציה) / 🟡 (Edge secrets)

| | |
|--|--|
| **מה עובד** | Staging `usfeoerkpcafxxlyuldl` · Frontend ב-GitHub Pages · `MarketingApi` + CRM + `marketing_*` tables · QA 131/131 |
| **מה חסר** | לא נבדקו secrets של Google/OpenAI/Gemini על Edge מרחוק |
| **איפה** | `.env.local` → `VITE_SUPABASE_*` · `.github/workflows/deploy-staging-pages.yml` |
| **מפתח במחשב** | ✅ anon key ב-`.env.local` (staging). 🔴 אין `SERVICE_ROLE` / `DATABASE_URL` בקבצי env מקומיים |
| **פעולה** | `supabase secrets list --project-ref usfeoerkpcafxxlyuldl` לאימות |

---

## Edge Functions (27) — סיווג לפי תפקיד

### שיווק / CRM (מנהל שיווק)

| Function | סטטוס | הערה |
|----------|--------|------|
| `marketing-google-sync` | 🟡 | GSC+GA4 sync בקוד; secrets + super_admin; GTM/Gmail מדווחים "ready" **בלי API** |
| `marketing-ai-chat` | 🟡 | קוד מוכן; דורש OpenAI secret + login |
| `marketing-gemini-chat` | 🟡 | קוד מוכן; דורש Gemini secret |
| `create-admin-user` | 🟡 | provisioning marketing tables; דורש service role |

### דליה כללית (לא מנהל שיווק)

| Function | סטטוס | Secrets נדרשים |
|----------|--------|----------------|
| `help-ai-chat` | 🟡 | `LOVABLE_API_KEY` |
| `auth-send-otp`, `auth-verify-otp`, `auth-login-challenge`, `auth-complete-password-reset` | ✅/🟡 | `RESEND_API_KEY` + Supabase (OTP עובד ב-staging לפי QA קודם) |
| `send-password-reset`, `send-user-access-code`, `send-supplier-order-email`, `notify-*-email` | 🟡 | `RESEND_API_KEY` |
| `send-whatsapp-message` | 🟡 | `GUPSHUP_API_KEY` (+ source/app) |
| `twilio-outbound-call` | 🟡 | Twilio + ElevenLabs |
| `elevenlabs-conversation-token` | 🟡 | `ELEVENLABS_API_KEY` |
| `paypal-charge` | 🟡 | PayPal credentials |
| `vehicle-lookup`, `check-driver-*`, `book-pickup-slot` | 🟡 | DB + APIs צי |
| `deploy-control` | 🟡 | `GITHUB_PAT` |
| `backup-data`, `full-supabase-export`, `change-user-password` | 🟡 | Service role |

---

## APIs נוספים בפרויקט

| שירות | סטטוס | הערה |
|--------|--------|------|
| Resend (אימייל) | 🟡 | Edge functions קיימים; `RESEND_API_KEY` לא ב-env מקומי — כנראה ב-Supabase בלבד |
| Gupshup (WhatsApp) | 🟡 | `send-whatsapp-message` |
| Twilio | 🟡 | שיחות יוצאות |
| ElevenLabs | 🟡 | voice |
| PayPal | 🟡 | תשלומים |
| Lovable | 🟡 | `help-ai-chat` |

---

## סיכום מספרי (מנהל שיווק)

| סטטוס | כמות שירותי Google+AI+Supabase עיקריים |
|--------|----------------------------------------|
| ✅ עובד עם נתונים אמיתיים (CLI/dashboard) | 4 (GSC, GA4, Sheets, Drive) |
| 🟡 מוכן — חסר secret/אישור/אימות | 10 |
| 🔴 לא ממומש | 2 (GTM, Claude) |

---

## פעולות מומלצות (סדר עדיפות)

1. **רענון Google:** `npm run project-001:sync-and-export` (מחשב העבודה)
2. **העלאת secrets ל-Staging:** `node scripts/setup-marketing-google-secrets.mjs` + `OPENAI` + `GEMINI`
3. **בדיקה חיה:** login יוני → מנהל שיווק → 🔄 Google → AI שאלה
4. **GBP:** המתנה/מעקב אחר אישור Google API
5. **Ads:** אישור Developer Token ב-API Center
6. **Claude / GTM:** פיתוח — לא רק מפתח
