-- Staging ONLY (usfeoerkpcafxxlyuldl). Do not apply to Production.
-- Telemarketing MVP tables + RLS. No DELETE. No locks table.
-- Rollback: DROP TABLE telemarketing_followups, telemarketing_calls, telemarketing_settings CASCADE;
-- Enum value telemarketing_agent cannot be dropped.

CREATE TABLE IF NOT EXISTS public.telemarketing_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  employee_name text NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  company_name text NOT NULL DEFAULT '',
  contact_name text,
  contact_role text,
  phone text NOT NULL DEFAULT '',
  email text,
  vehicle_count integer,
  city text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_seconds integer,
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed')),
  result text,
  lead_rating text,
  summary text,
  needs_follow_up boolean NOT NULL DEFAULT false,
  next_action text,
  follow_up_owner text,
  follow_up_date date,
  follow_up_time time,
  follow_up_urgency text CHECK (follow_up_urgency IS NULL OR follow_up_urgency IN ('רגיל', 'חשוב', 'דחוף')),
  manager_note text,
  whatsapp_status text NOT NULL DEFAULT 'not_applicable'
    CHECK (whatsapp_status IN ('not_applicable', 'pending', 'sent', 'failed')),
  email_status text NOT NULL DEFAULT 'not_applicable'
    CHECK (email_status IN ('not_applicable', 'pending', 'sent', 'failed')),
  client_token text NOT NULL UNIQUE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telemarketing_calls_phone ON public.telemarketing_calls (phone);
CREATE INDEX IF NOT EXISTS idx_telemarketing_calls_company ON public.telemarketing_calls (lower(company_name));
CREATE INDEX IF NOT EXISTS idx_telemarketing_calls_employee ON public.telemarketing_calls (employee_id);
CREATE INDEX IF NOT EXISTS idx_telemarketing_calls_status ON public.telemarketing_calls (status);
CREATE INDEX IF NOT EXISTS idx_telemarketing_calls_created_at ON public.telemarketing_calls (created_at DESC);

CREATE TABLE IF NOT EXISTS public.telemarketing_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL UNIQUE REFERENCES public.telemarketing_calls(id) ON DELETE RESTRICT,
  company_name text NOT NULL,
  contact_name text,
  phone text NOT NULL DEFAULT '',
  action_needed text NOT NULL DEFAULT '',
  owner text,
  due_date date NOT NULL,
  due_time time,
  urgency text NOT NULL DEFAULT 'רגיל' CHECK (urgency IN ('רגיל', 'חשוב', 'דחוף')),
  manager_note text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  completed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telemarketing_followups_status ON public.telemarketing_followups (status);
CREATE INDEX IF NOT EXISTS idx_telemarketing_followups_due_date ON public.telemarketing_followups (due_date);

CREATE TABLE IF NOT EXISTS public.telemarketing_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.telemarketing_settings (key, value) VALUES
  ('manager_whatsapp_number', '0534338601'),
  ('manager_notification_email', ''),
  ('whatsapp_enabled', 'true'),
  ('email_enabled', 'true')
ON CONFLICT (key) DO NOTHING;

DROP TRIGGER IF EXISTS trg_telemarketing_calls_updated_at ON public.telemarketing_calls;
CREATE TRIGGER trg_telemarketing_calls_updated_at
  BEFORE UPDATE ON public.telemarketing_calls
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_telemarketing_settings_updated_at ON public.telemarketing_settings;
CREATE TRIGGER trg_telemarketing_settings_updated_at
  BEFORE UPDATE ON public.telemarketing_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.telemarketing_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemarketing_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemarketing_settings ENABLE ROW LEVEL SECURITY;

-- No DELETE policies on any telemarketing table.

DROP POLICY IF EXISTS telemarketing_calls_select ON public.telemarketing_calls;
CREATE POLICY telemarketing_calls_select ON public.telemarketing_calls
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'telemarketing_agent'::app_role)
      AND employee_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS telemarketing_calls_insert ON public.telemarketing_calls;
CREATE POLICY telemarketing_calls_insert ON public.telemarketing_calls
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'telemarketing_agent'::app_role)
      AND employee_id = auth.uid()
      AND COALESCE(created_by, auth.uid()) = auth.uid()
    )
  );

DROP POLICY IF EXISTS telemarketing_calls_update ON public.telemarketing_calls;
CREATE POLICY telemarketing_calls_update ON public.telemarketing_calls
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
  );

DROP POLICY IF EXISTS telemarketing_followups_insert ON public.telemarketing_followups;
CREATE POLICY telemarketing_followups_insert ON public.telemarketing_followups
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'telemarketing_agent'::app_role)
      AND EXISTS (
        SELECT 1 FROM public.telemarketing_calls c
        WHERE c.id = call_id AND c.employee_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS telemarketing_followups_update ON public.telemarketing_followups;
CREATE POLICY telemarketing_followups_update ON public.telemarketing_followups
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS telemarketing_settings_select ON public.telemarketing_settings;
CREATE POLICY telemarketing_settings_select ON public.telemarketing_settings
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'telemarketing_agent'::app_role)
  );

DROP POLICY IF EXISTS telemarketing_settings_insert ON public.telemarketing_settings;
CREATE POLICY telemarketing_settings_insert ON public.telemarketing_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS telemarketing_settings_update ON public.telemarketing_settings;
CREATE POLICY telemarketing_settings_update ON public.telemarketing_settings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));
