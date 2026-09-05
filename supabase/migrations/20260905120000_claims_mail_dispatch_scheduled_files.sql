-- Staging ONLY. Completes the existing claims_mail_dispatch_now dry-run
-- dispatcher so a one-shot scheduled email can attach the exact file_ids
-- stored on the reminder (same claim_id only). No new cron. No inbox scan.
-- Do not apply on Production.

CREATE OR REPLACE FUNCTION public.claims_mail_dispatch_now()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode text;
  v_job record;
  v_rem record;
  v_claim record;
  v_n int := 0;
  v_fail int := 0;
  v_skip int := 0;
  v_preview jsonb;
  v_docs jsonb;
  v_next timestamptz;
  v_claimed int;
  v_ids text[];
  v_purpose text;
  v_hist_type text;
  v_hist_ok text;
  v_hist_fail_closed text;
  v_hist_fail_to text;
BEGIN
  SELECT value INTO v_mode FROM public.claims_config WHERE key = 'MAIL_DISPATCH_MODE';
  v_mode := coalesce(v_mode, 'dry_run');
  IF v_mode IS DISTINCT FROM 'dry_run' THEN
    RETURN jsonb_build_object(
      'success', false,
      'blocked', true,
      'reason', 'live_blocked_until_oauth',
      'mode', v_mode,
      'realEmailSend', false,
      'gmailTouched', false
    );
  END IF;

  FOR v_job IN
    SELECT j.id, j.reminder_id, j.claim_id, j.planned_at
    FROM public.claims_mail_jobs j
    WHERE j.status = 'pending' AND j.planned_at <= now()
    ORDER BY j.planned_at
    LIMIT 50
  LOOP
    UPDATE public.claims_mail_jobs
      SET status = 'sending', claimed_at = now()
      WHERE id = v_job.id AND status = 'pending';
    GET DIAGNOSTICS v_claimed = ROW_COUNT;
    IF v_claimed = 0 THEN
      v_skip := v_skip + 1;
      CONTINUE;
    END IF;

    SELECT * INTO v_rem FROM public.claims_reminders WHERE id = v_job.reminder_id;
    SELECT * INTO v_claim FROM public.claims_records WHERE id = v_job.claim_id;
    v_purpose := coalesce(v_rem.row_data->>'purpose', '');
    IF v_purpose = 'scheduled_send' THEN
      v_hist_type := 'mail_scheduled';
      v_hist_ok := 'Dry Run: מייל מתוזמן שהיה אמור להישלח';
      v_hist_fail_closed := 'מייל מתוזמן נכשל';
      v_hist_fail_to := 'מייל מתוזמן נכשל';
    ELSE
      v_hist_type := 'mail_followup';
      v_hist_ok := 'Dry Run: מייל שהיה אמור להישלח';
      v_hist_fail_closed := 'מעקב מייל נכשל';
      v_hist_fail_to := 'מעקב מייל נכשל';
    END IF;

    IF v_rem.status = 'cancelled' THEN
      UPDATE public.claims_mail_jobs SET status = 'cancelled', finished_at = now(), fail_reason = 'followup_cancelled' WHERE id = v_job.id;
      v_skip := v_skip + 1;
      CONTINUE;
    END IF;

    IF public.claims_is_closed_status(v_claim.status) AND NOT coalesce(v_rem.allow_on_closed, false) THEN
      UPDATE public.claims_mail_jobs
        SET status = 'failed', finished_at = now(), fail_reason = 'closed_claim'
        WHERE id = v_job.id;
      UPDATE public.claims_reminders SET status = 'failed' WHERE id = v_rem.id AND status = 'scheduled';
      PERFORM public.claims_hist(v_claim.id, v_hist_fail_closed, 'תיק סגור — לא נשלח (dry-run)', v_hist_type, 'מערכת (dry-run)');
      INSERT INTO public.claims_notifications (id, claim_id, row_data)
      VALUES (public.claims_nid('NTF'), v_claim.id, jsonb_build_object(
        'claimId', v_claim.id, 'type', v_hist_type, 'message', v_hist_fail_closed || ': תיק סגור', 'read', 'false',
        'createdAt', to_char(now() AT TIME ZONE 'Asia/Jerusalem', 'DD/MM/YYYY, HH24:MI:SS')
      ));
      v_fail := v_fail + 1;
      CONTINUE;
    END IF;

    IF NOT public.claims_mail_valid_to(v_rem.mail_to) THEN
      UPDATE public.claims_mail_jobs
        SET status = 'failed', finished_at = now(), fail_reason = 'invalid_to'
        WHERE id = v_job.id;
      UPDATE public.claims_reminders SET status = 'failed' WHERE id = v_rem.id AND status = 'scheduled';
      PERFORM public.claims_hist(v_claim.id, v_hist_fail_to, 'כתובת נמען לא תקינה — לא נשלח (dry-run)', v_hist_type, 'מערכת (dry-run)');
      INSERT INTO public.claims_notifications (id, claim_id, row_data)
      VALUES (public.claims_nid('NTF'), v_claim.id, jsonb_build_object(
        'claimId', v_claim.id, 'type', v_hist_type, 'message', v_hist_fail_to || ': כתובת לא תקינה', 'read', 'false',
        'createdAt', to_char(now() AT TIME ZONE 'Asia/Jerusalem', 'DD/MM/YYYY, HH24:MI:SS')
      ));
      v_fail := v_fail + 1;
      CONTINUE;
    END IF;

    SELECT coalesce(array_agg(trim(x)), ARRAY[]::text[])
      INTO v_ids
    FROM unnest(string_to_array(coalesce(v_rem.row_data->>'file_ids', ''), ',')) AS x
    WHERE trim(x) <> '';

    IF coalesce(array_length(v_ids, 1), 0) > 0 THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.original_name)), '[]'::jsonb)
        INTO v_docs
      FROM public.claims_documents d
      WHERE d.claim_id = v_claim.id
        AND d.id = ANY (v_ids);
    ELSIF v_rem.attach_mode = 'received' THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.original_name)), '[]'::jsonb)
        INTO v_docs
      FROM public.claims_documents d
      WHERE d.claim_id = v_claim.id;
    ELSE
      v_docs := '[]'::jsonb;
    END IF;

    v_preview := jsonb_build_object(
      'dispatch', 'dry_run',
      'realEmailSend', false,
      'gmailTouched', false,
      'to', v_rem.mail_to,
      'cc', coalesce(v_rem.row_data->>'mail_cc', ''),
      'subject', v_rem.mail_subject,
      'body', v_rem.mail_body,
      'plannedAt', v_job.planned_at,
      'kind', v_rem.mail_kind,
      'purpose', v_purpose,
      'repeatEveryDays', v_rem.repeat_every_days,
      'attachMode', v_rem.attach_mode,
      'attachments', v_docs,
      'claimId', v_claim.id,
      'clientName', v_claim.client_name,
      'definedBy', (SELECT full_name FROM public.profiles WHERE id = v_rem.created_by)
    );

    UPDATE public.claims_mail_jobs
      SET status = 'dry_run_sent', finished_at = now(), preview = v_preview, fail_reason = null
      WHERE id = v_job.id;

    INSERT INTO public.claims_comm_log (id, claim_id, row_data)
    VALUES (
      public.claims_nid('COM'),
      v_claim.id,
      jsonb_build_object(
        'type', 'mail',
        'direction', 'out',
        'dispatch', 'dry_run',
        'realEmailSend', 'false',
        'email', v_rem.mail_to,
        'subject', v_rem.mail_subject,
        'body', v_rem.mail_body,
        'kind', v_rem.mail_kind,
        'purpose', v_purpose,
        'plannedAt', v_job.planned_at,
        'attachments', v_docs,
        'at', to_char(now() AT TIME ZONE 'Asia/Jerusalem', 'DD/MM/YYYY, HH24:MI:SS'),
        'by', 'מערכת (dry-run)',
        'note', 'Dry Run — לא נשלח מייל אמיתי'
      )
    );

    PERFORM public.claims_hist(
      v_claim.id,
      v_hist_ok,
      v_rem.mail_to || ' · ' || coalesce(v_rem.mail_subject, ''),
      v_hist_type,
      'מערכת (dry-run)'
    );

    INSERT INTO public.claims_notifications (id, claim_id, row_data)
    VALUES (public.claims_nid('NTF'), v_claim.id, jsonb_build_object(
      'claimId', v_claim.id, 'type', v_hist_type,
      'message', 'Dry Run: מייל שהיה אמור לצאת אל ' || v_rem.mail_to,
      'read', 'false',
      'createdAt', to_char(now() AT TIME ZONE 'Asia/Jerusalem', 'DD/MM/YYYY, HH24:MI:SS')
    ));

    IF v_rem.mail_kind = 'email_repeat' THEN
      v_next := v_job.planned_at + make_interval(days => coalesce(v_rem.repeat_every_days, 7));
      IF v_rem.stop_at IS NOT NULL AND v_next > v_rem.stop_at THEN
        UPDATE public.claims_reminders SET status = 'completed', next_run_at = null WHERE id = v_rem.id;
      ELSE
        UPDATE public.claims_reminders SET next_run_at = v_next WHERE id = v_rem.id;
        INSERT INTO public.claims_mail_jobs (id, reminder_id, claim_id, planned_at, status)
        VALUES (public.claims_nid('MJB'), v_rem.id, v_claim.id, v_next, 'pending')
        ON CONFLICT (reminder_id, planned_at) DO NOTHING;
      END IF;
    ELSE
      UPDATE public.claims_reminders SET status = 'completed', next_run_at = null WHERE id = v_rem.id;
    END IF;

    v_n := v_n + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'mode', 'dry_run',
    'realEmailSend', false,
    'gmailTouched', false,
    'processed', v_n,
    'failed', v_fail,
    'skipped', v_skip
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claims_mail_dispatch_now() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claims_mail_dispatch_now() FROM anon;
REVOKE ALL ON FUNCTION public.claims_mail_dispatch_now() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claims_mail_dispatch_now() TO service_role;
