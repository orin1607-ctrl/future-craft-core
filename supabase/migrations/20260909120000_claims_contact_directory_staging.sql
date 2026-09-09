-- Staging ONLY (usfeoerkpcafxxlyuldl / dalia-staging). Do not apply to Production.
-- Claims contact directory. No ALTER on existing claims_* tables. No app_role / Auth change.
-- No mass-migration of existing claim row_data contact fields.
-- Rollback: supabase/migrations/20260909120000_claims_contact_directory_staging_rollback.sql

CREATE TABLE IF NOT EXISTS public.claims_contacts (
  id text PRIMARY KEY,
  full_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'other'
    CHECK (role IN ('client','insurer','insurer_dept','agent','surveyor','garage','lawyer','other')),
  company_name text NOT NULL DEFAULT '',
  department text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  row_data jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_claims_contacts_company ON public.claims_contacts (company_name);
CREATE INDEX IF NOT EXISTS idx_claims_contacts_role ON public.claims_contacts (role);
CREATE INDEX IF NOT EXISTS idx_claims_contacts_name ON public.claims_contacts (full_name);

CREATE TABLE IF NOT EXISTS public.claims_contact_channels (
  id text PRIMARY KEY,
  contact_id text NOT NULL REFERENCES public.claims_contacts(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('email','phone','whatsapp')),
  value text NOT NULL,
  value_norm text NOT NULL,
  label text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_claims_contact_channels_contact ON public.claims_contact_channels (contact_id);
CREATE INDEX IF NOT EXISTS idx_claims_contact_channels_norm ON public.claims_contact_channels (value_norm);
CREATE UNIQUE INDEX IF NOT EXISTS idx_claims_contact_channels_kind_norm
  ON public.claims_contact_channels (kind, value_norm)
  WHERE value_norm <> '';

CREATE TABLE IF NOT EXISTS public.claims_claim_contacts (
  claim_id text NOT NULL REFERENCES public.claims_records(id) ON DELETE CASCADE,
  contact_id text NOT NULL REFERENCES public.claims_contacts(id) ON DELETE CASCADE,
  role_on_claim text NOT NULL DEFAULT '',
  is_primary_treatment boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (claim_id, contact_id)
);
CREATE INDEX IF NOT EXISTS idx_claims_claim_contacts_contact ON public.claims_claim_contacts (contact_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_claims_claim_contacts_one_primary
  ON public.claims_claim_contacts (claim_id)
  WHERE is_primary_treatment;

ALTER TABLE public.claims_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claims_contact_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claims_claim_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS claims_contacts_all ON public.claims_contacts;
CREATE POLICY claims_contacts_all ON public.claims_contacts
  FOR ALL TO authenticated
  USING (public.has_claims_access(auth.uid()))
  WITH CHECK (public.has_claims_access(auth.uid()));

DROP POLICY IF EXISTS claims_contact_channels_all ON public.claims_contact_channels;
CREATE POLICY claims_contact_channels_all ON public.claims_contact_channels
  FOR ALL TO authenticated
  USING (public.has_claims_access(auth.uid()))
  WITH CHECK (public.has_claims_access(auth.uid()));

DROP POLICY IF EXISTS claims_claim_contacts_all ON public.claims_claim_contacts;
CREATE POLICY claims_claim_contacts_all ON public.claims_claim_contacts
  FOR ALL TO authenticated
  USING (public.claims_can_work_claim(claim_id))
  WITH CHECK (public.claims_can_work_claim(claim_id));

REVOKE ALL ON TABLE public.claims_contacts FROM PUBLIC;
REVOKE ALL ON TABLE public.claims_contact_channels FROM PUBLIC;
REVOKE ALL ON TABLE public.claims_claim_contacts FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.claims_contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.claims_contact_channels TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.claims_claim_contacts TO authenticated;

NOTIFY pgrst, 'reload schema';
