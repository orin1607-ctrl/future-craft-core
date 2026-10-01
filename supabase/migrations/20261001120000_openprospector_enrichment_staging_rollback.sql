-- Staging ONLY rollback for 20261001120000_openprospector_enrichment_staging.sql
-- Drops only the columns/constraints added by that migration. Original data is untouched.
ALTER TABLE public.prospect_leads
  DROP CONSTRAINT IF EXISTS prospect_leads_lead_stage_check,
  DROP CONSTRAINT IF EXISTS prospect_leads_fleet_size_status_check,
  DROP CONSTRAINT IF EXISTS prospect_leads_crm_handoff_status_check,
  DROP CONSTRAINT IF EXISTS prospect_leads_ready_requires_phone_check;
DROP INDEX IF EXISTS public.idx_prospect_leads_stage;
DROP INDEX IF EXISTS public.idx_prospect_leads_ready;
ALTER TABLE public.prospect_leads
  DROP COLUMN IF EXISTS company_active_status, DROP COLUMN IF EXISTS phone_secondary, DROP COLUMN IF EXISTS email_direct,
  DROP COLUMN IF EXISTS contact_form_url, DROP COLUMN IF EXISTS public_whatsapp, DROP COLUMN IF EXISTS linkedin_company,
  DROP COLUMN IF EXISTS contact_name, DROP COLUMN IF EXISTS contact_role, DROP COLUMN IF EXISTS contact_phone,
  DROP COLUMN IF EXISTS contact_email, DROP COLUMN IF EXISTS contact_linkedin, DROP COLUMN IF EXISTS fleet_exists,
  DROP COLUMN IF EXISTS fleet_size, DROP COLUMN IF EXISTS fleet_size_status, DROP COLUMN IF EXISTS fleet_types,
  DROP COLUMN IF EXISTS fleet_evidence, DROP COLUMN IF EXISTS fleet_manager_name, DROP COLUMN IF EXISTS fleet_manager_source,
  DROP COLUMN IF EXISTS safety_officer_name, DROP COLUMN IF EXISTS safety_officer_source, DROP COLUMN IF EXISTS safety_officer_verified,
  DROP COLUMN IF EXISTS verification_status, DROP COLUMN IF EXISTS verification_date, DROP COLUMN IF EXISTS missing_fields,
  DROP COLUMN IF EXISTS source_list, DROP COLUMN IF EXISTS field_status, DROP COLUMN IF EXISTS registry_check, DROP COLUMN IF EXISTS tier,
  DROP COLUMN IF EXISTS lead_stage, DROP COLUMN IF EXISTS lead_quality, DROP COLUMN IF EXISTS ready_for_contact,
  DROP COLUMN IF EXISTS rejected_reason, DROP COLUMN IF EXISTS crm_handoff_status, DROP COLUMN IF EXISTS crm_handoff_requested_at,
  DROP COLUMN IF EXISTS enrichment_source, DROP COLUMN IF EXISTS enrichment_status, DROP COLUMN IF EXISTS enrichment_cost,
  DROP COLUMN IF EXISTS enrichment_requested;
