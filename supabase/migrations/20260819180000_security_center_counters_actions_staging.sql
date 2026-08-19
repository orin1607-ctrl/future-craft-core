-- Oren Car / Staging ONLY. Distinct people vs tools vs unidentified review.
-- Do NOT apply to Production.

CREATE OR REPLACE FUNCTION public.security_dashboard_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day timestamptz := date_trunc('day', now());
  v_people int;
  v_tools int;
  v_unidentified int;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT count(DISTINCT user_id) INTO v_people
  FROM public.security_activity_sessions
  WHERE is_open AND last_heartbeat_at > now() - interval '3 minutes';

  SELECT count(DISTINCT tool_name) INTO v_tools
  FROM public.security_audit_events
  WHERE occurred_at > now() - interval '15 minutes'
    AND access_kind IN ('cursor_cross', 'claude_code', 'chatgpt', 'github_actions', 'automation')
    AND coalesce(tool_name, '') NOT IN ('', 'לא מזוהה');

  SELECT count(*) INTO v_unidentified
  FROM public.security_audit_events
  WHERE occurred_at >= v_day
    AND (
      identity_status = 'unidentified'
      OR tool_name = 'לא מזוהה'
      OR (identity_status = 'identity_unavailable' AND actor_username IS NULL AND actor_email IS NULL)
    );

  RETURN jsonb_build_object(
    'active_now', v_people,
    'active_people_now', v_people,
    'active_tools_now', v_tools,
    'unidentified_review', v_unidentified,
    'logins_today', (
      SELECT count(*) FROM public.security_audit_events
      WHERE occurred_at >= v_day AND event_type = 'login_success' AND outcome = 'success'
    ),
    'unique_users_today', (
      SELECT count(DISTINCT actor_user_id) FROM public.security_audit_events
      WHERE occurred_at >= v_day AND actor_user_id IS NOT NULL AND source = 'app'
    ),
    'failed_logins_today', (
      SELECT count(*) FROM public.security_audit_events
      WHERE occurred_at >= v_day AND event_type IN ('login_failed', 'otp_failed', 'ssh_login_failed')
    ),
    'unidentified_today', v_unidentified,
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
    'unauthorized_page', 'forbidden_action', 'session_invalid', 'heartbeat', 'page_view',
    'entity_create', 'entity_update', 'document_upload', 'document_view', 'document_download',
    'settings_change', 'user_change'
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
    NULL, public.security_strip_secrets(p_details)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.security_dashboard_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.security_record_client_event(text, text, text, text, uuid, text, text, jsonb) TO authenticated;
