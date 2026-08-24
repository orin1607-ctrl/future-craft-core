-- Staging ONLY (usfeoerkpcafxxlyuldl). Do not apply to Production.
-- Dalia team care chats. No DELETE. Purple is not a lead traffic-light.
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_telemarketing_team_chats_guard ON public.telemarketing_team_chats;
--   DROP TRIGGER IF EXISTS trg_telemarketing_team_messages_guard ON public.telemarketing_team_messages;
--   DROP FUNCTION IF EXISTS public.telemarketing_team_chat_guard();
--   DROP FUNCTION IF EXISTS public.telemarketing_team_message_guard();
--   DROP TABLE IF EXISTS public.telemarketing_team_chat_reads;
--   DROP TABLE IF EXISTS public.telemarketing_team_messages;
--   DROP TABLE IF EXISTS public.telemarketing_team_chats;

CREATE TABLE IF NOT EXISTS public.telemarketing_team_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  agent_name text NOT NULL,
  company_name text NOT NULL DEFAULT '',
  contact_name text,
  phone text NOT NULL DEFAULT '',
  email text,
  lead_key text,
  call_id uuid REFERENCES public.telemarketing_calls(id) ON DELETE SET NULL,
  followup_id uuid REFERENCES public.telemarketing_followups(id) ON DELETE SET NULL,
  work_session_id uuid REFERENCES public.telemarketing_work_sessions(id) ON DELETE SET NULL,
  care_type text NOT NULL,
  care_type_other text,
  request_detail text NOT NULL DEFAULT '',
  urgency text NOT NULL DEFAULT 'רגיל' CHECK (urgency IN ('רגיל', 'חשוב', 'דחוף')),
  due_at timestamptz,
  last_call_summary text,
  status text NOT NULL DEFAULT 'חדש'
    CHECK (status IN ('חדש', 'בטיפול', 'ממתין לנציג', 'ממתין ללקוח', 'הושלם', 'ארכיון')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  first_response_at timestamptz,
  started_at timestamptz,
  closed_at timestamptz,
  closed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  closing_summary text,
  last_message_at timestamptz,
  last_message_preview text,
  client_token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_chats_agent ON public.telemarketing_team_chats (agent_id);
CREATE INDEX IF NOT EXISTS idx_team_chats_status ON public.telemarketing_team_chats (status);
CREATE INDEX IF NOT EXISTS idx_team_chats_opened ON public.telemarketing_team_chats (opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_chats_lead ON public.telemarketing_team_chats (lead_key);

CREATE TABLE IF NOT EXISTS public.telemarketing_team_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES public.telemarketing_team_chats(id) ON DELETE RESTRICT,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  author_name text NOT NULL,
  author_role text NOT NULL CHECK (author_role IN ('telemarketing_agent', 'super_admin', 'system')),
  body text NOT NULL,
  kind text NOT NULL DEFAULT 'user' CHECK (kind IN ('user', 'system')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_messages_chat ON public.telemarketing_team_messages (chat_id, created_at);

CREATE TABLE IF NOT EXISTS public.telemarketing_team_chat_reads (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  chat_id uuid NOT NULL REFERENCES public.telemarketing_team_chats(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, chat_id)
);

DROP TRIGGER IF EXISTS trg_telemarketing_team_chats_updated_at ON public.telemarketing_team_chats;
CREATE TRIGGER trg_telemarketing_team_chats_updated_at
  BEFORE UPDATE ON public.telemarketing_team_chats
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.telemarketing_team_chat_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('הושלם', 'ארכיון') AND NEW.status NOT IN ('הושלם', 'ארכיון') THEN
      RAISE EXCEPTION 'לא ניתן לפתוח מחדש פנייה סגורה — יש לפתוח טיפול חדש';
    END IF;
    IF NEW.status = 'הושלם' AND OLD.status <> 'הושלם' THEN
      IF NEW.closing_summary IS NULL OR btrim(NEW.closing_summary) = '' THEN
        RAISE EXCEPTION 'חובה לכתוב סיכום טיפול לפני סגירה';
      END IF;
      IF NEW.closed_at IS NULL THEN
        NEW.closed_at := now();
      END IF;
      IF NEW.closed_by IS NULL THEN
        NEW.closed_by := auth.uid();
      END IF;
    END IF;
    IF NEW.status = 'בטיפול' AND NEW.started_at IS NULL THEN
      NEW.started_at := now();
    END IF;
    IF OLD.status = 'חדש' AND NEW.status <> 'חדש' AND NEW.first_response_at IS NULL THEN
      NEW.first_response_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_telemarketing_team_chats_guard ON public.telemarketing_team_chats;
CREATE TRIGGER trg_telemarketing_team_chats_guard
  BEFORE UPDATE ON public.telemarketing_team_chats
  FOR EACH ROW EXECUTE FUNCTION public.telemarketing_team_chat_guard();

CREATE OR REPLACE FUNCTION public.telemarketing_team_message_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chat_row public.telemarketing_team_chats%ROWTYPE;
BEGIN
  SELECT * INTO chat_row FROM public.telemarketing_team_chats WHERE id = NEW.chat_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'פנייה לא נמצאה';
  END IF;
  IF chat_row.status IN ('הושלם', 'ארכיון') THEN
    RAISE EXCEPTION 'הפנייה סגורה לקריאה בלבד';
  END IF;
  IF NEW.author_role = 'telemarketing_agent' AND NEW.author_id <> chat_row.agent_id THEN
    RAISE EXCEPTION 'נציג יכול לכתוב רק בפניות שלו';
  END IF;
  UPDATE public.telemarketing_team_chats
    SET last_message_at = NEW.created_at,
        last_message_preview = left(NEW.body, 140),
        first_response_at = CASE
          WHEN first_response_at IS NULL AND NEW.author_role = 'super_admin' THEN NEW.created_at
          ELSE first_response_at
        END
    WHERE id = NEW.chat_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_telemarketing_team_messages_guard ON public.telemarketing_team_messages;
CREATE TRIGGER trg_telemarketing_team_messages_guard
  BEFORE INSERT ON public.telemarketing_team_messages
  FOR EACH ROW EXECUTE FUNCTION public.telemarketing_team_message_guard();

ALTER TABLE public.telemarketing_team_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemarketing_team_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemarketing_team_chat_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS telemarketing_team_chats_select ON public.telemarketing_team_chats;
CREATE POLICY telemarketing_team_chats_select ON public.telemarketing_team_chats
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'telemarketing_agent'::app_role)
      AND agent_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS telemarketing_team_chats_insert ON public.telemarketing_team_chats;
CREATE POLICY telemarketing_team_chats_insert ON public.telemarketing_team_chats
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'telemarketing_agent'::app_role)
      AND agent_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS telemarketing_team_chats_update ON public.telemarketing_team_chats;
CREATE POLICY telemarketing_team_chats_update ON public.telemarketing_team_chats
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS telemarketing_team_messages_select ON public.telemarketing_team_messages;
CREATE POLICY telemarketing_team_messages_select ON public.telemarketing_team_messages
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.telemarketing_team_chats c
      WHERE c.id = chat_id AND c.agent_id = auth.uid()
        AND public.has_role(auth.uid(), 'telemarketing_agent'::app_role)
    )
  );

