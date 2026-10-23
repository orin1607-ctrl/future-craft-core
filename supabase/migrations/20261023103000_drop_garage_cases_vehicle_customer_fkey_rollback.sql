-- Rollback: drop_garage_cases_vehicle_customer_fkey
ALTER TABLE public.garage_cases
  ADD CONSTRAINT garage_cases_vehicle_customer_fkey
  FOREIGN KEY (vehicle_id, customer_id)
  REFERENCES public.garage_vehicles(id, customer_id)
  ON DELETE RESTRICT;
