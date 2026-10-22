-- National registry – legal pages also for sites waiting in the review queue (STAGING).
-- 12,310 sites were held for review because only the name (or only a phone) matched. Their terms / accessibility pages often
-- print the company number: when the number + name rule ties the site to one of the suggested companies, the pending
-- site_identify finding is accepted automatically (auto_verified:legal_pages); any other company stays a review.
-- Order of work: web-created businesses, then review sites, then no-identity sites.

alter table public.nr_legal_queue drop constraint if exists nr_legal_queue_kind_check;
alter table public.nr_legal_queue add constraint nr_legal_queue_kind_check check (kind in ('no_identity', 'web_created', 'review_site'));

insert into public.nr_legal_queue (domain, kind)
select q.domain, 'review_site' from public.nr_site_queue q where q.status = 'review'
on conflict (domain) do nothing;

create or replace function public.nr_claim_legal(p_n int default 10)
returns table (domain text, kind text, web_business_id bigint)
language sql
security definer
set search_path = public
as $$
  update nr_legal_queue q set status = 'claimed', claimed_at = now(), attempts = q.attempts + 1
   where q.domain in (
     select x.domain from nr_legal_queue x
      where x.status = 'queued' or (x.status = 'claimed' and x.claimed_at < now() - interval '5 minutes' and x.attempts < 3)
      order by case x.kind when 'web_created' then 0 when 'review_site' then 1 else 2 end, x.queued_at
      limit greatest(1, least(p_n, 30))
      for update skip locked)
  returning q.domain, q.kind, q.web_business_id;
$$;
revoke all on function public.nr_claim_legal(int) from public, anon, authenticated;

-- a site tied by number + name: close its pending site_identify finding when the company was one of the suggestions
create or replace function public.nr_legal_resolve(p_domain text, p_business bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_id bigint;
begin
  select f.id into v_id from nr_findings f
   where f.dedup_key = 'site_identify:' || p_domain and f.match_status = 'pending_review' and p_business = any(f.candidate_ids)
   limit 1;
  if v_id is null then return 'none'; end if;
  perform public.nr_auto_accept_finding(v_id, p_business, 'legal_pages');
  return 'accepted';
end
$$;
revoke all on function public.nr_legal_resolve(text, bigint) from public, anon, authenticated;

-- websites tied by the legal-pages step (≈5,000 an hour read) must reach the social engine the same day: refill its
-- to-do list hourly instead of daily (one refill takes ≈10 s)
select cron.unschedule('nr-social-fill') where exists (select 1 from cron.job where jobname = 'nr-social-fill');
select cron.schedule('nr-social-fill', '25 * * * *', $job$ DO $b$ BEGIN IF public.nr_engine_on('social') THEN PERFORM public.nr_social_auto_fill(); END IF; END $b$ $job$);
