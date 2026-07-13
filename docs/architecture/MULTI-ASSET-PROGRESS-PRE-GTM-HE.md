# Multi-Asset Brand Site — Progress Report (pre-GTM-publish)
**Date:** 2026-07-13  
**Status:** Owner gate open for GTM Publish only

## Completed now

### Supabase (Staging `usfeoerkpcafxxlyuldl`)
- `customer_id`: `e244b5af-2778-4ca1-93c8-b4fa7c2f144e`
- `website_id` (brand): `e9b2bbf1-1276-4fce-8756-99060a47a44e`
- domain: `dalia-car.online/site`
- Bindings (6): GA4, GTM, GSC, GBP, PageSpeed, Ads
- Proof file: `docs/audit-reports/multi-asset-brand-site/SUPABASE-BRAND-BINDINGS.json`

### nginx → Git
- Live VPS config copied to repo `nginx.conf`
- Paths present: `/site/`, `/orin-marketing/`, `/`, preview 301
- Deploy workflow syncs `public/site/` → `/root/future-craft-core/site-static/` (outside dist wipe)

### PageSpeed LIVE
- Mobile Perf **79** · A11y 90 · BP 100 · SEO 100 · LCP **4.5s**
- Desktop Perf **79** · A11y 83 · BP 100 · SEO 100 · LCP 1.3s · TBT 390ms
- Stored in Supabase `google_pagespeed` binding for brand `website_id`
- Recommendations: compress hero / defer JS; remove dual gtag after GTM publish; cut unused JS (~136KiB)

### AI proof (50 + 10)
- Engine `CocoDaliaAssistantsEngine` runAll: **50 assistants**, **10 consultants**
- Active asset `dalia-brand-site`, mode compare, assets N=3, brand in context for all
- Mock 4th → list length 4
- File: `AI-ENGINE-50-10-PROOF.json`

### Daily report generator
- `scripts/generate-daily-live-dalia.mjs` SITES now includes brand asset (N=3, website_id linked)

## Pending — Owner only
1. **GTM Publish** for `GTM-KH38DZ6J` (see approval request)
2. After publish: remove direct gtag dual-load; GTM Preview; GA4 Realtime via GTM only
3. Google Ads Basic Access (unchanged external blocker)
4. GBP public website URL intentionally unchanged

## Dual load note (until GTM published)
- `/site/` currently has both `GTM-KH38DZ6J` snippet and direct `G-KYDLXY9C39` gtag
- After publish: strip direct gtag so GA4 fires only through GTM
