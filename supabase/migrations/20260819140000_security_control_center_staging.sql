-- Oren Car / Staging ONLY (usfeoerkpcafxxlyuldl)
-- Security Control Center — append-only audit, isolated from customer documents.
-- Do NOT apply to Production (qasomfndnjuixgjmjwcm).

CREATE TABLE IF NOT EXISTS public.security_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN ('app', 'supabase', 'github', 'hostinger_vps')),
  event_type text NOT NULL,
  actor_user_id uuid,
  actor_email text,
  actor_role text,
  company_name text,
  identity_status text NOT NULL DEFAULT 'unidentified'
    CHECK (identity_status IN ('identified', 'unidentified', 'identity_unavailable')),
  outcome text NOT NULL DEFAULT 'unknown'
    CHECK (outcome IN ('success', 'failure', 'unknown')),
  action_label text NOT NULL DEFAULT '',
  result_label text NOT NULL DEFAULT '',
  session_id uuid,
  active_ms bigint,
  ip_address text,
  device_summary text,
  severity text NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'warning', 'high', 'critical')),
  source_ref text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS security_audit_events_occurred_idx
  ON public.security_audit_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS security_audit_events_source_idx
  ON public.security_audit_events (source, occurred_at DESC);
CREATE INDEX IF NOT EXISTS security_audit_events_actor_idx
  ON public.security_audit_events (actor_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS security_audit_events_company_idx
  ON public.security_audit_events (company_name, occurred_at DESC);

COMMENT ON TABLE public.security_audit_events IS
  'Append-only security/access audit. No customer document bytes. Retention recommendation: 180 days events, 90 days IPs.';

CREATE TABLE IF NOT EXISTS public.security_activity_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  accumulated_active_ms bigint NOT NULL DEFAULT 0,
  end_reason text,
  ip_address text,
  device_summary text,
  is_open boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS security_activity_sessions_open_idx
  ON public.security_activity_sessions (user_id, is_open)
  WHERE is_open = true;

CREATE TABLE IF NOT EXISTS public.security_alert_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.security_audit_events(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  severity text NOT NULL DEFAULT 'warning'
    CHECK (severity IN ('info', 'warning', 'high', 'critical')),
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz
);

CREATE INDEX IF NOT EXISTS security_alert_inbox_open_idx
  ON public.security_alert_inbox (created_at DESC)
  WHERE acknowledged_at IS NULL;

ALTER TABLE public.security_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_activity_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_alert_inbox ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.security_audit_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.security_activity_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.security_alert_inbox FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.security_audit_events TO authenticated;
GRANT SELECT ON public.security_activity_sessions TO authenticated;
GRANT SELECT, UPDATE ON public.security_alert_inbox TO authenticated;

DROP POLICY IF EXISTS security_events_select_super_admin ON public.security_audit_events;
CREATE POLICY security_events_select_super_admin
  ON public.security_audit_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS security_sessions_select_super_admin ON public.security_activity_sessions;
CREATE POLICY security_sessions_select_super_admin
  ON public.security_activity_sessions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS security_alerts_select_super_admin ON public.security_alert_inbox;
CREATE POLICY security_alerts_select_super_admin
  ON public.security_alert_inbox FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS security_alerts_ack_super_admin ON public.security_alert_inbox;
CREATE POLICY security_alerts_ack_super_admin
  ON public.security_alert_inbox FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE OR REPLACE FUNCTION public.security_strip_secrets(p jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p, '{}'::jsonb)
    - ARRAY[
      'password', 'token', 'secret', 'authorization', 'api_key', 'apikey',
      'private_key', 'service_role', 'access_token', 'refresh_token',
      'cookie', 'cookies', 'ssh_key', 'credential'
    ];
$$;

CREATE OR REPLACE FUNCTION public.security_maybe_alert(p_event public.security_audit_events)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_event.severity IN ('high', 'critical')
     OR p_event.event_type IN ('login_failed', 'ssh_login_success', 'ssh_login_failed', 'deploy', 'unauthorized_page')
     OR (p_event.actor_role = 'super_admin' AND p_event.event_type = 'login_success') THEN
    INSERT INTO public.security_alert_inbox (event_id, title, body, severity)
    VALUES (
      p_event.id,
      COALESCE(p_event.action_label, p_event.event_type),
      concat_ws(' · ', p_event.source, p_event.actor_email, p_event.outcome),
      p_event.severity
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.security_insert_event(
  p_source text,
  p_event_type text,
  p_actor_user_id uuid DEFAULT NULL,
  p_actor_email text DEFAULT NULL,
  p_actor_role text DEFAULT NULL,
  p_company_name text DEFAULT NULL,
  p_identity_status text DEFAULT 'unidentified',
  p_outcome text DEFAULT 'unknown',
  p_action_label text DEFAULT '',
  p_result_label text DEFAULT '',
  p_session_id uuid DEFAULT NULL,
  p_active_ms bigint DEFAULT NULL,
  p_ip_address text DEFAULT NULL,
  p_device_summary text DEFAULT NULL,
  p_severity text DEFAULT 'info',
  p_source_ref text DEFAULT NULL,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_row public.security_audit_events;
BEGIN
  INSERT INTO public.security_audit_events (
    source, event_type, actor_user_id, actor_email, actor_role, company_name,
    identity_status, outcome, action_label, result_label, session_id, active_ms,
    ip_address, device_summary, severity, source_ref, details
  ) VALUES (
    p_source, p_event_type, p_actor_user_id, p_actor_email, p_actor_role, p_company_name,
    p_identity_status, p_outcome, p_action_label, p_result_label, p_session_id, p_active_ms,
    p_ip_address, p_device_summary, p_severity, p_source_ref,
    public.security_strip_secrets(p_details)
  )
  RETURNING * INTO v_row;
  v_id := v_row.id;
  PERFORM public.security_maybe_alert(v_row);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.security_start_session(p_device_summary text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_role text;
  v_company text;
  v_email text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT ur.role::text INTO v_role FROM public.user_roles ur WHERE ur.user_id = v_uid LIMIT 1;
  SELECT p.company_name, COALESCE(p.contact_email, auth.jwt() ->> 'email')
    INTO v_company, v_email
  FROM public.profiles p WHERE p.id = v_uid;

  INSERT INTO public.security_activity_sessions (user_id, device_summary)
  VALUES (v_uid, p_device_summary)
  RETURNING id INTO v_id;

  PERFORM public.security_insert_event(
    'app', 'session_start', v_uid, v_email, COALESCE(v_role, 'other'), v_company,
    'identified', 'success', 'התחלת Session', 'הצליח', v_id, 0,
    NULL, p_device_summary, 'info', NULL,
    jsonb_build_object('kind', 'session_start')
  );
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.security_heartbeat(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.security_activity_sessions;
  v_delta bigint;
  v_add bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_row
  FROM public.security_activity_sessions
  WHERE id = p_session_id AND user_id = v_uid AND is_open = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'session_not_open');
  END IF;

  v_delta := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - v_row.last_heartbeat_at)) * 1000));
  -- Cap a single heartbeat so an idle/open tab does not accumulate hours.
  v_add := LEAST(v_delta, 90000);

  UPDATE public.security_activity_sessions
  SET last_heartbeat_at = now(),
      last_activity_at = now(),
      accumulated_active_ms = accumulated_active_ms + v_add
  WHERE id = p_session_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'ok', true,
    'accumulated_active_ms', v_row.accumulated_active_ms,
    'added_ms', v_add
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.security_end_session(p_session_id uuid, p_reason text DEFAULT 'logout')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.security_activity_sessions;
  v_role text;
  v_company text;
  v_email text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  UPDATE public.security_activity_sessions
  SET is_open = false,
      ended_at = now(),
      end_reason = COALESCE(p_reason, 'logout'),
      last_activity_at = now()
  WHERE id = p_session_id AND user_id = v_uid AND is_open = true
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT ur.role::text INTO v_role FROM public.user_roles ur WHERE ur.user_id = v_uid LIMIT 1;
  SELECT p.company_name, COALESCE(p.contact_email, auth.jwt() ->> 'email')
    INTO v_company, v_email FROM public.profiles p WHERE p.id = v_uid;

  PERFORM public.security_insert_event(
    'app', 'session_end', v_uid, v_email, COALESCE(v_role, 'other'), v_company,
    'identified', 'success', 'סיום Session', 'הצליח', v_row.id, v_row.accumulated_active_ms,
    NULL, v_row.device_summary, 'info', NULL,
    jsonb_build_object('reason', COALESCE(p_reason, 'logout'))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.security_record_client_event(
  p_event_type text,
  p_outcome text DEFAULT 'success',
  p_action_label text DEFAULT '',
  p_result_label text DEFAULT '',
  p_session_id uuid DEFAULT NULL,
  p_device_summary text DEFAULT NULL,
  p_severity text DEFAULT 'info',
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_company text;
  v_email text;
  v_allowed text[] := ARRAY[
    'unauthorized_page', 'forbidden_action', 'session_invalid', 'heartbeat'
  ];
  v_active bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT (p_event_type = ANY (v_allowed)) THEN
    RAISE EXCEPTION 'event type not allowed from client';
  END IF;

  SELECT ur.role::text INTO v_role FROM public.user_roles ur WHERE ur.user_id = v_uid LIMIT 1;
  SELECT p.company_name, COALESCE(p.contact_email, auth.jwt() ->> 'email')
    INTO v_company, v_email FROM public.profiles p WHERE p.id = v_uid;
  SELECT s.accumulated_active_ms INTO v_active
  FROM public.security_activity_sessions s
  WHERE s.id = p_session_id AND s.user_id = v_uid;

  RETURN public.security_insert_event(
    'app', p_event_type, v_uid, v_email, COALESCE(v_role, 'other'), v_company,
    'identified', p_outcome, p_action_label, p_result_label, p_session_id, v_active,
    NULL, p_device_summary,
    CASE WHEN p_event_type IN ('unauthorized_page', 'forbidden_action') THEN 'high' ELSE p_severity END,
    NULL, p_details
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.security_record_anon_event(
  p_event_type text,
  p_actor_email text DEFAULT NULL,
  p_action_label text DEFAULT '',
  p_result_label text DEFAULT '',
  p_device_summary text DEFAULT NULL,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed text[] := ARRAY['login_failed', 'unauthorized_anonymous', 'invalid_token'];
BEGIN
  IF NOT (p_event_type = ANY (v_allowed)) THEN
    RAISE EXCEPTION 'anonymous event type not allowed';
  END IF;
  RETURN public.security_insert_event(
    'app', p_event_type, NULL, NULLIF(trim(p_actor_email), ''),
    'unidentified', NULL, 'unidentified', 'failure',
    p_action_label, p_result_label, NULL, NULL, NULL, p_device_summary,
    'warning', NULL, p_details
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.security_ingest_external(
  p_source text,
  p_event_type text,
  p_action_label text,
  p_result_label text,
  p_outcome text DEFAULT 'unknown',
  p_identity_status text DEFAULT 'identity_unavailable',
  p_severity text DEFAULT 'info',
  p_source_ref text DEFAULT NULL,
  p_ip_address text DEFAULT NULL,
  p_device_summary text DEFAULT NULL,
  p_actor_email text DEFAULT NULL,
  p_actor_role text DEFAULT NULL,
  p_occurred_at timestamptz DEFAULT now(),
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_row public.security_audit_events;
BEGIN
  IF p_source NOT IN ('github', 'supabase', 'hostinger_vps') THEN
    RAISE EXCEPTION 'invalid external source';
  END IF;

  INSERT INTO public.security_audit_events (
    occurred_at, source, event_type, actor_email, actor_role,
    identity_status, outcome, action_label, result_label,
    ip_address, device_summary, severity, source_ref, details
  ) VALUES (
    COALESCE(p_occurred_at, now()), p_source, p_event_type, p_actor_email, p_actor_role,
    p_identity_status, p_outcome, p_action_label, p_result_label,
    p_ip_address, p_device_summary, p_severity, p_source_ref,
    public.security_strip_secrets(p_details)
  )
  RETURNING * INTO v_row;
  v_id := v_row.id;
  PERFORM public.security_maybe_alert(v_row);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.security_dashboard_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day timestamptz := date_trunc('day', now());
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN jsonb_build_object(
    'active_now', (
      SELECT count(*) FROM public.security_activity_sessions
      WHERE is_open AND last_heartbeat_at > now() - interval '3 minutes'
    ),
    'logins_today', (
      SELECT count(*) FROM public.security_audit_events
      WHERE occurred_at >= v_day AND event_type = 'login_success' AND outcome = 'success'
    ),
    'unique_users_today', (
      SELECT count(DISTINCT actor_user_id) FROM public.security_audit_events
      WHERE occurred_at >= v_day AND actor_user_id IS NOT NULL
    ),
    'failed_logins_today', (
      SELECT count(*) FROM public.security_audit_events
      WHERE occurred_at >= v_day AND event_type IN ('login_failed', 'otp_failed')
    ),
    'unidentified_today', (
      SELECT count(*) FROM public.security_audit_events
      WHERE occurred_at >= v_day AND identity_status = 'unidentified'
    ),
    'security_alerts_open', (
      SELECT count(*) FROM public.security_alert_inbox WHERE acknowledged_at IS NULL
    ),
    'github_today', (
      SELECT count(*) FROM public.security_audit_events
      WHERE occurred_at >= v_day AND source = 'github'
    ),
    'supabase_today', (
      SELECT count(*) FROM public.security_audit_events
      WHERE occurred_at >= v_day AND source = 'supabase'
    ),
    'vps_today', (
      SELECT count(*) FROM public.security_audit_events
      WHERE occurred_at >= v_day AND source = 'hostinger_vps'
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_auth_audit_to_security()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_company text;
  v_identity text;
  v_action text;
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    SELECT ur.role::text INTO v_role FROM public.user_roles ur WHERE ur.user_id = NEW.user_id LIMIT 1;
    SELECT p.company_name INTO v_company FROM public.profiles p WHERE p.id = NEW.user_id;
    v_identity := 'identified';
  ELSE
    v_identity := 'unidentified';
    v_role := 'unidentified';
  END IF;

  v_action := CASE NEW.event_type
    WHEN 'login_success' THEN 'התחברות הצליחה'
    WHEN 'login_failed' THEN 'התחברות נכשלה'
    WHEN 'otp_failed' THEN 'קוד OTP נכשל'
    WHEN 'otp_verified' THEN 'קוד OTP אומת'
    WHEN 'otp_sent' THEN 'נשלח OTP'
    WHEN 'account_locked' THEN 'חשבון ננעל'
    WHEN 'password_reset_completed' THEN 'איפוס סיסמה'
    ELSE NEW.event_type::text
  END;

  PERFORM public.security_insert_event(
    'app',
    NEW.event_type::text,
    NEW.user_id,
    NEW.email,
    COALESCE(v_role, 'other'),
    v_company,
    v_identity,
    CASE WHEN NEW.success THEN 'success' ELSE 'failure' END,
    v_action,
    CASE WHEN NEW.success THEN 'הצליח' ELSE 'נכשל' END,
    NULL, NULL, NEW.ip_address,
    left(COALESCE(NEW.user_agent, ''), 80),
    CASE WHEN NEW.success THEN 'info' ELSE 'warning' END,
    NEW.id::text,
    COALESCE(NEW.details, '{}'::jsonb)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auth_audit_to_security ON public.auth_audit_log;
CREATE TRIGGER trg_auth_audit_to_security
  AFTER INSERT ON public.auth_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_auth_audit_to_security();

GRANT EXECUTE ON FUNCTION public.security_start_session(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.security_heartbeat(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.security_end_session(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.security_record_client_event(text, text, text, text, uuid, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.security_record_anon_event(text, text, text, text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.security_dashboard_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.security_ingest_external(text, text, text, text, text, text, text, text, text, text, text, text, timestamptz, jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.security_ingest_external(text, text, text, text, text, text, text, text, text, text, text, text, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.security_insert_event(text, text, uuid, text, text, text, text, text, text, text, uuid, bigint, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
