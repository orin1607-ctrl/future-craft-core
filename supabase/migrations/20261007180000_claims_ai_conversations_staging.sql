-- Staging ONLY (usfeoerkpcafxxlyuldl). Do not apply to Production.
-- Claims AI chat history. No change to Gemini keys, Gmail tokens, or existing claims tables.
-- Rollback: supabase/migrations/20261007180000_claims_ai_conversations_staging_rollback.sql

CREATE TABLE IF NOT EXISTS public.claims_ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  claim_id text REFERENCES public.claims_records(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'שיחה חדשה',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS claims_ai_conversations_user_claim_updated
  ON public.claims_ai_conversations (user_id, claim_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.claims_ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.claims_ai_conversations(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  tool_name text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT claims_ai_messages_role_chk CHECK (role = ANY (ARRAY['user','assistant','system','tool']))
);

CREATE INDEX IF NOT EXISTS claims_ai_messages_conv_created
  ON public.claims_ai_messages (conversation_id, created_at);

CREATE OR REPLACE FUNCTION public.claims_ai_touch_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.claims_ai_conversations
  SET updated_at = now()
  WHERE id = NEW.conversation_id
    AND user_id = auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_claims_ai_touch_conversation ON public.claims_ai_messages;
CREATE TRIGGER trg_claims_ai_touch_conversation
  AFTER INSERT ON public.claims_ai_messages
  FOR EACH ROW EXECUTE FUNCTION public.claims_ai_touch_conversation();

ALTER TABLE public.claims_ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claims_ai_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS claims_ai_conversations_select ON public.claims_ai_conversations;
CREATE POLICY claims_ai_conversations_select ON public.claims_ai_conversations
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    AND public.has_claims_access(auth.uid())
    AND (claim_id IS NULL OR public.claims_can_work_claim(claim_id))
  );

DROP POLICY IF EXISTS claims_ai_conversations_insert ON public.claims_ai_conversations;
CREATE POLICY claims_ai_conversations_insert ON public.claims_ai_conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.has_claims_access(auth.uid())
    AND (claim_id IS NULL OR public.claims_can_work_claim(claim_id))
  );

DROP POLICY IF EXISTS claims_ai_conversations_update ON public.claims_ai_conversations;
CREATE POLICY claims_ai_conversations_update ON public.claims_ai_conversations
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.has_claims_access(auth.uid())
    AND (claim_id IS NULL OR public.claims_can_work_claim(claim_id))
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.has_claims_access(auth.uid())
    AND (claim_id IS NULL OR public.claims_can_work_claim(claim_id))
  );

DROP POLICY IF EXISTS claims_ai_messages_select ON public.claims_ai_messages;
CREATE POLICY claims_ai_messages_select ON public.claims_ai_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.claims_ai_conversations c
      WHERE c.id = conversation_id
        AND c.user_id = auth.uid()
        AND public.has_claims_access(auth.uid())
        AND (c.claim_id IS NULL OR public.claims_can_work_claim(c.claim_id))
    )
  );

DROP POLICY IF EXISTS claims_ai_messages_insert ON public.claims_ai_messages;
CREATE POLICY claims_ai_messages_insert ON public.claims_ai_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.claims_ai_conversations c
      WHERE c.id = conversation_id
        AND c.user_id = auth.uid()
        AND public.has_claims_access(auth.uid())
        AND (c.claim_id IS NULL OR public.claims_can_work_claim(c.claim_id))
    )
  );

REVOKE ALL ON TABLE public.claims_ai_conversations FROM PUBLIC;
REVOKE ALL ON TABLE public.claims_ai_conversations FROM anon;
REVOKE ALL ON TABLE public.claims_ai_messages FROM PUBLIC;
REVOKE ALL ON TABLE public.claims_ai_messages FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.claims_ai_conversations TO authenticated;
GRANT SELECT, INSERT ON TABLE public.claims_ai_messages TO authenticated;
GRANT EXECUTE ON FUNCTION public.claims_ai_touch_conversation() TO authenticated;
