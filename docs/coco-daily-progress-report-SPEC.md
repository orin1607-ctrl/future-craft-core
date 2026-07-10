# CO.CO — Daily Progress Report SPEC (approved plan)

## Guarantees
- Read-only collectors
- Never runs Pipeline / assistants / consultants / engines / image generation
- Never changes SEO, site, OAuth, Secrets, Production, Hostinger, DNS/SSL records

## Phase 1 (Dalia sample)
- Generator: `scripts/generate-daily-progress-dalia.mjs`
- Output: `public/coco-reports/dalia-c-official/daily/`
- Email: dry_run preview only until explicit send approval
- DB migration: `supabase/migrations/20260710180000_marketing_daily_reports.sql`
- Edge: `marketing-daily-progress-report` (persist_payload + status)
- Cron: `.github/workflows/daily-progress-report.yml`
- UI: `coco-daily-report-viewer.js`

## Source labels
live | cache | estimate | internal | missing | not_configured
