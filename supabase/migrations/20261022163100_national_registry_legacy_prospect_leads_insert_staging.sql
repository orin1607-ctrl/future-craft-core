-- STAGING only (usfeoerkpcafxxlyuldl). Insert the validated list from 20261022163000 (run on a 10-value sample first).
-- Through nr_upsert_cp, the same path as every source; the new row ids go back into the list, which is the rollback list:
--   delete from nr_findings where id in (select finding_id from nr_backup_20261022v.legacy_import);
--   delete from nr_contact_points where id in (select cp_id from nr_backup_20261022v.legacy_import);
--   then restore has_phone / has_email from nr_backup_20261022v.legacy_import_biz_flags.
-- The insert trigger files every new contact point as "★ important new information"; an old-system value is not new
-- information found by an engine, so its finding is set to normal importance and titled as an import.
do $$
declare r record; v_id bigint; v_f bigint;
begin
  for r in select * from nr_backup_20261022v.legacy_import where cp_id is null order by business_id, kind loop
    perform public.nr_upsert_cp(r.business_id, r.kind, r.subkind, r.value, r.display, null, null, 'legacy:prospect_leads');
    select id into v_id from public.nr_contact_points where business_id = r.business_id and kind = r.kind and value = r.value;
    select id into v_f from public.nr_findings where dedup_key = 'cp:' || v_id;
    update nr_backup_20261022v.legacy_import set cp_id = v_id, finding_id = v_f, inserted_at = now()
     where business_id = r.business_id and kind = r.kind and value = r.value;
  end loop;
  update public.nr_findings f
     set importance = 'normal', verification = 'unverified', updated_at = now(),
         title = 'יובא ממערכת קודמת (מקור לא ידוע): ' || coalesce((f.detail->>'value'), ''),
         detail = coalesce(f.detail, '{}'::jsonb) || jsonb_build_object('legacy_import', true, 'reliability', 'low')
   where f.id in (select finding_id from nr_backup_20261022v.legacy_import where finding_id is not null);
  update public.nr_businesses b
     set has_phone = b.has_phone or exists (select 1 from public.nr_contact_points c where c.business_id = b.id and c.kind = 'phone'),
         has_email = b.has_email or exists (select 1 from public.nr_contact_points c where c.business_id = b.id and c.kind = 'email')
   where b.id in (select business_id from nr_backup_20261022v.legacy_import where cp_id is not null);
end $$;
