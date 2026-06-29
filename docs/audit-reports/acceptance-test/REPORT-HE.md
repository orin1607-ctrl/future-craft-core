# דוח Acceptance Test — מערכת ניהול שיווק

**תאריך:** 2026-06-29  
**Staging:** https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=v3-mission-25-1-1fdfb7a  
**Commit:** `39f477dfb47a3ccd0c85276eacbbe1737fe3dd8c`  
**גרסה:** `v3-mission-25-1-1fdfb7a`

## 1. מה נבדק

בוצעו 12 בדיקות קבלה (AT-1 עד AT-12) על Orin Staging ב-Playwright — Desktop 1440px + iPhone 13, כמשתמש אמיתי עם לקוח רשמי (`dalia-c-official`):

| AT | נושא | איך נבדק |
|----|------|----------|
| AT-1 | כל 11 מסכים | hub, status, clients, crm, goals, actions, history, assets, ai-center, reports, agents — desktop + mobile |
| AT-2 | כל הכפתורים | hub cards, workbench open/back, Preview modal, CRM, AI Center ask |
| AT-3 | זרימה מלאה | Agents → Goals → Actions → Workbench → Preview → Approve → History → Reports → AI Center |
| AT-4 | Multi AI | ChatGPT (works_or_api), Claude (infrastructure), Gemini (works_or_api) |
| AT-5 | CRM | createLead, updateLead, search, GlobalFilterContext switch |
| AT-6 | Google Sheets | exportActionsCsv, exportHistoryToSheets, webhook config |
| AT-7 | Gmail | MarketingNotifications — 5 סוגי התראות ב-stub queue |
| AT-8 | מובייל | כל המסכים + 15 צעדי גלילה ב-Actions (jumps=0, idleJump=0) |
| AT-9 | בידוד לקוחות | FilterEngine hash A≠B, אין cross-campaign leakage |
| AT-10 | ביצועים | loadMs=4693, DOM=15223, LS=12KB |
| AT-11 | AI Control Center | snapshot, ask, filters, preview, approvals, reports, history, SEO |
| AT-12 | קבלה סופית | לקוח רשמי → clients/goals/8 cards/workbench/reports/20 agents/AI summary |

**תוצאה סופית: 12/12 עברו** | Console errors: 0 | Network errors: 0

## 2. מה תוקן

- **לא נדרש deploy** — אין באגים באפליקציה על Staging; כל 12 הבדיקות עברו לאחר דיוק הסקריפט.
- **תוקן בסקריפט הבדיקות** (`acceptance-test-marketing.mjs`):
  - המתנה ל-`.coco-act-lite-card` + `data-coco-act-ready` במסך פעולות (לא רק mount ריק)
  - בדיקת agents לפי `agent-card` / `agcard-*` (לא `coco-live-agents-context` הקטן)
  - Preview נלחץ **בתוך** workbench לפני back
  - היסטוריה: `coco-live-history-timeline` + `#tab-hist-all` (לא `coco-live-history-list` שלא קיים)

## 3. מה עבר

- ✅ **AT-1** — כל 11 המסכים: desktop + mobile, נתונים, ללא overflow אופקי
- ✅ **AT-2** — workbench, preview modal, back, hub navigation, AI ask
- ✅ **AT-3** — זרימה מלאה end-to-end כולל approve + history + reports
- ✅ **AT-4** — 3 מנועי AI מחוברים; OpenAI+Gemini API-ready, Claude infrastructure
- ✅ **AT-5** — CRM מלא ב-localStorage (יצירה, עריכה, חיפוש, מעבר לקוח)
- ✅ **AT-6** — תשתית export קיימת (פונקציות + UI)
- ✅ **AT-7** — stub queue ל-5 התראות (action_completed, approval_required, daily_digest, critical_alert)
- ✅ **AT-8** — מובייל: גלילת Actions חלקה (maxScroll=1601, jumps=0), workbench נפתח
- ✅ **AT-9** — בידוד לקוחות: hashA≠hashB, crossIds=[]
- ✅ **AT-10** — טעינה 4.7s, DOM 15K, LS קל
- ✅ **AT-11** — AI Control Center מחובר לכל המoduleים
- ✅ **AT-12** — תרחיש לקוח אמיתי: 8 כרטיסי פעולות, 20 עוזרים, workbench, AI summary

## 4. מה עדיין דורש חיבור חיצוני

| AT | חסם | פירוט |
|----|-----|-------|
| AT-4 | Claude API | `apiEnabled=false` — דורש מפתח Anthropic ב-backend |
| AT-5 | Supabase CRM | GH Pages משתמש ב-`dalia-crm-local-v1` — אין remote auth |
| AT-6 | Google Sheets | `sheetsWebhookUrl` ריק — deploy Apps Script לפי `docs/integrations/SHEETS-WEBHOOK-SETUP-HE.md` |
| AT-7 | Gmail | stub בלבד — חסר: `GMAIL_SEND_ENABLED`, OAuth `gmail.send`, edge function `marketing-notify-email`, Resend fallback |

## 5. אילו קבצים השתנו

- `scripts/acceptance-test-marketing.mjs` — סקריפט AT-1…AT-12
- `docs/audit-reports/acceptance-test/report.json` — תוצאות JSON
- `docs/audit-reports/acceptance-test/REPORT-HE.md` — דוח זה

## 6. מספרי Commit

- `39f477dfb47a3ccd0c85276eacbbe1737fe3dd8c` — Staging שנבדק (ללא שינויי אפליקציה)
- commit חדש — סקריפט AT + דוחות (לאחר push)

## 7. קישור ל-Orin (Staging)

https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=v3-mission-25-1-1fdfb7a
