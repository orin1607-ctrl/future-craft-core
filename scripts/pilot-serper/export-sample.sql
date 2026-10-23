-- STAGING only (usfeoerkpcafxxlyuldl). Read-only: the pilot sample with what our own site check needs
-- (company number, known phones and e-mails, city). Run:
--   supabase db query --linked -o json -f scripts/pilot-serper/export-sample.sql > <data dir>/sample.json
select s.business_id, s.grp, b.name, b.name_en, b.city, b.reg_id, b.reg_id_type,
       coalesce((select jsonb_agg(distinct c.value) from nr_contact_points c where c.business_id = b.id and c.kind = 'phone'), '[]'::jsonb) phones,
       coalesce((select jsonb_agg(distinct lower(c.value)) from nr_contact_points c where c.business_id = b.id and c.kind = 'email'), '[]'::jsonb) emails
  from op_test.serper_pilot_sample s join nr_businesses b on b.id = s.business_id
 order by s.grp, s.business_id;
