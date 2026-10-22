-- STAGING only (usfeoerkpcafxxlyuldl). Backfill for 20261022150000: existing contact points, their findings,
-- and the business flags that count verified contact points. Run after a sample check (done on 20 businesses first).
-- Sources are not touched, so no contact-point trigger fires. Restore: nr_backup_20261022v.
set lock_timeout = '20s';

-- 1. contact points: verified by the independent-family rule
update public.nr_contact_points c
   set verified = x.v
  from (select id, coalesce((public.nr_contact_reliability(sources)->>'independent')::int, 0) >= 2 v from public.nr_contact_points) x
 where c.id = x.id and c.verified is distinct from x.v;

-- 2. findings that were marked verified automatically only because of the old rule (never by a person)
update public.nr_findings f
   set verification = 'unverified', updated_at = now(),
       detail = coalesce(f.detail, '{}'::jsonb) || jsonb_build_object('unverified_reason', 'two sources of the same family (2026-10-22 rule)')
  from public.nr_contact_points c
 where f.dedup_key = 'cp:' || c.id and f.verification = 'verified' and f.reviewed_by is null and not c.verified;

-- 3. business flags derived from verified contact points
update public.nr_businesses b
   set has_verified_phone = coalesce(x.vph, false), verified_points = coalesce(x.ver, 0)
  from (select b2.id, bool_or(c.kind = 'phone' and c.verified) vph, count(c.id) filter (where c.verified)::int ver
          from public.nr_businesses b2 left join public.nr_contact_points c on c.business_id = b2.id
         where b2.has_verified_phone or b2.verified_points > 0
            or exists (select 1 from public.nr_contact_points c2 where c2.business_id = b2.id and c2.verified)
         group by b2.id) x
 where b.id = x.id and (b.has_verified_phone is distinct from coalesce(x.vph, false) or b.verified_points is distinct from coalesce(x.ver, 0));
