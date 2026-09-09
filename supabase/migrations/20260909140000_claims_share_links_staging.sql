-- Staging ONLY (usfeoerkpcafxxlyuldl / dalia-staging). Do not apply to Production.
-- Outbound secure share of existing claims-docs files. No new bucket. No raw token column.
-- Rollback: supabase/migrations/20260909140000_claims_share_links_staging_rollback.sql

CREATE TABLE IF NOT EXISTS public.claims_share_links (
  id text PRIMARY KEY,
  claim_id text NOT NULL REFERENCES public.claims_records(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  recipient_name text NOT NULL,
  recipient_kind text NOT NULL
    CHECK (recipient_kind = ANY (ARRAY['surveyor','lawyer','insurer','agent','client','other'])),
  recipient_kind_note text NOT NULL DEFAULT '',
  recipient_email text NOT NULL DEFAULT '',
  recipient_phone text NOT NULL DEFAULT '',
  file_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  opened_at timestamptz,
  last_download_at timestamptz,
  open_count integer NOT NULL DEFAULT 0,
  CONSTRAINT claims_share_links_files_arr CHECK (jsonb_typeof(file_ids) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_claims_share_links_claim ON public.claims_share_links (claim_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_claims_share_links_hash ON public.claims_share_links (token_hash);

ALTER TABLE public.claims_share_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS claims_share_links_all ON public.claims_share_links;
CREATE POLICY claims_share_links_all ON public.claims_share_links
  FOR ALL TO authenticated
  USING (public.claims_can_work_claim(claim_id))
  WITH CHECK (public.claims_can_work_claim(claim_id));

REVOKE ALL ON TABLE public.claims_share_links FROM PUBLIC;
REVOKE ALL ON TABLE public.claims_share_links FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.claims_share_links TO authenticated;

COMMENT ON TABLE public.claims_share_links IS 'Outbound read-only share. token_hash only — never store raw token. Staging only.';
