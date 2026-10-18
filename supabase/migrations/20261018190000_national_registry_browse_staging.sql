-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- National registry – browse & filter layer (no data is deleted or merged here):
--  * district per business (official localities list → CBS districts)
--  * precomputed filter flags (phone / verified phone / email / website / social networks / people / roles / sources)
--  * employees: published number vs estimate kept apart, band for filtering, unknown stays unknown
--  * substring name search (pg_trgm), indexes for server-side filtering, sorting and paging
--  * flags refreshed incrementally by pg_cron for businesses updated by the collector

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- ── localities → district ──
CREATE TABLE IF NOT EXISTS public.nr_localities (
  city_norm text PRIMARY KEY,
  city text NOT NULL,
  nafa text,
  district text NOT NULL
);
ALTER TABLE public.nr_localities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS nr_localities_select ON public.nr_localities;
CREATE POLICY nr_localities_select ON public.nr_localities FOR SELECT TO authenticated USING (public.nr_can_read());
REVOKE ALL ON public.nr_localities FROM anon;

CREATE OR REPLACE FUNCTION public.nr_district_of_nafa(n text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN n IN ('עכו','צפת','גולן','כנרת','נצרת','עפולה') THEN 'צפון'
    WHEN n IN ('חיפה','חדרה') THEN 'חיפה'
    WHEN n IN ('השרון','פתח תקווה','רמלה','רחובות') THEN 'מרכז'
    WHEN n IN ('תל אביב','רמת גן','חולון') THEN 'תל אביב'
    WHEN n = 'ירושלים' THEN 'ירושלים'
    WHEN n IN ('אשקלון','באר שבע') THEN 'דרום'
    WHEN n IN ('שכם','ג''נין','חברון','בית לחם','טול כרם','ראמאללה','ירדן )יריחו(') THEN 'יהודה ושומרון'
  END;
$$;

-- ── filter columns ──
ALTER TABLE public.nr_businesses
  ADD COLUMN IF NOT EXISTS district text,
  ADD COLUMN IF NOT EXISTS has_phone boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_verified_phone boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_branch_phone boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS branch_phones int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS has_email boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_website boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_facebook boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_instagram boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_linkedin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_people boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS people_roles text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS source_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS verified_points int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS employees_basis text CHECK (employees_basis IN ('published','estimated')),
  ADD COLUMN IF NOT EXISTS employees_estimate int,
  ADD COLUMN IF NOT EXISTS employees_band text,
  ADD COLUMN IF NOT EXISTS flags_at timestamptz;

COMMENT ON COLUMN public.nr_businesses.employees_count IS 'מספר עובדים שפורסם במקור (ראיה ב-nr_evidence). לעולם לא הערכה.';
COMMENT ON COLUMN public.nr_businesses.employees_estimate IS 'הערכה מבוססת בלבד, נפרדת מהמספר שפורסם; ריק כשאין הערכה';
COMMENT ON COLUMN public.nr_businesses.employees_band IS 'טווח לסינון – מחושב מהמספר שפורסם בלבד; ריק = לא ידוע';

CREATE OR REPLACE FUNCTION public.nr_employees_band(n int) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN n IS NULL OR n < 1 THEN NULL
              WHEN n <= 5 THEN '1-5' WHEN n <= 10 THEN '6-10' WHEN n <= 50 THEN '11-50'
              WHEN n <= 100 THEN '51-100' WHEN n <= 500 THEN '101-500' ELSE '500+' END;
$$;

-- business role categories from the free-text role of a published business contact
CREATE OR REPLACE FUNCTION public.nr_role_category(r text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN r ~ 'מנכ|מנהל כללי|CEO' THEN 'ceo'
    WHEN r ~ 'בעלים|בעל העסק|owner' THEN 'owner'
    WHEN r ~ 'קצין|צי רכב|רכב' AND r !~ 'מוסך' THEN 'fleet'
    WHEN r ~ 'תפעול|לוגיסטיקה' THEN 'operations'
    WHEN r ~ 'מנהל מקצועי|כישורים' THEN 'professional'
    WHEN r ~ 'מנהל|ממונה|ראש|יו"ר' THEN 'manager'
    ELSE 'other' END;
$$;

-- recompute flags for businesses updated since p_since, optionally limited to an id range (all NULL = everything)
DROP FUNCTION IF EXISTS public.nr_refresh_flags(timestamptz);
CREATE OR REPLACE FUNCTION public.nr_refresh_flags(p_since timestamptz DEFAULT NULL, p_lo bigint DEFAULT NULL, p_hi bigint DEFAULT NULL) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  WITH t AS (
    SELECT b.id FROM public.nr_businesses b
     WHERE (p_since IS NULL OR b.updated_at >= p_since)
       AND (p_lo IS NULL OR b.id >= p_lo) AND (p_hi IS NULL OR b.id < p_hi)
  ), cp AS (
    SELECT c.business_id,
           bool_or(c.kind = 'phone') ph,
           bool_or(c.kind = 'phone' AND c.verified) vph,
           count(*) FILTER (WHERE c.kind = 'phone' AND c.subkind = 'branch') bph,
           bool_or(c.kind = 'email') em,
           bool_or(c.kind = 'website') web,
           bool_or(c.kind = 'social' AND c.subkind = 'facebook') fb,
           bool_or(c.kind = 'social' AND c.subkind = 'instagram') ig,
           bool_or(c.kind = 'social' AND c.subkind = 'linkedin') li,
           count(*) FILTER (WHERE c.verified) ver
      FROM public.nr_contact_points c JOIN t ON t.id = c.business_id GROUP BY c.business_id
  ), pp AS (
    SELECT p.business_id, array_agg(DISTINCT public.nr_role_category(p.role)) roles
      FROM public.nr_people p JOIN t ON t.id = p.business_id GROUP BY p.business_id
  )
  UPDATE public.nr_businesses b SET
    district = coalesce((SELECT l.district FROM public.nr_localities l WHERE l.city_norm = b.city_norm), b.district),
    has_phone = coalesce(cp.ph, false) OR b.phone_main IS NOT NULL,
    has_verified_phone = coalesce(cp.vph, false),
    has_branch_phone = coalesce(cp.bph, 0) > 0,
    branch_phones = coalesce(cp.bph, 0)::int,
    has_email = coalesce(cp.em, false) OR b.email_main IS NOT NULL,
    has_website = coalesce(cp.web, false) OR b.website IS NOT NULL,
    has_facebook = coalesce(cp.fb, false) OR b.socials ? 'facebook',
    has_instagram = coalesce(cp.ig, false) OR b.socials ? 'instagram',
    has_linkedin = coalesce(cp.li, false) OR b.socials ? 'linkedin',
    has_people = pp.business_id IS NOT NULL,
    people_roles = coalesce(pp.roles, '{}'),
    source_count = cardinality(b.sources),
    verified_points = coalesce(cp.ver, 0)::int,
    employees_basis = CASE WHEN b.employees_count IS NOT NULL THEN 'published'
                           WHEN b.employees_estimate IS NOT NULL THEN 'estimated' END,
    employees_band = public.nr_employees_band(b.employees_count),
    flags_at = now()
  FROM t
  LEFT JOIN cp ON cp.business_id = t.id
  LEFT JOIN pp ON pp.business_id = t.id
  WHERE b.id = t.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.nr_refresh_flags(timestamptz, bigint, bigint) FROM PUBLIC, anon, authenticated;

-- ── indexes for server-side filtering ──
CREATE INDEX IF NOT EXISTS nr_b_name_trgm ON public.nr_businesses USING gin (name_norm extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS nr_b_district ON public.nr_businesses (district);
CREATE INDEX IF NOT EXISTS nr_b_status ON public.nr_businesses (status);
CREATE INDEX IF NOT EXISTS nr_b_corp_type ON public.nr_businesses (corp_type);
CREATE INDEX IF NOT EXISTS nr_b_main_activity ON public.nr_businesses (main_activity);
CREATE INDEX IF NOT EXISTS nr_b_activities ON public.nr_businesses USING gin (activities);
CREATE INDEX IF NOT EXISTS nr_b_sources ON public.nr_businesses USING gin (sources);
CREATE INDEX IF NOT EXISTS nr_b_roles ON public.nr_businesses USING gin (people_roles);
CREATE INDEX IF NOT EXISTS nr_b_emp ON public.nr_businesses (employees_count) WHERE employees_count IS NOT NULL;
CREATE INDEX IF NOT EXISTS nr_b_founded ON public.nr_businesses (founded_year) WHERE founded_year IS NOT NULL;
CREATE INDEX IF NOT EXISTS nr_b_phone ON public.nr_businesses (id) WHERE has_phone;
CREATE INDEX IF NOT EXISTS nr_b_email ON public.nr_businesses (id) WHERE has_email;
CREATE INDEX IF NOT EXISTS nr_b_people ON public.nr_businesses (id) WHERE has_people;
CREATE INDEX IF NOT EXISTS nr_b_fleet ON public.nr_businesses (id) WHERE fleet_known;
CREATE INDEX IF NOT EXISTS nr_b_updated ON public.nr_businesses (updated_at);
CREATE INDEX IF NOT EXISTS nr_b_first_seen ON public.nr_businesses (first_seen_at);
CREATE INDEX IF NOT EXISTS nr_b_source_count ON public.nr_businesses (source_count DESC, id);

-- incremental refresh every 10 minutes (only businesses changed since the last refresh)
DO $$ BEGIN PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'nr-refresh-flags'; END $$;
SELECT cron.schedule('nr-refresh-flags', '*/10 * * * *',
  $cmd$ select public.nr_refresh_flags(now() - interval '11 minutes') $cmd$);
