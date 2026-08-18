-- P0 C2 Staging ONLY.
-- Signup metadata must not assign privileged roles or auto-activate super_admin.
-- Administrative user creation remains create-admin-user (service_role) after this trigger.
-- Rollback: restore previous handle_new_user body from 20260412165731.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, company_name, is_active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'company_name', ''),
    false
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'driver'::app_role);

  INSERT INTO public.drivers (id, full_name, phone, email, company_name, status, created_by)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'company_name', ''),
    'active',
    NEW.id
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;
