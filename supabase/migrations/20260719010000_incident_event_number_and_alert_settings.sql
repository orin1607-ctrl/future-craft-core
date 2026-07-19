-- Staging only: incident event numbering + FK links + company alert channel settings
-- Rollback: DROP FUNCTION allocate_incident_event_number; DROP TABLE incident_event_counters;
--           ALTER TABLE faults/accidents/company_settings DROP COLUMN ...

CREATE TABLE IF NOT EXISTS public.incident_event_counters (
  company_name text NOT NULL,
  year integer NOT NULL,
  prefix text NOT NULL,
  last_value integer NOT NULL DEFAULT 0,
  PRIMARY KEY (company_name, year, prefix)
);

ALTER TABLE public.incident_event_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage incident counters"
  ON public.incident_event_counters FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE OR REPLACE FUNCTION public.allocate_incident_event_number(
  p_company text,
  p_prefix text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  y integer;
  next_val integer;
  safe_company text;
  safe_prefix text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  safe_company := COALESCE(NULLIF(trim(p_company), ''), 'unknown');
  safe_prefix := upper(COALESCE(NULLIF(trim(p_prefix), ''), 'EVT'));
  IF safe_prefix NOT IN ('ACC', 'FLT') THEN
    RAISE EXCEPTION 'invalid prefix';
  END IF;

  y := EXTRACT(YEAR FROM (timezone('Asia/Jerusalem', now())))::integer;

  INSERT INTO public.incident_event_counters (company_name, year, prefix, last_value)
  VALUES (safe_company, y, safe_prefix, 1)
  ON CONFLICT (company_name, year, prefix)
  DO UPDATE SET last_value = public.incident_event_counters.last_value + 1
  RETURNING last_value INTO next_val;

  RETURN safe_prefix || '-' || y::text || '-' || lpad(next_val::text, 6, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.allocate_incident_event_number(text, text) TO authenticated;

-- faults extensions
ALTER TABLE public.faults
  ADD COLUMN IF NOT EXISTS event_number text DEFAULT '',
  ADD COLUMN IF NOT EXISTS vehicle_id uuid,
  ADD COLUMN IF NOT EXISTS driver_id uuid,
  ADD COLUMN IF NOT EXISTS opened_by_role text DEFAULT '',
  ADD COLUMN IF NOT EXISTS fault_type_other text DEFAULT '',
  ADD COLUMN IF NOT EXISTS reporter_phone text DEFAULT '',
  ADD COLUMN IF NOT EXISTS assignee_id uuid,
  ADD COLUMN IF NOT EXISTS assignee_name text DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS faults_company_event_number_uidx
  ON public.faults (company_name, event_number)
  WHERE event_number IS NOT NULL AND event_number <> '';

-- accidents extensions
ALTER TABLE public.accidents
  ADD COLUMN IF NOT EXISTS event_number text DEFAULT '',
  ADD COLUMN IF NOT EXISTS vehicle_id uuid,
  ADD COLUMN IF NOT EXISTS driver_id uuid,
  ADD COLUMN IF NOT EXISTS opened_by_role text DEFAULT '',
  ADD COLUMN IF NOT EXISTS reporter_phone text DEFAULT '',
  ADD COLUMN IF NOT EXISTS assignee_id uuid,
  ADD COLUMN IF NOT EXISTS assignee_name text DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS accidents_company_event_number_uidx
  ON public.accidents (company_name, event_number)
  WHERE event_number IS NOT NULL AND event_number <> '';

-- company incident notification settings (extend existing company_settings)
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS incident_notify_in_app boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS incident_notify_email boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS incident_notify_whatsapp boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS incident_email_recipients text NOT NULL DEFAULT 'fleet_managers',
  ADD COLUMN IF NOT EXISTS incident_whatsapp_recipients text NOT NULL DEFAULT 'dalia';

COMMENT ON COLUMN public.company_settings.incident_notify_in_app IS 'Send in-app notifications for new faults/accidents';
COMMENT ON COLUMN public.company_settings.incident_notify_email IS 'Send email for new faults/accidents';
COMMENT ON COLUMN public.company_settings.incident_notify_whatsapp IS 'Send WhatsApp when company whatsapp_enabled; paid add-on gate';
COMMENT ON COLUMN public.company_settings.incident_email_recipients IS 'fleet_managers | dalia | both';
COMMENT ON COLUMN public.company_settings.incident_whatsapp_recipients IS 'fleet_managers | dalia | both';
