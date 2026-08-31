-- Staging ONLY. Claims mail follow-up RPCs. Dry run only. No Gmail.

CREATE OR REPLACE FUNCTION public.claims_mail_valid_to(p_to text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(p_to, '') ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$';
$$;

CREATE OR REPLACE FUNCTION public.claims_is_closed_status(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(p_status, '') = ANY (ARRAY['הסתיים','שולם','נדחה']);
$$;

CREATE OR REPLACE FUNCTION public.claims_nid(p_prefix text)
RETURNS text
LANGUAGE sql
VOLATILE
AS $$
  SELECT p_prefix || '-' || (extract(epoch from clock_timestamp()) * 1000)::bigint::text
    || '-' || substr(md5(random()::text), 1, 6);
$$;

CREATE OR REPLACE FUNCTION public.claims_hist(p_claim_id text, p_action text, p_note text, p_type text, p_by text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.claims_history (id, claim_id, row_data)
  VALUES (
    public.claims_nid('HIS'),
    p_claim_id,
    jsonb_build_object(
      'action', p_action,
      'note', coalesce(p_note, ''),
      'type', coalesce(p_type, 'mail_followup'),
      'by', coalesce(p_by, ''),
      'at', to_char(now() AT TIME ZONE 'Asia/Jerusalem', 'DD/MM/YYYY, HH24:MI:SS')
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claims_upsert_mail_followup(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role_ok boolean;
  v_claim_id text := coalesce(p_payload->>'claim_id', '');
  v_id text := nullif(p_payload->>'id', '');
  v_to text := trim(coalesce(p_payload->>'mail_to', ''));
  v_kind text := coalesce(p_payload->>'mail_kind', 'email_once');
  v_subject text := coalesce(p_payload->>'mail_subject', '');
  v_body text := coalesce(p_payload->>'mail_body', '');
  v_attach text := coalesce(p_payload->>'attach_mode', 'none');
  v_repeat int := nullif(p_payload->>'repeat_every_days', '')::int;
  v_run timestamptz := (p_payload->>'next_run_at')::timestamptz;
  v_stop timestamptz := nullif(p_payload->>'stop_at', '')::timestamptz;
  v_allow_closed boolean := coalesce((p_payload->>'allow_on_closed')::boolean, false);
  v_name text;
  v_status text;
  v_closed boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'claims_upsert_mail_followup: not authenticated';
  END IF;
  IF NOT public.claims_can_work_claim(v_claim_id) THEN
    RAISE EXCEPTION 'claims_upsert_mail_followup: forbidden';
  END IF;
  SELECT public.has_role(v_uid, 'super_admin'::app_role) INTO v_role_ok;
  SELECT r.status INTO v_status FROM public.claims_records r WHERE r.id = v_claim_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'claims_upsert_mail_followup: claim not found';
  END IF;
  v_closed := public.claims_is_closed_status(v_status);
  IF v_closed AND NOT (v_allow_closed AND v_role_ok) THEN
    RAISE EXCEPTION 'claims_upsert_mail_followup: closed_claim';
  END IF;
  IF NOT public.claims_mail_valid_to(v_to) THEN
    RAISE EXCEPTION 'claims_upsert_mail_followup: invalid_to';
  END IF;
  IF v_run IS NULL THEN
    RAISE EXCEPTION 'claims_upsert_mail_followup: next_run_at required';
  END IF;
  IF v_kind = 'email_repeat' AND coalesce(v_repeat, 0) < 1 THEN
    RAISE EXCEPTION 'claims_upsert_mail_followup: repeat_every_days required';
  END IF;
  IF v_attach NOT IN ('none', 'received') THEN
    v_attach := 'none';
  END IF;
  SELECT full_name INTO v_name FROM public.profiles WHERE id = v_uid;
  IF v_id IS NULL THEN
    v_id := public.claims_nid('REM');
    INSERT INTO public.claims_reminders (
      id, claim_id, action, mail_kind, mail_to, mail_subject, mail_body, attach_mode,
      repeat_every_days, stop_at, next_run_at, status, allow_on_closed, created_by, row_data
    ) VALUES (
      v_id, v_claim_id, 'send_email', v_kind, v_to, v_subject, v_body, v_attach,
      CASE WHEN v_kind = 'email_repeat' THEN v_repeat ELSE NULL END,
      v_stop, v_run, 'scheduled', (v_allow_closed AND v_role_ok), v_uid,
      jsonb_build_object(
        'action', 'send_email',
        'date', to_char(v_run AT TIME ZONE 'Asia/Jerusalem', 'YYYY-MM-DD'),
        'time', to_char(v_run AT TIME ZONE 'Asia/Jerusalem', 'HH24:MI'),
        'note', v_subject,
        'owner', coalesce(v_name, ''),
        'sent', 'false'
      )
    );
    PERFORM public.claims_hist(v_claim_id, 'הוגדר מעקב מייל', v_to || ' · ' || v_subject, 'mail_followup', coalesce(v_name, ''));
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.claims_reminders r
      WHERE r.id = v_id AND r.claim_id = v_claim_id AND r.action = 'send_email' AND r.status = 'scheduled'
    ) THEN
      RAISE EXCEPTION 'claims_upsert_mail_followup: not_editable';
    END IF;
    UPDATE public.claims_reminders SET
      mail_kind = v_kind,
      mail_to = v_to,
      mail_subject = v_subject,
      mail_body = v_body,
      attach_mode = v_attach,
      repeat_every_days = CASE WHEN v_kind = 'email_repeat' THEN v_repeat ELSE NULL END,
      stop_at = v_stop,
      next_run_at = v_run,
      allow_on_closed = (v_allow_closed AND v_role_ok),
      row_data = coalesce(row_data, '{}'::jsonb) || jsonb_build_object(
        'date', to_char(v_run AT TIME ZONE 'Asia/Jerusalem', 'YYYY-MM-DD'),
        'time', to_char(v_run AT TIME ZONE 'Asia/Jerusalem', 'HH24:MI'),
        'note', v_subject,
        'owner', coalesce(v_name, '')
      )
    WHERE id = v_id;
    DELETE FROM public.claims_mail_jobs WHERE reminder_id = v_id AND status = 'pending';
    PERFORM public.claims_hist(v_claim_id, 'עודכן מעקב מייל', v_to || ' · ' || v_subject, 'mail_followup', coalesce(v_name, ''));
  END IF;

  INSERT INTO public.claims_mail_jobs (id, reminder_id, claim_id, planned_at, status)
  VALUES (public.claims_nid('MJB'), v_id, v_claim_id, v_run, 'pending')
  ON CONFLICT (reminder_id, planned_at) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.claims_cancel_mail_followup(p_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_claim text;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'claims_cancel_mail_followup: not authenticated';
  END IF;
  SELECT claim_id INTO v_claim FROM public.claims_reminders WHERE id = p_id AND action = 'send_email';
  IF v_claim IS NULL THEN
    RAISE EXCEPTION 'claims_cancel_mail_followup: not found';
  END IF;
  IF NOT public.claims_can_work_claim(v_claim) THEN
    RAISE EXCEPTION 'claims_cancel_mail_followup: forbidden';
  END IF;
  SELECT full_name INTO v_name FROM public.profiles WHERE id = v_uid;
  UPDATE public.claims_reminders
    SET status = 'cancelled', cancelled_at = now(), cancelled_by = v_uid
    WHERE id = p_id AND status = 'scheduled';
  UPDATE public.claims_mail_jobs
    SET status = 'cancelled', finished_at = now()
    WHERE reminder_id = p_id AND status IN ('pending', 'sending');
  PERFORM public.claims_hist(v_claim, 'מעקב מייל בוטל', p_id, 'mail_followup', coalesce(v_name, ''));
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claims_mail_valid_to(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claims_upsert_mail_followup(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claims_cancel_mail_followup(text) TO authenticated;
