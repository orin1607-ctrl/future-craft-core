-- STAGING only (usfeoerkpcafxxlyuldl). Progress report counts from the contact points themselves, not the has_* flags.
-- The integrity check of 22.10.2026 found the flags stale for ~2,000 businesses per kind (nr_refresh_flags only
-- revisits recently updated businesses) and contact forms / fax not counted: the report said 50,991 businesses with a
-- contact detail where the table holds 53,180. Each snapshot now carries "method"; the pace is measured only between
-- snapshots of the same method, so the switch does not show up as growth. Earlier snapshots are kept as they were.

create or replace function public.nr_progress_take()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
 set statement_timeout to '280s'
as $function$
declare d jsonb;
begin
  with cpb as (
    select business_id,
           bool_or(kind = 'phone') ph, bool_or(kind = 'phone' and verified) ph_v, bool_or(kind = 'email') em,
           bool_or(kind = 'website') web, bool_or(kind = 'social') so,
           bool_or(kind = 'social' and (src_own_site or src_official or verified)) so_rel, bool_or(kind = 'social' and verified) so_2f,
           bool_or(kind = 'social' and subkind = 'facebook') fb, bool_or(kind = 'social' and subkind = 'instagram') ig,
           bool_or(kind = 'social' and subkind = 'linkedin') li, bool_or(kind = 'social' and subkind = 'youtube') yt,
           bool_or(kind = 'social' and subkind = 'tiktok') tt, bool_or(kind = 'whatsapp') wa,
           bool_or(kind in ('contact_form', 'fax')) other_kind
      from nr_contact_points group by business_id
  ), b as (
    select count(*) total,
           count(*) filter (where x.status = 'active') active,
           count(*) filter (where x.status = 'active' and x.corp_type = 'ישראלית חברה פרטית') active_private,
           -- a contact point of any kind, or a main phone / e-mail / website stored on the business itself
           count(*) filter (where c.business_id is not null or x.phone_main is not null or x.email_main is not null or x.website is not null) enriched,
           count(*) filter (where x.status = 'active' and x.corp_type = 'ישראלית חברה פרטית'
                              and (c.business_id is not null or x.phone_main is not null or x.email_main is not null or x.website is not null)) active_private_enriched,
           count(*) filter (where c.ph or x.phone_main is not null) phone, count(*) filter (where c.ph_v) phone_verified,
           count(*) filter (where c.em or x.email_main is not null) email, count(*) filter (where c.web or x.website is not null) website,
           count(*) filter (where c.fb) facebook, count(*) filter (where c.ig) instagram, count(*) filter (where c.li) linkedin,
           count(*) filter (where c.yt) youtube, count(*) filter (where c.tt) tiktok, count(*) filter (where c.wa) whatsapp,
           count(*) filter (where c.so) social_any, count(*) filter (where c.so_rel) social_reliable, count(*) filter (where c.so_2f) social_two_families,
           count(*) filter (where c.so_rel and x.status = 'active' and x.corp_type = 'ישראלית חברה פרטית') active_private_social_reliable,
           count(*) filter (where x.has_people) people,
           count(*) filter (where x.fleet_level = 'documented') fleet_documented,
           count(*) filter (where x.fleet_level = 'strong') fleet_strong,
           count(*) filter (where x.fleet_level = 'possible') fleet_possible,
           count(*) filter (where x.enr_tender_won or x.enr_gov_contract) sig_tenders,
           count(*) filter (where x.enr_hiring_drivers) sig_hiring_drivers,
           count(*) filter (where x.enr_hiring_logistics) sig_hiring_logistics,
           count(*) filter (where x.enr_expansion or x.enr_branch_opened) sig_expansion,
           -- how far the stored has_* flags lag behind the contact points (shown so a gap is visible, not hidden)
           count(*) filter (where c.ph and not x.has_phone) stale_flag_phone,
           count(*) filter (where c.em and not x.has_email) stale_flag_email,
           count(*) filter (where c.web and not x.has_website) stale_flag_website
      from nr_businesses x left join cpb c on c.business_id = x.id
  ), cp as (
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
  select to_jsonb(b) || to_jsonb(cp) || to_jsonb(src) || to_jsonb(q) || jsonb_build_object('method', 'contact_points_v2')
    into d from b, cp, src, q;
  insert into nr_progress_snapshots (data) values (d);
  delete from nr_progress_snapshots where taken_at < now() - interval '180 days';
  return d;
end;
$function$;

-- same as before, but the day / week comparison only uses snapshots taken with the same counting method
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
  select * into d1 from nr_progress_snapshots where taken_at <= cur.taken_at - interval '20 hours'
     and data->>'method' is not distinct from cur.data->>'method' order by taken_at desc limit 1;
  select * into d7 from nr_progress_snapshots where taken_at <= cur.taken_at - interval '6 days'
     and data->>'method' is not distinct from cur.data->>'method' order by taken_at desc limit 1;
  goal := ceil((cur.data->>'total')::numeric / 2);
  -- measured only from snapshots (a week apart, else a day apart); never from first-seen dates (registry loaded from 18.10.2026)
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
