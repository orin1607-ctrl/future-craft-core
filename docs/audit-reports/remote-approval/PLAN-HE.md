# Mission 27 — מערכת אישור מרחוק (Remote Approval System)

**תאריך:** 2026-06-29  
**סטטוס:** תכנון בלבד — ללא יישום  
**תלות:** Mission 23 (Multi-AI) · Mission 24 (Control Center) · Mission 25 (Notifications stub) · Daily Engine v2  
**Staging:** https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html  
**מטרה:** המשתמש **לא** נכנס למערכת השיווק — המערכת רצה אוטונומית; המשתמש מקבל רק פריטים שדורשים החלטה.

---

## 1. סקירה כללית והארכיטקטורה

### 1.1 חזון

מערכת שיווק AI שרצה **פעם ביום** (ובמקרים חריגים — התראה מיידית), מנתחת נתונים מכל המקורות, מפעילה שלושה מנועי AI (ChatGPT, Claude, Gemini), מכינה טיוטות שינוי לעמודים, ושולחת **הודעת אישור אחת** לכל פריט שדורש החלטה — ב-Gmail (עדיפות ראשונה), WhatsApp (שנייה), או מרכז התראות במערכת (fallback).

המשתמש לוחץ **אשר / שלח לתיקון / דחה / תצוגה מלאה** מתוך ההודעה — **ללא התחברות** — באמצעות קישורים חתומים (signed tokens).

### 1.2 עקרונות מנחים

| עקרון | משמעות |
|--------|---------|
| **No login for approval** | אישור דרך token חד-פעמי/מוגבל בזמן — לא דורש סשן במערכת |
| **Notify only when needed** | התראה רק על `pending_approval` — לא digest יומי אלא אם הוגדר במפורש |
| **Preview before publish** | `executionMode: preview` עד לאישור; פרסום רק אחרי webhook מאושר |
| **GH Pages ≠ backend** | Staging סטטי — אין cron, queue, OAuth, או webhook בדפדפן |
| **Supabase Edge = מקור אמת** | אישורים, tokens, שליחת הודעות, screenshots, publish |

### 1.3 ארכיטקטורה מוצעת

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ORCHESTRATION LAYER                              │
│  GitHub Actions (06:00 UTC)  →  daily-marketing-engine (Node headless)  │
│       ↓ dispatch                                                            │
│  Supabase Edge: marketing-daily-run  →  queue job per tenant              │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         MULTI-AI PIPELINE (Edge)                         │
│  marketing-ai-chat · marketing-claude-chat · marketing-gemini-chat       │
│  → compare · confidence score · draft HTML/meta · before/after diff      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         APPROVAL PACKAGE BUILDER                         │
│  Playwright/screenshot service → Supabase Storage (before/after/compare) │
│  Hosted preview URL → marketing-preview/{approvalId}                     │
│  Row: marketing_approvals + marketing_approval_tokens                    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
            ┌─────────────┐ ┌─────────────┐ ┌──────────────────┐
            │ Gmail/Resend│ │ Gupshup WA  │ │ In-app fallback  │
            │ (priority 1)│ │ (priority 2)│ │ (priority 3)     │
            └──────┬──────┘ └──────┬──────┘ └────────┬─────────┘
                   │               │                  │
                   └───────────────┼──────────────────┘
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              PUBLIC APPROVAL GATEWAY (no login)                            │
│  Edge: marketing-approval-action  GET/POST ?token=…&action=approve|…     │
│  Landing: /approve.html (GH Pages) — תוצאה + קישור preview               │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                          approve ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         PUBLISH + AUDIT                                  │
│  deploy-control (GitHub PAT) · history row · completion notification     │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.4 ישויות נתונים מרכזיות (Supabase)

| טבלה | תפקיד |
|------|--------|
| `marketing_approvals` | פריט ממתין: client, site, page, rationale, diff, confidence, status |
| `marketing_approval_tokens` | token hash, action scope, expires_at, used_at, channel |
| `marketing_notification_outbox` | תור שליחה: channel, payload, retry, sent_at |
| `marketing_approval_audit` | מי, מתי, מאיזה IP/channel, action, token_id |
| `marketing_preview_assets` | URLs ל-before/after/compare ב-Storage |
| `marketing_daily_runs` | ריצות מנוע יומי per tenant (מחליף LS כמקור אמת) |

### 1.5 מה **לא** עובד ב-GH Pages לבד

- שליחת Gmail/WhatsApp (דורש secrets + Edge)
- יצירת signed tokens מאובטחים (secret בשרת בלבד)
- קבלת webhook inbound (תשובות מייל / לחיצות WA)
- פרסום לאתר חי (דורש `deploy-control` + GitHub PAT)
- צילומי מסך אוטומטיים (דורש headless browser בשרת)
- תור אלפי לקוחות — localStorage לא מתאים

---

## 2. איך Gmail יעבוד (OAuth, templates, action links, inbound replies)

### 2.1 אסטרטגיית שליחה — שתי שכבות

| שלב | שיטה | מתי |
|-----|------|-----|
| **Phase 1 (מומלץ להתחלה)** | **Resend** — כבר קיים ב-FleetOS (`RESEND_API_KEY`, `send-password-reset`) | שליחה מהירה, HTML עשיר, ללא OAuth מורכב |
| **Phase 2** | **Gmail API** — OAuth `https://www.googleapis.com/auth/gmail.send` | שליחה "מאת המשתמש", thread tracking, תשובות inbound |
| **Phase 3** | **Gmail Inbound** — Pub/Sub או Apps Script | תשובת "אשר 123" / "דחה" במייל |

**המלצה:** להתחיל ב-Resend ל-Mission 27 Phase 1 — אותה תשתית שעובדת ב-production לדליה. Gmail OAuth יתווסף כשצריך "נשלח מהחשבון שלי".

### 2.2 Edge Function חדשה: `marketing-notify-email`

```
POST /functions/v1/marketing-notify-email
Body: { approvalId, channel: 'email', recipientOverride? }
Auth: service role (internal) או cron secret
```

**זרימה:**
1. קורא `marketing_approvals` + assets
2. יוצר 4 tokens (approve, revise, reject, preview) — ראו סעיף 5
3. בונה HTML מ-template
4. שולח דרך Resend API (`from: approvals@dalia-c.com` או subdomain מאומת)
5. כותב ל-`marketing_notification_outbox` + `system_logs` (מודל FleetOS)

### 2.3 תבנית מייל (HTML)

**נושא:** `[דורש אישור] {company} · {pageTitle} · ביטחון AI {confidence}%`

