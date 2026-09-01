-- Staging ONLY (usfeoerkpcafxxlyuldl). Customer accident intake links.
-- Does not alter vehicles, accidents, telemarketing, users, app_role, Gmail, or existing 16 claims.
-- Token is stored as SHA-256 only. Anon/authenticated have no GRANT.

CREATE TABLE IF NOT EXISTS public.claims_intake_links (
  id text PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status = ANY (ARRAY['pending','submitting','submitted','revoked'])),
  draft jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text UNIQUE,
  expires_at timestamptz NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  claim_id text REFERENCES public.claims_records(id) ON DELETE SET NULL,
  duplicate_suspect boolean NOT NULL DEFAULT false,
  signature_path text
);

CREATE INDEX IF NOT EXISTS idx_claims_intake_status ON public.claims_intake_links (status);
CREATE INDEX IF NOT EXISTS idx_claims_intake_expires ON public.claims_intake_links (expires_at);
CREATE INDEX IF NOT EXISTS idx_claims_intake_claim ON public.claims_intake_links (claim_id);

CREATE TABLE IF NOT EXISTS public.claims_intake_rate (
  key_hash text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  hits int NOT NULL DEFAULT 0
);

ALTER TABLE public.claims_intake_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claims_intake_rate ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.claims_intake_links FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.claims_intake_rate FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claims_next_dal_id()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  UPDATE public.claims_config
    SET value = (COALESCE(NULLIF(value, '')::int, 0) + 1)::text,
        updated_at = now()
    WHERE key = 'CLAIM_COUNTER'
    RETURNING value::int INTO n;
  IF n IS NULL THEN
    INSERT INTO public.claims_config (key, value, updated_at)
    VALUES ('CLAIM_COUNTER', '1', now())
    ON CONFLICT (key) DO UPDATE
      SET value = (COALESCE(NULLIF(public.claims_config.value, '')::int, 0) + 1)::text,
          updated_at = now()
    RETURNING value::int INTO n;
  END IF;
  RETURN 'DAL-' || to_char(now() AT TIME ZONE 'Asia/Jerusalem', 'YYYY') || '-' || lpad(n::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.claims_next_dal_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claims_next_dal_id() TO service_role;
