-- STAGING only. Read-only: a mock sample for testing the pilot without a Serper key – 8 companies whose own website is
-- already confirmed (so the check must find it) and 4 whose "search result" is another company's site (so it must not).
--   supabase db query --linked -o json -f scripts/pilot-serper/export-mock.sql > <data dir>/sample-mock.json
with good as (
  select b.id, 'mock_own_site' grp, b.website site from nr_businesses b
   where b.website is not null and b.reg_id_type = 'company'
     and exists (select 1 from nr_site_queue q where q.business_id = b.id and q.status = 'matched' and q.method in ('reg_id_on_site', 'phone+name'))
   order by b.id desc limit 8
), wrong as (
  select b.id, 'mock_other_site' grp, (select g.site from good g order by g.id limit 1 offset 1) site from nr_businesses b
   where b.reg_id_type = 'company' and b.website is null and b.fleet_level = 'strong'
     and exists (select 1 from nr_contact_points c where c.business_id = b.id and c.kind = 'phone')
   order by b.id desc limit 4
)
select x.id business_id, x.grp, x.site mock_site, b.name, b.name_en, b.city, b.reg_id, b.reg_id_type,
       coalesce((select jsonb_agg(distinct c.value) from nr_contact_points c where c.business_id = b.id and c.kind = 'phone'), '[]'::jsonb) phones,
       coalesce((select jsonb_agg(distinct lower(c.value)) from nr_contact_points c where c.business_id = b.id and c.kind = 'email'), '[]'::jsonb) emails
  from (select * from good union all select * from wrong) x join nr_businesses b on b.id = x.id;
