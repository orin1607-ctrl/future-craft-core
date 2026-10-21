-- OpenProspector → Marketing Center link (STAGING). source_url points back to the registry card;
-- profile keeps the extra facts carried over (fleet level, people, district, contact sources).
alter table public.outreach_contacts add column if not exists source_url text;
alter table public.outreach_contacts add column if not exists profile jsonb not null default '{}'::jsonb;
create index if not exists outreach_contacts_srcref_idx on public.outreach_contacts (source, source_ref) where source_ref is not null;
