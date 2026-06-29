# Mission 28 — ניסיון Gmail אישור (Staging)

**תאריך:** 2026-06-29  
**עמוד דוגמה:** `page-07` — השירותים שלנו - דליה  
**מקור נתונים:** `docs/audit-reports/live-workflow-demo/report.json`  
**מצב:** `EXECUTION_MODE=preview` — **לא** Production

---

## 1. האם ההודעה נשלחה בפועל

**לא.** לא נשלח מייל אמיתי לתיבת Gmail.

| בדיקה | תוצאה |
|--------|--------|
| שליחה דרך Resend (מקומי) | ❌ אין `RESEND_API_KEY` בסביבה המקומית |
| `marketing-notify-email` Edge | ❌ לא קיים |
| Gmail API (`GMAIL_SEND_ENABLED`) | ❌ לא מוגדר ב-Supabase Staging |
| Mockup HTML | ✅ נוצר במלואו |

**נמען מתוכנן (מוסווה):** `or***@gmail.com`  
**נושא:** `עמוד מוכן לאישור – השירותים שלנו`

---

## 2. אם לא — מה חסר כדי לשלוח

| רכיב | מצב | פעולה נדרשת |
|------|-----|-------------|
| `RESEND_API_KEY` | ✅ קיים ב-Supabase Staging (FleetOS) | חיבור ל-Edge שיווק או הרצת `--send` עם מפתח מקומי |
| `marketing-notify-email` | ❌ חסר | Edge function חדשה (Mission 27 Phase 1) |
| `marketing_approvals` + tokens | ❌ חסר | מיגרציית Supabase |
| `GMAIL_SEND_ENABLED` | ❌ חסר | Phase 2 — OAuth Gmail (אופציונלי) |
| `RESEND_FROM` מאומת | ❌ חסר | דומיין `dalia-c.com` ב-Resend (כיום: `onboarding@resend.dev`) |
| צילומי מסך אמיתיים | ❌ חסר | Playwright / Storage (כיום: SVG mock בתוך המייל) |
| Tokens חתומים | ❌ חסר | `MARKETING_APPROVAL_SECRET` + `marketing-approval-action` |

**לשליחת ניסיון אחת מיד:**  
`RESEND_API_KEY=re_… TEST_RECIPIENT=verified@… node scripts/send-gmail-approval-trial.mjs --send`  
(נמען חייב להיות Verified Recipient ב-Resend sandbox)

---

## 3. האם העיצוב של ההודעה תקין

**כן — לניסיון Staging.** התבנית כוללת את כל הרכיבים הנדרשים:

| רכיב | סטטוס |
|------|--------|
| נושא בעברית | ✅ |
| שם חברה, אתר, עמוד, תאריך | ✅ |
| סיבת שינוי AI + 3 מנועים | ✅ ChatGPT, Claude, Gemini |
| טבלת שינויים (לפני/אחרי) | ✅ Title, Meta, H1, Alt |
| שיפור צפוי + ציון ביטחון 87% | ✅ |
| תמונות לפני/אחרי/השוואה | 🟡 SVG mock (לא screenshot אמיתי) |
| קישור Preview Staging | ✅ |
| כפתורי פעולה | ✅ אשר · תיקון · דחה · Preview מלא (stub URLs) |
| RTL + עיצוב מייל (טבלאות) | ✅ |

**הערות עיצוב:**
- תמונות הן סימולציה — ב-Production יוחלפו ב-WebP מ-Storage.
- כפתורי האישור מפנים ל-stub ב-`email-preview-approval.html` (לא Edge אמיתי).

---

## 4. האם התהליך מוכן לעבודה יומיומית

**לא — POC בלבד.** מתאים לצפייה ואישור עיצוב, לא לזרימה יומית.

| קריטריון | מוכן? |
|----------|--------|
| תבנית מייל עברית | ✅ |
| חיבור Daily Engine → שליחה | ❌ (`marketing-notifications.js` = stub LS) |
| שליחה אוטומטית אחרי `pending_approval` | ❌ |
| אישור מרחוק ללא login | ❌ (stub בלבד) |
| Audit trail | ❌ |
| Anti-spam / outbox | ❌ |
| מרכז אישורים in-app (Phase 0) | 🟡 קיים חלקית ב-Staging |

**מסקנה:** להמשיך לפי Mission 27 — Phase 0 (מרכז in-app) ואז Phase 1 (`marketing-notify-email` + Resend).

---

## קבצים וקישורים

| פריט | נתיב |
|------|------|
| דוגמת מייל (repo) | `docs/audit-reports/gmail-approval-trial/email-sample.html` |
| דוגמה ל-GH Pages | `public/ai-marketing/email-approval-sample.html` |
| תצוגה בדפדפן (אחרי deploy) | https://orin1607-ctrl.github.io/future-craft-core/ai-marketing/email-preview-approval.html |
| Preview עמוד page-07 | https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=v3-live-demo-3&page=page-07 |
| סקריפט | `node scripts/send-gmail-approval-trial.mjs` |
| תבנית | `scripts/lib/gmail-approval-email-template.mjs` |
| דוח מכונה | `docs/audit-reports/gmail-approval-trial/report.json` |

---

*Mission 28 · Staging only · לא Production*
