-- Staging only. Incoming Gmail review queue. Isolated from Production.
CREATE TABLE IF NOT EXISTS public.claims_gmail_pending (
  id text PRIMARY KEY,
  gmail_message_id text NOT NULL UNIQUE,
  gmail_thread_id text,
  from_addr text,
  subject text,
  snippet text,
  sent_at timestamptz,
  decision text NOT NULL DEFAULT 'needs_review',
  reason text,
  via text,
  candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  assigned_claim_id text REFERENCES public.claims_records(id) ON DELETE SET NULL,
  imported_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_claims_gmail_pending_decision ON public.claims_gmail_pending (decision);
ALTER TABLE public.claims_gmail_pending ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS claims_gmail_pending_all ON public.claims_gmail_pending;
CREATE POLICY claims_gmail_pending_all ON public.claims_gmail_pending
  FOR ALL TO authenticated
  USING (public.has_claims_access(auth.uid()))
  WITH CHECK (public.has_claims_access(auth.uid()));
REVOKE ALL ON TABLE public.claims_gmail_pending FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.claims_gmail_pending TO authenticated;
