-- Staging ONLY (usfeoerkpcafxxlyuldl). Do not apply to Production.
-- Old/new lead wave + unassign without touching follow-ups/history.
-- Import dedup: company name (not shared switchboard/email alone).
-- Rollback: revert this file; lead_wave column can stay (default old).

ALTER TABLE public.telemarketing_lead_directory
  ADD COLUMN IF NOT EXISTS lead_wave text NOT NULL DEFAULT 'old';

ALTER TABLE public.telemarketing_lead_directory
  DROP CONSTRAINT IF EXISTS telemarketing_lead_directory_wave_chk;
ALTER TABLE public.telemarketing_lead_directory
  ADD CONSTRAINT telemarketing_lead_directory_wave_chk CHECK (lead_wave IN ('old', 'new'));

CREATE INDEX IF NOT EXISTS idx_telemarketing_lead_directory_wave
  ON public.telemarketing_lead_directory (lead_wave);

CREATE OR REPLACE FUNCTION public.telemarketing_unassign_leads(p_lead_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  actor_name text;
  lead_row public.telemarketing_lead_directory%ROWTYPE;
  cleared integer := 0;
  skipped integer := 0;
  skipped_items jsonb := '[]'::jsonb;
  found_ids uuid[] := '{}';
  missing uuid;
BEGIN
  IF NOT public.has_role(actor, 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'אין הרשאה לביטול שיוך לידים';
  END IF;
  IF p_lead_ids IS NULL OR coalesce(array_length(p_lead_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'לא נבחרו לידים';
  END IF;
  IF array_length(p_lead_ids, 1) > 2000 THEN
    RAISE EXCEPTION 'יותר מדי לידים לביטול שיוך בבת אחת';
  END IF;

  SELECT full_name INTO actor_name FROM public.profiles WHERE id = actor;

  FOR lead_row IN
    SELECT * FROM public.telemarketing_lead_directory d
    WHERE d.id = ANY (p_lead_ids)
    ORDER BY d.created_at
    FOR UPDATE
  LOOP
    found_ids := array_append(found_ids, lead_row.id);
    IF lead_row.assigned_to IS NULL AND lead_row.claimed_by IS NULL THEN
      skipped := skipped + 1;
      skipped_items := skipped_items || jsonb_build_array(jsonb_build_object(
        'leadNumber', lead_row.lead_number,
        'companyName', lead_row.company_name,
        'reason', 'כבר ללא שיוך'
      ));
      CONTINUE;
    END IF;
    IF public.telemarketing_lead_is_busy(lead_row.phone, lead_row.company_name) THEN
      skipped := skipped + 1;
      skipped_items := skipped_items || jsonb_build_array(jsonb_build_object(
        'leadNumber', lead_row.lead_number,
        'companyName', lead_row.company_name,
        'reason', 'הליד בשיחה או במשימה פעילה — השיוך לא בוטל'
      ));
      CONTINUE;
    END IF;
    UPDATE public.telemarketing_lead_directory
    SET assigned_to = NULL,
        assigned_name = NULL,
        assigned_at = NULL,
        claimed_by = NULL,
        claimed_at = NULL
    WHERE id = lead_row.id;
    INSERT INTO public.telemarketing_lead_assignment_events (
      lead_id, lead_number, previous_agent_id, previous_agent_name, new_agent_id, new_agent_name, changed_by, changed_by_name
    ) VALUES (
      lead_row.id, lead_row.lead_number, lead_row.assigned_to, lead_row.assigned_name, NULL, '', actor, actor_name
    );
    cleared := cleared + 1;
  END LOOP;

  FOREACH missing IN ARRAY p_lead_ids
  LOOP
    IF NOT (missing = ANY (found_ids)) THEN
      skipped := skipped + 1;
      skipped_items := skipped_items || jsonb_build_array(jsonb_build_object(
        'leadNumber', '',
        'companyName', '',
        'reason', 'ליד לא נמצא במאגר'
      ));
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'unassignedCount', cleared,
    'skippedCount', skipped,
    'skipped', skipped_items
  );
END;
$$;

REVOKE ALL ON FUNCTION public.telemarketing_unassign_leads(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.telemarketing_unassign_leads(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.telemarketing_commit_lead_import(
  p_source text,
  p_file_name text,
  p_mapping jsonb,
  p_raw_sha text,
  p_raw_preview text,
  p_rows jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  batch_id uuid;
  item jsonb;
  imported integer := 0;
  skipped integer := 0;
  duplicates integer := 0;
  invalids integer := 0;
  total integer;
  lead_no text;
  company text;
  industry text;
  region text;
  fleet text;
  phone text;
  email text;
  company_key text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'אין הרשאה לייבוא לידים';
  END IF;
  IF p_source NOT IN ('pasted_sheet', 'csv', 'xlsx') THEN
    RAISE EXCEPTION 'מקור ייבוא לא נתמך';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'חסרות שורות לייבוא';
  END IF;
  total := jsonb_array_length(p_rows);
  IF total > 3000 THEN
    RAISE EXCEPTION 'יותר מדי שורות. המגבלה הבטוחה היא 3000 לידים בבת אחת.';
  END IF;

  INSERT INTO public.telemarketing_lead_import_batches (
    source, file_name, status, row_count, mapping, raw_input_sha256, raw_input_preview, created_by, committed_at
  ) VALUES (
    p_source, p_file_name, 'committed', total, COALESCE(p_mapping, '{}'::jsonb), p_raw_sha,
    left(COALESCE(p_raw_preview, ''), 4000), auth.uid(), now()
  ) RETURNING id INTO batch_id;

  FOR item IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    lead_no := btrim(COALESCE(item->>'lead_number', ''));
    company := btrim(COALESCE(item->>'company_name', ''));
    industry := btrim(COALESCE(item->>'industry', ''));
    region := btrim(COALESCE(item->>'region', ''));
    fleet := btrim(COALESCE(item->>'fleet_size', ''));
    phone := btrim(COALESCE(item->>'phone', ''));
    email := btrim(COALESCE(item->>'email', ''));
    IF company = '' AND phone = '' THEN
      invalids := invalids + 1;
      skipped := skipped + 1;
      CONTINUE;
    END IF;
    IF lead_no <> '' AND EXISTS (
      SELECT 1 FROM public.telemarketing_lead_directory d WHERE d.lead_number = lead_no
    ) THEN
      duplicates := duplicates + 1;
      skipped := skipped + 1;
      CONTINUE;
    END IF;
    company_key := lower(btrim(regexp_replace(regexp_replace(company, '[''״׳"]+', '', 'g'), '\s+', ' ', 'g')));
    IF company_key <> '' AND EXISTS (
      SELECT 1 FROM public.telemarketing_lead_directory d
      WHERE lower(btrim(regexp_replace(regexp_replace(d.company_name, '[''״׳"]+', '', 'g'), '\s+', ' ', 'g'))) = company_key
    ) THEN
      duplicates := duplicates + 1;
      skipped := skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.telemarketing_lead_directory (
      lead_number, company_name, industry, region, fleet_size, phone, email, extra, import_batch_id, source, created_by, lead_wave
    ) VALUES (
      lead_no, company, industry, region, fleet, phone, email, COALESCE(item->'extra', '{}'::jsonb), batch_id, p_source, auth.uid(), 'new'
    );
    imported := imported + 1;
  END LOOP;

  UPDATE public.telemarketing_lead_import_batches
  SET imported_count = imported,
      skipped_count = skipped,
      duplicate_count = duplicates,
      invalid_count = invalids
  WHERE id = batch_id;

  RETURN jsonb_build_object(
    'batchId', batch_id,
    'importedCount', imported,
    'skippedCount', skipped,
    'duplicateCount', duplicates,
    'invalidCount', invalids,
    'rowCount', total
  );
END;
$$;
