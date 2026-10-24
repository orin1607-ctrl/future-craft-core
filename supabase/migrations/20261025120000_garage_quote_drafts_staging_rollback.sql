-- Rollback for 20261025120000_garage_quote_drafts_staging.sql
-- Status: rollback for the STAGING table above (not run). Removes only that table.
-- Removes only the table this migration added (its policies and indexes go with it).

DROP TABLE IF EXISTS public.garage_quote_drafts;
