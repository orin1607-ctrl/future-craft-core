# Global Filter Context — Phase A (Infrastructure)

**Date:** 2026-06-28  
**Environment:** Staging only (`future-craft-core` GitHub Pages)  
**Status:** Phase A complete — no UI changes

## Purpose

Introduce a scalable, single-source-of-truth (SSOT) filter infrastructure that supports unlimited clients, campaigns, assets, and pages — without changing existing UI or the 10 Hub buttons.

## Architecture (4 layers)

| Layer | Module | Role |
|-------|--------|------|
| Taxonomy | `filter-taxonomy.js` | Activity types, asset types, sub-category schemas |
| Index | `filter-entity-index.js` + `public/marketing-index/*.json` | Lazy entity lookup, pagination-ready |
| Engine | `filter-engine.js` | Single `filter()` / `matches()` for all screens |
| Context SSOT | `global-filter-context.js` | v3 state, persist, cascade invalidation, legacy sync |
| Registry | `filter-screen-registry.js` | Auto-hook screens to filter refresh |

## Context storage

- **Primary:** `localStorage` key `coco-global-filter-v3`
- **Legacy sync:** `coco-flow-context-v2` (backward compatible with `COCO.flowContext`)
- **Migration:** automatic from v2 on first load

## Cascade invalidation

Changing a parent step resets children:

`clientId → activityType → campaignId → assetId → subCategory`

## Entity index files

Built by `npm run project-001:sync-marketing-index`:

- `clients-index.json`
- `campaigns-by-client.json`
- `assets-by-campaign.json`
- `pages-by-asset.json`
- `index-meta.json`

## Integration points (Phase A)

| File | Change |
|------|--------|
| `ai-marketing-platform.html` | Load GFC scripts before `client-id-ssot.js` |
| `client-id-ssot.js` | Registers client/campaign/asset + `GlobalFilterContext.set()` |
| `asset-flow-ssot.js` | Syncs active asset to GFC |
| `coco-claude-bridge.js` | `loadContext`/`saveContext` delegate to GFC |
| `coco-claude-data.js` | `applyCtxFilter` → `FilterEngine.filter()` |
| `coco-marketing-unified.js` | Context bar writes sync to GFC |

## Not changed (Phase A)

- UI / CSS / 10 Hub buttons
- `coco-claude-screens.html` layout
- Production / dalia-c.com writes
- Full 8-step filter bar UI (Phase C)

## Verify

```bash
npm run project-001:sync-marketing-index
node scripts/verify-global-filter-context-phase-a.mjs
```

## Next steps (Phase B/C)

1. **Phase B:** Enrich binders with full context scoping (pageId, dateRange, status)
2. **Phase C:** Extend `#coco-unified-context-bar` to 8 cascading controls (same visual style)
3. **Phase D:** Supabase-backed index + multi-client registry
4. Absorb remaining logic from `prd-filter.js` into taxonomy/index

## Risks

| Risk | Mitigation |
|------|------------|
| Double refresh on filter change | Harmless in Phase A; add `silent` option in Phase B |
| Large page sets | `getPages(assetId, { offset, limit })` pagination ready |
| Legacy direct `flowContext` writes | GFC syncs on save; full migration in Phase B |
