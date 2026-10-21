-- National registry – continuous social-presence locating for companies that HAVE a website but no
-- Facebook / Instagram yet (STAGING). Reuses the existing nr-enrichment action "social_sample"
-- (socialLocate.ts: site confirmation, high confidence saved with source, the rest to review) – no new engine.
-- Dalia-relevant companies first (documented / strong / possible fleet potential).
-- Each company is retried at most once in 30 days. Engine switch: nr_engine_on('social') (missing = on).

create or replace function public.nr_social_auto_pick(p_n int default 4)
returns setof bigint
language sql
stable
security definer
set search_path = public
as $$
  select b.id
    from nr_businesses b
   where b.has_website
     and not b.has_facebook
     and not b.has_instagram
     and not exists (select 1 from nr_social_runs r where r.business_id = b.id and r.started_at > now() - interval '30 days')
   order by case b.fleet_level when 'documented' then 0 when 'strong' then 1 when 'possible' then 2 else 3 end, b.id
   limit greatest(1, least(p_n, 10));
$$;

revoke all on function public.nr_social_auto_pick(int) from public, anon, authenticated;

-- progress view for the control screen / reports (read by the service role and signed-in staff)
create or replace function public.nr_social_auto_progress()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'eligible_left', (select count(*) from nr_businesses b where b.has_website and not b.has_facebook and not b.has_instagram
                        and not exists (select 1 from nr_social_runs r where r.business_id = b.id and r.started_at > now() - interval '30 days')),
    'auto_runs', (select count(*) from nr_social_runs where tag = 'auto_site_no_social'),
    'auto_saved', (select coalesce(sum(saved), 0) from nr_social_runs where tag = 'auto_site_no_social'),
    'auto_review', (select coalesce(sum(review), 0) from nr_social_runs where tag = 'auto_site_no_social'),
    'auto_errors', (select count(*) from nr_social_runs where tag = 'auto_site_no_social' and error is not null),
    'last_run', (select max(started_at) from nr_social_runs where tag = 'auto_site_no_social')
  );
$$;

revoke all on function public.nr_social_auto_progress() from public, anon;
grant execute on function public.nr_social_auto_progress() to authenticated;

-- every 2 minutes: up to 8 companies per call through Frankfurt (avg ~4.5 s per company, 100 s budget per call)
select cron.unschedule('nr-social-auto') where exists (select 1 from cron.job where jobname = 'nr-social-auto');
select cron.schedule('nr-social-auto', '*/2 * * * *', $job$
  select net.http_post(
    url := 'https://usfeoerkpcafxxlyuldl.supabase.co/functions/v1/nr-enrichment',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-region', 'eu-central-1',
      'x-dalia-internal-key', (select decrypted_secret from vault.decrypted_secrets where name = 'DALIA_EDGE_INTERNAL_SECRET')),
    body := jsonb_build_object('action', 'social_sample', 'tag', 'auto_site_no_social',
      'ids', (select coalesce(jsonb_agg(x), '[]'::jsonb) from public.nr_social_auto_pick(8) x)),
    timeout_milliseconds := 150000)
  where public.nr_engine_on('social') and (select enrich_running from public.nr_control where id = 1)
    and exists (select 1 from public.nr_social_auto_pick(1))
$job$);
