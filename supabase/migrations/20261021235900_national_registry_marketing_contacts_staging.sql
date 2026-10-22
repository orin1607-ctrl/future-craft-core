-- National registry – read-only contact list prepared for the future Dalia Marketing Center connection (STAGING).
-- Returns, per business, every contact point with its source, verification and first-seen date, plus the
-- number of findings still waiting for review. It does NOT send anything and is not wired to outreach yet.
-- Keyset pagination by business id; at most 500 rows per call (API calls must stay < 8 s).
-- reliability: official = government/registry source, own_site = the company's own verified website, other.

create or replace function public.nr_marketing_contacts(p_after bigint default 0, p_limit int default 200, p_only_social boolean default false)
returns table (
  business_id bigint, name text, reg_id text, city text, fleet_level text,
  phones jsonb, emails jsonb, websites jsonb, facebook jsonb, instagram jsonb, linkedin jsonb, whatsapp jsonb,
  pending_review int, has_verified_phone boolean
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
  with biz as (
    select b.id, b.name, b.reg_id, b.city, b.fleet_level, b.has_verified_phone
      from nr_businesses b
     where b.id > coalesce(p_after, 0)
       and (b.has_phone or b.has_email or b.has_facebook or b.has_instagram or b.has_linkedin)
       and (not p_only_social or b.has_facebook or b.has_instagram or b.has_linkedin)
     order by b.id
     limit greatest(1, least(coalesce(p_limit, 200), 500))
  ),
  pts as (
    select cp.business_id, cp.kind, coalesce(cp.subkind, '') sub,
           jsonb_build_object('value', cp.value, 'display', cp.display, 'verified', cp.verified, 'branch', cp.branch_name,
                              'reliability', case when cp.src_official then 'official' when cp.src_own_site then 'own_site' else 'other' end,
                              'sources', to_jsonb(cp.sources), 'first_seen', cp.first_seen_at) j
      from nr_contact_points cp join biz on biz.id = cp.business_id
  )
  select biz.id, biz.name, biz.reg_id, biz.city, biz.fleet_level,
         coalesce((select jsonb_agg(j) from pts where pts.business_id = biz.id and kind = 'phone'), '[]'),
         coalesce((select jsonb_agg(j) from pts where pts.business_id = biz.id and kind = 'email'), '[]'),
         coalesce((select jsonb_agg(j) from pts where pts.business_id = biz.id and kind = 'website'), '[]'),
         coalesce((select jsonb_agg(j) from pts where pts.business_id = biz.id and kind = 'social' and sub = 'facebook'), '[]'),
         coalesce((select jsonb_agg(j) from pts where pts.business_id = biz.id and kind = 'social' and sub = 'instagram'), '[]'),
         coalesce((select jsonb_agg(j) from pts where pts.business_id = biz.id and kind = 'social' and sub = 'linkedin'), '[]'),
         coalesce((select jsonb_agg(j) from pts where pts.business_id = biz.id and kind = 'whatsapp'), '[]'),
         (select count(*)::int from nr_findings f where f.business_id = biz.id and f.match_status = 'pending_review'),
         biz.has_verified_phone
    from biz
   order by biz.id;
end;
$$;

revoke all on function public.nr_marketing_contacts(bigint, int, boolean) from public, anon;
grant execute on function public.nr_marketing_contacts(bigint, int, boolean) to authenticated;
