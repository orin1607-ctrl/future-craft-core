-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Filter fix (20.10.2026): every registry filter request failed for signed-in users. nr_browse returned the page quickly
-- (~5 ms) but also counted ALL matching businesses exactly; on the 1.2 GB table those counts took 38–73 s, far over the
-- 3 s statement timeout of the "authenticated" role, so PostgREST cancelled the whole call and the table never changed.
-- The filters, the rows, the sort and the paging stay exactly the same. Only the total changes:
--   * exact when the filter matches up to 200 businesses (a capped count stops after 201 rows)
--   * otherwise the planner's estimate (EXPLAIN, no table read), returned with total_exact = false and shown as "כ-…"
-- Nothing is deleted.
DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.nr_browse(jsonb,text,integer,integer)'::regprocedure);
  IF position('total_exact' IN d) = 0 THEN
    d := replace(d, 'DECLARE v_where text; v_order text; v_total bigint; v_rows jsonb; v_size int; v_off int;',
                    'DECLARE v_where text; v_order text; v_total bigint; v_rows jsonb; v_size int; v_off int; v_plan json; v_exact boolean := true;');
    d := replace(d, $r$EXECUTE format('SELECT count(*) FROM public.nr_businesses b WHERE %s', v_where) INTO v_total USING p_filters;$r$,
                    $r$-- exact up to 200 matches; above that the planner's estimate (a full count of the big table exceeds the API timeout)
  EXECUTE format('SELECT count(*) FROM (SELECT 1 FROM public.nr_businesses b WHERE %s LIMIT 201) x', v_where) INTO v_total USING p_filters;
  IF v_total > 200 THEN
    EXECUTE format('EXPLAIN (FORMAT JSON) SELECT 1 FROM public.nr_businesses b WHERE %s', v_where) INTO v_plan USING p_filters;
    v_total := greatest(201, coalesce((v_plan->0->'Plan'->>'Plan Rows')::numeric, 201)::bigint);
    v_exact := false;
  END IF;$r$);
    d := replace(d, $r$RETURN jsonb_build_object('total', v_total,$r$, $r$RETURN jsonb_build_object('total', v_total, 'total_exact', v_exact,$r$);
    IF position('total_exact' IN d) = 0 OR position('LIMIT 201' IN d) = 0 THEN RAISE EXCEPTION 'nr_browse text did not match – not changed'; END IF;
    EXECUTE d;
  END IF;
END $$;
SELECT position('LIMIT 201' IN pg_get_functiondef('public.nr_browse(jsonb,text,integer,integer)'::regprocedure)) > 0 patched;
-- EXPLAIN is only allowed in a volatile function (nr_browse only reads; marking it volatile changes nothing else)
ALTER FUNCTION public.nr_browse(jsonb, text, integer, integer) VOLATILE;

-- Page query plan: for a rare filter the planner walked the sort index and read ~12,000 rows from disk to find 50
-- matches. With the match count known, a rare filter (fewer matches than ~sqrt((offset+page) × table rows)) selects the
-- matches first and sorts them; a common filter keeps walking the sort index (matches are dense, 50 are found quickly).
-- Same rows, same order.
DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.nr_browse(jsonb,text,integer,integer)'::regprocedure);
  IF position('v_from' IN d) = 0 THEN
    d := replace(d, 'v_plan json; v_exact boolean := true;', 'v_plan json; v_exact boolean := true; v_from text; v_n numeric;');
    d := replace(d, $r$        FROM public.nr_businesses b WHERE %s ORDER BY %s LIMIT %s OFFSET %s) r$q$, v_order, v_where, v_order, v_size, v_off)$r$,
                    $r$        FROM %s ORDER BY %s LIMIT %s OFFSET %s) r$q$, v_order, v_from, v_order, v_size, v_off)$r$);
    d := replace(d, $r$    INTO v_rows USING p_filters;$r$, $r$    INTO v_rows USING p_filters;$r$);
    d := replace(d, $r$  EXECUTE format($q$
    SELECT coalesce(jsonb_agg(r ORDER BY rn), '[]') FROM ($r$,
                    $r$  SELECT greatest(reltuples, 1) INTO v_n FROM pg_class WHERE oid = 'public.nr_businesses'::regclass;
  v_from := CASE WHEN v_total < sqrt((v_off + v_size) * v_n)
                 THEN format('(SELECT b.* FROM public.nr_businesses b WHERE %s OFFSET 0) b', v_where)   -- rare: filter first, then sort
                 ELSE 'public.nr_businesses b WHERE ' || v_where END;                                     -- common: walk the sort index
  EXECUTE format($q$
    SELECT coalesce(jsonb_agg(r ORDER BY rn), '[]') FROM ($r$);
    IF position('v_from := CASE' IN d) = 0 OR position('FROM %s ORDER BY %s LIMIT' IN d) = 0 THEN RAISE EXCEPTION 'nr_browse page text did not match – not changed'; END IF;
    EXECUTE d;
  END IF;
END $$;
SELECT position('v_from := CASE' IN pg_get_functiondef('public.nr_browse(jsonb,text,integer,integer)'::regprocedure)) > 0 page_plan_patched;

-- The registry screen's read functions get their own time limit (Supabase: a function-level statement_timeout applies to
-- REST calls). The "authenticated" role keeps its 3 s for everything else (claims etc. are not affected). On the Micro
-- compute a page of a cold, 1.2 GB table can need a few seconds of disk reads – especially while maintenance runs.
DO $$
DECLARE f regprocedure;
BEGIN
  FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname IN ('nr_browse', 'nr_facets', 'nr_stats', 'nr_export_page', 'nr_business_detail',
              'nr_outreach_page', 'nr_leads_page', 'nr_enrichment_report', 'nr_intel_report', 'nr_scale_report', 'nr_review_queue',
              'nr_control_panel', 'nr_search', 'nr_source_detail', 'nr_watch_updates')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET statement_timeout = %L', f, '25s');
  END LOOP;
END $$;
SELECT count(*) functions_with_own_timeout FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname LIKE 'nr\_%' AND p.proconfig::text LIKE '%statement_timeout=25s%';
