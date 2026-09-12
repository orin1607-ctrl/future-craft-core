-- ============================================================================
-- Oren Car PUBLIC STAGING ONLY (dalia-staging / usfeoerkpcafxxlyuldl)
-- Production / dalia-car.online / qasomfndnjuixgjmjwcm: FORBIDDEN.
-- DO NOT RUN without owner approval.
--
-- Garage mailbox correspondence, separate from Claims Gmail.
-- Expected mailbox: yoni191177@gmail.com
-- Claims mailbox yoni122222@gmail.com / claims_gmail_* / claims-docs: DO NOT TOUCH.
-- Attachments stay in existing private bucket garage-media (no new bucket).
-- ============================================================================

-- garage_gmail_pending: unmatched / ambiguous inbound mail awaiting worker assign.
CREATE TABLE IF NOT EXISTS public.garage_gmail_pending (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_message_id text NOT NULL,
  gmail_thread_id text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  from_addr text NOT NULL DEFAULT '',
  to_addr text NOT NULL DEFAULT 'yoni191177@gmail.com',
  sent_at timestamptz,
  snippet text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT '',
  candidates uuid[] NOT NULL DEFAULT '{}',
  decision text NOT NULL DEFAULT 'needs_review',
  assigned_case_id uuid REFERENCES public.garage_cases(id) ON DELETE RESTRICT,
  imported_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT garage_gmail_pending_mid_unique UNIQUE (gmail_message_id),
  CONSTRAINT garage_gmail_pending_decision_check CHECK (decision IN ('auto', 'needs_review', 'assigned', 'ignored'))
);

-- garage_gmail_imports: mail cards belonging to a garage case only.
CREATE TABLE IF NOT EXISTS public.garage_gmail_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  garage_case_id uuid NOT NULL REFERENCES public.garage_cases(id) ON DELETE RESTRICT,
  gmail_message_id text NOT NULL,
  gmail_thread_id text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  from_addr text NOT NULL DEFAULT '',
  to_addr text NOT NULL DEFAULT '',
  sent_at timestamptz,
  body_text text NOT NULL DEFAULT '',
  direction text NOT NULL DEFAULT 'incoming',
  file_names text[] NOT NULL DEFAULT '{}',
  staff_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT garage_gmail_imports_mid_unique UNIQUE (gmail_message_id),
  CONSTRAINT garage_gmail_imports_direction_check CHECK (direction IN ('incoming', 'outgoing')),
  CONSTRAINT garage_gmail_imports_not_claims CHECK (garage_case_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS garage_gmail_imports_case_idx
  ON public.garage_gmail_imports (garage_case_id, sent_at);

ALTER TABLE public.garage_gmail_pending ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garage_gmail_pending FORCE ROW LEVEL SECURITY;
ALTER TABLE public.garage_gmail_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garage_gmail_imports FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.garage_gmail_pending FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.garage_gmail_imports FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.garage_gmail_pending TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.garage_gmail_imports TO authenticated;

DROP POLICY IF EXISTS garage_gmail_pending_staff ON public.garage_gmail_pending;
CREATE POLICY garage_gmail_pending_staff
  ON public.garage_gmail_pending FOR ALL TO authenticated
  USING (public.garage_is_staff(auth.uid()))
  WITH CHECK (public.garage_is_staff(auth.uid()));

DROP POLICY IF EXISTS garage_gmail_imports_staff ON public.garage_gmail_imports;
CREATE POLICY garage_gmail_imports_staff
  ON public.garage_gmail_imports FOR ALL TO authenticated
  USING (public.garage_is_staff(auth.uid()))
  WITH CHECK (public.garage_is_staff(auth.uid()));

COMMENT ON TABLE public.garage_gmail_pending IS
  'Unmatched inbound garage mailbox mail. Staging only. Not claims_gmail_pending.';
COMMENT ON TABLE public.garage_gmail_imports IS
  'Garage-case mail cards. garage_case_id only. Never claim_id. Staging only.';
