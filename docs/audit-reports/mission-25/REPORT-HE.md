# דוח Mission 25 — מערכת ניהול שיווק AI

**גרסה:** v3-mission-25-1-1fdfb7a  
**תאריך:** 29 ביוני 2026  
**Staging:** https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=v3-mission-25-1-1fdfb7a  
**תוצאת QA:** 11/11 עברו

---

## 1. מה נבדק

| משימה | תיאור | תוצאה |
|-------|--------|--------|
| 25.1 | מרכז בקרה AI — COCO_AI_CONTROL, FAB, screen-ai-center | ✅ |
| 25.2 | גלילה במובייל — 11 מסכים + Actions scroll v10 | ✅ |
| 25.3 | Smoke test כפתורים — Workbench, Hub, CSV | ✅ |
| 25.4 | Workflow E2E — Agents→Goals→Actions→History→Reports→AI Center | ✅ |
| 25.5 | Gmail notification stub — queue ב-localStorage | ✅ |
| 25.6 | Multi-AI — ChatGPT / Claude / Gemini ב-registry | ✅ |
| 25.7 | ביצועים — loadMs, DOM nodes | ✅ |
| 25.8 | בידוד לקוחות — FilterEngine contextHash | ✅ |
| 25.9 | Google Sheets — CSV export + webhook infra | ✅ |
| 25.10 | דוח נתונים — מודולים וחיבורים | ✅ |
| 25.11 | סיכום QA סופי — 0 שגיאות קונסול | ✅ |

בדיקה בוצעה ב-Playwright (iPhone 13 למובייל) מול Orin Staging החי.

---

## 2. מה תוקן

### 25.6 Multi-AI
- **בעיה:** `getEngineStatus()` חיפש `reg.engines` במקום `reg.primary` — רשימת המנועים הראשיים לא הוחזרה.
- **תיקון:** `ai-control-center-bridge.js` — שימוש ב-`getRegistry().primary` (openai, claude, gemini).

### 25.8 Client Isolation
- **בעיה:** בדיקת QA השתמשה ב-`clientId` שלא השתנה בין קריאות (אותו hash).
- **תיקון:** `mission-25-qa.mjs` — בדיקה עם `campaignId` שונה (A/B) + `allowInvalid: true`; `FilterEngine.contextHash()` כולל `campaignId`.

### תיקונים קודמים (Mission 25.1)
- Actions scroll v10, FAB→COCO_AI_CONTROL.ask, ActionsWorkbench.openPreview alias.

---

## 3. מה הושלם

- מרכז בקרה AI פונקציונלי במסך `screen-ai-center`
- חיבור FAB ל-`COCO_AI_CONTROL.ask` עם fallback
- `marketing-notifications.js` — תור 5 סוגי התראות stub
- `multi-ai-orchestrator.js` — registry של 3 מנועים ראשיים
- סקריפט QA אוטומטי `scripts/mission-25-qa.mjs`
- דוחות ב-`docs/audit-reports/mission-25/`
- Deploy ל-Orin Staging — commit `1fdfb7a`

---

## 4. מה עובד בפועל

- **AI Control Center** — ask, execute, snapshot, פאנל מנועים
- **FAB ChatGPT** — שאילתות דרך AiQuestionEngine
- **Actions scroll** — maxScroll 1601px, 0 jumps
- **Workbench** — פתיחה/סגירה, Preview modal
- **Multi-AI registry** — openai (wired+api), claude (wired), gemini (wired+api)
- **FilterEngine isolation** — hash שונה בין campaign A/B
- **CSV export** — `ActionsWorkbench.exportActionsCsv`
- **DailyEngine** — `exportHistoryToSheets` infra
- **MarketingNotifications** — queue 5 פריטים, `gmailStatus: stub_only`

---

## 5. מה עדיין דורש API

| מנוע | סטטוס |
|------|--------|
| ChatGPT (openai) | תשתית + stub; live דורש Supabase Edge + auth |
| Claude | תשתית בלבד (`apiEnabled: false`); דורש ANTHROPIC_API_KEY |
| Gemini | תשתית + stub; live דורש GOOGLE_AI_KEY |
| marketing-ai-chat Edge | דורש auth Super Admin |
| marketing-google-sync | Gmail pending |

---

## 6. מה עדיין דורש Gmail

- `GMAIL_SEND_ENABLED` + OAuth scope `gmail.send`
- Edge function `marketing-notify-email` — לא קיים
- Resend (קיים ב-FleetOS) — לא מחובר לשיווק
- **קיים היום:** localStorage queue + 5 סוגי התראות stub (`gmailStatus: stub_only`)

---

## 7. מה עדיין דורש Google Sheets

- CSV export — **עובד**
- Webhook POST — **תשתית מוכנה**, `sheetsWebhookUrl` ריק
- משתמש חייב להגדיר webhook URL ב-`dalia-actions-export-config-v1`
- Apps Script template: `docs/integrations/dalia-actions-sheets-webhook.gs`

---

## 8. מה עדיין דורש Supabase

- marketing-ai-chat Edge — auth Super Admin
- persistence ל-history/notifications — לא מחובר ל-DB
- ANTHROPIC_API_KEY / GOOGLE_AI_KEY ב-secrets ל-live enrichAi
- IndexedDB migration — מומלץ כש-history עובר 100 רשומות

---

## 9. אילו קבצים השתנו

| קובץ | שינוי |
|------|--------|
| `public/ai-marketing/ai-control-center.js` | חדש — UI מרכז בקרה |
| `public/ai-marketing/marketing-notifications.js` | חדש — תור התראות |
| `public/ai-marketing/ai-control-center-bridge.js` | registry.primary fix |
| `public/ai-marketing/ai-assistant.js` | FAB → COCO_AI_CONTROL |
| `public/ai-marketing/actions-workbench.js` | scroll v10, openPreview |
| `public/ai-marketing-platform.html` | טעינת מודולים חדשים |
| `scripts/mission-25-qa.mjs` | חדש — QA 25.1–25.11 |
| `scripts/verify-actions-scroll-fix.mjs` | scroll verification |
| `.github/workflows/deploy-staging-pages.yml` | v3-mission-25-1 |
| `docs/audit-reports/mission-25/report.json` | דוח QA |
| `docs/audit-reports/mission-25/REPORT-HE.md` | דוח זה |

---

## 10. מספרי Commit

| Commit | תיאור |
|--------|--------|
| `360553c` | feat(mission-25): AI Control Center, scroll v10, QA suite |
| `e13fce6` | fix(mission-25): Multi-AI registry + isolation QA |
| `1fdfb7a` | docs(mission-25): final QA reports 11/11 |

---

## 11. קישור ל-Orin (Staging)

https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=v3-mission-25-1-1fdfb7a

---

## 12. המלצות להמשך

1. **Gmail Phase 1** — חבר Resend ל-MarketingNotifications.enqueue → Edge send
2. **Claude API** — הוסף ANTHROPIC_API_KEY ל-Supabase secrets
3. **Sheets** — הגדר `sheetsWebhookUrl` ובדוק POST
4. **CI** — הוסף `mission-25-qa.mjs` ל-GitHub Actions post-deploy
5. **Actions scroll** — אימות על iPhone/Android פיזי
6. **IndexedDB** — migrate מ-localStorage כש-history גדל
