-- Social link finder for the outreach center — STAGING ONLY. Runs only for companies the owner selects.
-- Findings are suggestions until the owner approves them; approved links are written to outreach_contacts.
create table if not exists public.outreach_social_runs (
  id uuid primary key default gen_random_uuid(),
  business_id text not null references public.social_businesses(id) on delete cascade,
  contact_ids uuid[] not null,
  done_ids uuid[] not null default '{}',
  status text not null default 'running' check (status in ('running','done','stopped')),
  created_at timestamptz not null default now(), finished_at timestamptz);
create table if not exists public.outreach_social_findings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.outreach_social_runs(id) on delete cascade,
  business_id text not null references public.social_businesses(id) on delete cascade,
  contact_id uuid not null references public.outreach_contacts(id) on delete cascade,
  platform text not null check (platform in ('facebook','instagram')),
  url text, handle text,
  confidence text not null check (confidence in ('existing','high','medium','none')),
  source text, evidence text,
  status text not null default 'suggested' check (status in ('existing','suggested','approved','rejected','not_found')),
  created_at timestamptz not null default now(), reviewed_at timestamptz);
create index if not exists outreach_social_findings_run_idx on public.outreach_social_findings (run_id, contact_id);
create index if not exists outreach_social_findings_contact_idx on public.outreach_social_findings (contact_id, platform, status);
alter table public.outreach_social_runs enable row level security;
alter table public.outreach_social_findings enable row level security;
