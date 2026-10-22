-- STAGING only (usfeoerkpcafxxlyuldl). Contact reliability for source keys that are not rows in nr_sources.
-- The legal-pages step and the review auto-verifier write keys of their own (enr:legal_pages, auto_verified:…).
-- nr_source_group returned NULL for them, so 2,138 contact points (mostly websites) carried no reliability at all
-- and showed as "one source, not verified" although the company number on the site's own legal page ties it to the company.
--   enr:legal_pages / auto_verified:legal_pages – company number of the business on the site's terms / accessibility page → own_site
--   auto_verified:email_domain                   – the site is the domain of the business e-mail on record → own_site
--   any other key without a nr_sources row      → other (never NULL again)
-- Rollback: backups/openprospector-trust-case-2026-10-22/nr_source_group.before.sql, then the same backfill.

create or replace function public.nr_source_group(p_key text)
 returns text
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(
    (select case when s.kind in ('ckan', 'arcgis', 'fleet_ckan') then 'official'
                 when s.kind in ('website', 'enrich_web_deep', 'enrich_site_identify', 'enrich_web_discovery', 'enrich_watch') then 'own_site'
                 else 'other' end
       from public.nr_sources s where s.key = p_key),
    case when p_key in ('enr:legal_pages', 'auto_verified:legal_pages', 'auto_verified:email_domain') then 'own_site'
         when p_key is null then null
         else 'other' end);
$function$;

-- recompute the stored flags for the rows that carry such a key (sources are not touched, so no trigger fires)
update public.nr_contact_points c
   set src_official = coalesce((r->>'official')::boolean, false),
       src_own_site = coalesce((r->>'own_site')::boolean, false),
       src_other    = coalesce((r->>'other')::boolean, false),
       src_groups   = coalesce((r->>'groups')::int, 0)
  from (select id, public.nr_contact_reliability(sources) r
          from public.nr_contact_points
         where exists (select 1 from unnest(sources) k where not exists (select 1 from public.nr_sources s where s.key = k))) x
 where c.id = x.id;
