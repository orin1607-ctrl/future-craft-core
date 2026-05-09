
-- Pickup appointments table
CREATE TABLE public.pickup_appointments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name TEXT,
  customer_id UUID,
  customer_name TEXT,
  customer_phone TEXT,
  vehicle_id UUID,
  vehicle_plate TEXT,
  driver_id UUID,
  driver_name TEXT,
  driver_phone TEXT,
  scheduled_date DATE,
  scheduled_time TIME,
  location TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  source TEXT NOT NULL DEFAULT 'voice_ai',
  call_log_id UUID,
  conversation_id TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pickup_appointments ENABLE ROW LEVEL SECURITY;

-- Super admin sees all
CREATE POLICY "super_admin_all_pickup" ON public.pickup_appointments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Fleet managers see their company
CREATE POLICY "fleet_manager_company_pickup" ON public.pickup_appointments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'fleet_manager') AND company_name = public.get_user_company(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'fleet_manager') AND company_name = public.get_user_company(auth.uid()));

-- Drivers see their own assignments
CREATE POLICY "driver_own_pickup" ON public.pickup_appointments
  FOR SELECT TO authenticated
  USING (driver_id = auth.uid());

CREATE POLICY "driver_update_own_pickup" ON public.pickup_appointments
  FOR UPDATE TO authenticated
  USING (driver_id = auth.uid())
  WITH CHECK (driver_id = auth.uid());

-- Service role / system inserts (from edge functions w/ service key bypass RLS)
CREATE POLICY "system_insert_pickup" ON public.pickup_appointments
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE TRIGGER update_pickup_appointments_updated_at
  BEFORE UPDATE ON public.pickup_appointments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_pickup_company ON public.pickup_appointments(company_name);
CREATE INDEX idx_pickup_driver ON public.pickup_appointments(driver_id);
CREATE INDEX idx_pickup_date ON public.pickup_appointments(scheduled_date);

-- Notify driver when assigned to a pickup
CREATE OR REPLACE FUNCTION public.notify_driver_on_pickup_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.driver_id IS NOT NULL THEN
    INSERT INTO public.driver_notifications (user_id, type, title, message, link)
    VALUES (
      NEW.driver_id,
      'pickup',
      '🚗 תיאום איסוף רכב חדש',
      'שובץ לך איסוף רכב ' || COALESCE(NEW.vehicle_plate, '') ||
      ' מ-' || COALESCE(NEW.customer_name, 'לקוח') ||
      CASE WHEN NEW.scheduled_date IS NOT NULL
           THEN ' ב-' || to_char(NEW.scheduled_date, 'DD/MM/YYYY') ||
                COALESCE(' בשעה ' || to_char(NEW.scheduled_time, 'HH24:MI'), '')
           ELSE '' END,
      '/pickup-appointments'
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_driver_pickup_insert
  AFTER INSERT ON public.pickup_appointments
  FOR EACH ROW EXECUTE FUNCTION public.notify_driver_on_pickup_assignment();

CREATE TRIGGER trg_notify_driver_pickup_update
  AFTER UPDATE OF driver_id ON public.pickup_appointments
  FOR EACH ROW
  WHEN (OLD.driver_id IS DISTINCT FROM NEW.driver_id)
  EXECUTE FUNCTION public.notify_driver_on_pickup_assignment();
