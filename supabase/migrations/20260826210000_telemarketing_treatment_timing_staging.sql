-- Staging ONLY (usfeoerkpcafxxlyuldl). Do not apply to Production.
-- Adds report/treatment timestamps next to existing call and work timers.
-- Rollback: DROP the five new columns from telemarketing_calls and telemarketing_work_sessions.

ALTER TABLE public.telemarketing_calls
  ADD COLUMN IF NOT EXISTS report_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS report_ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS report_duration_seconds integer,
  ADD COLUMN IF NOT EXISTS treated_ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS treatment_duration_seconds integer;

ALTER TABLE public.telemarketing_work_sessions
  ADD COLUMN IF NOT EXISTS report_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS report_ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS report_duration_seconds integer,
  ADD COLUMN IF NOT EXISTS treated_ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS treatment_duration_seconds integer;
