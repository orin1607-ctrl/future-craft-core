-- READ ONLY. Oren Car PUBLIC STAGING usfeoerkpcafxxlyuldl only.
-- No ALTER / INSERT / DELETE / CREATE / DROP / GRANT / REVOKE.
-- Does not write shop_company_name. Uses opened_by -> profiles.company_name as the only signal.

WITH case_signal AS (
  SELECT
    gc.id AS case_id,
    gc.customer_id,
    gc.vehicle_id,
    trim(coalesce(p.company_name, '')) AS opener_shop
  FROM public.garage_cases gc
  LEFT JOIN public.profiles p ON p.id = gc.opened_by
),
customer_signal AS (
  SELECT
    customer_id,
    count(*)::bigint AS case_count,
    count(DISTINCT opener_shop) FILTER (WHERE opener_shop <> '')::bigint AS distinct_shops
  FROM case_signal
  GROUP BY customer_id
),
vehicle_signal AS (
  SELECT
    vehicle_id,
    count(*)::bigint AS case_count,
    count(DISTINCT opener_shop) FILTER (WHERE opener_shop <> '')::bigint AS distinct_shops
  FROM case_signal
  GROUP BY vehicle_id
)
SELECT json_build_object(
  'target', 'usfeoerkpcafxxlyuldl',
  'read_only', true,
  'shop_column_present', exists (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'garage_customers'
      AND column_name = 'shop_company_name'
  ),
  'cases', json_build_object(
    'total', (SELECT count(*)::bigint FROM public.garage_cases),
    'unambiguous', (
      SELECT count(*)::bigint
      FROM public.garage_cases gc
      JOIN customer_signal cs ON cs.customer_id = gc.customer_id
      WHERE cs.distinct_shops = 1
    ),
    'conflict', (
      SELECT count(*)::bigint
      FROM public.garage_cases gc
      JOIN customer_signal cs ON cs.customer_id = gc.customer_id
      WHERE cs.distinct_shops > 1
    ),
    'no_signal', (
      SELECT count(*)::bigint
      FROM public.garage_cases gc
      JOIN customer_signal cs ON cs.customer_id = gc.customer_id
      WHERE cs.distinct_shops = 0
    )
  ),
  'customers', json_build_object(
    'total', (SELECT count(*)::bigint FROM public.garage_customers),
    'unambiguous', (
      SELECT count(*)::bigint FROM customer_signal WHERE distinct_shops = 1
    ),
    'conflict', (
      SELECT count(*)::bigint FROM customer_signal WHERE distinct_shops > 1
    ),
    'no_cases', (
      SELECT count(*)::bigint
      FROM public.garage_customers c
      WHERE NOT EXISTS (
        SELECT 1 FROM customer_signal cs WHERE cs.customer_id = c.id
      )
    ),
    'cases_exist_but_opener_shop_empty', (
      SELECT count(*)::bigint FROM customer_signal WHERE distinct_shops = 0
    )
  ),
  'vehicles', json_build_object(
    'total', (SELECT count(*)::bigint FROM public.garage_vehicles),
    'unambiguous_from_own_cases', (
      SELECT count(*)::bigint FROM vehicle_signal WHERE distinct_shops = 1
    ),
    'conflict', (
      SELECT count(*)::bigint FROM vehicle_signal WHERE distinct_shops > 1
    ),
    'inherit_from_unambiguous_customer', (
      SELECT count(*)::bigint
      FROM public.garage_vehicles v
      JOIN customer_signal cs ON cs.customer_id = v.customer_id
      WHERE cs.distinct_shops = 1
        AND NOT EXISTS (
          SELECT 1 FROM vehicle_signal vs
          WHERE vs.vehicle_id = v.id AND vs.distinct_shops > 1
        )
        AND (
          NOT EXISTS (SELECT 1 FROM vehicle_signal vs WHERE vs.vehicle_id = v.id)
          OR EXISTS (
            SELECT 1 FROM vehicle_signal vs
            WHERE vs.vehicle_id = v.id AND vs.distinct_shops = 0
          )
        )
    ),
    'no_cases_and_customer_unassigned', (
      SELECT count(*)::bigint
      FROM public.garage_vehicles v
      WHERE NOT EXISTS (SELECT 1 FROM vehicle_signal vs WHERE vs.vehicle_id = v.id)
        AND NOT EXISTS (
          SELECT 1 FROM customer_signal cs
          WHERE cs.customer_id = v.customer_id AND cs.distinct_shops = 1
        )
    )
  ),
  'media', json_build_object(
    'table_present', to_regclass('public.garage_media') IS NOT NULL,
    'total', CASE
      WHEN to_regclass('public.garage_media') IS NULL THEN NULL
      ELSE (SELECT count(*)::bigint FROM public.garage_media)
    END,
    'orphan_without_case', CASE
      WHEN to_regclass('public.garage_media') IS NULL THEN NULL
      ELSE (
        SELECT count(*)::bigint
        FROM public.garage_media m
        WHERE NOT EXISTS (
          SELECT 1 FROM public.garage_cases gc WHERE gc.id = m.garage_case_id
        )
      )
    END
  )
) AS precheck;
