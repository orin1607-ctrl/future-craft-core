-- Rollback for 20261025120000_garage_quote_drafts_staging.sql
-- Status: PREPARED FOR USER REVIEW (DO NOT APPLY WITHOUT EXPLICIT APPROVAL)
-- Removes only the table this migration added (its policies and indexes go with it).

DROP TABLE IF EXISTS public.garage_quote_drafts;
