-- Staging ONLY (usfeoerkpcafxxlyuldl). Do not apply to Production.
-- Lead directory + single import pipeline (paste/csv/xlsx share this).
-- No DELETE of existing leads. No Auth/OTP/RLS weakening. No Dalia customers.
-- Rollback:
--   DROP FUNCTION IF EXISTS public.telemarketing_commit_lead_import(text, text, jsonb, text, text, jsonb);
--   DROP TABLE IF EXISTS public.telemarketing_lead_directory;
--   DROP TABLE IF EXISTS public.telemarketing_lead_import_batches;

CREATE TABLE IF NOT EXISTS public.telemarketing_lead_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('pasted_sheet', 'csv', 'xlsx')),
  file_name text,
  status text NOT NULL DEFAULT 'committed' CHECK (status IN ('committed', 'cancelled')),
  row_count integer NOT NULL DEFAULT 0,
  imported_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  duplicate_count integer NOT NULL DEFAULT 0,
  invalid_count integer NOT NULL DEFAULT 0,
  mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_input_sha256 text,
  raw_input_preview text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.telemarketing_lead_directory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_number text NOT NULL DEFAULT '',
  company_name text NOT NULL DEFAULT '',
  industry text NOT NULL DEFAULT '',
  region text NOT NULL DEFAULT '',
  fleet_size text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  import_batch_id uuid REFERENCES public.telemarketing_lead_import_batches(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'pasted_sheet',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT telemarketing_lead_directory_identity CHECK (btrim(company_name) <> '' OR btrim(phone) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS telemarketing_lead_directory_number_ux
  ON public.telemarketing_lead_directory (lead_number)
  WHERE btrim(lead_number) <> '';

CREATE INDEX IF NOT EXISTS idx_telemarketing_lead_directory_phone ON public.telemarketing_lead_directory (phone);
CREATE INDEX IF NOT EXISTS idx_telemarketing_lead_directory_email ON public.telemarketing_lead_directory (lower(email));
CREATE INDEX IF NOT EXISTS idx_telemarketing_lead_directory_batch ON public.telemarketing_lead_directory (import_batch_id);

DROP TRIGGER IF EXISTS trg_telemarketing_lead_directory_updated_at ON public.telemarketing_lead_directory;
CREATE TRIGGER trg_telemarketing_lead_directory_updated_at
  BEFORE UPDATE ON public.telemarketing_lead_directory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.telemarketing_lead_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemarketing_lead_directory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS telemarketing_lead_batches_select ON public.telemarketing_lead_import_batches;
CREATE POLICY telemarketing_lead_batches_select ON public.telemarketing_lead_import_batches
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS telemarketing_lead_directory_select ON public.telemarketing_lead_directory;
CREATE POLICY telemarketing_lead_directory_select ON public.telemarketing_lead_directory
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'telemarketing_agent'::app_role)
  );

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
  phone_key text;
  email_key text;
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
  IF total > 2000 THEN
    RAISE EXCEPTION 'יותר מדי שורות. המגבלה הבטוחה היא 2000 לידים בבת אחת.';
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
    phone_key := regexp_replace(phone, '[^0-9*]', '', 'g');
    IF phone_key <> '' AND EXISTS (
      SELECT 1 FROM public.telemarketing_lead_directory d
      WHERE regexp_replace(d.phone, '[^0-9*]', '', 'g') = phone_key
    ) THEN
      duplicates := duplicates + 1;
      skipped := skipped + 1;
      CONTINUE;
    END IF;
    email_key := lower(email);
    IF email_key <> '' AND EXISTS (
      SELECT 1 FROM public.telemarketing_lead_directory d
      WHERE lower(d.email) = email_key AND d.email <> ''
    ) THEN
      duplicates := duplicates + 1;
      skipped := skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.telemarketing_lead_directory (
      lead_number, company_name, industry, region, fleet_size, phone, email, extra, import_batch_id, source, created_by
    ) VALUES (
      lead_no, company, industry, region, fleet, phone, email, COALESCE(item->'extra', '{}'::jsonb), batch_id, p_source, auth.uid()
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

REVOKE ALL ON FUNCTION public.telemarketing_commit_lead_import(text, text, jsonb, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.telemarketing_commit_lead_import(text, text, jsonb, text, text, jsonb) TO authenticated;
