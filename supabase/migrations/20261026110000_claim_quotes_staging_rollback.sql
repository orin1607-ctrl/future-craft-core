-- Rollback for 20261026110000_claim_quotes_staging.sql (STAGING ONLY).
-- Drops only the tables that migration created. Export their rows first if any quotes were saved.
drop table if exists public.claim_quote_versions;
drop table if exists public.claim_quotes;
drop table if exists public.claim_quote_library;
drop table if exists public.claim_paint_calcs;
