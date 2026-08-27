-- Staging ONLY (usfeoerkpcafxxlyuldl). Do not apply to Production.
-- One-shot: historical/manual work time + follow-up without inventing a past call.
-- Rollback:
--   DROP POLICY IF EXISTS telemarketing_historical_work_select ON public.telemarketing_historical_work;
--   DROP TABLE IF EXISTS public.telemarketing_historical_work;
--   ALTER TABLE public.telemarketing_followups DROP COLUMN IF EXISTS owner_employee_id;
--   -- restore call_id NOT NULL only after no null call_id rows remain
-- No RPC. No DELETE policies.

ALTER TABLE public.telemarketing_followups
  ALTER COLUMN call_id DROP NOT NULL;

ALTER TABLE public.telemarketing_followups
  ADD COLUMN IF NOT EXISTS owner_employee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_telemarketing_followups_owner_employee
  ON public.telemarketing_followups (owner_employee_id);

DROP POLICY IF EXISTS telemarketing_followups_select ON public.telemarketing_followups;
CREATE POLICY telemarketing_followups_select ON public.telemarketing_followups
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'telemarketing_agent'::app_role)
      AND EXISTS (
        SELECT 1 FROM public.telemarketing_calls c
        WHERE c.id = call_id AND c.employee_id = auth.uid()
      )
    )
    OR (
      public.has_role(auth.uid(), 'telemarketing_agent'::app_role)
      AND owner_employee_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS telemarketing_followups_update_agent ON public.telemarketing_followups;
CREATE POLICY telemarketing_followups_update_agent
ON public.telemarketing_followups FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'telemarketing_agent'::app_role)
  AND (
    EXISTS (
      SELECT 1 FROM public.telemarketing_calls c
      WHERE c.id = call_id AND c.employee_id = auth.uid()
    )
    OR owner_employee_id = auth.uid()
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'telemarketing_agent'::app_role)
  AND (
    EXISTS (
      SELECT 1 FROM public.telemarketing_calls c
      WHERE c.id = call_id AND c.employee_id = auth.uid()
    )
    OR owner_employee_id = auth.uid()
  )
);

CREATE TABLE IF NOT EXISTS public.telemarketing_historical_work (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  employee_name text NOT NULL,
  work_date date NOT NULL,
  lead_number text,
  company_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  duration_seconds integer NOT NULL CHECK (duration_seconds > 0),
  note text NOT NULL DEFAULT 'זמן היסטורי / הוזן ידנית',
  source text NOT NULL DEFAULT 'manual_historical',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telemarketing_historical_work_employee_date
  ON public.telemarketing_historical_work (employee_id, work_date);

ALTER TABLE public.telemarketing_historical_work ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS telemarketing_historical_work_select ON public.telemarketing_historical_work;
CREATE POLICY telemarketing_historical_work_select ON public.telemarketing_historical_work
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'telemarketing_agent'::app_role)
      AND employee_id = auth.uid()
    )
  );

GRANT SELECT ON public.telemarketing_historical_work TO authenticated;
GRANT ALL ON public.telemarketing_historical_work TO service_role;

NOTIFY pgrst, 'reload schema';
