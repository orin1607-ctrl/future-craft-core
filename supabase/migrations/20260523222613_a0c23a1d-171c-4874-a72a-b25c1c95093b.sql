
-- 1. Tighten voice_scenario_runs INSERT policy
DROP POLICY IF EXISTS runs_insert ON public.voice_scenario_runs;
CREATE POLICY runs_insert ON public.voice_scenario_runs
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR (has_role(auth.uid(), 'fleet_manager'::app_role) AND company_name = get_user_company(auth.uid()))
  );

-- 2. Revoke EXECUTE on internal trigger/utility SECURITY DEFINER functions from anon and authenticated.
-- These are only meant to be called by triggers, not via the API.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.set_deal_number() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.set_exchange_number() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.set_work_order_number() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.set_supplier_number() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_driver_on_exam() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_driver_on_pickup_assignment() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_managers_on_service_order() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_managers_on_service_order_urgent() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_managers_on_fault() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_managers_on_accident() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.queue_voice_scenarios_on_service_order() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.queue_voice_scenarios_on_fault() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.log_info_gap_status_change() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.export_schema_ddl() FROM anon, authenticated, public;
-- has_role, get_user_role, get_user_company are used inside RLS policies and can stay callable.

-- 3. Restrict anon access on driver_declarations to only rows with a valid token filter.
-- Requires the client to explicitly filter by a non-empty token; without a token, no rows are returned.
DROP POLICY IF EXISTS "Anonymous can view by token" ON public.driver_declarations;
DROP POLICY IF EXISTS "Anonymous can update by token" ON public.driver_declarations;
CREATE POLICY "Anonymous can view by token" ON public.driver_declarations
  FOR SELECT TO anon
  USING (token IS NOT NULL AND length(token) >= 20 AND status = 'pending');
CREATE POLICY "Anonymous can update by token" ON public.driver_declarations
  FOR UPDATE TO anon
  USING (token IS NOT NULL AND length(token) >= 20 AND status = 'pending')
  WITH CHECK (token IS NOT NULL AND length(token) >= 20);

-- 4. Same for driving_exams
DROP POLICY IF EXISTS "Anon view exam by token" ON public.driving_exams;
DROP POLICY IF EXISTS "Anon submit exam by token" ON public.driving_exams;
CREATE POLICY "Anon view exam by token" ON public.driving_exams
  FOR SELECT TO anon
  USING (token IS NOT NULL AND length(token) >= 20 AND status = 'pending');
CREATE POLICY "Anon submit exam by token" ON public.driving_exams
  FOR UPDATE TO anon
  USING (token IS NOT NULL AND length(token) >= 20 AND status = 'pending')
  WITH CHECK (token IS NOT NULL AND length(token) >= 20);
