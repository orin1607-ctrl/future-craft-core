-- Oren Car Staging only (usfeoerkpcafxxlyuldl).
-- Tasks 2+8: next due date on each inspection row (historical).
-- Task 9: boolean flag to show existing notes on vehicle/driver lists.
-- Rollback:
--   ALTER TABLE public.vehicle_inspections DROP COLUMN IF EXISTS next_due_date;
--   ALTER TABLE public.vehicles DROP COLUMN IF EXISTS show_notes_on_list;
--   ALTER TABLE public.drivers DROP COLUMN IF EXISTS show_notes_on_list;

ALTER TABLE public.vehicle_inspections
  ADD COLUMN IF NOT EXISTS next_due_date date DEFAULT NULL;

COMMENT ON COLUMN public.vehicle_inspections.next_due_date IS
  'Next inspection due date captured when this inspection was saved (historical per row)';

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS show_notes_on_list boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.vehicles.show_notes_on_list IS
  'When true, vehicles.notes is shown on the vehicles list';

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS show_notes_on_list boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.drivers.show_notes_on_list IS
  'When true, drivers.notes is shown on the drivers list';
