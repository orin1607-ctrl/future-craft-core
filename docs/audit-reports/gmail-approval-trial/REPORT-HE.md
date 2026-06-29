# Mission 30 — חיבור Gmail / Resend + דוח אישור AI מקצועי

**תאריך:** 2026-06-29  
**עמוד דוגמה:** `page-07` — השירותים שלנו - דליה  
**מקור נתונים:** `docs/audit-reports/live-workflow-demo/report.json`  
**מצב:** `EXECUTION_MODE=preview` — **לא** Production

---

## 1. האם Gmail חובר בהצלחה

**חיבור טכני — כן (Resend, Phase 1).**  
**Gmail OAuth מקורי — לא (Phase 2 לפי Mission 27).**

| רכיב | סטטוס |
|------|--------|
| תבנית מייל v2 (17 רכיבים) | ✅ |
| `marketing-notify-email` Edge | ✅ נוצר + **deploy** ל-Supabase Staging |
| `RESEND_API_KEY` ב-Supabase Staging | ✅ קיים (FleetOS) |
| `RESEND_API_KEY` מקומי (`.env.local`) | ❌ לא מוגדר |
| `GMAIL_SEND_ENABLED` / OAuth Gmail | ❌ לא מוגדר — לא נדרש ל-Phase 1 |
| `marketing-notifications.js` → Edge stub | ✅ `tryDispatchApprovalEmail` |
| נמען מתוכנן (מוסווה) | `or***@gmail.com` |

**הסבר:** לפי `docs/audit-reports/remote-approval/PLAN-HE.md` (Mission 27), **Resend** הוא הנתיב המומלץ לשלב ראשון — אותה תשתית שעובדת ב-FleetOS (`send-password-reset`, `notify-*-email`). Gmail API עם OAuth (`gmail.send`) יתווסף ב-Phase 2 כשצריך שליחה "מחשבון Gmail של המשתמש" ותמיכה ב-inbound.

---

## 2. האם נשלחה הודעת ניסיון

**כן — נשלח מייל ניסיון אמיתי ל-`orin1607@gmail.com`.**

| ניסיון | תוצאה |
|--------|--------|
| Edge `marketing-notify-email` + `MARKETING_CRON_SECRET` | ✅ HTTP 200 |
| Resend message id | `0ea0cdc6-5f7b-4267-a4e2-8aab1bf26fe8` |
| נושא | `📢 עמוד מוכן לאישור – השירותים שלנו` |
| שולח (sandbox) | `דליה מערכות <onboarding@resend.dev>` |

**שליחה חוזרת (מפעיל):**

```bash
MARKETING_CRON_SECRET=<מוגדר ב-Supabase> node scripts/send-gmail-approval-trial.mjs --send --v2 --edge
```

---

## 3. אם לא — מה בדיוק חסר

| חסר | למה זה חוסם | פעולה |
|-----|-------------|--------|
| `RESEND_API_KEY` ב-`.env.local` | שליחה ישירה מהסקריפט | הוסף מפתח `re_…` או השתמש ב-Edge |
| `MARKETING_CRON_SECRET` או `SUPABASE_SERVICE_ROLE_KEY` מקומי | קריאה ל-Edge ללא login | הגדר סוד cron או service role ב-env |
| Verified Recipient ב-Resend | `onboarding@resend.dev` שולח רק לכתובות מאומתות | אמת נמען ב-Resend dashboard |
| `RESEND_FROM` (`dalia-c.com`) | מייל מקצועי + deliverability | אימות דומיין ב-Resend |
| `marketing_approvals` + tokens | אישור מרחוק אמיתי | מיגרציית Supabase (Mission 27 Phase 1) |
| `marketing-approval-action` Edge | כפתורי אשר/דחה אמיתיים | Phase 1b |
| צילומי מסך Playwright | תמונות אמיתיות במייל | Phase 2 — כיום SVG mock |
| Gmail OAuth (`GMAIL_SEND_ENABLED`) | שליחה מחשבון Gmail אישי | Phase 2 — אופציונלי |

