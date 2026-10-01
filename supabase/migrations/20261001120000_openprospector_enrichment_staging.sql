-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- OpenProspector: lead enrichment, verification and qualification fields.
-- Additive only (nullable columns / safe defaults). No existing column or row is modified.
-- Existing columns are reused instead of duplicated:
--   phone -> phone_primary, email -> email_general, industry -> activity_type,
--   website, address, city, evidence stay as-is.
-- Backup taken before this migration: public.prospect_leads_backup_20261001_pre_enrichment

ALTER TABLE public.prospect_leads
  -- company
  ADD COLUMN IF NOT EXISTS company_active_status text,
  -- contact channels
  ADD COLUMN IF NOT EXISTS phone_secondary text,
  ADD COLUMN IF NOT EXISTS email_direct text,
  ADD COLUMN IF NOT EXISTS contact_form_url text,
  ADD COLUMN IF NOT EXISTS public_whatsapp text,
  ADD COLUMN IF NOT EXISTS linkedin_company text,
  -- contact person
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS contact_role text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_linkedin text,
  -- fleet (fleet_size is NULL unless proven; never estimated)
  ADD COLUMN IF NOT EXISTS fleet_exists boolean,
  ADD COLUMN IF NOT EXISTS fleet_size integer,
  ADD COLUMN IF NOT EXISTS fleet_size_status text,
  ADD COLUMN IF NOT EXISTS fleet_types text[],
  ADD COLUMN IF NOT EXISTS fleet_evidence jsonb,
  -- fleet manager / safety officer (OVDIM is never a safety officer)
  ADD COLUMN IF NOT EXISTS fleet_manager_name text,
  ADD COLUMN IF NOT EXISTS fleet_manager_source text,
  ADD COLUMN IF NOT EXISTS safety_officer_name text,
  ADD COLUMN IF NOT EXISTS safety_officer_source text,
  ADD COLUMN IF NOT EXISTS safety_officer_verified boolean NOT NULL DEFAULT false,
  -- verification
  ADD COLUMN IF NOT EXISTS verification_status text,
  ADD COLUMN IF NOT EXISTS verification_date date,
  ADD COLUMN IF NOT EXISTS missing_fields text[],
  ADD COLUMN IF NOT EXISTS source_list text[],
  ADD COLUMN IF NOT EXISTS field_status jsonb,
  ADD COLUMN IF NOT EXISTS registry_check jsonb,
  ADD COLUMN IF NOT EXISTS tier text,
  -- qualification
  ADD COLUMN IF NOT EXISTS lead_stage text,
  ADD COLUMN IF NOT EXISTS lead_quality text,
  ADD COLUMN IF NOT EXISTS ready_for_contact boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rejected_reason text,
  -- CRM / follow-up handoff: request only, never executed automatically
  ADD COLUMN IF NOT EXISTS crm_handoff_status text,
  ADD COLUMN IF NOT EXISTS crm_handoff_requested_at timestamptz,
  -- paid enrichment placeholders (Apollo / Lusha not connected)
  ADD COLUMN IF NOT EXISTS enrichment_source text,
  ADD COLUMN IF NOT EXISTS enrichment_status text,
  ADD COLUMN IF NOT EXISTS enrichment_cost numeric(10,2),
  ADD COLUMN IF NOT EXISTS enrichment_requested boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  ALTER TABLE public.prospect_leads ADD CONSTRAINT prospect_leads_lead_stage_check
    CHECK (lead_stage IS NULL OR lead_stage IN ('basic','review','verified','qualified','quality','ready','rejected'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.prospect_leads ADD CONSTRAINT prospect_leads_fleet_size_status_check
    CHECK (fleet_size_status IS NULL OR fleet_size_status IN ('verified','exists_size_unknown','indication_needs_verification','unknown'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.prospect_leads ADD CONSTRAINT prospect_leads_crm_handoff_status_check
    CHECK (crm_handoff_status IS NULL OR crm_handoff_status IN ('pending_approval','approved','sent','cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- "Ready for contact" can never be set without a phone
DO $$ BEGIN
  ALTER TABLE public.prospect_leads ADD CONSTRAINT prospect_leads_ready_requires_phone_check
    CHECK (NOT ready_for_contact OR (coalesce(btrim(phone),'') NOT IN ('', 'לא נמצא')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_prospect_leads_stage ON public.prospect_leads (lead_stage);
CREATE INDEX IF NOT EXISTS idx_prospect_leads_ready ON public.prospect_leads (ready_for_contact) WHERE ready_for_contact;
