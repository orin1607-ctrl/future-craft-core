
ALTER TABLE public.faults ADD COLUMN IF NOT EXISTS vehicle_id uuid;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS vehicle_id uuid;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS imported boolean NOT NULL DEFAULT false;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS imported_source text;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS imported_at timestamptz;

-- Backfill vehicle_id from plate+company
UPDATE public.faults f SET vehicle_id = v.id
FROM public.vehicles v
WHERE f.vehicle_id IS NULL AND f.vehicle_plate IS NOT NULL
  AND v.license_plate = f.vehicle_plate AND v.company_name = f.company_name;

UPDATE public.service_orders s SET vehicle_id = v.id
FROM public.vehicles v
WHERE s.vehicle_id IS NULL AND s.vehicle_plate IS NOT NULL
  AND v.license_plate = s.vehicle_plate AND v.company_name = s.company_name;

CREATE INDEX IF NOT EXISTS idx_faults_vehicle_id ON public.faults(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_service_orders_vehicle_id ON public.service_orders(vehicle_id);
