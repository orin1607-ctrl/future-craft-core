# Project 001 — Phase 1 Status

**Updated:** 2026-06-18 (home computer)  
**Account:** orin1607@gmail.com

## Pre-flight (completed)

| Check | Status |
|-------|--------|
| `npm run verify` (Google infra) | ✅ 7/7 APIs OK |
| Drive folders (Staging) | ✅ `1E4_8MUSZkJOFq7Adcnh8Auaqyxo_ZccT` |
| OAuth token (base scopes) | ✅ present |
| clasp | ⏭ not required for Phase 1 (Node pull scripts) |

## Phase 1 pipeline (built)

| Command | Purpose |
|---------|---------|
| `npm run project-001:auth` | OAuth with GSC + GA4 scopes (Owner Gate) |
| `npm run project-001:probe` | List GSC sites + GA4 properties |
| `npm run project-001:sync` | Pull data → Google Sheets |
| `npm run project-001:verify` | Full Phase 1 (double sync) |

Config: `integrations/project-001/config.json` (gitignored)

## Owner Gate — action required

Current token lacks Search Console + Analytics scopes. Before sync:

### 1. Enable APIs (GCP project `840269841580`)

- [Search Console API](https://console.cloud.google.com/apis/library/searchconsole.googleapis.com?project=840269841580)
- [Google Analytics Data API](https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com?project=840269841580)
- [Google Analytics Admin API](https://console.cloud.google.com/apis/library/analyticsadmin.googleapis.com?project=840269841580)

### 2. OAuth consent screen — add scopes

In [OAuth consent](https://console.cloud.google.com/apis/credentials/consent?project=840269841580), add:

- `.../auth/webmasters.readonly` (Search Console)
- `.../auth/analytics.readonly` (Analytics)

### 3. Re-authorize on this computer

```bash
npm run project-001:auth
```

Approve in browser when prompted.

### 4. Discover properties

```bash
npm run project-001:probe
```

Update `integrations/project-001/config.json`:

- `gsc_site_url` — must match a site from probe (default: staging GitHub Pages URL)
- `ga4_property_id` — e.g. `properties/123456789`

### 5. First sync

```bash
npm run project-001:sync
```

Sheet is created in Drive → Dalia FleetOS → Staging.

---

**After sync works:** stop for dashboard approval (HTML/Web App) before AI/content steps.
