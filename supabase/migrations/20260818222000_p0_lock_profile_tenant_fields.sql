-- P0-B / P0-C Staging ONLY.
-- Users cannot change tenant (company_name) or reactivate themselves (is_active).
-- Super_admin and service_role remain the administrative path.
-- Rollback: DROP TRIGGER trg_lock_profile_tenant_fields ON public.profiles; DROP FUNCTION public.lock_profile_tenant_fields();

CREATE OR REPLACE FUNCTION public.lock_profile_tenant_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  -- Service role (create-admin-user and other admin APIs).
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Super admin may change tenant / activation for any profile.
  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.company_name IS DISTINCT FROM OLD.company_name THEN
    RAISE EXCEPTION 'company_name can only be changed by an administrator'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION 'is_active can only be changed by an administrator'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    RAISE EXCEPTION 'approval_status can only be changed by an administrator'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.two_factor_approved IS DISTINCT FROM OLD.two_factor_approved THEN
    RAISE EXCEPTION 'two_factor_approved can only be changed by an administrator'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_profile_tenant_fields ON public.profiles;
CREATE TRIGGER trg_lock_profile_tenant_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.lock_profile_tenant_fields();
