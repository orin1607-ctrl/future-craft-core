-- Staging ONLY: usfeoerkpcafxxlyuldl. Claims AI operations audit log.
-- Full audit trail for all AI read/write/preview operations in claims module.

CREATE TABLE IF NOT EXISTS public.claims_ai_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_name text NOT NULL DEFAULT '',
  claim_id text REFERENCES public.claims_records(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.claims_ai_conversations(id) ON DELETE SET NULL,
  tool_name text NOT NULL,
  action_type text NOT NULL,
  user_prompt text NOT NULL DEFAULT '',
  intent text NOT NULL DEFAULT '',
  preview_summary text,
  preview_payload jsonb,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by_name text,
  execution_action text,
  state_before jsonb,
  state_after jsonb,
  status text NOT NULL DEFAULT 'success',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_claims_ai_audit_claim ON public.claims_ai_audit_log (claim_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_claims_ai_audit_user ON public.claims_ai_audit_log (user_id, created_at DESC);

ALTER TABLE public.claims_ai_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS claims_ai_audit_select ON public.claims_ai_audit_log;
CREATE POLICY claims_ai_audit_select ON public.claims_ai_audit_log
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    AND public.has_claims_access(auth.uid())
    AND (claim_id IS NULL OR public.claims_can_work_claim(claim_id))
  );

DROP POLICY IF EXISTS claims_ai_audit_insert ON public.claims_ai_audit_log;
CREATE POLICY claims_ai_audit_insert ON public.claims_ai_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.has_claims_access(auth.uid())
    AND (claim_id IS NULL OR public.claims_can_work_claim(claim_id))
  );

GRANT SELECT, INSERT ON TABLE public.claims_ai_audit_log TO authenticated;
