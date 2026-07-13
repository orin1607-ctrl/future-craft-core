# Multi-Asset Brand Site — Delivery Report
**Date:** 2026-07-13  
**Scope:** Waves A–E (partial Supabase DB write / GTM publish / PSI quota)

## Permanent brand site
- **URL:** https://dalia-car.online/site/
- **Files on server:** `/root/future-craft-core/site-static/` (outside SPA `dist/assets` wipe)
- **nginx:** `location ^~ /site/` → alias to site-static; `location = /site` → 301 `/site/`
- **301:** `/orin-marketing/client-previews/dalia-c-official/` → `/site/` (verified)
- **Query preserve:** `/orin-marketing/?asset=…` → pirsum-home with `$is_args$args` (fixed)

## Google IDs (brand asset)
| Service | Value | Status |
|---------|--------|--------|
| GA4 Property | `properties/545281140` | LIVE |
| Measurement ID | `G-KYDLXY9C39` | LIVE (gtag embedded) |
| GTM Container | `GTM-KH38DZ6J` (account 6239197284) | Created + GA4 tag; **Publish Pending** (needs `tagmanager.publish` re-consent) |
| GSC | URL-prefix `https://dalia-car.online/site/` | Added + sitemap submitted |
| GBP | Read in-system | **Website URL in profile NOT changed** |
| Ads | Binding pending | Pending Google Basic Access |
| PageSpeed | API | **Quota exceeded** (public PSI quota) — retry later |

## Assets in פרסום (N=3 + mock 4th)
1. dalia-c.com — האתר הישן  
2. אפליקציית דליה  
3. אתר התדמית החדש  
4. Mock regression via `AssetRegistry.enableMockFourthAsset(true)` → count 4 ✅

## Modes
- Single / Compare / Portfolio UI controls + `AssetRegistry.aiContext()`  
- E2E: 3 labels, mode bar, compare rows, AI ctx n=3, mock→4

## My Site links (after fix)
- Brand → `https://dalia-car.online/site/`  
- App → `https://dalia-car.online/`  
- Old → `https://dalia-c.com/`  

## AI
- `coco-dalia-assistants-engine.js` now injects `multiAsset` / `assets[]` from AssetRegistry  
- 50 assistants + 10 consultants receive N-asset context (not hardcoded 2)

## Pending / Owner actions
1. **GTM Publish** — open https://tagmanager.google.com/#/container/accounts/6239197284/containers/258130829 and Publish (or re-auth with `tagmanager.publish`)  
2. **PageSpeed** — retry when quota resets  
3. **Supabase website_id row** — publishable key only locally; needs service-role / Owner Edge write  
4. **Google Ads** — still Basic Access Pending (unchanged)  
5. **GBP public website URL** — intentionally unchanged  

## Existing assets
- dalia-c.com and app GA4/GTM/GSC IDs **unchanged**

## Key files changed
- `public/ai-marketing/asset-registry-ssot.js` (new)
- `public/ai-marketing/asset-flow-ssot.js`
- `public/ai-marketing/marketing-ssot.js`
- `public/ai-marketing/dalia-site-config.js`
- `public/ai-marketing/coco-dalia-assistants-engine.js`
- `public/orin-marketing/coco-dalia-assets.js`
- `public/project-001/dashboard.json`
- `public/site/**` (brand static)
- nginx on VPS
- scripts: provision-brand-site-google.mjs, smoke-multi-asset-e2e.cjs
- docs: ARCHITECTURE + PLAN + this report
