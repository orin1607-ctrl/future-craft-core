-- National registry – social engine with two workers (STAGING). The legal-pages step adds websites faster than one worker
-- (14 companies / 2 minutes ≈ 420 an hour) can read them. A claim marks each company for 15 minutes (SKIP LOCKED), so two
-- workers on alternate minutes never read the same company. 20 companies per call (≈4 s each, 100 s budget).

alter table public.nr_social_auto_queue add column if not exists claimed_at timestamptz;

create or replace function public.nr_social_auto_claim(p_n int default 20)
returns setof bigint
language sql
volatile
security definer
set search_path = public
as $$
  update nr_social_auto_queue q set claimed_at = now()
   where q.business_id in (
     select x.business_id from nr_social_auto_queue x
      where (x.claimed_at is null or x.claimed_at < now() - interval '15 minutes')
        and not exists (select 1 from nr_social_runs r where r.business_id = x.business_id and r.started_at > now() - interval '30 days')
      order by x.tier, x.prio, x.business_id
      limit greatest(1, least(p_n, 20))
      for update skip locked)
  returning q.business_id;
$$;
revoke all on function public.nr_social_auto_claim(int) from public, anon, authenticated;

do $do$
declare j text; m text;
begin
  foreach j in array array['nr-social-auto', 'nr-social-auto-2'] loop
    m := case j when 'nr-social-auto' then '*/2 * * * *' else '1-59/2 * * * *' end;
    perform cron.unschedule(j) where exists (select 1 from cron.job where jobname = j);
    perform cron.schedule(j, m, $job$
  select net.http_post(
    url := 'https://usfeoerkpcafxxlyuldl.supabase.co/functions/v1/nr-enrichment',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-region', 'eu-central-1',
      'x-dalia-internal-key', (select decrypted_secret from vault.decrypted_secrets where name = 'DALIA_EDGE_INTERNAL_SECRET')),
    body := jsonb_build_object('action', 'social_sample', 'tag', 'auto_site_no_social',
      'ids', (select coalesce(jsonb_agg(x), '[]'::jsonb) from public.nr_social_auto_claim(20) x)),
    timeout_milliseconds := 150000)
  where public.nr_engine_on('social') and (select enrich_running from public.nr_control where id = 1)
    and exists (select 1 from public.nr_social_auto_pick(1))
$job$);
  end loop;
end
$do$;
