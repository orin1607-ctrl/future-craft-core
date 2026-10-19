-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Scale-up: Israeli business websites from the Common Crawl web graph (open data) → identify each site against the existing
-- registry (ח.פ. on the site → phone / e-mail already known → exact registered name) and enrich that record; a business
-- without a public registry number is added only with a clear identity (stated name + Israeli phone + city/address or ח.פ.)
-- and no existing business with the same phone, domain or a similar name; anything doubtful goes to review.
-- Separate queue and separate parallel workers from the enrichment tick. Rollback boundary: nr_businesses.id > 539326
-- (19.10.2026 05:17 UTC); every addition carries source 'enr:site_identify'. Backup: nr_backup_20261019b.

CREATE TABLE IF NOT EXISTS public.nr_site_queue (
  domain text PRIMARY KEY,
  source text NOT NULL,
  priority int NOT NULL DEFAULT 100,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','claimed','matched','created','review','no_identity','not_business','parked','robots','unreachable','known','error')),
  business_id bigint REFERENCES public.nr_businesses(id) ON DELETE SET NULL,
  method text,
  note text,
  attempts int NOT NULL DEFAULT 0,
  queued_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  checked_at timestamptz
);
CREATE INDEX IF NOT EXISTS nr_site_queue_todo ON public.nr_site_queue (priority, queued_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS nr_site_queue_checked ON public.nr_site_queue (checked_at) WHERE checked_at IS NOT NULL;
ALTER TABLE public.nr_site_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS nr_site_queue_select ON public.nr_site_queue;
CREATE POLICY nr_site_queue_select ON public.nr_site_queue FOR SELECT TO authenticated USING (public.nr_can_read());
REVOKE ALL ON public.nr_site_queue FROM anon;

-- worker control: how many parallel identify workers are allowed (raised gradually) and a per-worker lock
ALTER TABLE public.nr_control
  ADD COLUMN IF NOT EXISTS identify_workers int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS identify_batch int NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS identify_locks jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.nr_identify_lock(p_worker int, p_seconds int) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ok boolean;
BEGIN
  UPDATE public.nr_control SET identify_locks = identify_locks || jsonb_build_object(p_worker::text, now() + make_interval(secs => p_seconds))
   WHERE id = 1 AND enrich_running AND p_worker <= identify_workers
     AND coalesce((identify_locks->>p_worker::text)::timestamptz, 'epoch') < now()
  RETURNING true INTO ok;
  RETURN coalesce(ok, false);
END;
$$;
CREATE OR REPLACE FUNCTION public.nr_identify_unlock(p_worker int) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.nr_control SET identify_locks = identify_locks - p_worker::text WHERE id = 1;
$$;

-- claim a batch; a claim left by a worker that died is taken again after 10 minutes (3 attempts max)
CREATE OR REPLACE FUNCTION public.nr_claim_site_queue(p_limit int) RETURNS TABLE(domain text, attempts int)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.nr_site_queue q SET status = 'claimed', claimed_at = now(), attempts = q.attempts + 1
   WHERE q.domain IN (SELECT x.domain FROM public.nr_site_queue x
                       WHERE x.status = 'queued' OR (x.status = 'claimed' AND x.claimed_at < now() - interval '10 minutes' AND x.attempts < 3)
                       ORDER BY x.priority, x.queued_at LIMIT p_limit FOR UPDATE SKIP LOCKED)
  RETURNING q.domain, q.attempts;
$$;

-- registry lookups used to identify a site (phones and e-mails are normalised as in nr_contact_points)
CREATE OR REPLACE FUNCTION public.nr_identify_lookup(p_domain text, p_phones text[], p_emails text[], p_reg_ids text[]) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_dom bigint; v_reg jsonb; v_ph jsonb; v_em jsonb;
BEGIN
  v_dom := public.nr_business_by_domain(p_domain);
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'reg_id', reg_id, 'name', name, 'website', website)), '[]') INTO v_reg
    FROM public.nr_businesses WHERE reg_id = ANY(coalesce(p_reg_ids, '{}'));
  SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('id', c.business_id, 'value', c.value)), '[]') INTO v_ph
    FROM public.nr_contact_points c WHERE c.kind = 'phone' AND c.value = ANY(coalesce(p_phones, '{}'));
  SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('id', c.business_id, 'value', c.value)), '[]') INTO v_em
    FROM public.nr_contact_points c WHERE c.kind = 'email' AND c.value = ANY(coalesce(p_emails, '{}'));
  RETURN jsonb_build_object('domain', v_dom, 'reg', v_reg, 'phones', v_ph, 'emails', v_em);
END;
$$;

