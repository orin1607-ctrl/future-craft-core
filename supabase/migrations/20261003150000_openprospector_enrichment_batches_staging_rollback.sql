-- Staging ONLY rollback for 20261003150000_openprospector_enrichment_batches_staging.sql
-- Drops only the enrichment queue/audit tables. public.prospect_leads is untouched.
DROP TRIGGER IF EXISTS trg_prospect_enrichment_items_cap ON public.prospect_enrichment_items;
DROP FUNCTION IF EXISTS public.prospect_enrichment_items_cap();
DROP TABLE IF EXISTS public.prospect_enrichment_audit;
DROP TABLE IF EXISTS public.prospect_enrichment_items;
DROP TABLE IF EXISTS public.prospect_enrichment_batches;
