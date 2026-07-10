# CO.CO — Daily Progress Report SPEC (final decisions)

## Product goal
The daily report is the **primary management dashboard** for each client project.
Within 2–3 minutes the owner must know: Google up/down, what changed, what people search, content gaps, blockers, and the top 3 tasks for today.

## Hard principles
- **Truth first:** external live data (GSC / GA4 / GBP / Ads / …) before AI estimates.
- Every metric shows: **source · last updated · reliability**.
- Never mix real metrics with AI recommendations without clear labels.
- If missing: explain why (no connection / no permission / new site / insufficient data / no sync).
- Read-only collectors for report generation (no Pipeline / images / site / OAuth / Secrets / Production unless separately approved).
- Email send **only** via existing `marketing-notify-email` (no parallel Resend client).

### Reliability labels
| Label | Meaning |
|-------|---------|
| נתון אמיתי | live external / verified |
| נתון ממטמון | cache |
| חישוב פנימי | internal calculation |
| הערכת AI | AI estimate |
| אין נתון חי | missing — with reason |

## Report numbering & files
- Per-client sequential id that **never changes**: `#0001`, `#0002`, …
- Resend of same report keeps the same number.
- Filename pattern: `COCO-Daily-Report-0001-2026-07-10.pdf` (or `dalia-c-report-0001-2026-07-10.pdf`)
- PDF cover page: report #, client, generated date/time, email sent time, system version, unique report id.

## Email (archive = inbox)
- **Primary archive = email mailbox** (Gmail search), not thousands of files in GitHub/Pages.
- Subject (fixed pattern):  
  `CO.CO | דוח יומי #0001 | {client name} | DD/MM/YYYY`
- Body = short digest only: report #, Project Score, Health Score, site state, top 3 tasks.
- Full report = **PDF attachment**.
- In marketing UI keep only: **latest report** + # + date + Open / Download PDF / Resend email.
- Full history later = dedicated DB, not site static files.

## PDF
- Every report also produced as professional PDF (official artifact).
- Button: **הורד PDF** — identical to on-screen content.
- Future: Excel / CSV.

## Page-1 Dashboard order (must be first)
1. Google site status  
2. Up or down  
3. Average position  
4. Top 3 / Top 10 / Top 20  
5. Keywords up / down  
6. Searched today / this week  
7. Matching page exists? / need new page? / content missing?  
8. System Health  
9. Executive summary  

Then all other sections.

## Full requirements catalog (target system)
See owner list §§1–20: Dashboard, SEO, GSC, GA4, GBP, Ads, site performance, technical SEO, indexation, content, search trends, content opportunities, competitors, backlinks, business metrics, Health Check, project management, AI recommendations, data reliability, executive summary.

## System Health (every report, automatic)
Full scan of connected systems (OpenAI, Supabase, GitHub, Pages, GSC, GA4, Ads, GBP, GTM, Gmail, Drive, Sheets, Storage, Resend, CRM, WhatsApp, DNS, Domain, SSL, CO.CO API, Edge, DB, notifications, reports, site builder, images, backups, Cron, …).
Per system: status, source, checkedAt, lastSync, version, latency, live vs cache, fault, impact, critical?, fix.
Summary: counts, System Health Score, critical faults, new since 24h, resolved since previous report.

## Email failure policy (approved)
Statuses: `pending` | `sent` | `failed` | `skipped` | `dry_run`  
On failure: report still saved; link available; `email_error` set; UI message  
**"הדוח נוצר בהצלחה אך שליחת המייל נכשלה."** + button **"נסה לשלוח שוב"** (one attempt after user confirm).  
No Pipeline / assistants / consultants / engines / images / OAuth / Secrets / Production side effects.  
One transient retry after 5 minutes max; idempotency key prevents duplicates.

## Phased delivery (approved)
### Phase 1 — now
- New executive Dashboard (page 1 order)
- PDF + Download PDF
- Truth labels everywhere
- System Health section
- Executive summary
- Report numbering + filename + email subject/body patterns (send still gated)
- UI: latest only + open / PDF / resend (resend gated)

### Phase 2
- Live GSC / GA4 / GBP / Ads sections (only after verified connections)

### Phase 3
- Keyword trends, content gaps, AI recommendations, auto work plan  
  (AI clearly separated from live metrics)

## Current lock
- Sample Dalia HTML/JSON already on Staging (read-only sample).
- Real email E2E once proven via `marketing-notify-email`.
- DB migration / daily Edge / Cron **not** activated until separately approved.
- No Commit/Push of Phase 1 until owner approves the Phase 1 deliverable package.