DROP POLICY IF EXISTS telemarketing_team_messages_insert ON public.telemarketing_team_messages;
CREATE POLICY telemarketing_team_messages_insert ON public.telemarketing_team_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      public.has_role(auth.uid(), 'super_admin'::app_role)
      AND author_id = auth.uid()
    )
    OR (
      public.has_role(auth.uid(), 'telemarketing_agent'::app_role)
      AND author_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.telemarketing_team_chats c
        WHERE c.id = chat_id AND c.agent_id = auth.uid()
          AND c.status NOT IN ('הושלם', 'ארכיון')
      )
    )
  );

DROP POLICY IF EXISTS telemarketing_team_reads_select ON public.telemarketing_team_chat_reads;
CREATE POLICY telemarketing_team_reads_select ON public.telemarketing_team_chat_reads
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS telemarketing_team_reads_insert ON public.telemarketing_team_chat_reads;
CREATE POLICY telemarketing_team_reads_insert ON public.telemarketing_team_chat_reads
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS telemarketing_team_reads_update ON public.telemarketing_team_chat_reads;
CREATE POLICY telemarketing_team_reads_update ON public.telemarketing_team_chat_reads
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT ON public.telemarketing_team_chats TO authenticated;
GRANT UPDATE ON public.telemarketing_team_chats TO authenticated;
GRANT SELECT, INSERT ON public.telemarketing_team_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.telemarketing_team_chat_reads TO authenticated;
