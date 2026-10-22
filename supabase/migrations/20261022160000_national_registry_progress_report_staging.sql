-- STAGING only (usfeoerkpcafxxlyuldl). Progress report for Dalia lead finder: how much of the registry is enriched,
-- against the goal "50% of companies with at least one reliable business social account".
-- A snapshot is taken every 6 hours (one pass over the registry, ~1 min) and kept, so the daily rate is measured,
-- not estimated. Read-only for the data: it only writes nr_progress_snapshots.
-- "Reliable social" = a social link from the company's own verified site, an official source, or 2 independent
-- source families (nr_contact_points.verified). Links that only come from one other source are counted apart.

create table if not exists public.nr_progress_snapshots (
  id bigserial primary key,
  taken_at timestamptz not null default now(),
  data jsonb not null
);
alter table public.nr_progress_snapshots enable row level security;
revoke all on public.nr_progress_snapshots from public, anon, authenticated;

create or replace function public.nr_progress_take()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
 set statement_timeout to '280s'
as $function$
declare d jsonb;
begin
  with soc as (
    select business_id,
           bool_or(src_own_site or src_official or verified) reliable, bool_or(verified) two_fam
      from nr_contact_points where kind = 'social' group by business_id
  ), b as (
    select count(*) total,
           count(*) filter (where status = 'active') active,
           count(*) filter (where has_phone or has_email or has_website or has_facebook or has_instagram or has_linkedin
                              or has_youtube or has_tiktok or has_twitter or has_whatsapp) enriched,
           count(*) filter (where has_phone) phone, count(*) filter (where has_verified_phone) phone_verified,
           count(*) filter (where has_email) email, count(*) filter (where has_website) website,
           count(*) filter (where has_facebook) facebook, count(*) filter (where has_instagram) instagram,
           count(*) filter (where has_linkedin) linkedin, count(*) filter (where has_youtube) youtube,
           count(*) filter (where has_tiktok) tiktok, count(*) filter (where has_people) people,
           count(*) filter (where fleet_level = 'documented') fleet_documented,
           count(*) filter (where fleet_level = 'strong') fleet_strong,
           count(*) filter (where fleet_level = 'possible') fleet_possible,
           count(*) filter (where enr_tender_won or enr_gov_contract) sig_tenders,
           count(*) filter (where enr_hiring_drivers) sig_hiring_drivers,
           count(*) filter (where enr_hiring_logistics) sig_hiring_logistics,
           count(*) filter (where enr_expansion or enr_branch_opened) sig_expansion
      from nr_businesses
  ), s as (
    select count(*) social_any, count(*) filter (where reliable) social_reliable, count(*) filter (where two_fam) social_two_families
      from soc
  ), c as (
    select count(*) contact_points, count(*) filter (where verified) cp_two_families,
           count(*) filter (where src_official) cp_official, count(*) filter (where src_own_site) cp_own_site
      from nr_contact_points
  ), src as (
    select count(*) sources_total,
           count(*) filter (where status in ('collecting', 'completed', 'active')) sources_working,
           count(*) filter (where started_at > now() - interval '7 days') sources_new_7d
      from nr_sources
  ), q as (
    select (select count(*) from nr_site_queue where status = 'queued') site_queue,
           (select count(*) from nr_legal_queue where status = 'queued') legal_queue,
           (select count(*) from nr_social_auto_queue where claimed_at is null) social_queue,
           (select count(*) from nr_findings where match_status = 'pending_review') pending_review
  )
  select to_jsonb(b) || to_jsonb(s) || to_jsonb(c) || to_jsonb(src) || to_jsonb(q) into d from b, s, c, src, q;
  insert into nr_progress_snapshots (data) values (d);
  delete from nr_progress_snapshots where taken_at < now() - interval '180 days';
  return d;
end;
$function$;

-- latest snapshot + measured rates + gap to the 50% goal
create or replace function public.nr_progress_report()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare cur record; d1 record; d7 record; goal int; per_day numeric; per_day_src text;
begin
  if not public.nr_can_read() then raise exception 'forbidden'; end if;
  select * into cur from nr_progress_snapshots order by taken_at desc limit 1;
  if cur is null then return jsonb_build_object('empty', true); end if;
  select * into d1 from nr_progress_snapshots where taken_at <= cur.taken_at - interval '20 hours' order by taken_at desc limit 1;
  select * into d7 from nr_progress_snapshots where taken_at <= cur.taken_at - interval '6 days' order by taken_at desc limit 1;
  goal := ceil((cur.data->>'total')::numeric / 2);
  -- measured only from snapshots (a week apart, else a day apart). Not from first-seen dates: the whole registry was
  -- loaded from 18.10.2026, so "new in the last 7 days" was every link and would overstate the pace
  if d7 is not null then
    per_day := ((cur.data->>'social_reliable')::numeric - (d7.data->>'social_reliable')::numeric)
               / greatest(extract(epoch from cur.taken_at - d7.taken_at) / 86400, 1);
    per_day_src := 'snapshots_7d';
  elsif d1 is not null then
    per_day := ((cur.data->>'social_reliable')::numeric - (d1.data->>'social_reliable')::numeric)
               / greatest(extract(epoch from cur.taken_at - d1.taken_at) / 86400, 0.5);
    per_day_src := 'snapshots_1d';
  else
    per_day := null; per_day_src := 'not_measured_yet';
  end if;
  return jsonb_build_object(
    'taken_at', cur.taken_at, 'data', cur.data,
    'day_ago', case when d1 is null then null else jsonb_build_object('taken_at', d1.taken_at, 'data', d1.data) end,
    'week_ago', case when d7 is null then null else jsonb_build_object('taken_at', d7.taken_at, 'data', d7.data) end,
    'goal_social', goal,
    'goal_gap', greatest(goal - (cur.data->>'social_reliable')::int, 0),
    'social_per_day', round(per_day, 1), 'rate_basis', per_day_src,
    'days_to_goal', case when per_day > 0 then ceil(greatest(goal - (cur.data->>'social_reliable')::int, 0) / per_day) else null end);
end;
$function$;

revoke all on function public.nr_progress_take() from public, anon, authenticated;
revoke all on function public.nr_progress_report() from public, anon;
grant execute on function public.nr_progress_report() to authenticated;

do $$ begin
  perform cron.unschedule('nr-progress') where exists (select 1 from cron.job where jobname = 'nr-progress');
  perform cron.schedule('nr-progress', '33 */6 * * *',
    $j$ DO $b$ BEGIN IF public.nr_engine_on('caches') THEN PERFORM public.nr_progress_take(); END IF; END $b$ $j$);
end $$;
