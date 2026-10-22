-- National registry – "legal pages" step (STAGING). Many Israeli sites print the operating company's number on their
-- terms / accessibility statement / privacy / about / contact page. nr-enrichment action "legal_pages" reads those pages
-- for sites the identify engine could not tie to a company (nr_site_queue no_identity) and for businesses created from a
-- website without a company number, and ties the site to the registered company only when:
--   * exactly ONE valid company number (check digit) appears on the site, it exists in the registry, AND
--   * the registered company's name appears on the site (siteConfirms name rule).
-- Anything else with a number → nr_findings review (dedup site_identify:legal:<domain>, accepted through nr_review_finding).
-- 1,000-lead test 2026-10-22: 19 number links, 17 correct; with this rule 17 of 17. Name-only matches (~50–60% right) are never used.
-- Writes go through nr_ingest (never overwrites) with source enr:legal_pages; backups op_backup.nr_site_queue_legal_20261022,
-- op_backup.nr_web_created_20261022. Switch: nr_engine_on('legal').

create table if not exists public.nr_legal_queue (
  domain text primary key,
  kind text not null check (kind in ('no_identity', 'web_created')),
  web_business_id bigint,
  status text not null default 'queued' check (status in ('queued', 'claimed', 'matched', 'review', 'no_number', 'unreachable', 'robots', 'error')),
  attempts int not null default 0,
  claimed_at timestamptz,
  checked_at timestamptz,
  matched_business_id bigint,
  reg_ids text[],
  pages int,
  evidence jsonb,
  note text,
  queued_at timestamptz not null default now()
);
create index if not exists nr_legal_queue_todo on public.nr_legal_queue (kind, queued_at) where status in ('queued', 'claimed');
alter table public.nr_legal_queue enable row level security;
revoke all on public.nr_legal_queue from anon, authenticated;

-- fill: web-created businesses first (they link a known business to its registered company), then no-identity sites
insert into public.nr_legal_queue (domain, kind, web_business_id)
select distinct on (d) d, 'web_created', id from (
  select public.nr_host(b.website) d, b.id from public.nr_businesses b where b.reg_id is null and b.website is not null
) x where d ~ '^[a-z0-9.-]+\.[a-z]{2,}$' order by d, id
on conflict (domain) do nothing;
insert into public.nr_legal_queue (domain, kind)
select q.domain, 'no_identity' from public.nr_site_queue q where q.status = 'no_identity'
on conflict (domain) do nothing;

-- claim a batch (a call cut off by the platform leaves rows claimed: they come back after 5 minutes, 3 attempts at most)
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
      order by case x.kind when 'web_created' then 0 else 1 end, x.queued_at
      limit greatest(1, least(p_n, 30))
      for update skip locked)
  returning q.domain, q.kind, q.web_business_id;
$$;
revoke all on function public.nr_claim_legal(int) from public, anon, authenticated;

-- registered companies by number (for the name check on the page)
create or replace function public.nr_legal_lookup(p_ids text[])
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(b.reg_id, jsonb_build_object('id', b.id, 'name', b.name, 'name_en', b.name_en, 'reg_id_type', b.reg_id_type,
           'website', b.website, 'status', b.status)), '{}'::jsonb)
    from nr_businesses b where b.reg_id = any(p_ids);
$$;
revoke all on function public.nr_legal_lookup(text[]) from public, anon, authenticated;

-- progress for the control screen / reports
create or replace function public.nr_legal_progress()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'by_status', (select jsonb_object_agg(k, n) from (select kind || ':' || status k, count(*) n from nr_legal_queue group by 1) x),
    'last_hour', (select count(*) from nr_legal_queue where checked_at > now() - interval '1 hour'),
    'matched_last_hour', (select count(*) from nr_legal_queue where status = 'matched' and checked_at > now() - interval '1 hour'));
$$;
revoke all on function public.nr_legal_progress() from public, anon;
grant execute on function public.nr_legal_progress() to authenticated;

-- workers: one call per minute each through Frankfurt (≈24 sites, ≈30 s per call). Started with 2 (≈2,500 sites/hour, no
-- CPU-limit errors in 9 minutes), raised to 4.
do $do$
declare w int;
begin
  for w in 1..4 loop
    perform cron.unschedule('nr-legal-' || w) where exists (select 1 from cron.job where jobname = 'nr-legal-' || w);
    perform cron.schedule('nr-legal-' || w, '* * * * *', $job$
  select net.http_post(
    url := 'https://usfeoerkpcafxxlyuldl.supabase.co/functions/v1/nr-enrichment',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-region', 'eu-central-1',
      'x-dalia-internal-key', (select decrypted_secret from vault.decrypted_secrets where name = 'DALIA_EDGE_INTERNAL_SECRET')),
    body := '{"action":"legal_pages"}'::jsonb,
    timeout_milliseconds := 120000)
  where public.nr_engine_on('legal') and (select enrich_running from public.nr_control where id = 1)
    and exists (select 1 from public.nr_legal_queue where status = 'queued')
$job$);
  end loop;
end
$do$;
