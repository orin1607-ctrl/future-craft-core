-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- Registry browse / export carry the industry classification and fleet level (the existing functions are extended in place).
DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.nr_browse(jsonb,text,integer,integer)'::regprocedure);
  IF position('b.ind_codes' IN d) = 0 THEN
    d := replace(d, 'b.rel_count, b.rel_verified, b.watched,', 'b.rel_count, b.rel_verified, b.watched, b.ind_codes, b.ind_main, b.fleet_level, b.fleet_min,');
    d := replace(d, 'WHEN ''relations'' THEN ''b.rel_count DESC, b.id''', 'WHEN ''relations'' THEN ''b.rel_count DESC, b.id''' || chr(10) || '    WHEN ''fleet'' THEN ''b.fleet_score DESC NULLS LAST, b.id''');
    EXECUTE d;
  END IF;
  d := pg_get_functiondef('public.nr_export_page(jsonb,bigint,integer)'::regprocedure);
  IF position('industries' IN d) = 0 THEN
    d := replace(d, 'b.website, b.source_count,', 'b.website, b.source_count, b.fleet_level, b.fleet_min,' ||
      ' (SELECT string_agg(i.main_label || '' – '' || i.sub_label, ''; '' ORDER BY i.sort) FROM public.nr_industries i WHERE i.code = ANY(b.ind_codes)) industries,');
    EXECUTE d;
  END IF;
  d := pg_get_functiondef('public.nr_outreach_page(jsonb,bigint,integer)'::regprocedure);
  IF position('b.ind_codes' IN d) = 0 THEN
    d := replace(d, 'b.fleet_contact, b.employees_count,', 'b.fleet_contact, b.employees_count, b.ind_codes,');
    EXECUTE d;
  END IF;
END $$;
SELECT position('b.ind_codes' IN pg_get_functiondef('public.nr_outreach_page(jsonb,bigint,integer)'::regprocedure)) > 0 outreach_ok,
       position('b.ind_codes' IN pg_get_functiondef('public.nr_browse(jsonb,text,integer,integer)'::regprocedure)) > 0 browse_ok,
       position('industries' IN pg_get_functiondef('public.nr_export_page(jsonb,bigint,integer)'::regprocedure)) > 0 export_ok;