**גוף:**
- כותרת: שם החברה, אתר, שם העמוד
- **למה השינוי:** 2–3 משפטים (מ-Multi-AI rationale)
- **מה השתנה:** bullet diff (title, meta, H1, CTA)
- **שיפור צפוי:** KPI משוער (CTR, SEO score delta)
- **ציון ביטחון:** 0–100 + איזה מנועים הסכימו
- **תמונות:** `<img>` ל-before, after, side-by-side (hosted ב-Supabase Storage CDN)
- **כפתורים CTA:**
  - ✅ אשר → `https://api…/marketing-approval-action?token=…&action=approve`
  - ✏️ תיקון → `…&action=revise` (פותח טופס קצר ללא login)
  - ❌ דחה → `…&action=reject`
  - 👁️ תצוגה מלאה → `https://…/marketing-preview/{id}?token=…`

**הערה:** קישורי הכפתורים מצביעים ל-**Edge** (לא ל-GH Pages) — כדי לאמת token לפני redirect.

### 2.4 OAuth Gmail (Phase 2)

- חיבור דרך `marketing-google-sync` (כבר מכיר `gmail` ב-PROVIDERS)
- secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`
- scope מינימלי: `gmail.send` בלבד (לא `gmail.readonly` אלא אם נדרש inbound)
- `GMAIL_SEND_ENABLED=true` — flag ב-secrets (מוזכר ב-`marketing-notifications.js` stub)

### 2.5 Inbound replies (Phase 3)

**אפשרות A — Gmail Pub/Sub:**
- Cloud Pub/Sub → Edge `marketing-gmail-inbound`
- parser: `אשר {approvalId}` / `דחה {approvalId}` / `תיקון: {טקסט}`

**אפשרות B — Apps Script (פשוט יותר):**
- דומה ל-Sheets webhook (`dalia-actions-sheets-webhook.gs`)
- POST ל-Edge עם secret משותף

**אבטחה:** inbound חייב להתאים ל-`approvalId` + sender email ברשימת מאושרים (`marketing_approvers`).

### 2.6 מה קיים היום

| רכיב | מצב |
|------|-----|
| `marketing-notifications.js` | stub — `localStorage` queue, `gmailStatus: stub_only` |
| `getGmailRequirements()` | מפרט חסרים: Edge, OAuth, inbound |
| Resend ב-FleetOS | ✅ `send-password-reset`, `notify-*-email` |
| `marketing-notify-email` | ❌ לא קיים |
| Gmail ב-`marketing-google-sync` | תשתית providers, שליחה לא מיושמת |

---

## 3. איך WhatsApp יעבוד (Gupshup/API, templates, buttons)

### 3.1 תשתית קיימת

- Edge: `send-whatsapp-message` — Gupshup `/wa/api/v1/msg`
- secrets: `GUPSHUP_API_KEY`, `GUPSHUP_SOURCE`, `GUPSHUP_APP_NAME`
- אימות: `super_admin` בלבד (FleetOS)
- בדיקות: `scripts/test-whatsapp-gupshup-staging.mjs`, דוחות `gupshup-*`

### 3.2 מגבלות Gupshup קריטיות

| סוג הודעה | מתי | דרישה |
|-----------|-----|--------|
| **Session message** | משתמש שלח הודעה ב-24h האחרונות | טקסט חופשי + כפתורים מוגבלים |
| **Template message** | יוזמה עסקית / מחוץ ל-24h | תבנית מאושרת Meta + opt-in |

**למערכת אישור יומית:** רוב המקרים = **template message** (המשתמש לא כתב לנו קודם היום).

### 3.3 תבניות WhatsApp מוצעות

**תבנית 1 — `marketing_approval_v1` (Utility/Marketing):**
```
שלום {{1}},

עמוד מוכן לאישור:
🏢 {{2}} · 🌐 {{3}}
📄 {{4}}

סיבה: {{5}}
ביטחון AI: {{6}}%

