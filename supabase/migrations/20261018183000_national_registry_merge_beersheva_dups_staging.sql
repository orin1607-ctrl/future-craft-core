-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Merge duplicates created by the first pass of catalog source 62 (Beer Sheva licensing): the records had no city, so a
-- business with several licenses (e.g. several license rows of the same store) could not be matched and was created more
-- than once; giving them the city made the duplicates visible. Same rule as the collector: same normalized name + same
-- city + no official id = one business. Everything is moved to the oldest record before the others are deleted.
DO $$
DECLARE g record; v_keep bigint; v_drop bigint[]; n_groups int := 0; n_removed int := 0;
BEGIN
  FOR g IN
    SELECT name_norm, city_norm, array_agg(id ORDER BY id) ids
      FROM public.nr_businesses
     WHERE reg_id IS NULL AND city_norm IS NOT NULL
     GROUP BY name_norm, city_norm HAVING count(*) > 1
  LOOP
    v_keep := g.ids[1];
    v_drop := g.ids[2:array_length(g.ids, 1)];
    -- contact points: union of sources on the kept record
    INSERT INTO public.nr_contact_points AS cp (business_id, kind, subkind, value, display, branch_name, branch_address, sources, entry_mode, first_seen_at)
    SELECT v_keep, c.kind, min(c.subkind), c.value, min(c.display), min(c.branch_name), min(c.branch_address),
           array_agg(DISTINCT src), min(c.entry_mode), min(c.first_seen_at)
      FROM public.nr_contact_points c, unnest(c.sources) src WHERE c.business_id = ANY(v_drop)
     GROUP BY c.kind, c.value
    ON CONFLICT (business_id, kind, value) DO UPDATE
      SET sources = (SELECT array_agg(DISTINCT x) FROM unnest(cp.sources || EXCLUDED.sources) x);
    INSERT INTO public.nr_people (business_id, full_name, role, phone, email, source_key, source_url, collected_at)
    SELECT v_keep, full_name, role, phone, email, source_key, source_url, collected_at FROM public.nr_people WHERE business_id = ANY(v_drop)
    ON CONFLICT (business_id, full_name, role) DO NOTHING;
    INSERT INTO public.nr_evidence (business_id, source_key, source_record_id, source_url, match_method, entry_mode, fields, conflicts, collected_at)
    SELECT v_keep, source_key, source_record_id, source_url, 'name+city', entry_mode, fields, conflicts, collected_at
      FROM public.nr_evidence WHERE business_id = ANY(v_drop)
    ON CONFLICT (business_id, source_key, source_record_id) DO NOTHING;
    UPDATE public.nr_businesses k SET
      sources = (SELECT array_agg(DISTINCT x) FROM (SELECT unnest(sources) x FROM public.nr_businesses WHERE id = ANY(g.ids)) s),
      activities = (SELECT coalesce(array_agg(DISTINCT x), '{}') FROM (SELECT unnest(activities) x FROM public.nr_businesses WHERE id = ANY(g.ids)) s),
      address = coalesce(k.address, (SELECT min(address) FROM public.nr_businesses WHERE id = ANY(v_drop))),
      main_activity = coalesce(k.main_activity, (SELECT min(main_activity) FROM public.nr_businesses WHERE id = ANY(v_drop))),
      phone_main = coalesce(k.phone_main, (SELECT min(phone_main) FROM public.nr_businesses WHERE id = ANY(v_drop))),
      email_main = coalesce(k.email_main, (SELECT min(email_main) FROM public.nr_businesses WHERE id = ANY(v_drop))),
      website = coalesce(k.website, (SELECT min(website) FROM public.nr_businesses WHERE id = ANY(v_drop))),
      updated_at = now()
     WHERE k.id = v_keep;
    -- counters: the removed records were counted as "new" by the source that created them
    UPDATE public.nr_sources s SET businesses_new = greatest(s.businesses_new - c.n, 0), businesses_merged = s.businesses_merged + c.n
      FROM (SELECT e.source_key, count(DISTINCT e.business_id) n FROM public.nr_evidence e
             WHERE e.business_id = ANY(v_drop) AND e.match_method = 'created' GROUP BY 1) c
     WHERE s.key = c.source_key;
    DELETE FROM public.nr_businesses WHERE id = ANY(v_drop);
    n_groups := n_groups + 1; n_removed := n_removed + array_length(v_drop, 1);
  END LOOP;
  INSERT INTO public.nr_events (level, message, data)
  VALUES ('info', format('אוחדו כפילויות שנוצרו במעבר הראשון של רישוי העסקים באר שבע: %s קבוצות, %s רשומות כפולות מוזגו לרשומה אחת', n_groups, n_removed),
          jsonb_build_object('groups', n_groups, 'removed', n_removed));
END $$;