-- names: exact registered name, or close names in the same city (for the review queue / duplicate guard)
CREATE OR REPLACE FUNCTION public.nr_identify_name(p_name text, p_city text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE m jsonb; v_norm text := public.nr_norm_name(p_name); v_city text := public.nr_norm_city(p_city); v_sim bigint[];
BEGIN
  m := public.nr_match_business(p_name, p_city, NULL);
  IF length(v_norm) >= 4 THEN
    SELECT array_agg(id) INTO v_sim FROM (
      SELECT id FROM public.nr_businesses WHERE name_norm % v_norm AND similarity(name_norm, v_norm) >= 0.55
         AND (v_city IS NULL OR city_norm IS NULL OR city_norm = v_city)
       ORDER BY similarity(name_norm, v_norm) DESC LIMIT 3) x;
  END IF;
  RETURN m || jsonb_build_object('similar', to_jsonb(coalesce(v_sim, '{}')));
END;
$$;

-- a doubtful site match goes to the existing review queue (nr_findings, pending_review)
CREATE OR REPLACE FUNCTION public.nr_identify_review(p_domain text, p_name text, p_city text, p_candidates bigint[], p_reason text, p_detail jsonb) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.nr_put_finding(jsonb_build_object('source_key', 'enr:site_identify', 'source_url', 'https://' || p_domain, 'category', 'new_website',
    'subject_name', p_name, 'subject_city', p_city, 'candidates', to_jsonb(p_candidates),
    'title', 'האתר ' || p_domain || ' (' || coalesce(p_name, '') || ') – ייתכן שהוא של אחת החברות המוצעות; ממתין לאישור שיוך',
    'match_status', 'pending_review', 'match_method', p_reason, 'detail', p_detail, 'dedup_key', 'site_identify:' || p_domain));
$$;

REVOKE ALL ON FUNCTION public.nr_identify_lock(int, int), public.nr_identify_unlock(int), public.nr_claim_site_queue(int),
  public.nr_identify_lookup(text, text[], text[], text[]), public.nr_identify_name(text, text),
  public.nr_identify_review(text, text, text, bigint[], text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nr_identify_lock(int, int), public.nr_identify_unlock(int), public.nr_claim_site_queue(int),
  public.nr_identify_lookup(text, text[], text[], text[]), public.nr_identify_name(text, text),
  public.nr_identify_review(text, text, text, bigint[], text, jsonb) TO service_role;

INSERT INTO public.nr_sources (key, catalog_id, name, url, provider, kind, data_types, terms, status, status_reason, priority, config) VALUES
  ('enr:cc_domains', 'E30', 'Common Crawl – רשימת אתרי האינטרנט הישראליים (גרף הקישורים)', 'https://commoncrawl.org/web-graphs', 'Common Crawl Foundation', 'enrich_cc_domains',
    ARRAY['website','new_business'], 'נתונים פתוחים; נלקחת רק רשימת שמות המתחם (.co.il / .org.il) – ללא תוכן ומידע אישי', 'pending', NULL, 5,
    jsonb_build_object('graph', 'cc-main-2026-jun-jul-aug')),
  ('enr:site_identify', 'E31', 'זיהוי אתרים ישראליים מול המאגר (ח.פ. / טלפון / אימייל / שם רשום)', NULL, 'אתרי העסקים עצמם', 'enrich_site_identify',
    ARRAY['website','phone','email','social','new_business'], 'robots.txt מכובד; דף הבית ועמוד צור קשר בלבד; עסק חדש נוסף רק עם זהות ברורה', 'collecting',
    'תור נפרד עם עובדים מקבילים', 6, '{}')
ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, terms = EXCLUDED.terms, kind = EXCLUDED.kind, updated_at = now();

-- ── progress metrics: found vs verified vs saved, today / per hour, queues and success rates ──
CREATE OR REPLACE FUNCTION public.nr_scale_report() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE d0 timestamptz := date_trunc('day', now() AT TIME ZONE 'Asia/Jerusalem') AT TIME ZONE 'Asia/Jerusalem';
BEGIN
  IF NOT public.nr_can_read() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN jsonb_build_object(
    'day_start', d0,
    'new_businesses_today', (SELECT count(*) FROM public.nr_businesses WHERE first_seen_at >= d0),
    'new_businesses_by_source_today', (SELECT coalesce(jsonb_object_agg(s, n), '{}') FROM (SELECT sources[1] s, count(*) n FROM public.nr_businesses WHERE first_seen_at >= d0 GROUP BY 1) x),
    'enriched_today', (SELECT count(DISTINCT business_id) FROM public.nr_findings WHERE match_status = 'matched' AND discovered_at >= d0),
    'saved_today', (SELECT jsonb_object_agg(kind, n) FROM (SELECT kind, count(*) n FROM public.nr_contact_points WHERE first_seen_at >= d0 GROUP BY 1) x),
    'social_today', (SELECT jsonb_object_agg(coalesce(subkind, kind), n) FROM (SELECT kind, subkind, count(*) n FROM public.nr_contact_points WHERE first_seen_at >= d0 AND kind IN ('social','whatsapp','website') GROUP BY 1, 2) x),
    'verified_today', (SELECT count(*) FROM public.nr_contact_points WHERE first_seen_at >= d0 AND verified),
    'findings_today', (SELECT count(*) FROM public.nr_findings WHERE discovered_at >= d0),
    'findings_matched_today', (SELECT count(*) FROM public.nr_findings WHERE discovered_at >= d0 AND match_status = 'matched'),
    'findings_pending_today', (SELECT count(*) FROM public.nr_findings WHERE discovered_at >= d0 AND match_status = 'pending_review'),
    'findings_rejected_today', (SELECT count(*) FROM public.nr_findings WHERE discovered_at >= d0 AND match_status = 'rejected'),
    'relations_today', (SELECT jsonb_object_agg(level, n) FROM (SELECT level, count(*) n FROM public.nr_relations WHERE discovered_at >= d0 GROUP BY 1) x),
    'records_last_hour', (SELECT coalesce(sum(records_read), 0) FROM public.nr_runs WHERE source_key LIKE 'enr:%' AND started_at > now() - interval '1 hour'),
    'records_last_24h', (SELECT coalesce(sum(records_read), 0) FROM public.nr_runs WHERE source_key LIKE 'enr:%' AND started_at > now() - interval '24 hours'),
    'sites_checked_last_hour', (SELECT count(*) FROM public.nr_site_queue WHERE checked_at > now() - interval '1 hour'),
    'sites_checked_last_24h', (SELECT count(*) FROM public.nr_site_queue WHERE checked_at > now() - interval '24 hours'),
    'site_queue', (SELECT jsonb_object_agg(status, n) FROM (SELECT status, count(*) n FROM public.nr_site_queue GROUP BY 1) x),
    'site_success_rate', (SELECT round(100.0 * count(*) FILTER (WHERE status IN ('matched','created')) / nullif(count(*) FILTER (WHERE status NOT IN ('queued','claimed')), 0), 1) FROM public.nr_site_queue),
    'queues', jsonb_build_object(
       'sites', (SELECT count(*) FROM public.nr_site_queue WHERE status = 'queued'),
       'deep_crawl', (SELECT count(*) FROM public.nr_businesses WHERE website IS NOT NULL AND enr_site_checked_at IS NULL),
       'email_domains', (SELECT count(*) FROM public.nr_domain_queue WHERE status = 'queued'),
       'related_sites', (SELECT count(*) FROM public.nr_rel_domain_queue WHERE status = 'queued'),
       'review', (SELECT count(*) FROM public.nr_findings WHERE match_status = 'pending_review')),
    'errors_last_hour', (SELECT coalesce(jsonb_object_agg(source_key, n), '{}') FROM (SELECT source_key, count(*) n FROM public.nr_runs WHERE source_key LIKE 'enr:%' AND started_at > now() - interval '1 hour' AND NOT ok GROUP BY 1) x),
    'sources_active', (SELECT count(*) FROM public.nr_sources WHERE key LIKE 'enr:%' AND kind LIKE 'enrich%' AND status IN ('pending','collecting','completed')),
    'sources_blocked', (SELECT count(*) FROM public.nr_sources WHERE status IN ('blocked','unsupported','error')),
    'workers', (SELECT jsonb_build_object('identify_workers', identify_workers, 'identify_batch', identify_batch, 'running', enrich_running) FROM public.nr_control WHERE id = 1),
    'db_mb', (SELECT round(pg_database_size(current_database()) / 1048576.0)),
    'generated_at', now());
END;
$$;
REVOKE ALL ON FUNCTION public.nr_scale_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nr_scale_report() TO authenticated, service_role;

-- the official locality whose name appears in a written address ("הצורן 4 נתניה" → נתניה); longest name wins
CREATE OR REPLACE FUNCTION public.nr_city_in_text(p_text text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.city FROM public.nr_localities l
   WHERE length(l.city) >= 3 AND (' ' || regexp_replace(coalesce(p_text, ''), '[,.()]', ' ', 'g') || ' ') LIKE '% ' || l.city || ' %'
   ORDER BY length(l.city) DESC LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.nr_city_in_text(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nr_city_in_text(text) TO service_role;