{{7}} — תצוגה מקדימה
```

**כפתורים (Quick Reply או CTA URL):**
- `אשר` → URL עם token approve (מוגבל 1 שימוש)
- `תיקון` → URL revise
- `דחה` → URL reject
- `תצוגה` → preview URL

**הערה:** WhatsApp **לא** תומך ב-4 כפתורי URL מלאים כמו Gmail — לרוב 2–3 כפתורים + קישור בגוף. **הפתרון:** 3 כפתורים (אשר/תיקון/דחה) + קישור preview בטקסט או כפתור רביעי אם התבנית מאפשרת.

### 3.4 תמונות ב-WhatsApp

- **Header image:** תמונת compare (before|after) — URL ציבורי מ-Supabase Storage
- **אין** embed של HTML — רק image + text + buttons
- גודל מקסימלי: דחיסה ל-<500KB

### 3.5 Edge Function חדשה: `marketing-notify-whatsapp`

```
POST { approvalId, destination }
→ בודק opt-in ב-marketing_whatsapp_subscribers
→ בוחר template vs session
→ קורא ל-Gupshup template endpoint: /wa/api/v1/template/msg
→ לוג ב-notification_outbox
```

**הרחבת `send-whatsapp-message`:**
- הוספת `action: 'send_template'` עם `templateId`, `params[]`
- הסרת דרישת `super_admin` לקריאות service-role פנימיות (webhook secret)

### 3.6 Inbound WhatsApp (אופציונלי Phase 2)

- Gupshup callback URL → Edge `marketing-whatsapp-inbound`
- מיפוי quick-reply payload → `approval-action`
- דורש הגדרת webhook ב-Gupshup console

### 3.7 עדיפות ערוץ

```
if (user.email && email_verified) → Gmail/Resend
else if (user.phone && whatsapp_opt_in) → WhatsApp template
else → in-app notification center (סעיף 4)
```

---

## 4. איך מרכז ההתראות במערכת יעבוד (fallback)

### 4.1 מטרה

כשאין Gmail/WhatsApp, או כשהשליחה נכשלה אחרי N ניסיונות — הפריט נשאר ב-**מרכז התראות** עד שהמשתמש נכנס (אופציונלי) או עד שיישלח ערוץ חלופי.

### 4.2 שכבות fallback

| עדיפות | ערוץ | טריגר fallback |
|--------|------|----------------|
| 1 | Gmail/Resend | כשל שליחה / אין email |
| 2 | WhatsApp | כשל / אין opt-in |
| 3 | In-app | תמיד — mirror לפריט |
| 4 | (אופציונלי) SMS/Twilio | קיים `twilio-outbound-call` — לא מומלץ לשגרה |

### 4.3 מימוש In-app (Staging → Production)

**היום (stub):**
- `marketing-notifications.js` — `localStorage` `coco-marketing-notifications-v1`
- סוגים: `approval_required`, `page_ready`, `action_completed`, `daily_digest`, `critical_alert`
- `ai-control-center-bridge.js` → `notifyPageReadyForApproval()` מזין את התור

**יעד Phase 0 (מרכז הודעות ואישורים — סעיף 15):**
- עמוד ייעודי in-app = **ערוץ ראשי ל-POC** — לא fallback בלבד
- מנצל Preview מ-`actions-workbench.js` ו-badge מ-`app.js`
- טבלת `marketing_in_app_notifications` ב-Supabase (Phase 0b)
- Realtime subscription (אופציונלי) למסך Hub

**יעד Phase 1+ (ערוצים חיצוניים):**
- Gmail/WhatsApp = **התראה + deep link** למרכז — לא מחליפים את המרכז
- אישור מרחוק ללא login (tokens) — משלים את המרכז, לא מחליף אותו

### 4.4 UI מרכז התראות

- badge על Hub (`approvalCount` — כבר קיים ב-`app.js`)
- מסך `screen-ai-center` — רשימת `pending_approval` עם deep link
- כל פריט: אותם 4 פעולות כמו במייל (דרך token גם מתוך המערכת — SSO אופציונלי)

### 4.5 מניעת spam

- **אחד לפריט:** `UNIQUE(approval_id, channel)` ב-outbox
- **digest:** רק אם `>3` פריטים באותו יום ו-`user.prefers_digest=true`
- **שעת שקט:** לא לשלוח WA בין 22:00–07:00 (timezone לקוח)
- **תזכורת:** מקסימום 1 reminder אחרי 48h ללא תגובה

---

## 5. איך יתבצע האישור (tokenized links, webhook, audit trail, no login required)

### 5.1 מודל Token

```
token = base64url(approvalId + '.' + action + '.' + nonce)
signature = HMAC-SHA256(token, MARKETING_APPROVAL_SECRET)
link = APPROVAL_BASE_URL + '?t=' + token + '.' + signature
```

**שדות ב-DB (`marketing_approval_tokens`):**

| שדה | תיאור |
|-----|--------|
| `id` | UUID |
| `approval_id` | FK |
| `action` | `approve` \| `revise` \| `reject` \| `preview` |
| `token_hash` | SHA256 של הערך המלא — לא לשמור token גולמי |
| `expires_at` | ברירת מחדל: 7 ימים (approve/reject), 30 יום (preview) |
| `used_at` | null עד שימוש |
| `max_uses` | 1 ל-approve/reject; 10 ל-preview |
| `recipient_hint` | hash של email/phone — לא PII גולמי |

### 5.2 Edge Function: `marketing-approval-action`

```
GET/POST /functions/v1/marketing-approval-action?t=…&action=approve
```

**זרימה:**
1. אמת חתימה + תוקף + לא used
2. טען `marketing_approvals` — ודא `status = pending_approval`
3. בצע פעולה:
   - **approve** → `status = approved`, queue publish job
   - **reject** → `status = rejected`, שמור `rejection_reason` אם סופק
   - **revise** → `status = revision_requested`, שמור `revision_notes`
   - **preview** → redirect ל-hosted preview (לא משנה status)
4. סמן token כ-used; כתוב `marketing_approval_audit`
5. החזר HTML פשוט (mobile-friendly) או JSON

**דף תוצאה (GH Pages `public/approve.html`):**
- מקבל `?result=approved&approvalId=…` אחרי redirect מ-Edge
- מציג אישור ויזואלי — **ללא** צורך ב-JS כבד

### 5.3 ללא התחברות — איך זה בטוח?

| איום | מיטיגציה |
|------|----------|
| ניחוש token | 256-bit entropy + HMAC; rate limit per IP |
| העברת קישור לצד שלישי | token מקושר ל-recipient_hint; אופציונלי: OTP במייל לפעולות רגישות |
| replay | `used_at` + `max_uses=1` |
| CSRF על GET approve | POST מומלץ ל-approve/reject; GET מציג דף אישור עם כפתור POST |
| פרסום בטעות | שני שלבים: לחיצה → דף "האם לאשר?" → POST סופי |

### 5.4 Audit Trail

כל אירוע ב-`marketing_approval_audit`:
```json
{
  "approval_id": "…",
  "action": "approve",
  "channel": "email_link",
  "actor_ip_hash": "…",
  "user_agent": "…",
  "token_id": "…",
  "created_at": "…",
  "metadata": { "confidence_at_approval": 87 }
}
```

שיקוף אופציונלי ל-Sheets (`type: approval-audit` ב-webhook).

### 5.5 חיבור ל-Actions Workbench (Staging)

**קיים:** `dalia-action-approvals-v1` ב-localStorage, `ActionsWorkbench.approve()`, `EXECUTION_MODE=preview`

**מיגרציה:**
- אישור מרחוק מעדכן Supabase → sync webhook → עדכון LS בכניסה הבאה למערכת
- עד אז: Edge כותב גם ל-Sheets/GitHub issue כגיבוי

### 5.6 אחרי אישור — Publish

1. Edge `marketing-publish-approved` נקרא מ-queue
2. משתמש ב-`deploy-control` (קיים — `GITHUB_PAT`, dispatch workflow)
3. מעדכן `site-work-plan.json` / CMS (עתידי)
4. כותב history: `marketing_approval_audit` + `marketing_daily_runs`
5. שולח **הודעת השלמה** (Gmail > WA > in-app): "✅ פורסם — {pageTitle}"

---

## 6. איך יוצגו לפני/אחרי/Preview בתוך ההודעה (screenshots, hosted preview URLs)

### 6.1 מקורות תוכן

| נכס | מקור | אחסון |
|-----|------|--------|
| **Before** | צילום URL חי נוכחי או snapshot אחרון מ-`history-lite` | Storage: `previews/{approvalId}/before.webp` |
| **After** | HTML טיוטה מ-AI rendered ב-headless | Storage: `previews/{approvalId}/after.webp` |
| **Compare** | תמונה משולבת (slider static או side-by-side) | `compare.webp` |
| **Full preview** | דף HTML מלא עם diff highlights | `marketing-preview/{approvalId}/index.html` |

### 6.2 שירות צילום מסך

**אפשרות מומלצת — Edge + external:**
- **Browserless.io** / **Playwright on Fly.io** / **GitHub Actions** (זול, איטי)
- Edge function `marketing-capture-preview` שולחת job ל-queue

**אפשרות POC:**
- GitHub Actions workflow `capture-page-preview.yml` — מופעל מ-`deploy-control` dispatch
- מעלה artifacts ל-Supabase Storage דרך service key

**לא ב-GH Pages:** אין אפשרות להריץ Playwright בדפדפן המשתמש באופן אמין לכל הלקוחות.

### 6.3 Hosted Preview URL

```
https://{project}.supabase.co/storage/v1/object/public/marketing-previews/{approvalId}/index.html?token={preview_token}
```

או subdomain ייעודי: `preview.dalia-c.com/{approvalId}` → CDN ל-Storage.

**תוכן הדף:**
- iframe או HTML מלא של הטיוטה
- סרגל עליון: חברה, אתר, שם עמוד, confidence
- טאבים: לפני | אחרי | השוואה | הסבר AI
- כפתורי אישור (אותם tokens)

### 6.4 הצגה בערוצים

| ערוץ | before/after | full preview |
|------|--------------|--------------|
| **Gmail** | `<img>` x3 + alt text | כפתור CTA |
| **WhatsApp** | header image (compare) | URL בכפתור/טקסט |
| **In-app** | thumbnails + modal | iframe במודל Preview (קיים ב-Workbench) |

### 6.5 ביצועים

- WebP, רוחב מקס 1200px
- lazy-load ב-preview page
- TTL על assets: 90 יום אחרי סגירת approval

---

## 7. זרימה יומית מלאה (cron → multi-AI → draft → notify → approve → publish)

### 7.1 ציר זמן (UTC)

| שעה | שלב | רכיב |
|-----|------|------|
| 06:00 | Cron | `.github/workflows/daily-marketing-engine.yml` |
| 06:01 | Headless analyze | `scripts/daily-marketing-engine.mjs` |
| 06:02 | Dispatch Edge | webhook ל-`marketing-daily-run` (חדש) |
| 06:05–06:30 | Per-tenant queue | workers מוגבלים (5 במקביל) |
| 06:30–07:00 | Multi-AI | 3 מנועים + compare |
| 07:00–07:15 | Build drafts + screenshots | רק לפריטים עם `confidence >= threshold` |
| 07:15 | Notify | outbox processor |
| *async* | User action | token link |
| *async* | Publish | אחרי approve |

### 7.2 תרשים זרימה מפורט

```
[Cron GH Actions]
    → Node daily-engine (headless, כל ה-tenants)
    → POST marketing-daily-run { runId, tenants[], findings }
         │
         ▼
