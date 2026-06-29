# דוח Mission 25 — מערכת ניהול שיווק AI

**גרסה:** v3-mission-25-1  
**Staging:** https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=v3-mission-25-1

---

## 1. מה הושלם

- **מרכז בקרה AI (25.1)** — חיבור מלא: `COCO_AI_CONTROL` + `AiControlCenter` + FAB + מסך `screen-ai-center`
- **Mobile QA (25.2)** — בדיקת כל 11 מסכי השיווק + scroll Actions v10
- **בדיקת כפתורים (25.3)** — smoke test על Actions, Workbench, Hub
- **Workflow E2E (25.4)** — Agents → Goals → Actions → History → Reports → AI Center
- **Gmail Notifications (25.5)** — תשתית stub + queue ב-localStorage
- **Multi-AI (25.6)** — אימות ChatGPT / Claude / Gemini
- **ביצועים (25.7)** — DOM nodes + load time
- **בידוד לקוחות (25.8)** — FilterEngine context hash
- **Google Sheets (25.9)** — CSV export + webhook infra
- **דוח נתונים (25.10)** — מיפוי מודולים וחיבורים
- **QA סופי (25.11)** — סקריפט `mission-25-qa.mjs`

## 2. מה תוקן

- **Actions scroll v10** — שמירת scrollTop בזמן rerender, SCROLL_IDLE_MS=550ms, `content-visibility:auto` על כרטיסים
- **FAB ai-assistant** — מחובר ל-`COCO_AI_CONTROL.ask` עם fallback ל-API chat
- **runAiAnalysis** — משתמש במרכז בקרה AI במקום demo בלבד
- **ActionsWorkbench.openPreview** — alias ל-openLitePreview (תיקון AiQuestionEngine)

## 3. מה נוסף

| קובץ | תפקיד |
|------|--------|
| `ai-control-center.js` | UI פונקציונלי במסך AI Center |
| `marketing-notifications.js` | תור התראות + Gmail requirements |
| `scripts/mission-25-qa.mjs` | QA אוטומטי מלא |
| `docs/audit-reports/mission-25/` | דוחות JSON |

## 4. מה נבדק בפועל

- Playwright mobile (iPhone 13) על Staging
- COCO_AI_CONTROL.ask('מה דחוף היום?') — מחזיר summary
- scroll Actions — 15 צעדים, 0 jumps
- Workbench open/close, Preview modal
- MarketingNotifications.testAll() — 5 סוגי התראות
- FilterEngine isolation — hash שונה בין client A/B

## 5. קבצים שהשתנו

- `public/ai-marketing/ai-control-center-bridge.js`
- `public/ai-marketing/ai-control-center.js` (חדש)
- `public/ai-marketing/marketing-notifications.js` (חדש)
- `public/ai-marketing/ai-assistant.js`
- `public/ai-marketing/actions-workbench.js`
- `public/ai-marketing/coco-claude-integration.css`
- `public/ai-marketing-platform.html`
- `.github/workflows/deploy-staging-pages.yml`
- `scripts/mission-25-qa.mjs` (חדש)
- `scripts/verify-actions-scroll-fix.mjs`

## 6. מספרי commit

_(מתעדכן לאחר push)_

## 7. Orin Staging URL

https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=v3-mission-25-1

## 8. מה עדיין דורש חיבורים חיצוניים

### API (Multi-AI)
| מנוע | סטטוס |
|------|--------|
| ChatGPT | תשתית + stub; live דורש Supabase Edge + auth |
| Claude | תשתית בלבד; דורש ANTHROPIC_API_KEY |
| Gemini | תשתית + stub; live דורש GOOGLE_AI_KEY |

### Gmail
- `GMAIL_SEND_ENABLED` + OAuth scope `gmail.send`
- Edge function `marketing-notify-email` — לא קיים
- Resend (קיים ב-FleetOS) — לא מחובר לשיווק
- **קיים:** localStorage queue + 5 סוגי התראות stub

### Google Sheets
- CSV export — **עובד**
- Webhook POST — **תשתית מוכנה**, `sheetsWebhookUrl` ריק (משתמש חייב להגדיר)
- Apps Script template: `docs/integrations/dalia-actions-sheets-webhook.gs`

### Supabase
- marketing-ai-chat Edge — דורש auth Super Admin
- marketing-google-sync — Gmail pending
- persistence ל-history/notifications — לא מחובר

## 9. המלצות מקצועיות

1. **Gmail Phase 1** — חבר Resend (קיים) ל-MarketingNotifications.enqueue → Edge send
2. **Claude API** — הוסף ANTHROPIC_API_KEY ל-Supabase secrets ל-enrichAi live
3. **Sheets** — הגדר webhook URL ב-Actions export config ובדוק POST
4. **Actions scroll** — אימות על iPhone/Android פיזי; v10 שיפר scroll preservation
5. **IndexedDB** — כש-history עובר 100 רשומות, migrate מ-LS
6. **CI** — הוסף `mission-25-qa.mjs` ל-GitHub Actions post-deploy
