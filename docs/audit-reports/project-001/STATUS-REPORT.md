# Project 001 — Status Report (2026-06-20)

## Already ready (before this session)

- GCP project **Project001AIMarketing** created (console)
- **GSC** — `dalia-c.com` DNS verified, **siteOwner**
- **GA4** — Property `427711798`, sync working (151 days historical)
- **Sheets / Drive / Docs / Gmail / Apps Script** — OAuth + verify 7/7
- **Google Ads** — connected in UI (same Google account)
- **GBP** — business visible in UI under yoni122222@gmail.com
- Data Sheet: https://docs.google.com/spreadsheets/d/1_7PP3HVv0jxSR6Twc7PXI372fFlQS3O5Woip8YxAHEs

## Completed now

| Action | Result |
|--------|--------|
| `project-001:gbp-probe` | ⚠️ **Quota exceeded** on legacy GCP `840269841580` — not permission denied yet |
| `project-001:connections` | ✅ GSC, GA4, Sheets, Drive, Docs, Gmail, Apps Script |
| `project-001:probe` | ✅ dalia-c.com + GA4 |
| GBP + connections scripts | Added to repo |
| `config.json` | GBP hint + Ads note |

## Waiting for your approval only

### 1. Project001AIMarketing Project Number (required for unified GCP)

Open: https://console.cloud.google.com/home/dashboard  
→ Select **Project001AIMarketing** → **Project settings** → copy **Project number**  
→ paste in `integrations/project-001/gcp.json` → `"project_id": "..."`

### 2. GBP API — enable on Project001AIMarketing + OAuth migration

After project_id is set, run: `npm run project-001:enable-apis`  
On these tabs click **ENABLE**:
- https://console.cloud.google.com/apis/library/mybusinessaccountmanagement.googleapis.com?project=YOUR_ID
- https://console.cloud.google.com/apis/library/mybusinessbusinessinformation.googleapis.com?project=YOUR_ID

Then create OAuth client in **Project001AIMarketing** (same redirect URI) → `npm run google:import-paste` → `npm run project-001:auth`

**GBP location access (if API still empty after quota fix):**  
https://business.google.com → business **דליה פתרונות מימון ותחזוקה לרכב** → **Users** → add **orin1607@gmail.com** as **Manager** (read is enough; no new profile)

### 3. Google Ads API (read-only, Part A step 3)

https://ads.google.com/aw/apicenter → apply for **Developer Token** (test mode OK for read)  
→ reply **"Ads token ready"** when approved

### 4. OpenAI

https://platform.openai.com/api-keys → **Create new secret key**  
→ paste in `.env.openai` as `OPENAI_API_KEY=sk-...`

## Next steps to 100% infrastructure

1. Paste **Project001AIMarketing** project number → migrate OAuth
2. Re-run: `npm run project-001:gbp-probe` + `npm run project-001:connections`
3. Google Ads API probe (after developer token)
4. OpenAI probe: `npm run project-001:openai-probe`
5. Part B: AI Marketing engine + Approval Center (after Part A gates clear)

## Git

- Branch: `main`
- Last commit: `38747e6`
- Local work saved (scripts, config, reports)
