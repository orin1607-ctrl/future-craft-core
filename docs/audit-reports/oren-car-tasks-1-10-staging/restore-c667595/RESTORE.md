# Restore Point — Oren Car tasks 1–10

**Created:** 2026-08-13 16:42 (Asia/Jerusalem)  
**Branch:** `feat/incident-alerts-staging`  
**HEAD:** `c667595cc4799fc65d92c84fdcfa5fa992432d62` (`c667595` — DriverHub navy tiles)

## What this covers

- Full `src/` + `supabase/migrations` tree at HEAD (`src-tree-HEAD-c667595.zip`)
- Copies of key files under `src-files/`
- Git status / log snapshots in this folder

## Restore code (work area only)

```bash
git checkout c667595cc4799fc65d92c84fdcfa5fa992432d62 -- src supabase/migrations
```

Or unzip `src-tree-HEAD-c667595.zip` over the repo.

## Restore schema (Staging DB only — usfeoerkpcafxxlyuldl)

If the additive columns were applied:

```sql
ALTER TABLE public.vehicle_inspections DROP COLUMN IF EXISTS next_due_date;
ALTER TABLE public.vehicles DROP COLUMN IF EXISTS show_notes_on_list;
ALTER TABLE public.drivers DROP COLUMN IF EXISTS show_notes_on_list;
```

Do **not** run this against Production.

## Safety

- No Production deploy
- No Hostinger
- No Production Supabase
- No Google Apps Script
