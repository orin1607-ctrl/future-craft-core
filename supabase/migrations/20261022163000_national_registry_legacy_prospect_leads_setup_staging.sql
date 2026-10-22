-- STAGING only (usfeoerkpcafxxlyuldl). Owner-approved (22.10.2026): bring the phones / e-mails that exist only in the
-- older lead table (prospect_leads) into the registry, as a separate LOW-reliability source "old system – source unknown".
-- Only values with no recorded source at all (72 phones, 73 e-mails). Not imported: 27 values the old system took from
-- Gemini (AI output, not a public source), 3 websites that conflict with the contractors register, and 2 phones whose only
-- "source" is the Companies Registrar (which publishes no phones). Only for businesses with no value of that kind yet.
-- This file: source row, source family, the validated list (= the rollback list) and a flag backup. Insert: 20261022163100.

insert into public.nr_sources (key, name, kind, status, status_reason, priority, data_types, config)
values ('legacy:prospect_leads', 'מערכת קודמת – מקור לא ידוע (prospect_leads)', 'legacy_unknown', 'completed',
        'יובא באישור הבעלים 22.10.2026: ערכים מטבלת הלידים הקודמת שלא נרשם להם מקור. אמינות נמוכה – לא נספרים כמאומתים ולא מאמתים ערך של מקור אחר.',
        1000, array['phone', 'email'], '{"reliability": "low", "approved_by_owner": "2026-10-22"}'::jsonb)
on conflict (key) do nothing;

-- an unknown source is not evidence: it never counts as an independent family (so it cannot "verify" anything)
create or replace function public.nr_source_family(p_key text)
 returns text
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select case when p_key is null or p_key in ('auto_verified:already_on_record', 'legacy:prospect_leads') then null
              when p_key = 'enr:social_locate' or public.nr_source_group(p_key) = 'own_site' then 'site'
              when p_key in ('enr:wikidata', 'enr:wikidata_bulk', 'auto_verified:wikidata_id_name') then 'wikidata'
              when p_key in ('cat:27', 'enr:osm_bulk') then 'osm'
              when p_key in ('cat:72', 'dgov:905e6597') then 'tourism_vat' -- one dataset, an older and an updated release
              else p_key end;
$function$;

create table if not exists nr_backup_20261022v.legacy_import (
  lead_number bigint, business_id bigint, kind text, subkind text, value text, display text,
  cp_id bigint, finding_id bigint, inserted_at timestamptz,
  primary key (business_id, kind, value)
);
insert into nr_backup_20261022v.legacy_import (lead_number, business_id, kind, subkind, value, display)
select distinct on (business_id, kind, value) lead_number, business_id, kind, subkind, value, display from (
  select l.lead_number, b.id business_id, 'phone' kind,
         case when p.d ~ '^05' then 'mobile' else 'main' end subkind, p.d value,
         case when length(p.d) = 10 then substr(p.d, 1, 3) || '-' || substr(p.d, 4, 3) || '-' || substr(p.d, 7)
              else substr(p.d, 1, 2) || '-' || substr(p.d, 3, 3) || '-' || substr(p.d, 6) end display
    from public.prospect_leads l
    join public.nr_businesses b on b.reg_id = regexp_replace(coalesce(l.company_hp, ''), '\D', '', 'g') and l.company_hp is not null
    cross join lateral (select regexp_replace(regexp_replace(l.phone, '\D', '', 'g'), '^972', '0') d) p
   where nullif(btrim(l.phone), '') is not null
     and (l.source_list is null or cardinality(l.source_list) = 0)
     and l.enrichment_source is distinct from 'gemini_incremental'
     and p.d ~ '^0([2-489]\d{7}|[57]\d{8})$'
     and not exists (select 1 from public.nr_contact_points x where x.business_id = b.id and x.kind = 'phone')
  union all
  select l.lead_number, b.id, 'email', null, lower(btrim(l.email)), lower(btrim(l.email))
    from public.prospect_leads l
    join public.nr_businesses b on b.reg_id = regexp_replace(coalesce(l.company_hp, ''), '\D', '', 'g') and l.company_hp is not null
   where nullif(btrim(l.email), '') is not null
     and (l.source_list is null or cardinality(l.source_list) = 0)
     and l.enrichment_source is distinct from 'gemini_incremental'
     and lower(btrim(l.email)) ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'
     and not exists (select 1 from public.nr_contact_points x where x.business_id = b.id and x.kind = 'email')
) c order by business_id, kind, value, lead_number
on conflict do nothing;

create table if not exists nr_backup_20261022v.legacy_import_biz_flags as
  select id, has_phone, has_email, flags_at from public.nr_businesses
   where id in (select business_id from nr_backup_20261022v.legacy_import);

revoke all on all tables in schema nr_backup_20261022v from public, anon, authenticated;
