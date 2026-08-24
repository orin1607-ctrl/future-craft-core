-- Staging ONLY (usfeoerkpcafxxlyuldl). Do not apply to Production.
-- Minimal Follow-up links + agent UPDATE (no DELETE).
-- Rollback:
--   DROP POLICY IF EXISTS telemarketing_followups_update_agent ON public.telemarketing_followups;
--   ALTER TABLE public.telemarketing_calls DROP COLUMN IF EXISTS source_followup_id;
--   ALTER TABLE public.telemarketing_followups DROP COLUMN IF EXISTS closed_by_call_id;

ALTER TABLE public.telemarketing_calls
  ADD COLUMN IF NOT EXISTS source_followup_id uuid;

ALTER TABLE public.telemarketing_followups
  ADD COLUMN IF NOT EXISTS closed_by_call_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'telemarketing_calls_source_followup_fkey'
  ) THEN
    ALTER TABLE public.telemarketing_calls
      ADD CONSTRAINT telemarketing_calls_source_followup_fkey
      FOREIGN KEY (source_followup_id) REFERENCES public.telemarketing_followups(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'telemarketing_followups_closed_by_call_fkey'
  ) THEN
    ALTER TABLE public.telemarketing_followups
      ADD CONSTRAINT telemarketing_followups_closed_by_call_fkey
      FOREIGN KEY (closed_by_call_id) REFERENCES public.telemarketing_calls(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_telemarketing_calls_source_followup
  ON public.telemarketing_calls (source_followup_id);
CREATE INDEX IF NOT EXISTS idx_telemarketing_followups_closed_by_call
  ON public.telemarketing_followups (closed_by_call_id);

-- Agent may complete/update own follow-ups. Super-admin policy stays. No DELETE.
DROP POLICY IF EXISTS telemarketing_followups_update_agent ON public.telemarketing_followups;
CREATE POLICY telemarketing_followups_update_agent
ON public.telemarketing_followups FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'telemarketing_agent'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.telemarketing_calls c
    WHERE c.id = call_id AND c.employee_id = auth.uid()
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'telemarketing_agent'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.telemarketing_calls c
    WHERE c.id = call_id AND c.employee_id = auth.uid()
  )
);
