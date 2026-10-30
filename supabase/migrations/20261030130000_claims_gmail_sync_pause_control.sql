-- Staging Claims only. Adds absolute GMAIL_SYNC_PAUSED support to claims_mail_dispatch_now.
-- Preserves real GMAIL_INBOX_LAST_SCAN_AT. No fake dates. No unapproved real sends.
-- Absolute pause: When GMAIL_SYNC_PAUSED='true', NO bypass is allowed under any circumstance.

-- 1. Ensure the pause flag exists and is strictly set to 'true'
INSERT INTO public.claims_config (key, value, updated_at)
VALUES ('GMAIL_SYNC_PAUSED', 'true', now())
ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = now();

-- 2. Update claims_mail_dispatch_now to unconditionally respect GMAIL_SYNC_PAUSED
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
  v_scan jsonb;
  v_url text := 'https://usfeoerkpcafxxlyuldl.supabase.co/functions/v1/claims-gmail';
  v_secret text := NULL;
  v_req bigint;
  v_headers jsonb;
  v_stamp text;
  v_last timestamptz;
  v_paused text;
BEGIN
  v_scan := jsonb_build_object('success', false, 'skipped', true, 'reason', 'not_attempted');
  BEGIN
    IF v_url LIKE '%qasomfndnjuixgjmjwcm%' THEN
      v_scan := jsonb_build_object('success', false, 'blocked', true, 'reason', 'production_url');
    ELSE
      SELECT value INTO v_stamp FROM public.claims_config WHERE key = 'GMAIL_INBOX_LAST_SCAN_AT';
      SELECT value INTO v_paused FROM public.claims_config WHERE key = 'GMAIL_SYNC_PAUSED';

      -- ABSOLUTE PAUSE: If paused, abort inbox scan tick immediately with zero external HTTP call
      IF coalesce(v_paused, '') = 'true' THEN
        v_scan := jsonb_build_object(
          'success', true,
          'skipped', true,
          'paused', true,
          'blocked', true,
          'reason', 'sync_paused_by_admin',
          'note', 'חסימת סנכרון מוחלטת פעילה ב-STAGING. לא מתבצעת סריקת מיילים.',
          'lastScanAt', v_stamp,
          'realEmailSend', false,
          'mailboxMutated', false
        );
      ELSE
        BEGIN
          v_last := NULLIF(v_stamp, '')::timestamptz;
        EXCEPTION WHEN OTHERS THEN
          v_last := NULL;
        END;
        IF v_last IS NOT NULL AND (now() - v_last) < interval '3 hours' THEN
          v_scan := jsonb_build_object(
            'success', true,
            'skipped', true,
            'reason', 'scan_not_due',
            'lastScanAt', v_stamp,
            'nextDueAt', (v_last + interval '3 hours')::text,
            'everyHours', 3
          );
        ELSE
          BEGIN
            SELECT ds.decrypted_secret INTO v_secret
            FROM vault.decrypted_secrets ds
            WHERE ds.name IN (
              'DALIA_EDGE_INTERNAL_SECRET',
              'SUPABASE_SERVICE_ROLE_KEY',
              'service_role_key'
            )
            AND coalesce(ds.decrypted_secret, '') <> ''
            ORDER BY CASE ds.name
              WHEN 'DALIA_EDGE_INTERNAL_SECRET' THEN 1
              WHEN 'SUPABASE_SERVICE_ROLE_KEY' THEN 2
              ELSE 3
            END
            LIMIT 1;
          EXCEPTION WHEN OTHERS THEN
            v_secret := NULL;
          END;

          IF v_secret IS NULL OR v_secret = '' THEN
            v_scan := jsonb_build_object(
              'success', false,
              'skipped', true,
              'reason', 'no_existing_scheduler_secret',
              'realEmailSend', false
            );
          ELSIF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
            v_scan := jsonb_build_object(
              'success', false,
              'skipped', true,
              'reason', 'pg_net_missing',
              'realEmailSend', false
            );
          ELSE
            v_headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer ' || v_secret,
              'x-dalia-internal-key', v_secret
            );
            SELECT net.http_post(
              url := v_url,
              headers := v_headers,
              body := jsonb_build_object(
                'action', 'scan_inbox',
                'scheduler', true,
                'dry', false
              )
            ) INTO v_req;
            v_scan := jsonb_build_object(
              'success', true,
              'queued', true,
              'request_id', v_req,
              'everyHours', 3,
              'folders', jsonb_build_array('inbox', 'sent'),
              'realEmailSend', false,
              'autoSend', false,
              'gmailSend', false
            );
          END IF;
        END IF;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_scan := jsonb_build_object('success', false, 'skipped', true, 'reason', SQLERRM);
  END;

  SELECT value INTO v_mode FROM public.claims_config WHERE key = 'MAIL_DISPATCH_MODE';
  v_mode := coalesce(v_mode, 'dry_run');
  IF v_mode IS DISTINCT FROM 'dry_run' THEN
    RETURN jsonb_build_object(
      'success', false,
      'blocked', true,
      'reason', 'live_blocked_until_oauth',
      'mode', v_mode,
      'realEmailSend', false,
      'gmailTouched', false,
      'inboxScanTick', v_scan
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
        'claimId', v_claim.id, 'type', v_hist_type, 'message', v_hist_fail_to || ': כתובת נמען לא תקינה', 'read', 'false',
        'createdAt', to_char(now() AT TIME ZONE 'Asia/Jerusalem', 'DD/MM/YYYY, HH24:MI:SS')
      ));
      v_fail := v_fail + 1;
      CONTINUE;
    END IF;

    IF v_rem.attach_mode = 'none' OR v_rem.row_data->>'file_ids' IS NULL THEN
      v_ids := ARRAY[]::text[];
    ELSE
      v_ids := string_to_array(v_rem.row_data->>'file_ids', ',');
    END IF;

    SELECT coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.original_name, 'bytes', d.byte_size)), '[]'::jsonb)
      INTO v_docs
      FROM public.claims_documents d
      WHERE d.claim_id = v_claim.id AND d.id = ANY(v_ids);

    v_preview := jsonb_build_object(
      'dispatch', 'dry_run',
      'realEmailSend', false,
      'gmailTouched', false,
      'to', v_rem.mail_to,
      'cc', v_rem.row_data->>'mail_cc',
      'subject', v_rem.mail_subject,
      'body', v_rem.mail_body,
      'plannedAt', v_job.planned_at,
      'files', v_docs
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
    'skipped', v_skip,
    'inboxScanTick', v_scan
  );
