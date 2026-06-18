# Project 001 — AI SEO & Digital Marketing Manager

**Skeleton v0.1** — structure only. No data ingestion, no OpenAI, no publish.

## What this folder contains

- `src/` — Apps Script modules (stubs + one-time setup)
- `src/setup/CreateSkeleton.gs` — creates Sheet, Drive folders, Doc templates

## One-time Google setup (Owner Gate)

```powershell
cd project-001-ai-marketing
npm install
npx clasp login
npm run create
npm run push
npm run setup
```

Or open the script in Apps Script editor and run `createProjectSkeleton`.

## Sheet tabs

`config`, `raw_gsc`, `raw_ga4`, `site_pages`, `keywords`, `pages`, `competitors`,
`opportunities`, `content_queue`, `approvals`, `history`, `learning_log`, `gbp_audit`, `daily_reports`

## Drive layout

```
AI-Marketing/
├── drafts/
├── reports/
├── assets/
├── competitors/
├── published/
└── templates/   (Doc templates)
```

## Approval Center tabs

- `content_queue` — ready packages awaiting review
- `approvals` — your approve/reject decisions
- `history` — full audit trail
- `learning_log` — feedback for prompt improvement
