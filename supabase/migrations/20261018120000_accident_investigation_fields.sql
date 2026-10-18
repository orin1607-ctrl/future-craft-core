-- Accident report: driver fault, investigation done, investigation conclusions.
-- Additive and nullable: existing rows keep NULL ("not determined" / "not done").
-- The existing row-level policies on accidents (company_name scope) cover the new
-- columns as-is; no policy or grant is changed here.
begin;

alter table public.accidents
  add column if not exists driver_at_fault text,
  add column if not exists investigation_done text,
  add column if not exists investigation_conclusions text;

alter table public.accidents
  drop constraint if exists accidents_driver_at_fault_check,
  add constraint accidents_driver_at_fault_check
    check (driver_at_fault is null or driver_at_fault in ('yes', 'no')),
  drop constraint if exists accidents_investigation_done_check,
  add constraint accidents_investigation_done_check
    check (investigation_done is null or investigation_done in ('yes', 'no'));

comment on column public.accidents.driver_at_fault is 'yes / no; NULL = not determined yet';
comment on column public.accidents.investigation_done is 'yes / no; NULL = not done yet';
comment on column public.accidents.investigation_conclusions is 'Free-text investigation conclusions';

commit;
