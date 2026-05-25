CREATE OR REPLACE FUNCTION public.log_vehicle_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  drv_old TEXT;
  drv_new TEXT;
BEGIN
  -- Status change
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.vehicle_history (vehicle_id, company_name, event_type, event_date, title, description, source)
    VALUES (NEW.id, COALESCE(NEW.company_name, ''), 'status_change', now(),
            'שינוי סטטוס רכב',
            'מ-' || COALESCE(OLD.status, '—') || ' ל-' || COALESCE(NEW.status, '—'),
            'system');
  END IF;

  -- Odometer change (only if increased or set for the first time)
  IF NEW.odometer IS DISTINCT FROM OLD.odometer AND NEW.odometer IS NOT NULL THEN
    INSERT INTO public.vehicle_history (vehicle_id, company_name, event_type, event_date, title, description, odometer, source)
    VALUES (NEW.id, COALESCE(NEW.company_name, ''), 'odometer', now(),
            'עדכון קילומטראז׳',
            'מ-' || COALESCE(OLD.odometer::text, '—') || ' ל-' || NEW.odometer::text,
            NEW.odometer, 'system');
  END IF;

  -- Driver assignment change
  IF NEW.assigned_driver_id IS DISTINCT FROM OLD.assigned_driver_id THEN
    SELECT full_name INTO drv_old FROM public.drivers WHERE id = OLD.assigned_driver_id;
    SELECT full_name INTO drv_new FROM public.drivers WHERE id = NEW.assigned_driver_id;
    INSERT INTO public.vehicle_history (vehicle_id, company_name, event_type, event_date, title, description, source)
    VALUES (NEW.id, COALESCE(NEW.company_name, ''), 'driver_assignment', now(),
            'שיוך נהג',
            'מ-' || COALESCE(drv_old, '—') || ' ל-' || COALESCE(drv_new, '—'),
            'system');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_vehicle_changes ON public.vehicles;
CREATE TRIGGER trg_log_vehicle_changes
AFTER UPDATE ON public.vehicles
FOR EACH ROW
EXECUTE FUNCTION public.log_vehicle_changes();