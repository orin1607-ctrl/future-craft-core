# Project 001 — Phase 1 Status Report

**Date:** 2026-06-18  
**Account:** orin1607@gmail.com (ILANA ATIAS)  
**GCP Project:** `840269841580` (dalia-fleetos)

---

## Summary

| Step | Status | Notes |
|------|--------|-------|
| OAuth scopes (full suite) | ✅ Done | 16 scopes including GSC, GA4, GBP, Gmail, Apps Script |
| GCP APIs | ✅ Enabled | GSC + Analytics APIs responding |
| `npm run verify` (Google infra) | ✅ 7/7 OK | Drive, Sheets, Gmail, Calendar, Docs, Apps Script |
| `project-001:probe` | ⚠️ Blocked | **0 GSC sites, 0 GA4 properties** on this account |
| `project-001:sync` | ⏸ Pending | Needs GSC site + GA4 property ID in config |
| `project-001:verify` | ⏸ Pending | Runs after successful sync |

**Bottom line:** All permissions and APIs are ready. Real data cannot be pulled yet because **Search Console and Google Analytics are not set up** for any site on `orin1607@gmail.com`.

---

## What was completed automatically

### OAuth (16 scopes granted)

- Drive (file + readonly)
- Sheets, Docs, Calendar
- Gmail (send + readonly) — *send blocked by policy until manual approval*
- Apps Script (projects, deployments, scriptapp)
- Search Console (webmasters.readonly)
- Analytics (analytics.readonly)
- Google Business Profile (business.manage) — *read/connect only; no publishing*

### Scripts available

```bash
npm run project-001:auth          # Re-auth if needed
npm run project-001:enable-apis   # Open GCP API enable tabs
npm run project-001:probe         # List GSC sites + GA4 properties
npm run project-001:sync          # Pull data → Google Sheets
npm run project-001:verify        # Full Phase 1 validation
```

### Safety rules (active)

| Allowed | Blocked without your approval |
|---------|-------------------------------|
| Connect APIs, read data | Publish to website |
| Pull data → Sheets | Update Google Business Profile |
| Create test Docs/drafts | Send real emails |

---

## Owner Gate — 3 quick steps to unlock real data

### 1. Add Search Console property

1. Open [Google Search Console](https://search.google.com/search-console)
2. **Add property** → URL prefix:  
   `https://orin1607-ctrl.github.io/future-craft-core/`
3. Verify ownership (HTML tag method — requires adding meta tag to `index.html`; say **"מאשר אימות GSC"** and we'll add it)

*Alternative:* If `dalia-c.com` is already verified on another Google account, OAuth with that account instead.

### 2. Create GA4 property

1. Open [Google Analytics](https://analytics.google.com/)
2. **Admin** → Create property for staging or dalia-c.com
3. Copy Property ID (numeric, e.g. `123456789`)

### 3. Update config + re-run

Edit `integrations/project-001/config.json`:

```json
{
  "gsc_site_url": "https://orin1607-ctrl.github.io/future-craft-core/",
  "ga4_property_id": "properties/123456789"
}
```

Then:

```bash
npm run project-001:probe
npm run project-001:sync
npm run project-001:verify
```

Sheet will be created automatically in **Drive → Dalia FleetOS → Staging**.

---

## After sync works

We **stop** before building the HTML Dashboard — waiting for your approval, as planned.

---

## Files

- Config: `integrations/project-001/config.json`
- Probe report: `docs/audit-reports/project-001/probe.json`
- Scopes catalog: `integrations/project-001/scopes.json`
