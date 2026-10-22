-- National registry – ready-to-use target lists for the Dalia Marketing Center (STAGING). Read-only; nothing is sent.
-- p_target: 'dalia'  – companies with fleet potential (documented / strong / possible) or vehicle-heavy industries
--                      (transport, construction, security & services, energy, agriculture)
--           'yoni_garage' – businesses that run service / commercial vehicles (same fleet levels + trades, services,
--                      retail, food); narrow with p_filters.city / region / district to the garage's area
--           'all'    – no preset
-- p_filters (all optional): ind_main text[], ind_code text, city, region, district, fleet_level text[],
--   employees_band text[], has_phone, has_verified_phone, has_email, has_social, q (name contains), with_contact (default true)
-- Each row carries the best phone / e-mail / links with their reliability (official / own_site / other).
-- Keyset pagination by business id (p_after), at most 500 rows per call.

create or replace function public.nr_target_list(p_target text default 'dalia', p_filters jsonb default '{}'::jsonb, p_after bigint default 0, p_limit int default 200)
returns table (
  business_id bigint, name text, reg_id text, city text, region text, ind_main text[], fleet_level text, fleet_min int,
  employees_band text, best_phone jsonb, phones int, best_email jsonb, website text, facebook text, instagram text, linkedin text,
  has_verified_phone boolean, priority int
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  -- one permission check per call (the row-level policy would re-check the role for every registry row)
  if not public.nr_can_read() then raise exception 'forbidden'; end if;
  return query
  with f as (select coalesce(p_filters, '{}'::jsonb) j),
  biz as (
    select b.*
      from nr_businesses b, f
     where b.id > coalesce(p_after, 0)
       and coalesce(b.status, '') !~* '(מחוק|פירוק|לא פעיל|מבוטל|inactive|dissolved|struck)'
       and case p_target
             when 'dalia' then b.fleet_level is not null or b.ind_main && array['transport','construction','security','energy','agriculture']
             when 'yoni_garage' then b.fleet_level is not null or b.ind_main && array['transport','construction','professional','retail','food','security','energy']
             else true end
       and (coalesce((f.j->>'with_contact')::boolean, true) = false or b.has_phone or b.has_email or b.has_facebook or b.has_instagram or b.has_linkedin)
       and (f.j->'ind_main' is null or b.ind_main && array(select jsonb_array_elements_text(f.j->'ind_main')))
       and (f.j->>'ind_code' is null or f.j->>'ind_code' = any(b.ind_codes))
       and (f.j->>'city' is null or b.city = f.j->>'city')
       and (f.j->>'region' is null or b.region = f.j->>'region')
       and (f.j->>'district' is null or b.district = f.j->>'district')
       and (f.j->'fleet_level' is null or b.fleet_level = any(array(select jsonb_array_elements_text(f.j->'fleet_level'))))
       and (f.j->'employees_band' is null or b.employees_band = any(array(select jsonb_array_elements_text(f.j->'employees_band'))))
       and (f.j->>'has_phone' is null or b.has_phone = (f.j->>'has_phone')::boolean)
       and (f.j->>'has_verified_phone' is null or b.has_verified_phone = (f.j->>'has_verified_phone')::boolean)
       and (f.j->>'has_email' is null or b.has_email = (f.j->>'has_email')::boolean)
       and (f.j->>'has_social' is null or (b.has_facebook or b.has_instagram or b.has_linkedin) = (f.j->>'has_social')::boolean)
       and (f.j->>'q' is null or b.name ilike '%' || (f.j->>'q') || '%')
     order by b.id
     limit greatest(1, least(coalesce(p_limit, 200), 500))
  )
  select biz.id, biz.name, biz.reg_id, biz.city, biz.region, biz.ind_main, biz.fleet_level, biz.fleet_min, biz.employees_band,
         (select jsonb_build_object('value', cp.display, 'reliability', case when cp.src_official then 'official' when cp.src_own_site then 'own_site' else 'other' end,
                                    'verified', cp.verified, 'branch', cp.branch_name, 'sources', to_jsonb(cp.sources), 'first_seen', cp.first_seen_at)
            from nr_contact_points cp where cp.business_id = biz.id and cp.kind = 'phone'
           order by cp.verified desc, cp.src_official desc, cp.src_own_site desc, (cp.branch_name is null) desc, cp.first_seen_at limit 1),
         (select count(*)::int from nr_contact_points cp where cp.business_id = biz.id and cp.kind = 'phone'),
         (select jsonb_build_object('value', cp.value, 'reliability', case when cp.src_official then 'official' when cp.src_own_site then 'own_site' else 'other' end, 'sources', to_jsonb(cp.sources))
            from nr_contact_points cp where cp.business_id = biz.id and cp.kind = 'email'
           order by cp.src_own_site desc, cp.src_official desc, cp.first_seen_at limit 1),
         biz.website,
         (select cp.value from nr_contact_points cp where cp.business_id = biz.id and cp.kind = 'social' and cp.subkind = 'facebook' order by cp.src_groups desc nulls last, cp.first_seen_at limit 1),
         (select cp.value from nr_contact_points cp where cp.business_id = biz.id and cp.kind = 'social' and cp.subkind = 'instagram' order by cp.src_groups desc nulls last, cp.first_seen_at limit 1),
         (select cp.value from nr_contact_points cp where cp.business_id = biz.id and cp.kind = 'social' and cp.subkind = 'linkedin' order by cp.src_groups desc nulls last, cp.first_seen_at limit 1),
         biz.has_verified_phone,
         (case biz.fleet_level when 'documented' then 40 when 'strong' then 30 when 'possible' then 15 else 0 end
          + case when biz.has_verified_phone then 25 when biz.has_phone then 15 else 0 end
          + case when biz.has_email then 10 else 0 end
          + case when biz.has_facebook or biz.has_instagram or biz.has_linkedin then 10 else 0 end)::int
    from biz
   order by biz.id;
end;
$$;

revoke all on function public.nr_target_list(text, jsonb, bigint, int) from public, anon;
grant execute on function public.nr_target_list(text, jsonb, bigint, int) to authenticated;
