-- National registry – inverted-index bulk import (Wikidata + OpenStreetMap), run weekly by the edge function
-- nr-bulk-index in Frankfurt (STAGING). Instead of searching business by business, all public records that carry a
-- company number / phone / website together with social accounts are downloaded at once and matched in one pass.
-- High confidence (exact company number or phone, own domain, plus name agreement) -> nr_ingest (never overwrites);
-- anything uncertain -> nr_put_finding (review queue); official websites -> nr_site_queue (identify confirms them).
-- First manual run 2026-10-21/22: Wikidata 488 new links (345 companies) + 536 existing confirmed; OSM 12 new + 313 confirmed.

-- one set-based lookup for a whole batch: company numbers, phone numbers and website hosts -> business ids + names
create or replace function public.nr_bulk_lookup(p_hps text[] default '{}', p_phones text[] default '{}', p_hosts text[] default '{}')
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with hp as (
    select b.reg_id k, b.id from nr_businesses b where b.reg_id = any(p_hps)
  ), ph as (
    select regexp_replace(cp.value, '\D', '', 'g') k, cp.business_id id
      from nr_contact_points cp
     where cp.kind = 'phone' and regexp_replace(cp.value, '\D', '', 'g') = any(p_phones)
  ), ho as (
    select h k, id from (
      select lower(regexp_replace(regexp_replace(b.website, '^https?://(www\.)?', ''), '[/:?#].*$', '')) h, b.id from nr_businesses b where b.website is not null
      union all
      select lower(regexp_replace(regexp_replace(cp.value, '^https?://(www\.)?', ''), '[/:?#].*$', '')), cp.business_id from nr_contact_points cp where cp.kind = 'website'
    ) x where h = any(p_hosts)
  ), ids as (select id from hp union select id from ph union select id from ho)
  select jsonb_build_object(
    'hp', coalesce((select jsonb_object_agg(k, ids) from (select k, jsonb_agg(distinct id) ids from hp group by k) a), '{}'),
    'phones', coalesce((select jsonb_object_agg(k, ids) from (select k, jsonb_agg(distinct id) ids from ph group by k) a), '{}'),
    'hosts', coalesce((select jsonb_object_agg(k, ids) from (select k, jsonb_agg(distinct id) ids from ho group by k) a), '{}'),
    'names', coalesce((select jsonb_object_agg(b.id, jsonb_build_object('n', b.name, 'c', b.city)) from nr_businesses b where b.id in (select id from ids)), '{}'));
$$;

revoke all on function public.nr_bulk_lookup(text[], text[], text[]) from public, anon, authenticated;

-- weekly run (Sunday 02:20 UTC) through Frankfurt; switch: nr_engine_on('bulk_index')
select cron.unschedule('nr-bulk-index') where exists (select 1 from cron.job where jobname = 'nr-bulk-index');
select cron.schedule('nr-bulk-index', '20 2 * * 0', $job$
  select net.http_post(
    url := 'https://usfeoerkpcafxxlyuldl.supabase.co/functions/v1/nr-bulk-index',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-region', 'eu-central-1',
      'x-dalia-internal-key', (select decrypted_secret from vault.decrypted_secrets where name = 'DALIA_EDGE_INTERNAL_SECRET')),
    body := '{"action":"all"}'::jsonb,
    timeout_milliseconds := 150000)
  where public.nr_engine_on('bulk_index') and (select enrich_running from public.nr_control where id = 1)
$job$);
