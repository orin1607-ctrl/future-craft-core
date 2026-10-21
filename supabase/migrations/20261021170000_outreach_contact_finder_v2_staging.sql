-- Contact finder v2 (selected companies only) — STAGING. Findings now cover every business contact channel,
-- with a low-confidence level for search candidates, per-company check log, contact-form field, and a
-- daily search-API quota (search_usage_take is atomic, service-role only).
alter table public.outreach_social_findings drop constraint if exists outreach_social_findings_platform_check;
alter table public.outreach_social_findings add constraint outreach_social_findings_platform_check
  check (platform in ('facebook','instagram','linkedin','website','email','phone','contact_form','whatsapp'));
alter table public.outreach_social_findings drop constraint if exists outreach_social_findings_confidence_check;
alter table public.outreach_social_findings add constraint outreach_social_findings_confidence_check
  check (confidence in ('existing','high','medium','low','none'));
alter table public.outreach_social_findings add column if not exists detail jsonb not null default '{}'::jsonb;
alter table public.outreach_social_runs add column if not exists mode text not null default 'full';
alter table public.outreach_social_runs add column if not exists engine text not null default 'v1';
create table if not exists public.outreach_find_checks (
  run_id uuid not null references public.outreach_social_runs(id) on delete cascade,
  contact_id uuid not null references public.outreach_contacts(id) on delete cascade,
  steps jsonb not null default '[]'::jsonb, queries int not null default 0, ms int,
  created_at timestamptz not null default now(), primary key (run_id, contact_id));
alter table public.outreach_contacts add column if not exists contact_form_url text;
create table if not exists public.search_usage (
  day date not null, provider text not null, count int not null default 0, primary key (day, provider));
alter table public.outreach_find_checks enable row level security;
alter table public.search_usage enable row level security;
create or replace function public.search_usage_take(p_provider text, p_limit int, p_n int default 1)
returns boolean language plpgsql security definer set search_path = public as $$
declare v int;
begin
  insert into search_usage(day, provider, count) values (current_date, p_provider, 0) on conflict do nothing;
  update search_usage set count = count + p_n where day = current_date and provider = p_provider and count + p_n <= p_limit returning count into v;
  return v is not null;
end $$;
revoke all on function public.search_usage_take(text,int,int) from public, anon, authenticated;
