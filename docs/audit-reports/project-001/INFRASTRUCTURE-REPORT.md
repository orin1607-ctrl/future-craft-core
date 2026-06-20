# Project001AIMarketing — Infrastructure Report

**Date:** 2026-06-20  
**Account:** orin1607@gmail.com  
**Target GCP:** Project001AIMarketing (numeric ID pending in `integrations/project-001/gcp.json`)

---

## Executive summary

| Area | Status |
|------|--------|
| **Part A — Google Analytics** | ✅ Connected · Property `properties/427711798` · 151 days synced |
| **Part A — Search Console** | ✅ `dalia-c.com` **siteOwner** (DNS verified) |
| **Google infra (OAuth)** | ✅ 7/7 APIs · token active (legacy GCP `840269841580`) |
| **Project001AIMarketing GCP** | ⏸ Project ID + OAuth client not migrated yet |
| **OpenAI** | ⏸ `.env.openai` key pending |
| **Ready for AI Marketing dev** | **~85%** — data pipeline works; GCP migration + OpenAI key remain |

---

## 1. GCP Project — Project001AIMarketing

| Item | Status |
|------|--------|
| Project created (console) | ✅ per owner |
| `project_id` in repo | ❌ **paste numeric ID** into `integrations/project-001/gcp.json` |
| OAuth on new project | ❌ credentials still on legacy `840269841580` (dalia-fleetos) |
| gcloud CLI | ❌ not installed (browser-only GCP ops) |

**Active OAuth today:** legacy project — scripts work; migrate when new OAuth client exists in Project001AIMarketing.

---

## 2. APIs (required list)

Scripts probe via `npm run project-001:gcp-audit` once `project_id` is set.

| API | Legacy project (840269841580) | Project001AIMarketing |
|-----|------------------------------|---------------------|
| Search Console | ✅ used | enable in new project |
| Analytics Data/Admin | ✅ used | enable in new project |
| Sheets, Drive, Docs, Gmail, Apps Script | ✅ verified | enable in new project |
| My Business (GBP) | scope in token | enable in new project |

**Auto:** `npm run project-001:enable-apis` opens all library tabs (uses Project001AIMarketing ID when set).

---

## 3. OAuth & Consent

| Item | Status |
|------|--------|
| Token | ✅ `integrations/google/token.json` |
| Account | orin1607@gmail.com |
| Scopes | 16+ (GSC, GA4, Drive, Sheets, Docs, Gmail, Apps Script, GBP) |
| Consent screen (Project001AIMarketing) | ⏸ configure after project_id set |

---

## 4. Credentials

| Item | Status |
|------|--------|
| OAuth client file | ✅ `integrations/google/credentials.oauth.json` |
| OAuth project in file | `840269841580` (legacy — migrate to Project001AIMarketing) |
| Service Account | ⏸ optional — create in new project if needed |
| API Keys | N/A for Google OAuth flow |

---

## 5. IAM

| Item | Status |
|------|--------|
| User OAuth (orin1607) | ✅ working |
| Service account / IAM roles | ⏸ manual in GCP console after project_id set |

---

## 6. Project 001 data pipeline

| Service | Probe | Sync | Notes |
|---------|-------|------|-------|
| **Google Analytics** | ✅ | ✅ | Property **427711798** · **151 daily rows**, 48 pages |
| **Search Console** | ✅ siteOwner | ⚠️ 0 query rows | Connected; may be low/no search volume in 28d window |
| **Sheets** | ✅ | ✅ | [Sheet](https://docs.google.com/spreadsheets/d/1_7PP3HVv0jxSR6Twc7PXI372fFlQS3O5Woip8YxAHEs) |
| Drive, Docs, Gmail, Apps Script | ✅ google:verify 7/7 | — | infra ready |

**config.json updated:**
- `gsc_site_url`: `https://dalia-c.com/`
- `ga4_property_id`: `properties/427711798`

**Verify:** ✅ Phase 1 double-sync passed (2026-06-20)

---

## 7. OpenAI

| Item | Status |
|------|--------|
| `.env.openai.example` | ✅ created |
| `.env.openai` | ⏸ owner pastes key |
| Probe | `npm run project-001:openai-probe` |

---

## Owner Gates (browser — exact actions)

### A. Project001AIMarketing Project ID

1. Open: https://console.cloud.google.com/home/dashboard  
2. **Top bar** → click project name → select **Project001AIMarketing**  
3. **⚙ Project settings** (or IAM & Admin → Settings)  
4. Copy **Project number**  
5. Paste into `integrations/project-001/gcp.json` → `"project_id": "YOUR_NUMBER"`

### B. OAuth client (new project)

1. Open: `https://console.cloud.google.com/apis/credentials?project=YOUR_PROJECT_ID`  
2. **+ CREATE CREDENTIALS** → **OAuth client ID**  
3. Application type: **Web application**  
4. Name: `Project001 OAuth`  
5. **Authorized redirect URIs** → **+ ADD URI → `http://127.0.0.1:4521/oauth2callback` → **SAVE**  
6. **Add secret** → copy Client ID + Secret → `integrations/google/credentials.oauth.paste.json` → `npm run google:import-paste`

### C. OAuth Consent (new project)

1. Open: `https://console.cloud.google.com/apis/credentials/consent?project=YOUR_PROJECT_ID`  
2. **EDIT APP** → add scopes from `integrations/google/scopes.json`  
3. **Test users** → add `orin1607@gmail.com`  
4. **SAVE**

### D. Enable APIs (new project)

Run: `npm run project-001:enable-apis`  
On each tab: click **ENABLE**

### E. OpenAI key

1. Open: https://platform.openai.com/api-keys  
2. **+ Create new secret key**  
3. Copy key → create `.env.openai` from example → `OPENAI_API_KEY=sk-...`

---

## Git

| | |
|--|--|
| Branch | `main` |
| Last commit | `38747e6` — GSC verification (staging) |
| Status | ahead 2 · many untracked local files (Project 001 scripts) |

---

## Next steps

1. Paste **Project001AIMarketing** project number → re-run `npm run project-001:gcp-audit -- --open`  
2. Create OAuth in **new** project → `npm run project-001:auth`  
3. Paste **OpenAI** key → `npm run project-001:openai-probe`  
4. **Part A step 2+** (Ads, GBP full probe) after GCP migration  
5. **Part B** (Dashboard, AI engine) after Part A complete
