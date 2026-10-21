-- OpenProspector – central storage of the 200-company phone completion results (STAGING)
-- The results of each company (phone, verification status, evidence links, sources, candidates,
-- history) are stored on its EXISTING prospect_leads row under raw_payload.batch200.
-- Nothing is deleted or overwritten: other raw_payload keys are kept, phone is filled only when empty,
-- and a row is inserted only for a company number that does not exist yet (unique company_hp).
-- SECURITY INVOKER: the existing RLS policies (authenticated only) apply.
-- Backup taken before applying: op_backup.prospect_leads_20261021 (5,956 rows).

create or replace function public.op_batch200_save(p_items jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  it jsonb;
  v_hp text;
  v_updated int := 0;
  v_inserted int := 0;
  v_skipped int := 0;
  v_n int;
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a json array';
  end if;
  for it in select * from jsonb_array_elements(p_items) loop
    v_hp := nullif(btrim(it->>'no'), '');
    if v_hp is null or v_hp !~ '^[0-9]{9}$' then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    update prospect_leads
       set raw_payload = coalesce(raw_payload, '{}'::jsonb) || jsonb_build_object('batch200', it),
           phone = coalesce(nullif(btrim(phone), ''), nullif(it->>'phone_db', '')),
           updated_at = now()
     where company_hp = v_hp;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      v_updated := v_updated + v_n;
    else
      insert into prospect_leads (company_name, company_hp, city, phone, status, found_date, updated_date, raw_payload, source_keyword)
      values (coalesce(nullif(it->>'name', ''), v_hp), v_hp, it->>'city', nullif(it->>'phone_db', ''), 'new',
              to_char(now(), 'DD/MM/YYYY'), to_char(now(), 'DD/MM/YYYY'), jsonb_build_object('batch200', it), 'batch_200_regular')
      on conflict (company_hp) do update
         set raw_payload = coalesce(prospect_leads.raw_payload, '{}'::jsonb) || jsonb_build_object('batch200', excluded.raw_payload->'batch200'),
             updated_at = now();
      v_inserted := v_inserted + 1;
    end if;
  end loop;
  return jsonb_build_object('updated', v_updated, 'inserted', v_inserted, 'skipped', v_skipped);
end;
$$;

create or replace function public.op_batch200_load(p_hps text[] default null)
returns table (company_hp text, batch200 jsonb, updated_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select pl.company_hp, pl.raw_payload->'batch200', pl.updated_at
    from prospect_leads pl
   where pl.raw_payload ? 'batch200'
     and (p_hps is null or pl.company_hp = any(p_hps));
$$;

revoke all on function public.op_batch200_save(jsonb) from public, anon;
revoke all on function public.op_batch200_load(text[]) from public, anon;
grant execute on function public.op_batch200_save(jsonb) to authenticated;
grant execute on function public.op_batch200_load(text[]) to authenticated;
