-- Staging ONLY: usfeoerkpcafxxlyuldl. Do not apply to Production.
-- OpenProspector: Source Discovery repository for new sources discovered by Gemini.
-- Sources are saved as 'new' or 'under_review' and must be manually approved
-- before becoming permanent free sources for the prospector engine.

CREATE TABLE IF NOT EXISTS public.prospect_discovered_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name text NOT NULL,
  url text NOT NULL,
  domain text,
  source_type text DEFAULT 'web_grounding',
  field_types text[] DEFAULT '{}'::text[],
  leads_helped_count integer NOT NULL DEFAULT 1,
  sample_lead_id uuid REFERENCES public.prospect_leads(id) ON DELETE SET NULL,
  sample_lead_name text,
  sample_findings jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'under_review', 'approved_permanent', 'rejected')),
  discovered_by text DEFAULT 'gemini_grounding',
  discovered_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  review_notes text,
  reusable boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_prospect_discovered_sources_url UNIQUE (url)
);

CREATE INDEX IF NOT EXISTS idx_prospect_discovered_sources_status ON public.prospect_discovered_sources (status);
CREATE INDEX IF NOT EXISTS idx_prospect_discovered_sources_domain ON public.prospect_discovered_sources (domain);

-- Enable RLS
ALTER TABLE public.prospect_discovered_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pds_select_policy" ON public.prospect_discovered_sources;
CREATE POLICY "pds_select_policy" ON public.prospect_discovered_sources
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "pds_insert_policy" ON public.prospect_discovered_sources;
CREATE POLICY "pds_insert_policy" ON public.prospect_discovered_sources
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "pds_update_policy" ON public.prospect_discovered_sources;
CREATE POLICY "pds_update_policy" ON public.prospect_discovered_sources
  FOR UPDATE TO anon, authenticated
  USING (true)
  WITH CHECK (true);
