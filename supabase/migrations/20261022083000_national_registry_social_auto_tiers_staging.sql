-- National registry – continuous social locating, wider set and bigger batches (STAGING).
-- The first set (companies WITH a website but no Facebook / Instagram) runs dry within a day, so the same engine
-- (nr-enrichment action social_sample → socialLocate.ts, same confirmation rules, no new engine) continues with:
--   tier 1  website, no Facebook / Instagram                         (as before)
--   tier 2  no website, but a business e-mail domain (socialLocate opens that domain and confirms it is the company's)
--   tier 3  registered companies with fleet potential, no website / e-mail (known Israeli domains similar to the name,
--           checked against the company's details – the weakest tier, so it runs last)
-- Inside a tier: documented / strong / possible fleet first. Each company at most once in 30 days.
-- The list lives in nr_social_auto_queue (refilled daily by nr_social_auto_fill), so the 2-minute job stays cheap.
-- Batch per call goes from 8 to 14 companies (measured ≈4 s per company, 100 s budget per call) – same number of calls.

-- the to-do list is computed once a day into a small table (a full nr_businesses scan every 2 minutes is too heavy for
-- the Micro database); the picker reads only this table
create table if not exists public.nr_social_auto_queue (
  business_id bigint primary key,
  tier smallint not null,
  prio smallint not null,
  added_at timestamptz not null default now()
);
create index if not exists nr_social_auto_queue_order on public.nr_social_auto_queue (tier, prio, business_id);
alter table public.nr_social_auto_queue enable row level security;
revoke all on public.nr_social_auto_queue from anon, authenticated;

create or replace function public.nr_social_auto_fill()
returns int
language plpgsql
security definer
set search_path = public
as $fn$
declare n int;
begin
  delete from nr_social_auto_queue q using nr_businesses b where b.id = q.business_id and (b.has_facebook or b.has_instagram);
  insert into nr_social_auto_queue (business_id, tier, prio)
  select id, tier, case fleet_level when 'documented' then 0 when 'strong' then 1 when 'possible' then 2 else 3 end from (
    select b.id, 1 tier, b.fleet_level from nr_businesses b
     where b.has_website and not b.has_facebook and not b.has_instagram
    union all
    select b.id, 2, b.fleet_level from nr_businesses b
     where not b.has_website and b.has_email and not b.has_facebook and not b.has_instagram
       and exists (select 1 from nr_contact_points cp where cp.business_id = b.id and cp.kind = 'email'
                    and split_part(lower(cp.value), '@', 2) !~ '^(gmail|walla|hotmail|yahoo|outlook|live|icloud|me|01\d|01\dnet|netvision|bezeqint|bezeq|zahav|internet-zahav|smile|actcom|msn|aol|nana10?|barak|inter|isdn|t2|xfone|partner|cellcom|orange|golan|hot|ymail|protonmail|mail)\.')
    union all
    select b.id, 3, b.fleet_level from nr_businesses b
     where not b.has_website and not b.has_email and not b.has_facebook and not b.has_instagram
       and b.reg_id is not null and b.fleet_level is not null
  ) c
  on conflict (business_id) do update set tier = least(nr_social_auto_queue.tier, excluded.tier), prio = excluded.prio;
  get diagnostics n = row_count;
  return n;
end
$fn$;
revoke all on function public.nr_social_auto_fill() from public, anon, authenticated;

create or replace function public.nr_social_auto_pick(p_n int default 4)
returns setof bigint
language sql
stable
security definer
set search_path = public
as $$
  select q.business_id from nr_social_auto_queue q
   where not exists (select 1 from nr_social_runs r where r.business_id = q.business_id and r.started_at > now() - interval '30 days')
   order by q.tier, q.prio, q.business_id
   limit greatest(1, least(p_n, 20));
$$;

revoke all on function public.nr_social_auto_pick(int) from public, anon, authenticated;

create or replace function public.nr_social_auto_progress()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with left_ as (
    select count(*) filter (where q.tier = 1) t1, count(*) filter (where q.tier = 2) t2, count(*) filter (where q.tier = 3) t3
      from nr_social_auto_queue q
     where not exists (select 1 from nr_social_runs r where r.business_id = q.business_id and r.started_at > now() - interval '30 days')
  )
  select jsonb_build_object(
    'eligible_left', (select t1 from left_),
    'eligible_left_email_domain', (select t2 from left_),
    'eligible_left_fleet_no_site', (select t3 from left_),
    'auto_runs', (select count(*) from nr_social_runs where tag = 'auto_site_no_social'),
    'auto_saved', (select coalesce(sum(saved), 0) from nr_social_runs where tag = 'auto_site_no_social'),
    'auto_review', (select coalesce(sum(review), 0) from nr_social_runs where tag = 'auto_site_no_social'),
    'auto_errors', (select count(*) from nr_social_runs where tag = 'auto_site_no_social' and error is not null),
    'last_hour_runs', (select count(*) from nr_social_runs where tag = 'auto_site_no_social' and started_at > now() - interval '1 hour'),
    'last_hour_saved', (select coalesce(sum(saved), 0) from nr_social_runs where tag = 'auto_site_no_social' and started_at > now() - interval '1 hour'),
    'last_run', (select max(started_at) from nr_social_runs where tag = 'auto_site_no_social')
  );
$$;

revoke all on function public.nr_social_auto_progress() from public, anon;
grant execute on function public.nr_social_auto_progress() to authenticated;

select public.nr_social_auto_fill();

-- daily refill (new websites / e-mails found by the other engines join the list)
select cron.unschedule('nr-social-fill') where exists (select 1 from cron.job where jobname = 'nr-social-fill');
select cron.schedule('nr-social-fill', '25 3 * * *', $job$ DO $b$ BEGIN IF public.nr_engine_on('social') THEN PERFORM public.nr_social_auto_fill(); END IF; END $b$ $job$);

-- same single job (one worker on this queue), 14 companies per call
select cron.unschedule('nr-social-auto') where exists (select 1 from cron.job where jobname = 'nr-social-auto');
select cron.schedule('nr-social-auto', '*/2 * * * *', $job$
  select net.http_post(
    url := 'https://usfeoerkpcafxxlyuldl.supabase.co/functions/v1/nr-enrichment',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-region', 'eu-central-1',
      'x-dalia-internal-key', (select decrypted_secret from vault.decrypted_secrets where name = 'DALIA_EDGE_INTERNAL_SECRET')),
    body := jsonb_build_object('action', 'social_sample', 'tag', 'auto_site_no_social',
      'ids', (select coalesce(jsonb_agg(x), '[]'::jsonb) from public.nr_social_auto_pick(14) x)),
    timeout_milliseconds := 150000)
  where public.nr_engine_on('social') and (select enrich_running from public.nr_control where id = 1)
    and exists (select 1 from public.nr_social_auto_pick(1))
$job$);
