# Global Filter Context — Phase B (Unified Filter Bar)

**Date:** 2026-06-28  
**Environment:** Staging (`future-craft-core` GitHub Pages)  
**Cache bust:** `?v=v3-global-filter-b`

## Purpose

Deliver a single, compact cascade filter bar across all marketing screens — without breaking live Goals (28 pages) or Actions Workbench (395 actions).

## Cascade order (SSOT)

1. לקוח (`clientId`)
2. סוג פעילות (`activityType`)
3. קמפיין (`campaignId`)
4. נכס דיגיטלי (`assetId`)
5. תת-קטגוריה (`subCategory`)
6. **פריט ספציפי** (`specificItem`) — page, ad, keyword, GBP post, IG reel, etc.
7. תאריך (`dateRange`)
8. סטטוס (`status`)
9. חיפוש (`freeSearch`)

Parent change resets all downstream steps (except date/status/search when `skipCascade`).

## UI layout

| Zone | Controls | Visibility |
|------|----------|------------|
| Summary row | `#coco-unified-filter-chip` | Always (compact breadcrumb) |
| Primary | client, activity, campaign, asset + "עוד" | Desktop always; mobile when bar expanded |
| Advanced | subCategory, specificItem, date, status, search | Toggle via `#gfc-advanced-toggle` |

Mount point: `#coco-cfc-filters` inside `#coco-unified-context-bar` (same position on every screen).

## New modules (Phase B)

| Module | Role |
|--------|------|
| `global-filter-bar.js` | Cascade UI; writes only via `GlobalFilterContext.set()` |
| `filter-meta.js` | Normalized field extractors for all binders |

## Context v3 fields (extended)

```javascript
specificItem: { type, id, label, path }  // concrete entity within asset
```

## Integration

| File | Change |
|------|--------|
| `ai-marketing-platform.html` | Load `filter-meta.js`, `global-filter-bar.js`; cache `v3-global-filter-b` |
| `coco-marketing-unified.js` | Mount GFC bar; `GlobalFilterBar.place()` on navigation |
| `coco-claude-data.js` | Binders use `FilterMeta.page/action/...` |
| `filter-engine.js` | `specificItemMatches`, `hasUserScope` for live mode |
| `filter-entity-index.js` | `getSpecificItems()` paginated |
| `filter-taxonomy.js` | `CASCADE_STEPS`, `PAGE_KINDS`, sub-schemas per channel |

## Auto-registration for new screens

1. Add screen id to `FilterScreenRegistry.registerDefaults()` (or call `register()` from screen init).
2. Ensure `#coco-unified-context-bar` is placed via `CocoUnified.placeContextBar(screenId)`.
3. Binder uses `applyCtxFilter(items, FilterMeta.xxx)` — no custom filter UI needed.

## Scalability notes

- Entity index JSON is paginated (`getSpecificItems` limit 100; overflow hint → use search).
- Index rebuild: `npm run project-001:sync-marketing-index`
- Future: async typeahead for specificItem (Phase C), multi-client from Supabase.

## Verify

```bash
npm run ai-marketing:serve   # terminal 1
npm run project-001:verify-global-filter-b   # terminal 2
```

Report: `docs/audit-reports/global-filter-context-phase-b/report.json`

## Not changed

- 10 Hub buttons layout
- Production / dalia-c.com writes
- Actions approval (localStorage only)
