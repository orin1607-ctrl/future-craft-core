// scripts/fix-garage-permissions-trigger-v2.mjs
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const tmpWork = join(process.env.TEMP || 'C:\\Temp', `sb-fix-garage-trg-v2-${Date.now()}`);
mkdirSync(tmpWork, { recursive: true });

execSync(`npx --yes supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, {
  encoding: 'utf8',
  stdio: 'pipe',
});

const sql = `
CREATE OR REPLACE FUNCTION public.garage_apply_shop_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  my_company text;
  parent_shop text;
  vehicle_shop text;
  is_service_role boolean;
BEGIN
  -- Allow service_role or backend functions without auth.uid()
  is_service_role := (auth.uid() IS NULL) OR (coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role');

  IF NOT is_service_role THEN
    my_company := trim(coalesce(public.get_user_company(auth.uid()), ''));

    IF NOT public.has_role(auth.uid(), 'super_admin'::public.app_role)
       AND NOT public.has_role(auth.uid(), 'fleet_manager'::public.app_role) THEN
      RAISE EXCEPTION 'אין הרשאה לשמור נתוני מוסך';
    END IF;
  ELSE
    my_company := trim(coalesce(NEW.shop_company_name, 'מוסך יוני – פחחות וצבע לרכב'));
  END IF;

  IF TG_TABLE_NAME = 'garage_customers' THEN
    IF NOT is_service_role AND public.has_role(auth.uid(), 'fleet_manager'::public.app_role) THEN
      IF length(my_company) = 0 THEN
        RAISE EXCEPTION 'למנהל מוסך חסר company_name בפרופיל. לא שומרים תיק בלי מוסך.';
      END IF;
      NEW.shop_company_name := my_company;
    ELSE
      NEW.shop_company_name := trim(coalesce(nullif(NEW.shop_company_name, ''), nullif(my_company, ''), 'מוסך יוני – פחחות וצבע לרכב'));
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'garage_vehicles' THEN
    SELECT trim(coalesce(c.shop_company_name, '')) INTO parent_shop
    FROM public.garage_customers c
    WHERE c.id = NEW.customer_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'לא שומרים רכב בלי לקוח קיים.';
    END IF;
    NEW.shop_company_name := coalesce(nullif(parent_shop, ''), nullif(my_company, ''), 'מוסך יוני – פחחות וצבע לרכב');
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'garage_cases' THEN
    IF NEW.customer_id IS NOT NULL THEN
      SELECT trim(coalesce(c.shop_company_name, '')) INTO parent_shop
      FROM public.garage_customers c
      WHERE c.id = NEW.customer_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'לא שומרים תיק בלי לקוח קיים.';
      END IF;
      IF NEW.vehicle_id IS NOT NULL THEN
        SELECT trim(coalesce(v.shop_company_name, '')) INTO vehicle_shop
        FROM public.garage_vehicles v
        WHERE v.id = NEW.vehicle_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'לא שומרים תיק בלי רכב קיים.';
        END IF;
        IF length(parent_shop) > 0 AND length(vehicle_shop) > 0 AND parent_shop <> vehicle_shop THEN
          RAISE EXCEPTION 'לקוח ורכב לא שייכים לאותו מוסך. לא שומרים תיק.';
        END IF;
      END IF;
      NEW.shop_company_name := coalesce(nullif(parent_shop, ''), nullif(vehicle_shop, ''), nullif(my_company, ''), 'מוסך יוני – פחחות וצבע לרכב');
    ELSE
      NEW.shop_company_name := coalesce(nullif(NEW.shop_company_name, ''), nullif(my_company, ''), 'מוסך יוני – פחחות וצבע לרכב');
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;
`;

writeFileSync(join(tmpWork, 'fix.sql'), sql, 'utf8');
const out = execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${join(tmpWork, 'fix.sql')}"`, {
  encoding: 'utf8',
  stdio: 'pipe',
  timeout: 60000,
});
console.log('Result:', out);
console.log('✅ garage_apply_shop_tenant v2 trigger updated successfully in STAGING!');
