-- Staging ONLY (usfeoerkpcafxxlyuldl). Claims Gmail OAuth + import. No live send.
-- Do not apply to Production. Tokens are not granted to authenticated.

INSERT INTO public.claims_config (key, value, updated_at) VALUES
  ('GMAIL_SEND_ENABLED', 'false', now()),
  ('GMAIL_ALLOWED_ACCOUNT', 'yoni122222@gmail.com', now()),
  ('MAIL_DISPATCH_MODE', 'dry_run', now())
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = now();

ALTER TABLE public.claims_records
  ADD COLUMN IF NOT EXISTS gmail_message_id text,
  ADD COLUMN IF NOT EXISTS gmail_thread_id text;

ALTER TABLE public.claims_documents DROP CONSTRAINT IF EXISTS claims_documents_source_chk;
ALTER TABLE public.claims_documents
  ADD CONSTRAINT claims_documents_source_chk
  CHECK (source = ANY (ARRAY['customer','staff','gmail']));

ALTER TABLE public.claims_documents
  ADD COLUMN IF NOT EXISTS gmail_message_id text,
  ADD COLUMN IF NOT EXISTS gmail_thread_id text,
  ADD COLUMN IF NOT EXISTS gmail_attachment_id text;

CREATE INDEX IF NOT EXISTS idx_claims_documents_gmail_msg
  ON public.claims_documents (claim_id, gmail_message_id);

CREATE TABLE IF NOT EXISTS public.claims_gmail_connection (
  id text PRIMARY KEY,
  connected_email text NOT NULL,
  refresh_token text NOT NULL,
  scopes text NOT NULL DEFAULT '',
  google_sub text,
  connected_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  last_ok_at timestamptz
);

ALTER TABLE public.claims_gmail_connection ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.claims_gmail_connection FROM PUBLIC;
REVOKE ALL ON TABLE public.claims_gmail_connection FROM anon;
REVOKE ALL ON TABLE public.claims_gmail_connection FROM authenticated;
-- service_role / postgres only. No token to the frontend.

CREATE TABLE IF NOT EXISTS public.claims_gmail_imports (
  id text PRIMARY KEY,
  claim_id text NOT NULL REFERENCES public.claims_records(id) ON DELETE CASCADE,
  gmail_message_id text NOT NULL,
  gmail_thread_id text,
  from_addr text,
  subject text,
  snippet text,
  body_text text,
  sent_at timestamptz,
  attachment_count integer NOT NULL DEFAULT 0,
  imported_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  imported_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT claims_gmail_imports_uniq UNIQUE (claim_id, gmail_message_id)
);
CREATE INDEX IF NOT EXISTS idx_claims_gmail_imports_claim ON public.claims_gmail_imports (claim_id);

ALTER TABLE public.claims_gmail_imports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS claims_gmail_imports_all ON public.claims_gmail_imports;
CREATE POLICY claims_gmail_imports_all ON public.claims_gmail_imports
  FOR ALL TO authenticated
  USING (public.claims_can_work_claim(claim_id))
  WITH CHECK (public.claims_can_work_claim(claim_id));

REVOKE ALL ON TABLE public.claims_gmail_imports FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.claims_gmail_imports TO authenticated;
