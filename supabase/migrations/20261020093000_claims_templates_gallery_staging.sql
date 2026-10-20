-- Staging ONLY (usfeoerkpcafxxlyuldl). Permanent claims templates gallery for Dalia AI.
-- Does not touch Production.

CREATE TABLE IF NOT EXISTS public.claims_templates (
  id text PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'cat_b',
  form_key text,
  storage_path text NOT NULL,
  original_name text NOT NULL DEFAULT '',
  mime_type text NOT NULL DEFAULT 'application/pdf',
  byte_size integer NOT NULL DEFAULT 0,
  content_sha256 text,
  is_permanent boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_claims_templates_name ON public.claims_templates (name);
CREATE INDEX IF NOT EXISTS idx_claims_templates_form_key ON public.claims_templates (form_key);

ALTER TABLE public.claims_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "claims_templates_select" ON public.claims_templates;
CREATE POLICY "claims_templates_select" ON public.claims_templates
  FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "claims_templates_insert" ON public.claims_templates;
CREATE POLICY "claims_templates_insert" ON public.claims_templates
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "claims_templates_update" ON public.claims_templates;
CREATE POLICY "claims_templates_update" ON public.claims_templates
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "claims_templates_delete" ON public.claims_templates;
CREATE POLICY "claims_templates_delete" ON public.claims_templates
  FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.claims_templates TO authenticated;
GRANT SELECT ON TABLE public.claims_templates TO anon;
