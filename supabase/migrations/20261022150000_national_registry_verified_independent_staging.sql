-- STAGING only (usfeoerkpcafxxlyuldl). "Verified" contact point = confirmed by two INDEPENDENT families of source.
-- Until now verified was GENERATED as cardinality(sources) >= 2, so two crawls of the company's own site
-- (enr:web_deep + website_crawl) counted as two sources: 57k of 60k "verified" contact points had nothing else.
-- Families (each counts once):
--   site      – every source that reads the company's own site (nr_source_group = own_site) and the social locator
--   wikidata  – enr:wikidata, enr:wikidata_bulk, auto_verified:wikidata_id_name
--   osm       – cat:27 (Overpass), enr:osm_bulk
--   tourism_vat – cat:72 and dgov:905e6597 (the same Tourism-VAT list in two releases)
--   any other key (each official government dataset, …) is its own family
--   auto_verified:already_on_record is a bookkeeping mark, not evidence – not counted
-- The column stays (filters, findings, marketing read it) but is now kept by the reliability trigger.
-- Backup: schema nr_backup_20261022v (cp_flags, findings_verification, business_flags) and
--         backups/openprospector-verified-2026-10-22/*.before.sql. Data backfill: 20261022151000.

create or replace function public.nr_source_family(p_key text)
 returns text
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select case when p_key is null or p_key = 'auto_verified:already_on_record' then null
              when p_key = 'enr:social_locate' or public.nr_source_group(p_key) = 'own_site' then 'site'
              when p_key in ('enr:wikidata', 'enr:wikidata_bulk', 'auto_verified:wikidata_id_name') then 'wikidata'
              when p_key in ('cat:27', 'enr:osm_bulk') then 'osm'
              when p_key in ('cat:72', 'dgov:905e6597') then 'tourism_vat' -- one dataset, an older and an updated release
              else p_key end;
$function$;

create or replace function public.nr_contact_reliability(p_sources text[])
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select jsonb_build_object(
    'official', bool_or(g = 'official'), 'own_site', bool_or(g = 'own_site'), 'other', bool_or(g = 'other'),
    'groups', count(distinct g), 'sources', count(*), 'independent', count(distinct fam))
    from (select public.nr_source_group(k) g, public.nr_source_family(k) fam from unnest(p_sources) k) x;
$function$;

-- metadata only on PG 17: the stored values stay until the backfill rewrites them
set lock_timeout = '20s';
do $$ begin
  if exists (select 1 from pg_attribute where attrelid = 'public.nr_contact_points'::regclass and attname = 'verified' and attgenerated = 's') then
    alter table public.nr_contact_points alter column verified drop expression;
  end if;
end $$;
alter table public.nr_contact_points alter column verified set default false;
comment on column public.nr_contact_points.verified is
  'Confirmed by 2+ independent source families (nr_source_family); kept by nr_cp_reliability_trg. Two crawls of one site are one family.';

create or replace function public.nr_cp_reliability_trg()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE r jsonb;
BEGIN
  r := public.nr_contact_reliability(NEW.sources);
  NEW.src_official := coalesce((r->>'official')::boolean, false);
  NEW.src_own_site := coalesce((r->>'own_site')::boolean, false);
  NEW.src_other := coalesce((r->>'other')::boolean, false);
  NEW.src_groups := coalesce((r->>'groups')::int, 0);
  NEW.verified := coalesce((r->>'independent')::int, 0) >= 2;
  RETURN NEW;
END;
$function$;