[לכל tenant עם המלצות חדשות]
    → שלב 1: איסוף נתונים (GSC/GA4 live אם מחובר, אחרת snapshot)
    → שלב 2: MultiAiOrchestrator (Edge) — task: analyze_page
    → שלב 3: אם disagreement גבוה → confidence נמוך → לא שולחים notify (רק in-app)
    → שלב 4: generate draft (title, meta, content patch)
    → שלב 5: INSERT marketing_approvals (status=pending_approval)
    → שלב 6: capture screenshots (async job)
    → שלב 7: כשהצילומים מוכנים → marketing_notification_outbox
         │
         ▼
[Outbox processor — cron כל 5 דק']
    → try email → else whatsapp → else in-app
    → update sent_at / retry_count
         │
         ▼
[משתמש לוחץ אשר]
    → marketing-approval-action
    → marketing-publish-approved
    → deploy-control / CMS update
    → completion notify
```

### 7.3 תנאים לשליחת התראה

שולחים **רק אם כולם מתקיימים:**
1. `requiresApproval === true`
2. `status === pending_approval`
3. יש draft משמעותי (לא שינוי טריוויאלי)
4. `ai_confidence >= 60` (סף ניתן להגדרה per client)
5. לא נשלחה התראה על אותו `actionId` ב-24h האחרונות
6. screenshots מוכנים (או fallback: טקסט בלבד אם capture נכשל)

### 7.4 מצב היום vs יעד

| שלב | היום | יעד Mission 27 |
|-----|------|----------------|
| Cron | GH Actions → artifact בלבד | + dispatch Edge |
| Analyze | rule-based (browser/Node) | + Multi-AI live |
| Draft | localStorage / report.json | Supabase |
| Notify | LS queue stub | Email/WA/outbox |
| Approve | בתוך Staging בלבד | token מרחוק |
| Publish | `preview` בלבד | deploy-control |

---

## 8. אילו שירותים לחבר (table: service, purpose, free/paid, required/optional)

| שירות | מטרה | חינמי/בתשלום | חובה/אופציונלי |
|--------|------|--------------|----------------|
| **GitHub Actions** | cron יומי, headless engine, screenshot workflow | חינם (public repo) | **חובה** |
| **Supabase** | DB, Edge Functions, Storage, Realtime | freemium → בתשלום בסקייל | **חובה** |
| **Resend** | שליחת מיילי אישור HTML | freemium (3K/חודש) | **חובה** Phase 1 |
| **Gmail API** | שליחה כמשתמש + inbound | חינם (quota) | אופציונלי Phase 2 |
| **Gupshup WhatsApp** | התראות WA + templates | בתשלום per message | אופציונלי (מומלץ) |
| **OpenAI API** | ChatGPT — ניתוח וניסוח | בתשלום per token | **חובה** ל-Multi-AI live |
| **Anthropic API** | Claude — reasoning, approval | בתשלום | **חובה** ל-Multi-AI |
| **Google AI (Gemini)** | השוואה שלישית | freemium מוגבל | מומלץ |
| **Google Search Console** | נתוני SEO | חינם | **חובה** (live דרך Edge) |
| **Google Analytics 4** | מדדים | חינם | מומלץ |
| **Supabase Storage** | screenshots + preview HTML | כלול ב-Supabase | **חובה** |
| **Playwright/Browserless** | צילומי מסך | חינם (GH) / בתשלום (hosted) | **חובה** לתמונות |
| **Google Sheets** | audit export, גיבוי | חינם | אופציונלי |
| **Cloudflare** | CDN ל-preview (prod) | freemium | אופציונלי |
| **Twilio** | שיחות/SMS חירום | בתשלום | אופציונלי |
| **GitHub PAT** | publish דרך deploy-control | חינם | **חובה** לפרסום |

---

## 9. עלויות משוערות (חינמי vs בתשלום)

### 9.1 שכבת POC (לקוח יחיד — Dalia C)

| פריט | עלות חודשית משוערת |
|------|---------------------|
| GH Actions + Pages | $0 |
| Supabase Free tier | $0 |
| Resend Free | $0 (עד 3K מיילים) |
| AI APIs (5–10 approvals/יום, 3 engines) | $15–40 |
| Gupshup WA (~30 הודעות template/חודש) | $5–15 |
| Browserless (אם hosted) | $0–25 |
| **סה"כ POC** | **$20–80/חודש** |

### 9.2 שכבת Production (100 לקוחות)

| פריט | עלות חודשית משוערת |
|------|---------------------|
| Supabase Pro | $25+ |
| Resend Pro | $20+ |
| AI (100 לקוחות × 2 פריטים/יום × 3 engines) | $300–800 |
| Gupshup (6000 template msgs) | $150–400 |
| Screenshot service | $50–100 |
| **סה"כ** | **$550–1,350/חודש** |

### 9.3 שכבת Scale (1000+ לקוחות)

| פריט | הערה |
|------|------|
| Supabase Team/Enterprise | queue workers, connection pooling |
| Batch AI | הקטנת קריאות — routing חכם (לא 3 engines לכל פריט) |
| Dedicated queue (Redis/Inngest) | $50–200 |
| **סה"כ** | $2,000–8,000/חודש (תלוי בנפח אישורים אמיתי) |

### 9.4 חיסכון

- שליחת AI רק לפריטים שעברו rule-based filter (Daily Engine v2 כבר עושה זאת)
- template WA במקום session
- digest במקום N מיילים כש>3 פריטים
- cache תוצאות Multi-AI לעמוד שלא השתנה

---

## 10. אבטחה והרשאות (signed tokens, expiry, RLS, rate limits)

### 10.1 Secrets (Supabase)

| Secret | שימוש |
|--------|--------|
| `MARKETING_APPROVAL_SECRET` | HMAC לtokens |
| `MARKETING_CRON_SECRET` | אימות GH Actions → Edge |
| `RESEND_API_KEY` | מייל |
| `GUPSHUP_API_KEY` | WhatsApp |
| `GITHUB_PAT` | publish |
| `MARKETING_OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GOOGLE_AI_KEY` | AI |

### 10.2 RLS (Row Level Security)

| טבלה | מדיניות |
|------|---------|
| `marketing_approvals` | service role full; authenticated marketing_manager לפי `client_id` |
| `marketing_approval_tokens` | **אין גישה מ-client** — Edge בלבד |
| `marketing_approval_audit` | read למנהלים; insert רק service role |
| `marketing_in_app_notifications` | user רואה רק `recipient_user_id` |

### 10.3 Rate Limits

| נקודה | מגבלה |
|--------|--------|
| `marketing-approval-action` | 30 req/min per IP |
| token validation failures | lock 15 min אחרי 10 כשלונות |
| outbox send | 100/min global |
| Multi-AI per tenant | 50 calls/day default |

### 10.4 תוקף Tokens

| פעולה | TTL | שימושים |
|--------|-----|---------|
| approve / reject | 7 ימים | 1 |
| revise | 14 ימים | 3 |
| preview | 30 ימים | 10 |

### 10.5 תאימות

- לא לשמור PII ב-URLs
- GDPR: מחיקת assets אחרי 90 יום
- לוגים — hash של IP, לא IP גולמי

---

## 11. ביצועים וסקייל (batch, queue, no heavy data in GH Pages)

### 11.1 עקרונות

1. **אין נתונים כבדים ב-GH Pages** — רק `approve.html` קל + קישורים ל-Storage
2. **Queue מרכזי** — `marketing_job_queue` (pgmq או טבלה עם `FOR UPDATE SKIP LOCKED`)
3. **Batch tenants** — 5–10 במקביל, לא 1000 בבת אחת
4. **Idempotency** — `runId + tenantId + pageId` unique

### 11.2 חלוקת עומס

```
GitHub Actions (scheduler) 
  → שולח רשימת tenant IDs ל-Edge
  → Edge דוחף jobs ל-queue
  → Workers (Edge cron / separate function) שואבים batch
```

### 11.3 אחסון

| נתון | מיקום | לא ב-LS |
|------|--------|---------|
| approvals | Supabase | ✅ |
| screenshots | Storage CDN | ✅ |
| runs history | Supabase + Sheets export | ✅ |
| notifications | outbox table | ✅ |

### 11.4 יעדי SLA

| מדד | יעד |
|-----|-----|
| זמן מ-cron עד notify (לקוח בודד) | < 45 דק |
| זמן תגובה ללחיצת אשר | < 2 שניות |
| זמן publish אחרי אשר | < 5 דק (async) |
| 1000 tenants — סיום batch | < 4 שעות (מקביל) |

### 11.5 מה Daily Engine v2 כבר עושה נכון

- `PAGE_CHUNK=5` + `yieldTick` — מניעת חסימת UI
- `MAX_DRAFTS=50`, `MAX_RUNS=30` — מגבלות אחסון
- `shouldRunPhase` — מניעת ריצות כפולות
- Node headless — אותה לוגיקה ללא דפדפן

---

## 12. מה כבר קיים ב-Staging vs מה חסר

### 12.1 קיים ופועל ✅

| רכיב | מיקום | הערה |
|------|--------|------|
| Daily Engine v2 | `daily-engine.js`, `daily-marketing-engine.mjs` | rule-based, `pending_approval` |
| GH Actions cron | `daily-marketing-engine.yml` | artifact בלבד |
| Multi-AI registry | `multi-ai-orchestrator.js` | 3 engines, `skip_live` ב-Staging |
| AI Control Center | `ai-control-center.js`, bridge | `notifyPageReadyForApproval` |
| Notifications stub | `marketing-notifications.js` | LS queue, 5 types |
| Actions + Preview | `actions-workbench.js` | modal, `EXECUTION_MODE=preview` |
| Approvals LS | `dalia-action-approvals-v1` | מקומי בלבד |
| Edge AI chat | `marketing-ai-chat`, claude, gemini | דורש super_admin |
| Resend emails | FleetOS functions | לא מחובר לשיווק |
| WhatsApp Gupshup | `send-whatsapp-message` | FleetOS, super_admin |
| deploy-control | Edge | publish דרך GH PAT |
| Google sync infra | `marketing-google-sync` | GSC/GA4, Gmail pending |
| Sheets export | `exportHistoryToSheets`, webhook.gs | CSV עובד |
| Mission 25 QA | 11/11 | תשתית UI יציבה |

### 12.2 חסר לחלוטין ❌

| רכיב | נדרש ל-Mission 27 |
|------|-------------------|
| `marketing-notify-email` | שליחת מייל אישור |
| `marketing-notify-whatsapp` | template messages לשיווק |
| `marketing-approval-action` | token gateway |
| `marketing-daily-run` | orchestration מ-cron |
| `marketing-publish-approved` | publish אחרי אישור |
| `marketing-capture-preview` | screenshots |
| טבלאות Supabase | approvals, tokens, outbox, audit |
| `approve.html` | דף תוצאה ציבורי |
| חיבור cron → Edge | dispatch אחרי Node run |
| Outbox processor | cron 5 דק |
| Gmail OAuth לשיווק | Phase 2 |
| WA templates מאושרים לשיווק | Meta approval |
| Multi-AI live בpipeline יומי | API keys + budget |
| מקור אמת מרכזי | מעבר מ-LS ל-Supabase |

### 12.3 פערים קריטיים

1. **GH Pages לא יכול לאשר מרחוק** — חייב Edge
2. **Gupshup דורש template** להודעות יוזמה — לא מספיק `send-whatsapp-message` הנוכחי
3. **אין screenshots** — ללא שירות headless
4. **Cron לא מפעיל notify** — רק יוצר JSON ב-repo

---

## 13. Roadmap יישום (Phase 0/1/2/3)

> **עדכון 2026-06-29:** נוסף **Phase 0** — מרכז הודעות ואישורים בתוך האפליקציה. Gmail ו-WhatsApp מדורגים אחריו כערוצי התראה חיצוניים בלבד (קישור לעמוד). פירוט מלא — סעיף 15.

### Phase 0 — מרכז הודעות ואישורים (2–3 שבועות) ⭐ **להתחיל כאן**

**מטרה:** עמוד ייעודי אחד בתוך Staging שמרכז את כל ההודעות, האישורים וההתראות — **ללא** Gmail API, WhatsApp API, או OAuth.

| שבוע | משימות |
|------|--------|
| 1 | מסך `screen-approval-hub` (או הרחבת `screen-ai-center`): רשימת פריטים ממתינים, badge, סינון לפי סטטוס |
| 1 | חיבור ל-`marketing-notifications.js` (stub) + `ai-control-center-bridge.js` → `notifyPageReadyForApproval()` |
| 2 | שילוב Preview מ-`actions-workbench.js` (modal before/after, `EXECUTION_MODE=preview`) |
| 2 | כפתורי אישור / דחייה / שליחה לתיקון — בתוך המערכת (SSO קיים ב-Staging) |
| 2–3 | דוח יומי, פעולות שהסתיימו, היסטוריית החלטות, סטטוס פריט, קישורים ישירים למשימות ולעמודים |
| 3 | מיגרציה ראשונית ל-Supabase: `marketing_approvals` + `marketing_in_app_notifications` (אופציונלי — מתחילים ב-LS) |
| 3 | QA: Playwright — ניווט לעמוד, אישור פריט, בדיקת היסטוריה |

**Definition of Done Phase 0:**
- [ ] עמוד יחיד מציג את כל 10 הרכיבים (סעיף 15.1)
- [ ] אישור מתוך המערכת מעדכן status + היסטוריה
- [ ] Preview לפני/אחרי עובד (מבוסס Workbench קיים)
- [ ] `notifyPageReadyForApproval` מזין את המרכז אוטומטית
- [ ] אין תלות ב-Gmail / WhatsApp / Resend

### Phase 1 — Gmail/Resend: התראה + קישור למרכז (3–4 שבועות)

**מטרה:** משתמש מקבל מייל **קצר** עם קישור ישיר לפריט ב**מרכז הודעות ואישורים** — לא אישור מלא מתוך המייל (זה מגיע ב-Phase 1b אופציונלי).

| שבוע | משימות |
|------|--------|
| 1 | מיגרציות Supabase: `marketing_approvals`, `tokens`, `audit`, `outbox` |
| 2 | Edge: `marketing-notify-email` (Resend) — תבנית קצרה: סיכום + קישור למרכז |
| 2–3 | Edge: `marketing-approval-action` + tokens (לאישור מרחוק אופציונלי) |
| 3 | `approve.html` + preview page ב-Storage; token flow E2E |
| 4 | `marketing-publish-approved` stub → עדכון status + הודעת השלמה במרכז + במייל |
| 4 | QA: Playwright + `scripts/verify-remote-approval.mjs` |

**Definition of Done Phase 1:**
- [ ] מייל נשלח עם קישור למרכז + (אופציונלי) כפתורי אישור מרחוק
- [ ] אשר מרחוק או מתוך המרכז מעדכן DB + audit
- [ ] completion notification במרכז + במייל

### Phase 2 — WhatsApp + Screenshots + Daily Automation (6–8 שבועות)

| שבוע | משימות |
|------|--------|
| 1–2 | אישור תבנית Gupshup `marketing_approval_v1` — **קישור למרכז בלבד** |
| 3 | `marketing-notify-whatsapp` + fallback chain (WA → מייל → in-app) |
| 4–5 | Screenshot pipeline (GH Actions / Browserless) |
| 6 | `marketing-daily-run` + חיבור cron ל-Edge |
| 7 | Multi-AI live בpipeline (סף confidence) |
| 8 | Outbox processor + retry + anti-spam |

**Definition of Done Phase 2:**
- [ ] זרימה יומית מלאה — התראה חיצונית מפנה למרכז
- [ ] before/after בתמונה במייל, ב-WA ובמרכז
- [ ] 0 התראות על פריטים שאושרו/נדחו

### Phase 3 — Scale + Gmail OAuth + Multi-tenant (8–12 שבועות)

| תחום | משימות |
|------|--------|
| Multi-tenant | `clientId` בכל טבלה; RLS; tenant queue |
| Gmail OAuth | שליחה מחשבון לקוח; inbound replies |
| Performance | pg_cron workers; batch 50 tenants |
| Cost control | AI routing — 1 engine לפריטים פשוטים |
| Dashboard | מסך סטטוס אישורים מרחוק (אופציונלי למנהל) |
| Sheets | mirror audit + דוח שבועי |

**Definition of Done Phase 3:**
- [ ] 100 לקוחות — batch יומי < 4 שעות
- [ ] $/client/month מדיד
- [ ] Gmail inbound "אשר X" עובד

---

## 14. המלצה מקצועית — הדרך האמינה ביותר

### 14.1 סיכום החלטה (עודכן)

**להתחיל ב-Phase 0: מרכז הודעות ואישורים בתוך האפליקציה** — עמוד ייעודי אחד שמרכז את כל ההחלטות, ה-Preview, וההיסטוריה. זה מנצל תשתית קיימת (`marketing-notifications.js`, `ai-control-center`, `actions-workbench` Preview) ומאפשר לבדוק את זרימת האישור ב-Staging **בשבועיים** ללא Gmail OAuth, תבניות WhatsApp, או עלויות שליחה.

**אחרי ש-Phase 0 יציב:** Gmail/Resend (Phase 1) שולח **התראה קצרה + קישור** למרכז — לא מחליף את המרכז. WhatsApp (Phase 2) באותו עיקרון. אישור מרחוק ללא login (tokens חתומים) נשאר יעד ארוך-טווח — לא חוסם את ה-MVP.

ארכיטקטורת יעד: **מרכז in-app = מקור אמת לחוויית אישור** · **ערוצים חיצוניים = push notification + deep link** · **Supabase Edge = אחסון, tokens, publish**.

לא לנסות לבנות את כל Mission 27 בבת אחת על Gmail/WhatsApp — זה יאט Staging וייצור תלות בהרשאות שלא נדרשות ל-POC.

### 14.2 סדר עדיפויות מומלץ (עודכן)

1. **מרכז הודעות ואישורים (Phase 0)** — MVP מהיר; מנצל קוד קיים
2. **DB + approvals ב-Supabase** — מקור אמת (מקביל או מיד אחרי Phase 0)
3. **Preview + before/after** — כבר קיים ב-Workbench; לחבר למרכז
4. **Resend email** — התראה + קישור למרכז (לא אישור מלא במייל)
5. **Token gateway** — לאישור מרחוק אופציונלי (Phase 1b)
6. **Screenshots** — Phase 2 (לא לחסום MVP)
7. **WhatsApp** — אחרי תבנית Meta; קישור למרכז בלבד
8. **Multi-AI live** — אחרי שזרימת האישור יציבה

### 14.3 נקודות סיכון שיש להיות כנים לגביהן

| סיכון | המלצה |
|--------|--------|
| Meta לא יאשר תבנית WA מהר | התחילו במייל; WA כערוץ משני |
| עלות AI מ-3 engines לכל עמוד | routing: Claude לאישור, GPT לניסוח, Gemini רק ב-disagreement |
| משתמש מעביר קישור אישור | recipient_hint + אופציונלי OTP לפרסום prod |
| GH Actions לא מספיק ל-1000 screenshots | queue + worker נפרד (Fly.io) |
| בלבול Staging/Production | תמיד `EXECUTION_MODE` בבירור בהודעות |

### 14.4 ארכיטקטורת יעד (מצומצמת — עודכן)

```
Cron (GH) → Node engine → Edge orchestrator → Queue
    → Multi-AI (conditional) → Approval row → Capture (async)
    → In-app hub (מרכז הודעות) ← מקור אמת לחוויית אישור
    → Outbox → Resend / Gupshup — התראה + deep link למרכז בלבד
    → User מאשר במרכז (או דרך token מרחוק) → Edge action → Publish → Done
```

### 14.5 קריטריון הצלחה ל-Mission 27

**Phase 0:** המשתמש נכנס למרכז הודעות ואישורים, רואה פריטים ממתינים עם Preview והשוואה לפני/אחרי, ולוחץ **אשר** — השינוי מתפרסם (או נשאר ב-preview לפי `EXECUTION_MODE`).

**Phase 1+:** בנוסף — המשתמש מקבל **מייל או WA** עם סיכום קצר וקישור ישיר לפריט במרכז. אישור מרחוק ללא login (token) — בונוס, לא חובה ל-MVP.

המערכת לא שולחת כלום בימים שאין `pending_approval` אמיתי.

---

## 15. Phase 0 — מרכז הודעות ואישורים (חלופה פשוטה in-app)

### 15.1 חזון ותוכן העמוד

**מרכז הודעות ואישורים** — עמוד ייעודי אחד בתוך האפליקציה (`ai-marketing-platform.html`) שמרכז את כל מה שהמשתמש צריך לדעת ולהחליט, **בלי** לפתוח Gmail, WhatsApp, או מסכים מפוזרים.

| # | רכיב | תיאור | בסיס קיים |
|---|------|--------|-----------|
| 1 | **דוח יומי** | סיכום ריצת המנוע היומי: כמה פריטים נוצרו, כמה ממתינים, כמה אושרו | `daily-engine.js`, `marketing_daily_runs` (יעד) |
| 2 | **פעולות שהסתיימו** | רשימת publish / reject שהושלמו היום/שבוע | `action_completed` ב-`marketing-notifications.js` |
| 3 | **עמודים שמוכנים לאישור** | תור `pending_approval` — הפריט המרכזי | `approval_required`, `notifyPageReadyForApproval()` |
| 4 | **Preview** | תצוגה מקדימה מלאה של הטיוטה | `actions-workbench.js` — modal Preview |
| 5 | **השוואה לפני/אחרי** | diff ויזואלי: title, meta, H1, CTA | Workbench + `history-lite` |
| 6 | **כפתורי אישור / דחייה / שליחה לתיקון** | 3 פעולות עיקריות על כל פריט | `ActionsWorkbench.approve()`, approvals LS |
| 7 | **התראות על תקלות** | `critical_alert` — עמוד down, SEO קריטי, כשל capture | `marketing-notifications.js` — סוג `critical_alert` |
| 8 | **היסטוריה של החלטות** | מי אישר/דחה, מתי, הערות | `dalia-action-approvals-v1` → Supabase `marketing_approval_audit` |
| 9 | **סטטוס של כל פעולה** | `pending` / `approved` / `rejected` / `revision_requested` | `marketing_approvals.status` |
| 10 | **קישורים ישירים למשימות ולעמודים** | deep link ל-Actions Workbench, לעמוד באתר, ל-AI Center | `screen-actions`, `screen-ai-center` |

### 15.2 יתרונות לעומת Gmail/WhatsApp מיידי

| יתרון | הסבר |
|--------|------|
| **קל יותר לבנייה** | מנצל `MarketingNotifications`, `ai-control-center`, Workbench Preview — כבר ב-Staging |
| **פחות תלות חיצונית** | אין OAuth Gmail, אין תבניות Meta ל-WhatsApp, אין Resend ל-POC |
| **עלות נמוכה** | $0 לערוץ in-app; AI בלבד (אם רץ) |
| **פחות הרשאות** | לא נדרש `gmail.send`, Gupshup template approval, Pub/Sub |
| **מהיר יותר ב-Staging** | GH Pages + LS/Supabase — ללא Edge Functions לשליחה |
| **חוויית אישור עשירה** | Preview מלא, השוואה, היסטוריה — לא מוגבל לתבנית מייל/WA |
| **מסלול ברור להמשך** | Gmail/WA שולחים רק **התראה + קישור** לעמוד זה |

### 15.3 מיקום ב-UI

**אפשרות A (מומלצת):** מסך חדש `screen-approval-hub` — כרטיס ב-Hub הראשי עם badge (`approvalCount` — כבר קיים ב-`app.js`).

**אפשרות B:** הרחבת `screen-ai-center` (`ai-control-center.js`) — טאב "אישורים" לצד שאלות AI.

**אפשרות C:** טאב ייעודי בתוך Actions Workbench — "מרכז אישורים" מעל רשימת הפעולות.

### 15.4 זרימת נתונים (Phase 0)

```
Daily Engine / AI Control Center
    → notifyPageReadyForApproval()
    → MarketingNotifications.enqueue('approval_required', payload)
    → מרכז הודעות ואישורים (UI)
    → משתמש: Preview → אשר / דחה / תיקון
    → ActionsWorkbench.approve() / reject / revise
    → LS (Phase 0) → Supabase (Phase 0b)
    → הודעת השלמה in-app (action_completed)
```

**הערה:** ב-Phase 0 המשתמש **נכנס** למערכת — זה מקבל את עקרון "No login for approval" מסעיף 1.2. זה מכוון: POC מהיר בתוך Staging. אישור ללא login (tokens) מגיע ב-Phase 1 כשהמרכז כבר עובד.

### 15.5 השוואת 3 גישות

דירוג: ⭐ (נמוך) עד ⭐⭐⭐⭐⭐ (גבוה).

| קריטריון | אישורים דרך Gmail | אישורים דרך WhatsApp | מרכז הודעות בתוך האפליקציה |
|----------|-------------------|----------------------|----------------------------|
| **מהירות פיתוח** | ⭐⭐⭐ — Resend מהיר; OAuth + inbound איטי | ⭐⭐ — תבנית Meta, Gupshup, מגבלות כפתורים | ⭐⭐⭐⭐⭐ — קוד קיים, UI בלבד |
| **עלות** | ⭐⭐⭐⭐ — Resend freemium; Gmail חינם | ⭐⭐ — תשלום per message + template | ⭐⭐⭐⭐⭐ — $0 לערוץ |
| **אמינות** | ⭐⭐⭐⭐ — תשתית מייל מבוססת; spam risk | ⭐⭐⭐ — תלוי Meta/Gupshup; 24h window | ⭐⭐⭐⭐ — תלוי Supabase/LS; אין כשל שליחה |
| **אבטחה** | ⭐⭐⭐⭐ — tokens חתומים; סיכון העברת קישור | ⭐⭐⭐ — tokens; פחות מקום ל-Preview מלא | ⭐⭐⭐⭐ — SSO/RBAC קיים; אין token ב-URL |
| **נוחות שימוש** | ⭐⭐⭐⭐⭐ — לא דורש כניסה; מהטלפון | ⭐⭐⭐⭐ — מובייל; מוגבל בתבנית | ⭐⭐⭐ — דורש כניסה; חוויה עשירה |
| **התאמה לעבודה עם הרבה לקוחות** | ⭐⭐⭐⭐ — מייל per client; digest אפשרי | ⭐⭐⭐ — עלות ליניארית; opt-in | ⭐⭐⭐⭐⭐ — מסך אחד, multi-tenant טבעי |

### 15.6 המלצה מפורשת — מה לעשות **קודם**

> **התחילו ב-Phase 0: מרכז הודעות ואישורים בתוך האפליקציה.**

**נימוק:**
1. **זמן לשוק:** 2–3 שבועות לעומת 4–6 ל-Gmail MVP מלא — כי רוב ה-UI והלוגיקה כבר קיימים.
2. **סיכון נמוך:** אין תלות באישור Meta לתבנית WA, ב-OAuth Google, או ב-onboarding Resend domain.
3. **ערך מיידי:** המשתמש רואה דוח יומי, תור אישורים, Preview, והיסטוריה — **היום** ב-Staging.
4. **בסיס לערוצים חיצוניים:** כש-Gmail/WA מגיעים — הם שולחים רק "יש פריט חדש" + קישור deep link לפריט במרכז. לא צריך לשכפל Preview במייל.
5. **סקייל:** עם 100+ לקוחות — מסך אחד עם סינון per `clientId` עדיף על 100 תיבות מייל.

**סדר מומלץ:**
```
Phase 0 (in-app hub) → Phase 1 (Gmail: notify + link) → Phase 2 (WhatsApp: notify + link) → Phase 3 (scale)
```

אישור מרחוק ללא login (token links) — **Phase 1b אופציונלי**, לא חוסם את השאר.

---

## נספח א — קישורי קוד קיימים

| קובץ | רלוונטיות |
|------|-----------|
| `public/ai-marketing/daily-engine.js` | pipeline יומי, `pending_approval` |
| `public/ai-marketing/marketing-notifications.js` | stub queue — בסיס לסוגי התראות |
| `public/ai-marketing/ai-control-center-bridge.js` | `notifyPageReadyForApproval` |
| `public/ai-marketing/actions-workbench.js` | Preview + approvals LS |
| `public/ai-marketing/multi-ai-orchestrator.js` | routing AI, task `approval` |
| `.github/workflows/daily-marketing-engine.yml` | cron 06:00 UTC |
| `supabase/functions/send-whatsapp-message/` | Gupshup |
| `supabase/functions/marketing-ai-chat/` | ChatGPT Edge |
| `supabase/functions/deploy-control/` | publish |
| `docs/integrations/SHEETS-WEBHOOK-SETUP-HE.md` | audit export |

## נספח ב — סוגי התראות (מיפוי)

| סוג קיים | שימוש ב-Mission 27 |
|-----------|-------------------|
| `approval_required` | **ראשי** — שליחה לערוצים |
| `page_ready` | נלווה — אותו payload |
| `action_completed` | אחרי publish |
| `daily_digest` | אופציונלי — רק אם מוגדר |
| `critical_alert` | עמוד down / SEO קריטי |

---

**סוף מסמך תכנון Mission 27**  
*יישום בפועל — לפי Roadmap בסעיף 13, **Phase 0** (מרכז הודעות ואישורים). Gmail ו-WhatsApp — Phase 1–2.*
