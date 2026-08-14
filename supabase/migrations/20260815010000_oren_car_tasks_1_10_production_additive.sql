-- Oren Car Production RC - additive schema only (tasks 1-10).
-- Idempotent ADD COLUMN IF NOT EXISTS. No DROP / rename / backfill / policies / data changes.
-- This file is Production-owned; it is not a copy of the Staging migration.

-- Task 2 / 8: historical next-due date captured on each inspection row.
ALTER TABLE public.vehicle_inspections
  ADD COLUMN IF NOT EXISTS next_due_date date DEFAULT NULL;

COMMENT ON COLUMN public.vehicle_inspections.next_due_date IS
  'Next inspection due date captured when this inspection was saved (historical per row; NULL when unknown)';

-- Task 9: optional list display of existing notes on vehicles / drivers.
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS show_notes_on_list boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.vehicles.show_notes_on_list IS
  'When true, vehicles.notes is shown on the vehicles list card';

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS show_notes_on_list boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.drivers.show_notes_on_list IS
  'When true, drivers.notes is shown on the drivers list card';
