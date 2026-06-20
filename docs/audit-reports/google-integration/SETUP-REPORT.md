# Google Integration — Setup Report

**Generated:** infrastructure phase (pre-OAuth)  
**Guide:** [GOOGLE_INTEGRATION.md](../../GOOGLE_INTEGRATION.md)

## Status: awaiting owner Google Cloud setup

Infrastructure is ready. **No Google account is connected yet.**

---

## Owner action (single step now)

**Create OAuth Desktop credentials and save the file:**

1. https://console.cloud.google.com/ → new project `dalia-fleetos`
2. Enable APIs: Drive, Sheets, Gmail, Calendar, Docs, Apps Script
3. OAuth consent screen → configure
4. Credentials → OAuth client ID → **Desktop app** → Download JSON
5. Save as: `integrations/google/credentials.oauth.json`

Reply: **"Google credentials ready"**

---

## After credentials

```bash
npm run google:auth    # browser OAuth (owner)
npm run google:check   # verify APIs
```
