
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.get_user_company(uuid) FROM anon, authenticated, public;

DROP POLICY IF EXISTS system_insert_pickup ON public.pickup_appointments;
-- Authenticated managers/super_admin/drivers can still insert via existing policies; edge function uses service role.
CREATE POLICY managers_insert_pickup ON public.pickup_appointments
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR (has_role(auth.uid(), 'fleet_manager'::app_role) AND company_name = get_user_company(auth.uid()))
  );
