-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Engine control (audit 19.10.2026 recommendations):
--  * a switch per engine + one emergency stop ("all"); every scheduled job checks its own switch. A stopped engine
--    finishes the call already running and starts nothing new; progress (cursor / queue status / ind_at / lead_checked_at)
--    is kept, so switching it back on continues from the same point. The older switches (running / enrich_running) keep
--    working as before.
--  * heartbeats: the cloud engine records the last success / error of each action
--  * watchdog every 5 minutes: an enabled engine that has work but no success for 15 minutes (classifier, fleet, caches by
--    their own schedule) opens an alert; also database size near the guard and a high CPU-cutoff rate. Open alerts show as
--    a red banner in the registry screen and are written once to nr_events. (No e-mail / push: that would need a paid or
--    external sender – not added.)
--  * scheduler log (cron.job_run_details) of the registry jobs is kept 7 days (daily cleanup). Rows of other systems'
--    jobs (claims, drivers …) are not touched.
-- Nothing of the business data is deleted; no cost.

ALTER TABLE public.nr_control ADD COLUMN IF NOT EXISTS engines jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.nr_engine_beats (
  engine text PRIMARY KEY,
  last_ok timestamptz, last_err timestamptz, last_err_msg text,
  ok_count bigint NOT NULL DEFAULT 0, err_count bigint NOT NULL DEFAULT 0
);
ALTER TABLE public.nr_engine_beats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nr_engine_beats FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.nr_alerts (
  key text PRIMARY KEY,
  level text NOT NULL,            -- critical / warn
  title text NOT NULL,
  detail text,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
ALTER TABLE public.nr_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nr_alerts FROM anon, authenticated;

-- the engines and what each switch covers
CREATE OR REPLACE FUNCTION public.nr_engine_list() RETURNS TABLE(engine text, label text, covers text, sort int)
LANGUAGE sql IMMUTABLE AS $$
  VALUES ('collector', 'איסוף ממאגרים רשמיים', 'data.gov.il, GIS עירוני, OpenStreetMap (nr-collector-tick)', 10),
         ('identify', 'זיהוי אתרים ועסקים חדשים', '10 עובדי זיהוי + מזין התור מ-Common Crawl (nr-identify-1..10, nr-feeder)', 20),
         ('deep', 'סריקת עומק באתרי החברות', 'פרטי קשר, אנשי קשר, צי רכב, גיוס וקשרים (nr-deep-2 ובתוך ההעשרה)', 30),
         ('enrich', 'העשרה', 'Wikidata, אתר מדומיין אימייל, RSS, מכרזים והתקשרויות (nr-enrich-tick)', 40),
         ('watch', 'מעקב אחר חברות', 'בדיקת חברות שסומנו למעקב (בתוך ההעשרה)', 50),
         ('classify', 'סיווג ענפים ומקצועות', 'nr-classify', 60),
         ('fleet', 'פוטנציאל צי רכב', 'nr-fleet-refresh, nr-fleet-refresh-full', 70),
         ('leads', 'סינון 7 הכללים והזרמת לידים', 'nr-leads, nr-lead-tidy', 80),
         ('caches', 'דוחות, מטמונים ודגלי סינון', 'nr-industry-summary, nr-leads-cache, nr-refresh-facets, nr-refresh-flags, nr-enrich-flags', 90),
         ('maintenance', 'תחזוקה יומית ושבועית', 'nr-enrich-weekly, nr-osm-daily-retry, nr-source-discovery, nr-cron-log-cleanup', 100);
$$;

-- is an engine switched on? (missing = on; "all" = emergency stop of everything)
CREATE OR REPLACE FUNCTION public.nr_engine_on(p_engine text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((engines->>'all')::boolean, true) AND coalesce((engines->>p_engine)::boolean, true)
    FROM public.nr_control WHERE id = 1;
$$;
GRANT EXECUTE ON FUNCTION public.nr_engine_on(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.nr_beat(p_engine text, p_ok boolean, p_msg text DEFAULT NULL) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.nr_engine_beats (engine, last_ok, last_err, last_err_msg, ok_count, err_count)
  VALUES (p_engine, CASE WHEN p_ok THEN now() END, CASE WHEN NOT p_ok THEN now() END, CASE WHEN NOT p_ok THEN left(p_msg, 300) END,
          CASE WHEN p_ok THEN 1 ELSE 0 END, CASE WHEN p_ok THEN 0 ELSE 1 END)
  ON CONFLICT (engine) DO UPDATE SET
    last_ok = CASE WHEN p_ok THEN now() ELSE nr_engine_beats.last_ok END,
    last_err = CASE WHEN NOT p_ok THEN now() ELSE nr_engine_beats.last_err END,
    last_err_msg = CASE WHEN NOT p_ok THEN left(p_msg, 300) ELSE nr_engine_beats.last_err_msg END,
    ok_count = nr_engine_beats.ok_count + CASE WHEN p_ok THEN 1 ELSE 0 END,
    err_count = nr_engine_beats.err_count + CASE WHEN p_ok THEN 0 ELSE 1 END;
$$;
REVOKE ALL ON FUNCTION public.nr_beat(text, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nr_beat(text, boolean, text) TO service_role;

-- switch one engine, or "all" (emergency stop / start). Only users allowed to control collection.
CREATE OR REPLACE FUNCTION public.nr_set_engine(p_engine text, p_on boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.nr_can_control() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_engine <> 'all' AND NOT EXISTS (SELECT 1 FROM public.nr_engine_list() e WHERE e.engine = p_engine) THEN RAISE EXCEPTION 'unknown engine %', p_engine; END IF;
  UPDATE public.nr_control SET engines = CASE WHEN p_engine = 'all' AND p_on
                                              THEN '{}'::jsonb            -- "start all" clears every individual stop
                                              ELSE engines || jsonb_build_object(p_engine, p_on) END,
         updated_at = now(), updated_by = auth.uid()
   WHERE id = 1 RETURNING engines INTO v;
  INSERT INTO public.nr_events (level, source_key, message, data)
  VALUES ('info', NULL, CASE WHEN p_engine = 'all' THEN (CASE WHEN p_on THEN 'כל המנועים הופעלו מחדש' ELSE 'עצירת חירום – כל המנועים נעצרו' END)
                             ELSE format('מנוע "%s" %s', (SELECT label FROM public.nr_engine_list() e WHERE e.engine = p_engine), CASE WHEN p_on THEN 'הופעל' ELSE 'נעצר' END) END,
          jsonb_build_object('engine', p_engine, 'on', p_on, 'by', auth.uid()));
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.nr_set_engine(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nr_set_engine(text, boolean) TO authenticated, service_role;

-- last successful run of a scheduled SQL job
CREATE OR REPLACE FUNCTION public.nr_job_last_ok(p_jobs text[]) RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, cron AS $$
  SELECT max(d.end_time) FROM cron.job_run_details d JOIN cron.job j ON j.jobid = d.jobid
   WHERE j.jobname = ANY(p_jobs) AND d.status = 'succeeded' AND d.start_time > now() - interval '2 days';
$$;

-- engine status: switch, has work, last success, last error (shared by the watchdog and the control panel)
CREATE OR REPLACE FUNCTION public.nr_engine_status() RETURNS TABLE(engine text, label text, covers text, sort int, enabled boolean, legacy_on boolean,
  has_work boolean, last_ok timestamptz, last_err timestamptz, last_err_msg text, stale_after interval)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, cron AS $$
DECLARE c public.nr_control;
BEGIN
  SELECT * INTO c FROM public.nr_control WHERE id = 1;
  RETURN QUERY
  SELECT e.engine, e.label, e.covers, e.sort, public.nr_engine_on(e.engine),
         CASE WHEN e.engine = 'collector' THEN c.running
              WHEN e.engine IN ('identify', 'deep', 'enrich', 'watch', 'leads') THEN c.enrich_running ELSE true END,
         CASE e.engine
           WHEN 'collector' THEN public.nr_has_work()
           WHEN 'identify' THEN EXISTS (SELECT 1 FROM public.nr_site_queue q WHERE q.status = 'queued')
           WHEN 'deep' THEN EXISTS (SELECT 1 FROM public.nr_businesses b WHERE b.website IS NOT NULL AND b.enr_site_checked_at IS NULL)
           WHEN 'enrich' THEN public.nr_enrich_has_work()
           WHEN 'leads' THEN EXISTS (SELECT 1 FROM public.nr_businesses b WHERE b.fleet_level IS NOT NULL AND b.lead_checked_at IS NULL)
           WHEN 'watch' THEN EXISTS (SELECT 1 FROM public.nr_watch)
           ELSE true END,
         CASE WHEN e.engine IN ('identify', 'deep', 'enrich', 'leads', 'watch') THEN bt.last_ok
              WHEN e.engine = 'collector' THEN (SELECT max(r.finished_at) FROM public.nr_runs r WHERE r.ok AND r.source_key NOT LIKE 'enr:%' AND r.started_at > now() - interval '2 days')
              WHEN e.engine = 'classify' THEN public.nr_job_last_ok(ARRAY['nr-classify'])
              WHEN e.engine = 'fleet' THEN public.nr_job_last_ok(ARRAY['nr-fleet-refresh', 'nr-fleet-refresh-full'])
              WHEN e.engine = 'caches' THEN public.nr_job_last_ok(ARRAY['nr-industry-summary', 'nr-leads-cache', 'nr-refresh-facets'])
              ELSE public.nr_job_last_ok(ARRAY['nr-enrich-weekly', 'nr-osm-daily-retry', 'nr-source-discovery', 'nr-cron-log-cleanup']) END,
         bt.last_err, bt.last_err_msg,
         CASE e.engine WHEN 'fleet' THEN interval '75 minutes' WHEN 'caches' THEN interval '75 minutes' WHEN 'watch' THEN interval '30 hours'
                       WHEN 'maintenance' THEN interval '8 days' ELSE interval '15 minutes' END
    FROM public.nr_engine_list() e LEFT JOIN public.nr_engine_beats bt ON bt.engine = e.engine;
END;
$$;
REVOKE ALL ON FUNCTION public.nr_engine_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nr_engine_status() TO service_role;

-- watchdog: open / refresh / resolve alerts
CREATE OR REPLACE FUNCTION public.nr_watchdog() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, net AS $$
DECLARE r record; v_now timestamptz := now(); v_keys text[] := '{}'; v_mb int; v_max int; v_calls int; v_cut int; v_new int := 0;
BEGIN
  -- an engine switched off on purpose (its own switch or the emergency stop) never counts as stalled; its alert resolves
  FOR r IN SELECT * FROM public.nr_engine_status() LOOP
    IF r.enabled AND r.legacy_on AND r.has_work AND (r.last_ok IS NULL OR r.last_ok < v_now - r.stale_after) THEN
      v_keys := v_keys || ('stalled:' || r.engine);
      INSERT INTO public.nr_alerts (key, level, title, detail, first_seen, last_seen)
      VALUES ('stalled:' || r.engine, CASE WHEN r.engine IN ('identify', 'leads', 'collector') THEN 'critical' ELSE 'warn' END,
              format('המנוע "%s" לא הצליח %s', r.label, CASE WHEN r.last_ok IS NULL THEN 'מאז הפעלת המעקב' ELSE 'מאז ' || to_char(r.last_ok AT TIME ZONE 'Asia/Jerusalem', 'DD.MM HH24:MI') END),
              coalesce('שגיאה אחרונה: ' || r.last_err_msg, 'יש עבודה ממתינה, המתג פעיל, ואין ריצה מוצלחת ב-' || r.stale_after), v_now, v_now)
      ON CONFLICT (key) DO UPDATE SET last_seen = v_now, detail = EXCLUDED.detail, title = EXCLUDED.title,
        level = EXCLUDED.level, resolved_at = NULL,
        first_seen = CASE WHEN nr_alerts.resolved_at IS NOT NULL THEN v_now ELSE nr_alerts.first_seen END;
    END IF;
  END LOOP;
  -- database size against the collection guard
  SELECT pg_database_size(current_database()) / 1048576, max_db_mb INTO v_mb, v_max FROM public.nr_control WHERE id = 1;
  IF v_mb >= v_max * 0.85 THEN
    v_keys := v_keys || 'db_size'::text;
    INSERT INTO public.nr_alerts (key, level, title, detail) VALUES ('db_size', CASE WHEN v_mb >= v_max * 0.95 THEN 'critical' ELSE 'warn' END,
      format('נפח מסד הנתונים %s MB – %s%% מתקרת האיסוף (%s MB)', v_mb, round(100.0 * v_mb / v_max), v_max),
      'בתקרה נעצר האיסוף ממאגרים רשמיים. הדיסק הכלול בתוכנית: 8GB (מסד + יומן + מערכת).')
    ON CONFLICT (key) DO UPDATE SET last_seen = v_now, title = EXCLUDED.title, level = EXCLUDED.level, resolved_at = NULL,
      first_seen = CASE WHEN nr_alerts.resolved_at IS NOT NULL THEN v_now ELSE nr_alerts.first_seen END;
  END IF;
  -- CPU cut-offs of the cloud calls in the last 15 minutes
  SELECT count(*), count(*) FILTER (WHERE status_code = 546) INTO v_calls, v_cut FROM net._http_response WHERE created > v_now - interval '15 minutes';
  IF v_calls >= 40 AND v_cut > v_calls * 0.2 THEN
    v_keys := v_keys || 'cpu_cut'::text;
    INSERT INTO public.nr_alerts (key, level, title, detail) VALUES ('cpu_cut', 'warn',
      format('%s מתוך %s קריאות שרת נקטעו במגבלת המעבד ב-15 הדקות האחרונות', v_cut, v_calls), 'העבודה חוזרת לתור, אבל הקצב יורד.')
    ON CONFLICT (key) DO UPDATE SET last_seen = v_now, title = EXCLUDED.title, resolved_at = NULL,
      first_seen = CASE WHEN nr_alerts.resolved_at IS NOT NULL THEN v_now ELSE nr_alerts.first_seen END;
  END IF;
  -- newly opened alerts go to the event log once
  INSERT INTO public.nr_events (level, source_key, message, data)
  SELECT CASE a.level WHEN 'critical' THEN 'error' ELSE 'warn' END, NULL, '🚨 ' || a.title, jsonb_build_object('alert', a.key, 'detail', a.detail)
    FROM public.nr_alerts a WHERE a.key = ANY(v_keys) AND a.first_seen = v_now;
  GET DIAGNOSTICS v_new = ROW_COUNT;
  UPDATE public.nr_alerts SET resolved_at = v_now WHERE resolved_at IS NULL AND NOT (key = ANY(v_keys));
  RETURN jsonb_build_object('open', (SELECT count(*) FROM public.nr_alerts WHERE resolved_at IS NULL), 'new', v_new);
END;
$$;
REVOKE ALL ON FUNCTION public.nr_watchdog() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nr_watchdog() TO service_role;

-- the control panel for the screen
CREATE OR REPLACE FUNCTION public.nr_control_panel() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, net AS $$
BEGIN
  IF NOT public.nr_can_read() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN jsonb_build_object(
    'engines', (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.sort) FROM public.nr_engine_status() s),
    'emergency_stop', NOT coalesce((SELECT (engines->>'all')::boolean FROM public.nr_control WHERE id = 1), true),
    'can_control', public.nr_can_control(),
    'alerts', (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.resolved_at IS NULL DESC, a.level, a.last_seen DESC), '[]') FROM
                 (SELECT * FROM public.nr_alerts WHERE resolved_at IS NULL OR resolved_at > now() - interval '24 hours' ORDER BY last_seen DESC LIMIT 30) a),
    'db_mb', pg_database_size(current_database()) / 1048576,
    'max_db_mb', (SELECT max_db_mb FROM public.nr_control WHERE id = 1),
    'edge_calls_hour', (SELECT count(*) FROM net._http_response WHERE created > now() - interval '1 hour'),
    'edge_cut_hour', (SELECT count(*) FROM net._http_response WHERE created > now() - interval '1 hour' AND status_code = 546),
    'edge_err_hour', (SELECT count(*) FROM net._http_response WHERE created > now() - interval '1 hour' AND coalesce(status_code, 0) NOT IN (200, 546)),
    'watchdog_at', public.nr_job_last_ok(ARRAY['nr-watchdog']),
    'at', now());
END;
$$;
REVOKE ALL ON FUNCTION public.nr_control_panel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nr_control_panel() TO authenticated, service_role;

-- open alerts only (light call for the banner shown on every registry screen)
CREATE OR REPLACE FUNCTION public.nr_open_alerts() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.nr_can_read() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('key', key, 'level', level, 'title', title, 'detail', detail, 'since', first_seen) ORDER BY level, first_seen), '[]')
            FROM public.nr_alerts WHERE resolved_at IS NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.nr_open_alerts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nr_open_alerts() TO authenticated, service_role;

-- ── every scheduled job checks its engine switch ──
DO $$
DECLARE r record; v_engine text; v_cmd text;
BEGIN
  FOR r IN SELECT jobid, jobname, command FROM cron.job WHERE jobname LIKE 'nr-%' LOOP
    v_engine := CASE
      WHEN r.jobname = 'nr-collector-tick' THEN 'collector'
      WHEN r.jobname LIKE 'nr-identify-%' OR r.jobname = 'nr-feeder' THEN 'identify'
      WHEN r.jobname = 'nr-deep-2' THEN 'deep'
      WHEN r.jobname = 'nr-enrich-tick' THEN 'enrich'
      WHEN r.jobname = 'nr-classify' THEN 'classify'
      WHEN r.jobname LIKE 'nr-fleet-refresh%' THEN 'fleet'
      WHEN r.jobname IN ('nr-leads', 'nr-lead-tidy') THEN 'leads'
      WHEN r.jobname IN ('nr-industry-summary', 'nr-leads-cache', 'nr-refresh-facets', 'nr-refresh-flags', 'nr-enrich-flags') THEN 'caches'
      WHEN r.jobname IN ('nr-enrich-weekly', 'nr-osm-daily-retry', 'nr-source-discovery') THEN 'maintenance'
      END;
    CONTINUE WHEN v_engine IS NULL OR position('nr_engine_on' IN r.command) > 0;
    IF position('net.http_post' IN r.command) > 0 THEN
      -- edge calls: add the switch to the WHERE clause (or add one)
      v_cmd := CASE WHEN r.command ~* '\)\s*where\s'
                    THEN regexp_replace(r.command, '\)(\s*)where(\s)', ')\1where public.nr_engine_on(''' || v_engine || ''') and\2', 'i')
                    ELSE regexp_replace(r.command, '\s*$', '') || ' where public.nr_engine_on(''' || v_engine || ''')' END;
    ELSE
      -- SQL jobs: run only when switched on (a DO block keeps multi-statement commands together)
      v_cmd := format('DO $job$ BEGIN IF public.nr_engine_on(%L) THEN PERFORM 1; %s END IF; END $job$',
                      v_engine, regexp_replace(regexp_replace(btrim(r.command), '(^|;)\s*select\s', '\1 PERFORM ', 'gi'), ';?\s*$', ';'));
    END IF;
    PERFORM cron.alter_job(r.jobid, command := v_cmd);
  END LOOP;
END $$;

-- watchdog + scheduler-log retention (registry jobs only)
DO $$ BEGIN PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('nr-watchdog', 'nr-cron-log-cleanup'); END $$;
SELECT cron.schedule('nr-watchdog', '*/5 * * * *', $cmd$ select public.nr_watchdog() $cmd$);
SELECT cron.schedule('nr-cron-log-cleanup', '10 3 * * *', $cmd$
  DO $job$ BEGIN IF public.nr_engine_on('maintenance') THEN
    DELETE FROM cron.job_run_details d USING cron.job j
     WHERE d.jobid = j.jobid AND j.jobname LIKE 'nr-%' AND d.end_time < now() - interval '7 days';
  END IF; END $job$
$cmd$);

SELECT jobname, left(command, 160) cmd FROM cron.job WHERE jobname LIKE 'nr-%' ORDER BY jobname;
