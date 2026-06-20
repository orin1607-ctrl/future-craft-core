# Google OAuth — Wrong GCP Project

**Date:** 2026-06-07  
**Status:** Blocked — credentials not owned by current Google account

## What happened

| Item | Value |
|------|--------|
| File | `integrations/google/credentials.oauth.json` |
| Source | Downloads — OAuth Playground tutorial client |
| GCP project | `sonorous-study-472906-u7` |
| Client type | Web (OAuth Playground only) |
| Redirect URIs | `https://developers.google.com/oauthplayground` |

The signed-in Google account has **no IAM access** to `sonorous-study-472906-u7`, so Console shows **"You need additional access"**.

There is **no** pre-existing FleetOS GCP project in this repo (`config.json` still has `YOUR_GCP_PROJECT_ID`).

## Resolution (Owner Gate)

Create a **new** project under your Google account:

1. [Create project](https://console.cloud.google.com/projectcreate) → `dalia-fleetos`
2. [OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent) → Dalia FleetOS
3. Enable APIs: Drive, Sheets, Gmail, Calendar, Docs, Apps Script
4. [Credentials](https://console.cloud.google.com/apis/credentials) → **Desktop app** (not Web) → Download JSON
5. Save as `integrations/google/credentials.oauth.json`
6. Tell Cursor: **Google credentials ready**

Desktop client avoids manual redirect URI configuration.