**מה כבר הושלם ב-Mission 30:**

- `email-sample-v2.html` — דוח מלא 17 סעיפים בעברית RTL
- `scripts/lib/gmail-approval-email-template.mjs` — בונה v2 מנתוני `live-workflow-demo`
- `scripts/send-gmail-approval-trial.mjs` — `--v2`, `--edge`
- `supabase/functions/marketing-notify-email/index.ts` — deployed
- `public/ai-marketing/email-preview-approval.html` — תצוגה Mission 30
- `marketing-notifications.js` — `approval_required` → `tryDispatchApprovalEmail`

---

## 4. השלב הבא לאוטומציה יומית

```
Daily Engine (cron GH Actions)
  → pending_approval ב-Supabase (לא רק localStorage)
  → buildApprovalEmailV2(payload)
  → marketing_notification_outbox
  → marketing-notify-email (Resend)
  → משתמש: אשר / תיקון / דחה (token — Phase 1b)
  → marketing-publish-approved → deploy-control
```

| שבוע | משימה |
|------|--------|
| 1 | מיגרציה: `marketing_approvals`, `marketing_notification_outbox` |
| 1 | `MARKETING_CRON_SECRET` + חיבור `daily-marketing-engine.mjs` → Edge |
| 2 | `marketing-approval-action` + tokens חתומים |
| 2 | מרכז אישורים in-app (Phase 0 Mission 27) כ-fallback |
| 3 | צילומי מסך → Storage; `RESEND_FROM` מאומת |
| 4 | Gmail OAuth (Phase 2) — רק אם נדרש "מאת המשתמש" |

**טריגר stub (קיים):**  
`MarketingNotifications.enqueue('approval_required', payload)` → `tryDispatchApprovalEmail` (dryRun עד שיש `emailHtml` + `recipient` ב-payload).

---

## רשימת 17 הרכיבים בדוח v2

| # | רכיב | סטטוס |
|---|------|--------|
| 1 | שם חברה | ✅ |
| 2 | שם אתר | ✅ |
| 3 | שם עמוד | ✅ |
| 4 | תאריך/שעה | ✅ |
| 5 | מנועי AI (ChatGPT, Claude, Gemini) | ✅ |
| 6 | למה ה-AI החליט | ✅ |
| 7 | נתונים שנאספו (GSC, GA4, סריקה) | ✅ |
| 8 | מילות מפתח | ✅ |
| 9 | מצב לפני | ✅ |
| 10 | מצב אחרי | ✅ |
| 11 | מה השתנה (טבלה) | ✅ |
| 12 | שיפורים צפויים (SEO, PageSpeed, CTA…) | ✅ |
| 13 | ציון ביטחון + המלצה | ✅ |
| 14 | לפני/אחרי ויזואלי | 🟡 SVG mock |
| 15 | כפתורי Preview / אשר / תיקון / דחה | ✅ stub URLs |
| 16 | קישור Staging ישיר | ✅ |
| 17 | סיכום מנהל (5–10 שורות) | ✅ |

---

## קבצים וקישורים

| פריט | נתיב / URL |
|------|------------|
| דוגמת מייל v2 (repo) | `docs/audit-reports/gmail-approval-trial/email-sample-v2.html` |
| דוגמה ל-GH Pages | `public/ai-marketing/email-approval-sample.html` |
| **תצוגה בדפדפן (אחרי deploy)** | https://orin1607-ctrl.github.io/future-craft-core/ai-marketing/email-preview-approval.html?v=m30 |
| Preview עמוד page-07 | https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=v3-mission-30&page=page-07 |
| Edge function | `supabase/functions/marketing-notify-email/index.ts` |
| סקריפט | `node scripts/send-gmail-approval-trial.mjs --v2` |
| דוח מכונה | `docs/audit-reports/gmail-approval-trial/report.json` |

---

*Mission 30 · Staging only · Resend Phase 1 · Gmail OAuth Phase 2*
