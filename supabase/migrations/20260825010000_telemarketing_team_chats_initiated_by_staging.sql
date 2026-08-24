-- Staging ONLY (usfeoerkpcafxxlyuldl). Do not apply to Production.
-- Adds initiated_by so manager→employee internal chats are distinguishable.
-- No DELETE. Existing rows default to 'agent'.

ALTER TABLE public.telemarketing_team_chats
  ADD COLUMN IF NOT EXISTS initiated_by text NOT NULL DEFAULT 'agent';

ALTER TABLE public.telemarketing_team_chats
  DROP CONSTRAINT IF EXISTS telemarketing_team_chats_initiated_by_check;

ALTER TABLE public.telemarketing_team_chats
  ADD CONSTRAINT telemarketing_team_chats_initiated_by_check
  CHECK (initiated_by IN ('agent', 'admin'));

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
        END,
        status = CASE
          WHEN NEW.author_role = 'telemarketing_agent' AND status = 'ממתין לנציג' THEN 'בטיפול'
          ELSE status
        END,
        started_at = CASE
          WHEN NEW.author_role = 'telemarketing_agent' AND started_at IS NULL THEN now()
          ELSE started_at
        END
    WHERE id = NEW.chat_id;
  RETURN NEW;
END;
$$;

