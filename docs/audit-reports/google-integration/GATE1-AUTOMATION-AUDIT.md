# Google Gate 1 — Automation Feasibility Audit

**Date:** 2026-06-07  
**Question:** Can OAuth client credentials (`credentials.oauth.json`) be obtained without manual Console download?

## Verdict

**NO — Gate 1 is a true Google Owner Gate for this integration.**

There is no legal bypass for a Console-created Web client named **Dalia Login**. One owner action in Google Cloud Console is required.

---

## Methods checked

| Method | Available here? | Can replace JSON download? | Notes |
|--------|-----------------|------------------------------|-------|
| Existing `credentials.oauth.json` | Yes (invalid) | No | OAuth Playground client, project `sonorous-study-472906-u7`, no Fleet redirect |
| Files in `~/Downloads` | 2 files | No | Same playground client only |
| `token.json` | Missing | No | OAuth not completed |
| **gcloud CLI** | Not installed | No | No `%APPDATA%\gcloud` auth; install alone does not grant credentials |
| **`gcloud auth login`** | Not run | Partial only | Browser gate; gives GCP admin token, **not** OAuth client JSON |
| **`gcloud iam oauth-clients`** | N/A | No | **Workforce Identity Federation only** — not Drive/Gmail/Calendar user OAuth |
| **`gcloud iap oauth-clients create`** | N/A | No | Returns `secret` programmatically, but **IAP-locked only**; wrong scopes/redirects for FleetOS |
| **clientauthconfig / IAP API** | N/A | No | Google docs: *"The API does not operate on the OAuth clients that were created using the Google Cloud console"* |
| **Service Account + JSON key** | Not configured | No (different architecture) | Still requires Console/`gcloud` key creation; Gmail/Calendar/Drive user data needs **Workspace super-admin** domain-wide delegation — larger gate |
| **OAuth Playground flow** | Credentials exist | No | Foreign project; redirect is playground URL only |
| **Application Default Credentials** | Not present | No | Server auth for GCP APIs, not OAuth client secrets |
| **Auto-pick from Downloads script** | Ran | No | `google:pick-credentials` — 0 usable files |

---

## Why CLI/API cannot fetch "Dalia Login" secret

1. **Console-created OAuth clients** (Web / Desktop under APIs & Services → Credentials) expose the **client secret only at creation or via Download JSON**. Google does not offer a public API to retrieve secrets for existing Console clients.

2. **IAP programmatic OAuth API** (`gcloud iap oauth-clients`) explicitly **does not operate on Console-created clients** and creates IAP-only clients unsuitable for Drive/Sheets/Gmail integration.

3. **`gcloud iam oauth-clients`** is for Workforce Identity Federation (enterprise SSO), not Google Workspace user APIs used by FleetOS scripts.

4. **Installing gcloud + `gcloud auth login`** would still require a browser approval and would **not** produce the downloadable `credentials.oauth.json` format for your existing **Dalia Login** Web client.

5. **Service Account** is a different integration model; our scripts (`scripts/google/*`) are built for **OAuth 2.0 user consent** with refresh tokens, not domain-wide delegation.

---

## Minimum owner action (Gate 1)

One click in Console — no redirect URI editing needed if JSON includes `http://127.0.0.1:4521/oauth2callback` (already added per prior steps):

1. https://console.cloud.google.com/apis/credentials  
2. **Dalia Login** → **Download JSON** (download icon)  
3. Reply: **Google credentials ready**

After that, automation continues: pick from Downloads → OAuth browser (Gate 2, one Approve click) → API probes → final report.

---

## Optional future path (not implemented)

For organizations with **Google Workspace super-admin**: Service Account + domain-wide delegation could reduce per-user OAuth, but requires **two** owner gates (SA key + Admin Console delegation) and code changes. Not applicable as Gate 1 bypass today.
