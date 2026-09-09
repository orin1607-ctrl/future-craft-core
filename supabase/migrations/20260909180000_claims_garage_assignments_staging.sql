-- Staging ONLY (usfeoerkpcafxxlyuldl / dalia-staging). Do not apply to Production.
-- Garage-photo worker assignment. Separate from claims_records.assigned_to.
-- Workers never get SELECT on claims_records via this table.
-- Rollback: supabase/migrations/20260909180000_claims_garage_assignments_staging_rollback.sql

CREATE TABLE IF NOT EXISTS public.claims_garage_assignments (
  id text PRIMARY KEY,
  claim_id text NOT NULL REFERENCES public.claims_records(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  worker_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status = ANY (ARRAY['pending','in_progress','completed'])),
  worker_note text NOT NULL DEFAULT '',
  photo_count integer NOT NULL DEFAULT 0,
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_by_name text NOT NULL DEFAULT '',
  assigned_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  unassigned_at timestamptz,
  unassigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  unassigned_by_name text NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS claims_garage_one_active
  ON public.claims_garage_assignments (claim_id)
  WHERE unassigned_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_claims_garage_worker_active
  ON public.claims_garage_assignments (worker_id, assigned_at DESC)
  WHERE unassigned_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_claims_garage_claim
  ON public.claims_garage_assignments (claim_id, assigned_at DESC);

ALTER TABLE public.claims_garage_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS claims_garage_assignments_staff ON public.claims_garage_assignments;
CREATE POLICY claims_garage_assignments_staff ON public.claims_garage_assignments
  FOR ALL TO authenticated
  USING (public.claims_can_work_claim(claim_id))
  WITH CHECK (public.claims_can_work_claim(claim_id));

REVOKE ALL ON TABLE public.claims_garage_assignments FROM PUBLIC;
REVOKE ALL ON TABLE public.claims_garage_assignments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.claims_garage_assignments TO authenticated;

COMMENT ON TABLE public.claims_garage_assignments IS
  'Garage-photo job assignment. Not assigned_to. Workers access only via claims-docs edge actions. Staging only.';
