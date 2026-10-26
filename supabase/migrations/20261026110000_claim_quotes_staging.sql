-- Claim quotes (הצעות מחיר בתיק תביעה) + reusable job library + paint calc storage.
-- STAGING ONLY (usfeoerkpcafxxlyuldl). Additive: creates new tables, alters nothing existing.
-- Access follows the claim: claims_can_work_claim(claim_id). Versions are insert-only (no history loss).

create table if not exists public.claim_quotes (
  id uuid primary key default gen_random_uuid(),
  claim_id text not null,
  quote_no integer not null default 1,
  title text not null default 'הצעת מחיר',
  status text not null default 'draft',
  data jsonb not null default '{}'::jsonb,
  totals jsonb not null default '{}'::jsonb,
  total_amount numeric not null default 0,
  version integer not null default 0,
  company_name text,
  created_by uuid default auth.uid(),
  created_by_name text,
  updated_by uuid,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (claim_id, quote_no)
);
create index if not exists claim_quotes_claim_idx on public.claim_quotes (claim_id);

create table if not exists public.claim_quote_versions (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.claim_quotes(id),
  claim_id text not null,
  version integer not null,
  data jsonb not null default '{}'::jsonb,
  totals jsonb not null default '{}'::jsonb,
  total_amount numeric not null default 0,
  change_note text not null default '',
  created_by uuid default auth.uid(),
  created_by_name text,
  created_at timestamptz not null default now(),
  unique (quote_id, version)
);
create index if not exists claim_quote_versions_claim_idx on public.claim_quote_versions (claim_id);

create table if not exists public.claim_quote_library (
  id uuid primary key default gen_random_uuid(),
  company_name text not null default '',
  kind text not null default 'work',
  category text not null default '',
  label text not null,
  default_hours numeric,
  default_price numeric,
  created_by uuid default auth.uid(),
  created_by_name text,
  created_at timestamptz not null default now(),
  unique (company_name, kind, category, label)
);

-- Storage the existing paint calculator (claimPaintCalc.ts) already writes to; it was missing on STAGING.
create table if not exists public.claim_paint_calcs (
  id uuid primary key default gen_random_uuid(),
  claim_id text not null,
  company_name text,
  version integer not null default 1,
  is_draft boolean not null default true,
  calc_data jsonb not null default '{}'::jsonb,
  summary_text text not null default '',
  total_amount numeric not null default 0,
  created_by uuid default auth.uid(),
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists claim_paint_calcs_claim_idx on public.claim_paint_calcs (claim_id, is_draft);

alter table public.claim_quotes enable row level security;
alter table public.claim_quote_versions enable row level security;
alter table public.claim_quote_library enable row level security;
alter table public.claim_paint_calcs enable row level security;

revoke all on public.claim_quotes, public.claim_quote_versions, public.claim_quote_library, public.claim_paint_calcs from anon, authenticated;
grant select, insert, update, delete on public.claim_quotes to authenticated;
grant select, insert on public.claim_quote_versions to authenticated;
grant select, insert, update, delete on public.claim_quote_library to authenticated;
grant select, insert, update, delete on public.claim_paint_calcs to authenticated;

drop policy if exists claim_quotes_select on public.claim_quotes;
drop policy if exists claim_quotes_insert on public.claim_quotes;
drop policy if exists claim_quotes_update on public.claim_quotes;
drop policy if exists claim_quotes_delete on public.claim_quotes;
create policy claim_quotes_select on public.claim_quotes for select to authenticated using (public.claims_can_work_claim(claim_id));
create policy claim_quotes_insert on public.claim_quotes for insert to authenticated with check (public.claims_can_work_claim(claim_id));
create policy claim_quotes_update on public.claim_quotes for update to authenticated using (public.claims_can_work_claim(claim_id)) with check (public.claims_can_work_claim(claim_id));
create policy claim_quotes_delete on public.claim_quotes for delete to authenticated using (public.has_role(auth.uid(), 'super_admin'::app_role));

drop policy if exists claim_quote_versions_select on public.claim_quote_versions;
drop policy if exists claim_quote_versions_insert on public.claim_quote_versions;
create policy claim_quote_versions_select on public.claim_quote_versions for select to authenticated using (public.claims_can_work_claim(claim_id));
create policy claim_quote_versions_insert on public.claim_quote_versions for insert to authenticated with check (
  public.claims_can_work_claim(claim_id)
  and exists (select 1 from public.claim_quotes q where q.id = quote_id and q.claim_id = claim_quote_versions.claim_id)
);

drop policy if exists claim_quote_library_select on public.claim_quote_library;
drop policy if exists claim_quote_library_insert on public.claim_quote_library;
drop policy if exists claim_quote_library_update on public.claim_quote_library;
drop policy if exists claim_quote_library_delete on public.claim_quote_library;
create policy claim_quote_library_select on public.claim_quote_library for select to authenticated using (public.has_claims_access(auth.uid()));
create policy claim_quote_library_insert on public.claim_quote_library for insert to authenticated with check (public.has_claims_access(auth.uid()));
create policy claim_quote_library_update on public.claim_quote_library for update to authenticated using (public.has_claims_access(auth.uid())) with check (public.has_claims_access(auth.uid()));
create policy claim_quote_library_delete on public.claim_quote_library for delete to authenticated using (public.has_role(auth.uid(), 'super_admin'::app_role));

drop policy if exists claim_paint_calcs_select on public.claim_paint_calcs;
drop policy if exists claim_paint_calcs_insert on public.claim_paint_calcs;
drop policy if exists claim_paint_calcs_update on public.claim_paint_calcs;
drop policy if exists claim_paint_calcs_delete on public.claim_paint_calcs;
create policy claim_paint_calcs_select on public.claim_paint_calcs for select to authenticated using (public.claims_can_work_claim(claim_id));
create policy claim_paint_calcs_insert on public.claim_paint_calcs for insert to authenticated with check (public.claims_can_work_claim(claim_id));
create policy claim_paint_calcs_update on public.claim_paint_calcs for update to authenticated using (public.claims_can_work_claim(claim_id)) with check (public.claims_can_work_claim(claim_id));
create policy claim_paint_calcs_delete on public.claim_paint_calcs for delete to authenticated using (public.has_role(auth.uid(), 'super_admin'::app_role));
