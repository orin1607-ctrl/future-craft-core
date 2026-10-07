-- Staging ONLY rollback for claims AI chat history. Do not run on Production.

DROP TRIGGER IF EXISTS trg_claims_ai_touch_conversation ON public.claims_ai_messages;
DROP FUNCTION IF EXISTS public.claims_ai_touch_conversation();
DROP TABLE IF EXISTS public.claims_ai_messages;
DROP TABLE IF EXISTS public.claims_ai_conversations;
