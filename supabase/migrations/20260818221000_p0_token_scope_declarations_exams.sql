-- P0-F / C4 / C5 Staging ONLY (usfeoerkpcafxxlyuldl).
-- Replace driver_declarations and driving_exams anon USING(true) with token RPCs.
-- Rollback: restore the two anon policies per table and DROP these functions.

CREATE OR REPLACE FUNCTION public.get_declaration_by_token(p_token text)
RETURNS SETOF public.driver_declarations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 24 THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT d.*
  FROM public.driver_declarations d
  WHERE d.token = trim(p_token)
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.sign_declaration_by_token(p_token text, p_signature_url text)
RETURNS SETOF public.driver_declarations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 24 THEN
    RETURN;
  END IF;
  IF p_signature_url IS NULL OR length(trim(p_signature_url)) < 8 THEN
    RETURN;
  END IF;

  SELECT id INTO v_id
  FROM public.driver_declarations
  WHERE token = trim(p_token)
    AND status = 'pending'
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN QUERY
    SELECT d.*
    FROM public.driver_declarations d
    WHERE d.token = trim(p_token)
    LIMIT 1;
    RETURN;
  END IF;

  UPDATE public.driver_declarations
  SET
    status = 'signed',
    signed_at = now(),
    signature_url = trim(p_signature_url),
    expires_at = now() + interval '5 years',
    updated_at = now()
  WHERE id = v_id
    AND token = trim(p_token)
    AND status = 'pending';

  RETURN QUERY
  SELECT d.*
  FROM public.driver_declarations d
  WHERE d.id = v_id
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_driving_exam_by_token(p_token text)
RETURNS SETOF public.driving_exams
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 16 THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT e.*
  FROM public.driving_exams e
  WHERE e.token = trim(p_token)
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_driving_exam_by_token(p_token text)
RETURNS SETOF public.driving_exams
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 16 THEN
    RETURN;
  END IF;

  UPDATE public.driving_exams
  SET
    status = 'in_progress',
    started_at = COALESCE(started_at, now()),
    updated_at = now()
  WHERE token = trim(p_token)
    AND status = 'sent';

  RETURN QUERY
  SELECT e.*
  FROM public.driving_exams e
  WHERE e.token = trim(p_token)
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_driving_exam_by_token(
  p_token text,
  p_answers jsonb,
  p_score integer,
  p_correct_count integer,
  p_total_questions integer,
  p_passed boolean,
  p_category_breakdown jsonb,
  p_signature_url text
)
RETURNS SETOF public.driving_exams
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 16 THEN
    RETURN;
  END IF;

  UPDATE public.driving_exams
  SET
    status = 'completed',
    completed_at = now(),
    answers = COALESCE(p_answers, '[]'::jsonb),
    score = p_score,
    correct_count = p_correct_count,
    total_questions = p_total_questions,
    passed = p_passed,
    category_breakdown = COALESCE(p_category_breakdown, '{}'::jsonb),
    signature_url = COALESCE(p_signature_url, signature_url),
    updated_at = now()
  WHERE token = trim(p_token)
    AND status IN ('sent', 'in_progress');

  RETURN QUERY
  SELECT e.*
  FROM public.driving_exams e
  WHERE e.token = trim(p_token)
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_declaration_by_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sign_declaration_by_token(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_driving_exam_by_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_driving_exam_by_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_driving_exam_by_token(text, jsonb, integer, integer, integer, boolean, jsonb, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_declaration_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sign_declaration_by_token(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_driving_exam_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_driving_exam_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_driving_exam_by_token(text, jsonb, integer, integer, integer, boolean, jsonb, text) TO anon, authenticated;

DROP POLICY IF EXISTS "Anonymous can view by token" ON public.driver_declarations;
DROP POLICY IF EXISTS "Anonymous can update by token" ON public.driver_declarations;
DROP POLICY IF EXISTS "Anon view exam by token" ON public.driving_exams;
DROP POLICY IF EXISTS "Anon submit exam by token" ON public.driving_exams;
