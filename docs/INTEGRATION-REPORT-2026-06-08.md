# דוח חיבורים — מנהל השיווק + CRM (Orin Car Staging)

**תאריך:** 8 ביוני 2026  
**גרסה:** `v3-unified-3i`  
**Production:** לא הועלה (לפי בקשה)

---

## מה הושלם הלילה (חיבורים בלבד — ללא שינוי UI/מיקום/כפתורים)

### מערכת אחת — 10 מודולים + CRM

| רכיב | סטטוס |
|------|--------|
| Client ID משותף (`COCO.flowContext`) | מחובר — בחירת לקוח מסנכרנת לכל המודולים + CRM |
| סינון מרכזי (חיפוש, שירות, סטטוס, קמפיין) | מחובר — כולל `#coco-central-campaign` ב-FIELD_MAP |
| CRM ↔ שיווק (סינונים) | מחובר — search, status, service, campaign דו-כיווני |
| CRM ↔ שיווק (Client ID) | מחובר — `openClient` / `selectCustomer` / `openMarketing` |
| היסטוריה מאוחדת | מחובר — `marketing_activity_log` + פעילות CRM ללקוח פעיל |
| KPI Hub + דוחות | מחובר — GSC/GA4 מ-Supabase או `dashboard.json`; לידים/משימות מ-CRM |
| כרטיס CRM (#10) | ספירה חיה — לקוחות · לידים מ-Supabase |

### Google (חיבורים קיימים — לא נוצרו חדשים)

| שירות | סטטוס | הערות |
|--------|--------|--------|
| Search Console | **מחובר** | Edge `marketing-google-sync` + CLI `project-001-sync` → `dashboard.json` |
| Google Analytics 4 | **מחובר** | כמו GSC |
| Google Sheets | **מחובר (CLI)** | כתיבה ב-sync; לא ישירות ב-UI |
| Google Drive | **מחובר (CLI)** | ניהול spreadsheet |
| Google Ads | **חלקי** | CLI + סטטוס ב-edge; אין סנכרון מטריקות מלא ל-UI |
| Google Business Profile | **חלקי** | CLI קיים; edge מחזיר pending |
| Google Tag Manager | **ממתין לחיבור** | סטטוס בלבד — אין API sync בקוד |
| Gmail | **ממתין לחיבור** | OAuth scope + probe בלבד |
| Google Docs | **ממתין לחיבור** | probe בלבד |

כפתור **🔄 Google** במנהל השיווק → `marketing-google-sync` (GSC + GA4 → `marketing_metrics`).

### AI

| מנוע | סטטוס | הערות |
|------|--------|--------|
| OpenAI (ChatGPT) | **מחובר** | Edge `marketing-ai-chat` + `marketingChatUrl` מ-`AiMarketingPage` |
| Gemini | **מחובר** | Edge `marketing-gemini-chat` + `marketingGeminiChatUrl` (חדש) |
| Claude | **ממתין למפתח** | אין `ANTHROPIC_API_KEY` / edge function — UI בלבד |

AI מקבל `buildClientContext()` — bundle, Client ID, קמפיינים, מטריקות.

### Supabase

| טבלה / API | שימוש |
|------------|--------|
| `customers`, `marketing_*` | לקוחות, חיבורים, קמפיינים, מטריקות |
| `marketing_activity_log` | היסטוריה + לוג פעולות בין מודולים |
| CRM (`marketing_leads`, tasks, activity) | CRM embedded — `CrmApi` |

### Demo / Placeholder

- הוסר שימוש ב-KPI מזויף (`siteScore: 82`)
- התראות Hub מזויפות (PageSpeed 61 וכו') מוסתרות ב-live mode
- עוזרי AI: נתונים אמיתיים או **"ממתין לחיבור"** — לא `AGENT_DATA` כש-`dalia-live-only`
- תוקן באג `scoreDisplay` בדשבורד עוזר

---

## מה נבדק

- QA אוטומטי מקומי (`qa-claude-v3-staging.mjs`) — לפני deploy
- 10 מסכי hub + CRM כפתור #10 בלבד
- סינון בין מודולים (dateRange persistence)
- CRM UI נטען (`screen-crm-main`, `crm-clients-tbody`)

---

## מה עדיין דורש פעולה שלך

1. **Claude API** — להוסיף `ANTHROPIC_API_KEY` ל-Supabase Edge (אין edge function היום).
2. **Google Ads / GBP / GTM / Gmail** — הרשאות/API מלאים (חלקם ממתינים לאישור Google).
3. **סנכרון לילי `dashboard.json`** — להריץ במחשב העבודה: `npm run project-001:sync-and-export` (OAuth קיים ב-`.env.google`).
4. **וידוא Supabase secrets** — `GOOGLE_*`, `MARKETING_OPENAI_API_KEY`, `GEMINI_API_KEY` ב-staging (`scripts/setup-marketing-google-secrets.mjs`).

---

## כניסה לעבודה מחר בבוקר

1. דליה → **ניהול שיווק** (`/ai-marketing`)
2. התחברות Super Admin (מעביר token ל-iframe)
3. בחר לקוח → כל 10 המודולים + CRM (#10) על אותו Client ID
4. **🔄 Google** לסנכרון GSC/GA4 ללקוח הנבחר

**Staging:** `https://orin1607-ctrl.github.io/future-craft-core/ai-marketing` (לאחר deploy `v3-unified-3i`)
