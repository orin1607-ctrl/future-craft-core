# Google Integration — Dalia / FleetOS

**Status:** ✅ Setup complete (Staging) — see `docs/audit-reports/google-integration/SETUP-COMPLETE.md`

Professional Google Workspace connectivity (Drive, Sheets, Gmail, Calendar, Docs, Apps Script), mirroring the GitHub + Hostinger automation pattern.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Developer / CI (local scripts)                                  │
│  scripts/google/google-auth-login.mjs                            │
│  scripts/google/google-connection-check.mjs                      │
│  scripts/google/google-integration-audit.mjs                     │
└───────────────────────────┬─────────────────────────────────────┘
                            │ OAuth 2.0 (Desktop)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Google Cloud Project (dalia-fleetos)                            │
│  • OAuth consent screen                                          │
│  • Enabled APIs: Drive, Sheets, Gmail, Calendar, Docs, Script    │
│  • credentials.oauth.json (local only, gitignored)                 │
└───────────────────────────┬─────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
   Google Drive        Google Sheets      Apps Script
   Gmail               Calendar           (clasp deploy)
   Docs
```

### Secrets (never commit)

| File | Purpose |
|------|---------|
| `integrations/google/credentials.oauth.json` | OAuth client from GCP |
| `integrations/google/token.json` | Refresh + access tokens |
| `.env.google` | Optional paths / project overrides |
| `integrations/google/apps-script/.clasp.json` | clasp project id |

### Staging vs Production

| Environment | Google usage |
|-------------|--------------|
| **Staging** (github.io + dalia-staging Supabase) | Scripts + optional Drive folder `Staging/` |
| **Production** (dalia-car.online VPS) | Separate folder `Production/` — enable after go-live |

---

## NPM scripts

```bash
npm run google:audit         # inventory — no OAuth
npm run google:auth          # OAuth login (owner browser)
npm run google:check         # probe APIs after auth
npm run google:import-paste  # build credentials from paste file (new GCP UI)
npm run google:setup-drive   # create Drive folder structure
npm run google:verify        # full verification + reports
npm run google:continue      # auth + check + report
```

---

## Owner Step 1 — Google Cloud (one-time, **your approval required**)

Do this once as the Google account owner:

1. Open [Google Cloud Console](https://console.cloud.google.com/)
2. **Create project** → name e.g. `dalia-fleetos`
3. **APIs & Services → Enable APIs** — enable:
   - Google Drive API
   - Google Sheets API
   - Gmail API
   - Google Calendar API
   - Google Docs API
   - Google Apps Script API
4. **OAuth consent screen** → configure (External or Internal)
   - App name: `Dalia FleetOS`
   - User support email: your email
   - Add test users if External + Testing
5. **Credentials** — ממשק Google חדש (2025+): אין Download JSON ל-client קיים.

   **אפשרות א — Dalia Login (Web, Redirect URI כבר נוסף):**
   - פתח [Auth Clients](https://console.cloud.google.com/auth/clients) → **Dalia Login**
   - **Add secret** → העתק **Client ID** + **Client secret** (מוצגים **פעם אחת**)
   - שמור ב-`integrations/google/credentials.oauth.paste.json` (ראה `credentials.oauth.paste.example.json`)
   - הרץ: `npm run google:import-paste`

   **אפשרות ב — Desktop client חדש:**
   - Create client → **Desktop app** → בשלב Create העתק/שמור את ה-secret מיד (פעם אחת בלבד)

6. ~~Download JSON~~ — הוסר בממשק החדש; השתמש ב-paste או ביצירת client חדש.
   ```bash
   cp integrations/google/config.example.json integrations/google/config.json
   ```
   Edit `gcp_project_id` and `default_account_hint`.

Tell Cursor: **"Google credentials ready"** — we continue with `npm run google:auth`.

---

## Owner Step 2 — OAuth login (browser)

After Step 1, run:

```bash
npm run google:auth
```

A URL opens in the terminal. Log in as the **owner Google account** and approve scopes. Token saves to `integrations/google/token.json`.

---

## Owner Step 3 — Verify

```bash
npm run google:check
```

Report: `docs/audit-reports/google-integration/connection-check.json`

---

## Apps Script (optional, after OAuth)

```bash
npm install -g @google/clasp
cp integrations/google/apps-script/.clasp.json.example integrations/google/apps-script/.clasp.json
# clasp login  (separate Google approval)
# clasp create --title "Dalia FleetOS" --rootDir integrations/google/apps-script
```

---

## Audit reports

| Report | Command |
|--------|---------|
| Inventory | `npm run google:audit` → `docs/audit-reports/google-integration/report.json` |
| Live probes | `npm run google:check` → `connection-check.json` |

---

## Security

- Tokens and credentials are **gitignored**
- Use **Desktop OAuth** for local scripts only
- For production server automation later: use **Service Account** (separate doc / phase 2)
- Principle of least privilege: trim scopes in `integrations/google/scopes.json` if a service is unused

---

## Relation to existing app

| Current | Google integration |
|---------|-------------------|
| Resend email | Gmail API optional backup |
| Supabase Storage documents | Drive optional mirror |
| FleetOS fuel sheets (UI mock) | Sheets API for live data |
| `fonts.googleapis.com` | Unchanged (public CDN) |
| Maps link in handover | Unchanged (no API key) |
