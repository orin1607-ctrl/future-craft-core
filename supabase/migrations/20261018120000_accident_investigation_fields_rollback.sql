-- Rollback for 20261018120000_accident_investigation_fields.sql.
-- WARNING: dropping the columns deletes any investigation answers saved since the
-- migration. Back them up first:
--   create table public.accidents_investigation_backup_20261018 as
--   select id, company_name, driver_at_fault, investigation_done, investigation_conclusions
--   from public.accidents
--   where driver_at_fault is not null or investigation_done is not null or investigation_conclusions is not null;
-- Rolling back the frontend alone is enough to hide the fields; drop the columns only if required.
begin;

alter table public.accidents
  drop constraint if exists accidents_driver_at_fault_check,
  drop constraint if exists accidents_investigation_done_check,
  drop column if exists driver_at_fault,
  drop column if exists investigation_done,
  drop column if exists investigation_conclusions;

commit;
