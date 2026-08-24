-- Staging ONLY (usfeoerkpcafxxlyuldl). Do not apply to Production.
-- Adds telemarketing_agent to app_role. Must commit before the value is used
-- in policies (separate migration file).

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'telemarketing_agent';
