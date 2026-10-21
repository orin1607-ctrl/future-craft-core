-- OpenProspector – the "200 companies from the latest search" list is served from Supabase (STAGING)
-- instead of the public file public/openprospector-batch-200.js (lead data removed from the public repo).
-- Base records were loaded once into prospect_leads.raw_payload.batch200_base, and the old typed
-- contacts list into raw_payload.batch200_reported (reported sources only – never treated as verified).
-- Backup taken before loading: op_backup.prospect_leads_20261021b (5,957 rows).
-- SECURITY INVOKER: the existing role-based RLS on prospect_leads applies; anon has no access.

create or replace function public.op_batch200_list()
returns table (company_hp text, base jsonb, results jsonb, reported jsonb, updated_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select pl.company_hp,
         pl.raw_payload->'batch200_base',
         pl.raw_payload->'batch200',
         pl.raw_payload->'batch200_reported',
         pl.updated_at
    from prospect_leads pl
   where pl.raw_payload ? 'batch200_base'
   order by (pl.raw_payload->'batch200_base'->>'id') nulls last;
$$;

revoke all on function public.op_batch200_list() from public, anon;
grant execute on function public.op_batch200_list() to authenticated;
