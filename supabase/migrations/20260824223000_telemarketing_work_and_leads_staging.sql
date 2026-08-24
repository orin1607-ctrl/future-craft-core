-- Staging ONLY (usfeoerkpcafxxlyuldl). Do not apply to Production.
-- Work sessions + lead traffic-light. No DELETE. No Auth/Customers/recording changes.
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_telemarketing_calls_one_timer ON public.telemarketing_calls;
--   DROP TRIGGER IF EXISTS trg_telemarketing_work_one_timer ON public.telemarketing_work_sessions;
--   DROP FUNCTION IF EXISTS public.telemarketing_one_active_timer();
--   DROP FUNCTION IF EXISTS public.telemarketing_lead_key(text, text);
--   DROP TABLE IF EXISTS public.telemarketing_lead_status_events;
--   DROP TABLE IF EXISTS public.telemarketing_lead_states;
--   DROP TABLE IF EXISTS public.telemarketing_work_sessions;
--   DROP INDEX IF EXISTS telemarketing_calls_one_open_per_employee;

CREATE OR REPLACE FUNCTION public.telemarketing_lead_key(phone text, company_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') <> ''
      THEN 'p:' || regexp_replace(phone, '[^0-9]', '', 'g')
    ELSE 'c:' || lower(trim(coalesce(company_name, '')))
  END
$$;

CREATE TABLE IF NOT EXISTS public.telemarketing_work_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  employee_name text NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  company_name text NOT NULL DEFAULT '',
  contact_name text,
  phone text NOT NULL DEFAULT '',
  task_type text NOT NULL DEFAULT '',
  description text,
  note text,
  needs_follow_up boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_seconds integer,
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed')),
  client_token text NOT NULL UNIQUE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telemarketing_work_employee ON public.telemarketing_work_sessions (employee_id);
CREATE INDEX IF NOT EXISTS idx_telemarketing_work_started ON public.telemarketing_work_sessions (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemarketing_work_phone ON public.telemarketing_work_sessions (phone);
CREATE UNIQUE INDEX IF NOT EXISTS telemarketing_work_one_open_per_employee
  ON public.telemarketing_work_sessions (employee_id)
  WHERE status = 'in_progress';

CREATE UNIQUE INDEX IF NOT EXISTS telemarketing_calls_one_open_per_employee
  ON public.telemarketing_calls (employee_id)
  WHERE status = 'in_progress';

DROP TRIGGER IF EXISTS trg_telemarketing_work_updated_at ON public.telemarketing_work_sessions;
CREATE TRIGGER trg_telemarketing_work_updated_at
  BEFORE UPDATE ON public.telemarketing_work_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.telemarketing_lead_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_key text NOT NULL UNIQUE,
  company_name text NOT NULL DEFAULT '',
  contact_name text,
  phone text NOT NULL DEFAULT '',
  employee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  employee_name text,
  lead_color text NOT NULL CHECK (lead_color IN ('red', 'yellow', 'green')),
  lead_status text NOT NULL,
  reason text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT telemarketing_lead_key_not_blank CHECK (lead_key <> '' AND lead_key <> 'c:' AND lead_key <> 'p:')
);

CREATE INDEX IF NOT EXISTS idx_telemarketing_lead_color ON public.telemarketing_lead_states (lead_color);
CREATE INDEX IF NOT EXISTS idx_telemarketing_lead_employee ON public.telemarketing_lead_states (employee_id);

DROP TRIGGER IF EXISTS trg_telemarketing_lead_states_updated_at ON public.telemarketing_lead_states;
CREATE TRIGGER trg_telemarketing_lead_states_updated_at
  BEFORE UPDATE ON public.telemarketing_lead_states
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.telemarketing_lead_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_key text NOT NULL,
  lead_color text NOT NULL CHECK (lead_color IN ('red', 'yellow', 'green')),
  lead_status text NOT NULL,
  reason text,
  changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telemarketing_lead_events_key ON public.telemarketing_lead_status_events (lead_key, changed_at DESC);

CREATE OR REPLACE FUNCTION public.telemarketing_one_active_timer()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'telemarketing_work_sessions' AND NEW.status = 'in_progress' THEN
    IF EXISTS (
      SELECT 1 FROM public.telemarketing_calls c
      WHERE c.employee_id = NEW.employee_id AND c.status = 'in_progress'
    ) THEN
      RAISE EXCEPTION 'יש שיחה פעילה — יש לסיים אותה לפני משימת עבודה';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'telemarketing_calls' AND NEW.status = 'in_progress' THEN
    IF EXISTS (
      SELECT 1 FROM public.telemarketing_work_sessions w
      WHERE w.employee_id = NEW.employee_id AND w.status = 'in_progress'
    ) THEN
      RAISE EXCEPTION 'יש משימת עבודה פעילה — יש לסיים אותה לפני התחלת שיחה';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_telemarketing_work_one_timer ON public.telemarketing_work_sessions;
CREATE TRIGGER trg_telemarketing_work_one_timer
  BEFORE INSERT OR UPDATE OF status ON public.telemarketing_work_sessions
  FOR EACH ROW EXECUTE FUNCTION public.telemarketing_one_active_timer();

DROP TRIGGER IF EXISTS trg_telemarketing_calls_one_timer ON public.telemarketing_calls;
CREATE TRIGGER trg_telemarketing_calls_one_timer
  BEFORE INSERT OR UPDATE OF status ON public.telemarketing_calls
  FOR EACH ROW EXECUTE FUNCTION public.telemarketing_one_active_timer();

ALTER TABLE public.telemarketing_work_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemarketing_lead_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemarketing_lead_status_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS telemarketing_work_select ON public.telemarketing_work_sessions;
CREATE POLICY telemarketing_work_select ON public.telemarketing_work_sessions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'telemarketing_agent'::app_role)
      AND employee_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS telemarketing_work_insert ON public.telemarketing_work_sessions;
