-- Oren Car / Staging ONLY. Identity enrichment for security control center.
-- Do NOT apply to Production.

ALTER TABLE public.security_audit_events
  ADD COLUMN IF NOT EXISTS actor_username text,
  ADD COLUMN IF NOT EXISTS access_kind text,
  ADD COLUMN IF NOT EXISTS tool_name text,
  ADD COLUMN IF NOT EXISTS object_type text,
  ADD COLUMN IF NOT EXISTS ssh_fingerprint text,
  ADD COLUMN IF NOT EXISTS auth_method text;

CREATE INDEX IF NOT EXISTS security_audit_events_username_idx
  ON public.security_audit_events (actor_username, occurred_at DESC);
CREATE INDEX IF NOT EXISTS security_audit_events_session_idx
  ON public.security_audit_events (session_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.security_known_access_keys (
  fingerprint text PRIMARY KEY,
  tool_name text NOT NULL,
  access_kind text NOT NULL,
  proof_note text NOT NULL
);

REVOKE ALL ON public.security_known_access_keys FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.security_known_access_keys TO authenticated;
ALTER TABLE public.security_known_access_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS security_known_keys_select_super_admin ON public.security_known_access_keys;
CREATE POLICY security_known_keys_select_super_admin
  ON public.security_known_access_keys FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

INSERT INTO public.security_known_access_keys (fingerprint, tool_name, access_kind, proof_note)
VALUES
  (
    'SHA256:Ji7fUE2KcaJyxEhnHse0EqmL97LuuBuaOERJl+xtE4c',
    'Cursor/Cross',
    'cursor_cross',
    'authorized_keys comment cursor-dalia-vps'
  ),
  (
    'SHA256:LtTQ3mIOtB/Ke4iQAaXflVsDj5ONGo7uufDpCoEaIB8',
    'GitHub Actions',
    'github_actions',
    'authorized_keys comment github-actions-dalia-deploy'
  ),
  (
    'SHA256:XnB8FObo7yCVur0upE0kx2ILLOsPtVU4PD/PKH0rWsw',
    'GitHub Actions',
    'github_actions',
    'authorized_keys comment github-actions-deploy'
  )
ON CONFLICT (fingerprint) DO UPDATE
SET tool_name = EXCLUDED.tool_name,
    access_kind = EXCLUDED.access_kind,
    proof_note = EXCLUDED.proof_note;

CREATE OR REPLACE FUNCTION public.security_classify_github_actor(p_login text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text := lower(coalesce(p_login, ''));
BEGIN
  IF v = '' THEN
    RETURN jsonb_build_object('access_kind', 'unidentified', 'tool_name', 'לא מזוהה');
  END IF;
  IF v IN ('github-actions[bot]', 'github-actions') OR v LIKE '%github-actions%' THEN
    RETURN jsonb_build_object('access_kind', 'github_actions', 'tool_name', 'GitHub Actions');
  END IF;
  IF v IN ('cursor[bot]', 'cursoragent') OR v LIKE 'cursor%[bot]' THEN
    RETURN jsonb_build_object('access_kind', 'cursor_cross', 'tool_name', 'Cursor/Cross');
  END IF;
  IF v LIKE '%[bot]' OR v LIKE 'bot-%' THEN
    RETURN jsonb_build_object('access_kind', 'bot', 'tool_name', coalesce(p_login, 'Bot'));
  END IF;
  RETURN jsonb_build_object('access_kind', 'human', 'tool_name', 'GitHub user');
END;
$$;

CREATE OR REPLACE FUNCTION public.security_enrich_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_fp text;
  v_known public.security_known_access_keys%ROWTYPE;
  v_gh jsonb;
  v_login text;
BEGIN
  IF NEW.details ? 'actor' AND NEW.actor_username IS NULL THEN
    NEW.actor_username := NULLIF(NEW.details->>'actor', '');
  END IF;
  IF NEW.details ? 'ssh_user' AND NEW.actor_username IS NULL THEN
    NEW.actor_username := NULLIF(NEW.details->>'ssh_user', '');
  END IF;
  IF NEW.actor_username IS NULL AND NEW.actor_role LIKE 'ssh:%' THEN
    NEW.actor_username := substr(NEW.actor_role, 5);
  END IF;
  IF NEW.actor_email LIKE '%@users.noreply.github.com' THEN
    IF NEW.actor_username IS NULL THEN
      NEW.actor_username := split_part(NEW.actor_email, '@', 1);
    END IF;
    NEW.actor_email := NULL;
  END IF;

  v_fp := COALESCE(NEW.ssh_fingerprint, NEW.details->>'fingerprint', NEW.details->>'ssh_fingerprint');
  IF v_fp IS NULL AND NEW.source_ref LIKE 'SHA256:%' THEN
    v_fp := NEW.source_ref;
  END IF;
  NEW.ssh_fingerprint := v_fp;

  IF NEW.source = 'github' THEN
    v_login := COALESCE(NEW.actor_username, NEW.details->>'actor');
    v_gh := public.security_classify_github_actor(v_login);
    NEW.access_kind := COALESCE(NEW.access_kind, v_gh->>'access_kind');
    NEW.tool_name := COALESCE(NEW.tool_name, v_gh->>'tool_name');
    NEW.object_type := COALESCE(NEW.object_type, NEW.details->>'object_type', NEW.details->>'repo', 'repository');
    NEW.auth_method := COALESCE(NEW.auth_method, 'github');
    IF v_login IS NOT NULL AND v_login <> '' THEN
      NEW.identity_status := 'identified';
    ELSIF NEW.identity_status IS NULL THEN
      NEW.identity_status := 'identity_unavailable';
    END IF;
  ELSIF NEW.source = 'hostinger_vps' THEN
    NEW.object_type := COALESCE(NEW.object_type, 'ssh_session');
    NEW.auth_method := COALESCE(NEW.auth_method, NEW.device_summary, 'ssh');
    NEW.access_kind := COALESCE(NEW.access_kind, 'ssh');
    IF v_fp IS NOT NULL THEN
      SELECT * INTO v_known FROM public.security_known_access_keys k WHERE k.fingerprint = v_fp;
      IF FOUND THEN
        NEW.tool_name := v_known.tool_name;
        NEW.access_kind := v_known.access_kind;
      ELSE
        NEW.tool_name := COALESCE(NEW.tool_name, 'לא מזוהה');
      END IF;
    ELSE
      NEW.tool_name := COALESCE(NEW.tool_name, 'לא מזוהה');
    END IF;
  ELSIF NEW.source = 'app' THEN
    NEW.access_kind := COALESCE(NEW.access_kind, 'human');
    NEW.tool_name := COALESCE(NEW.tool_name, 'האפליקציה');
    NEW.object_type := COALESCE(NEW.object_type, NEW.details->>'object_type', NEW.details->>'path', 'app');
    NEW.auth_method := COALESCE(NEW.auth_method, 'session');
  ELSIF NEW.source = 'supabase' THEN
    NEW.access_kind := COALESCE(NEW.access_kind, 'api');
    NEW.tool_name := COALESCE(NEW.tool_name, 'Supabase');
    NEW.object_type := COALESCE(NEW.object_type, 'supabase');
    IF NEW.actor_username IS NULL AND NEW.actor_email IS NULL THEN
      NEW.identity_status := 'identity_unavailable';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_security_enrich_event ON public.security_audit_events;
CREATE TRIGGER trg_security_enrich_event
  BEFORE INSERT OR UPDATE OF details, source_ref, actor_email, actor_role, ssh_fingerprint
  ON public.security_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION public.security_enrich_event();

UPDATE public.security_audit_events SET details = details WHERE true;

CREATE OR REPLACE FUNCTION public.security_maybe_alert(p_event public.security_audit_events)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_event.severity IN ('high', 'critical')
     OR p_event.identity_status = 'unidentified'
     OR p_event.tool_name = 'לא מזוהה'
     OR p_event.event_type IN ('login_failed', 'ssh_login_success', 'ssh_login_failed', 'deploy', 'unauthorized_page')
     OR (p_event.actor_role = 'super_admin' AND p_event.event_type = 'login_success') THEN
    INSERT INTO public.security_alert_inbox (event_id, title, body, severity)
    VALUES (
      p_event.id,
      CASE
        WHEN p_event.identity_status = 'unidentified' THEN 'גישה לא מזוהה'
        WHEN p_event.tool_name = 'לא מזוהה' THEN 'גישה לא מזוהה'
        ELSE COALESCE(p_event.action_label, p_event.event_type)
      END,
      concat_ws(' · ', p_event.source, COALESCE(p_event.actor_username, p_event.actor_email), p_event.outcome),
      CASE
        WHEN p_event.identity_status = 'unidentified' THEN 'high'
        ELSE p_event.severity
      END
    );
  END IF;
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
      WHERE occurred_at >= v_day AND event_type IN ('login_failed', 'otp_failed', 'ssh_login_failed')
    ),
    'unidentified_today', (
      SELECT count(*) FROM public.security_audit_events
      WHERE occurred_at >= v_day
        AND (
          identity_status = 'unidentified'
          OR tool_name = 'לא מזוהה'
          OR (identity_status = 'identity_unavailable' AND actor_username IS NULL AND actor_email IS NULL)
        )
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
    'unauthorized_page', 'forbidden_action', 'session_invalid', 'heartbeat', 'page_view'
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

GRANT EXECUTE ON FUNCTION public.security_dashboard_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.security_record_client_event(text, text, text, text, uuid, text, text, jsonb) TO authenticated;
