-- READ ONLY. Post-apply verification on usfeoerkpcafxxlyuldl only.
-- No ALTER / INSERT / DELETE / CREATE / DROP.

SELECT json_build_object(
  'target', 'usfeoerkpcafxxlyuldl',
  'read_only', true,
  'shop_column_present', json_build_object(
    'customers', exists (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'garage_customers' AND column_name = 'shop_company_name'
    ),
    'vehicles', exists (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'garage_vehicles' AND column_name = 'shop_company_name'
    ),
    'cases', exists (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'garage_cases' AND column_name = 'shop_company_name'
    )
  ),
  'cases', json_build_object(
    'total', (SELECT count(*)::bigint FROM public.garage_cases),
    'assigned', (SELECT count(*)::bigint FROM public.garage_cases WHERE length(trim(shop_company_name)) > 0),
    'empty', (SELECT count(*)::bigint FROM public.garage_cases WHERE length(trim(shop_company_name)) = 0)
  ),
  'customers', json_build_object(
    'total', (SELECT count(*)::bigint FROM public.garage_customers),
    'assigned', (SELECT count(*)::bigint FROM public.garage_customers WHERE length(trim(shop_company_name)) > 0),
    'empty', (SELECT count(*)::bigint FROM public.garage_customers WHERE length(trim(shop_company_name)) = 0)
  ),
  'vehicles', json_build_object(
    'total', (SELECT count(*)::bigint FROM public.garage_vehicles),
    'assigned', (SELECT count(*)::bigint FROM public.garage_vehicles WHERE length(trim(shop_company_name)) > 0),
    'empty', (SELECT count(*)::bigint FROM public.garage_vehicles WHERE length(trim(shop_company_name)) = 0)
  ),
  'media', json_build_object(
    'total', (SELECT count(*)::bigint FROM public.garage_media),
    'orphan_without_case', (
      SELECT count(*)::bigint FROM public.garage_media m
      WHERE NOT EXISTS (SELECT 1 FROM public.garage_cases gc WHERE gc.id = m.garage_case_id)
    )
  ),
  'mismatches', json_build_object(
    'vehicle_customer', (
      SELECT count(*)::bigint
      FROM public.garage_vehicles v
      JOIN public.garage_customers c ON c.id = v.customer_id
      WHERE v.shop_company_name IS DISTINCT FROM c.shop_company_name
    ),
    'case_customer_or_vehicle', (
      SELECT count(*)::bigint
      FROM public.garage_cases gc
      JOIN public.garage_customers c ON c.id = gc.customer_id
      JOIN public.garage_vehicles v ON v.id = gc.vehicle_id
      WHERE gc.shop_company_name IS DISTINCT FROM c.shop_company_name
         OR gc.shop_company_name IS DISTINCT FROM v.shop_company_name
         OR c.shop_company_name IS DISTINCT FROM v.shop_company_name
    )
  ),
  'policies', json_build_object(
    'delete_on_garage_tables', (
      SELECT count(*)::bigint FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN ('garage_customers', 'garage_vehicles', 'garage_cases', 'garage_media')
        AND cmd = 'DELETE'
    ),
    'storage_update', (
      SELECT count(*)::bigint FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'garage_media%' AND cmd = 'UPDATE'
    ),
    'storage_delete', (
      SELECT count(*)::bigint FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'garage_media%' AND cmd = 'DELETE'
    ),
    'shop_policy_names', (
      SELECT coalesce(json_agg(tablename || '.' || policyname ORDER BY tablename, policyname), '[]'::json)
      FROM pg_policies
      WHERE (schemaname = 'public' AND tablename IN ('garage_customers', 'garage_vehicles', 'garage_cases', 'garage_media')
             AND policyname LIKE '%_shop')
         OR (schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'garage_media_storage_%')
    )
  ),
  'functions', json_build_object(
    'garage_shop_visible', to_regprocedure('public.garage_shop_visible(text)') IS NOT NULL,
    'garage_apply_shop_tenant', to_regprocedure('public.garage_apply_shop_tenant()') IS NOT NULL,
    'garage_is_staff', to_regprocedure('public.garage_is_staff(uuid)') IS NOT NULL,
    'garage_is_staff_mentions_fleet_manager', (
      SELECT pg_get_functiondef('public.garage_is_staff(uuid)'::regprocedure) ILIKE '%fleet_manager%'
    )
  )
) AS verify;