CREATE POLICY telemarketing_work_insert ON public.telemarketing_work_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'telemarketing_agent'::app_role)
      AND employee_id = auth.uid()
      AND COALESCE(created_by, auth.uid()) = auth.uid()
    )
  );

DROP POLICY IF EXISTS telemarketing_work_update ON public.telemarketing_work_sessions;
CREATE POLICY telemarketing_work_update ON public.telemarketing_work_sessions
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'telemarketing_agent'::app_role)
      AND employee_id = auth.uid()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'telemarketing_agent'::app_role)
      AND employee_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS telemarketing_leads_select ON public.telemarketing_lead_states;
CREATE POLICY telemarketing_leads_select ON public.telemarketing_lead_states
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'telemarketing_agent'::app_role)
      AND (
        employee_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.telemarketing_calls c
          WHERE c.employee_id = auth.uid()
            AND public.telemarketing_lead_key(c.phone, c.company_name) = lead_key
        )
      )
    )
  );

DROP POLICY IF EXISTS telemarketing_leads_insert ON public.telemarketing_lead_states;
CREATE POLICY telemarketing_leads_insert ON public.telemarketing_lead_states
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'telemarketing_agent'::app_role)
      AND COALESCE(changed_by, auth.uid()) = auth.uid()
    )
  );

DROP POLICY IF EXISTS telemarketing_leads_update ON public.telemarketing_lead_states;
CREATE POLICY telemarketing_leads_update ON public.telemarketing_lead_states
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'telemarketing_agent'::app_role)
      AND (
        employee_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.telemarketing_calls c
          WHERE c.employee_id = auth.uid()
            AND public.telemarketing_lead_key(c.phone, c.company_name) = lead_key
        )
      )
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'telemarketing_agent'::app_role)
      AND COALESCE(changed_by, auth.uid()) = auth.uid()
    )
  );

DROP POLICY IF EXISTS telemarketing_lead_events_select ON public.telemarketing_lead_status_events;
CREATE POLICY telemarketing_lead_events_select ON public.telemarketing_lead_status_events
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'telemarketing_agent'::app_role)
      AND EXISTS (
        SELECT 1 FROM public.telemarketing_lead_states s
        WHERE s.lead_key = telemarketing_lead_status_events.lead_key
          AND (
            s.employee_id = auth.uid()
            OR EXISTS (
              SELECT 1 FROM public.telemarketing_calls c
              WHERE c.employee_id = auth.uid()
                AND public.telemarketing_lead_key(c.phone, c.company_name) = s.lead_key
            )
          )
      )
    )
  );

DROP POLICY IF EXISTS telemarketing_lead_events_insert ON public.telemarketing_lead_status_events;
CREATE POLICY telemarketing_lead_events_insert ON public.telemarketing_lead_status_events
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'telemarketing_agent'::app_role)
      AND COALESCE(changed_by, auth.uid()) = auth.uid()
    )
  );