END;
$$;

-- 3. Dedicated Admin Helper functions with strict security
-- Pause is always allowed for service_role/admin
CREATE OR REPLACE FUNCTION public.claims_gmail_pause_sync()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.claims_config (key, value, updated_at)
  VALUES ('GMAIL_SYNC_PAUSED', 'true', now())
  ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = now();
  RETURN jsonb_build_object('success', true, 'paused', true, 'reason', 'sync_paused_by_admin');
END;
$$;

-- Resume STRICTLY requires confirmation token 'AUTHORIZE_RESUME_GMAIL_SYNC'
CREATE OR REPLACE FUNCTION public.claims_gmail_resume_sync(confirm_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF confirm_token IS DISTINCT FROM 'AUTHORIZE_RESUME_GMAIL_SYNC' THEN
    RAISE EXCEPTION 'Refused: Resume requires explicit authorization token AUTHORIZE_RESUME_GMAIL_SYNC';
  END IF;

  INSERT INTO public.claims_config (key, value, updated_at)
  VALUES ('GMAIL_SYNC_PAUSED', 'false', now())
  ON CONFLICT (key) DO UPDATE SET value = 'false', updated_at = now();
  RETURN jsonb_build_object('success', true, 'paused', false, 'reason', 'sync_resumed_by_admin');
END;
$$;

-- 4. Restrict all permissions strictly to service_role only (NO anon, NO authenticated)
REVOKE ALL ON FUNCTION public.claims_mail_dispatch_now() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claims_mail_dispatch_now() TO service_role;

REVOKE ALL ON FUNCTION public.claims_gmail_pause_sync() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claims_gmail_pause_sync() TO service_role;

REVOKE ALL ON FUNCTION public.claims_gmail_resume_sync(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claims_gmail_resume_sync(text) TO service_role;
