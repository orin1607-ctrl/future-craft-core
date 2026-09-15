/**
 * Staging uniqueness probe for garage plates per shop.
 * Uses a single transaction and ROLLBACK — no leftover rows, no DELETE.
 */
const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';

const url = (process.env.STAGING_DATABASE_URL || process.env.DATABASE_URL || '').trim();
if (!url) throw new Error('MISSING_STAGING_DATABASE_URL');
if (url.includes(PROD_REF) || /dalia-car\.online/i.test(url)) throw new Error('production_url_blocked');
if (!url.includes(STAGING_REF)) throw new Error('url_not_staging');

const { default: pg } = await import('pg');
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const plate = `QA${Date.now().toString().slice(-8)}`;
const shopA = 'QA מוסך פלטה א';
const shopB = 'QA מוסך פלטה ב';
const result = {
  staging: STAGING_REF,
  plate,
  productionTouched: false,
  deletedRows: false,
  rlsChanged: false,
};

try {
  const idx = await client.query(`
    SELECT indexdef FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'garage_vehicles_plate_unique_idx'
  `);
  result.indexdef = idx.rows[0]?.indexdef || '';
  if (!/shop_company_name/i.test(result.indexdef)) {
    throw new Error(`index not shop-scoped: ${result.indexdef}`);
  }

  await client.query('BEGIN');
  const admin = await client.query(`
    SELECT user_id
    FROM public.user_roles
    WHERE role = 'super_admin'
    LIMIT 1
  `);
  const openedBy = admin.rows[0]?.user_id || null;
  if (!openedBy) throw new Error('no staging super_admin for probe jwt');
  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: openedBy, role: 'authenticated' }),
  ]);

  const custA = await client.query(`
    INSERT INTO public.garage_customers (customer_type, name, phone, shop_company_name)
    VALUES ('private', 'QA לקוח א', '0500000001', $1)
    RETURNING id, shop_company_name
  `, [shopA]);
  const custB = await client.query(`
    INSERT INTO public.garage_customers (customer_type, name, phone, shop_company_name)
    VALUES ('private', 'QA לקוח ב', '0500000002', $1)
    RETURNING id, shop_company_name
  `, [shopB]);
  const idA = custA.rows[0].id;
  const idB = custB.rows[0].id;

  await client.query(`
    INSERT INTO public.garage_vehicles (customer_id, plate, shop_company_name)
    VALUES ($1, $2, $3)
  `, [idB, plate, shopB]);

  const createdA = await client.query(`
    INSERT INTO public.garage_vehicles (customer_id, plate, shop_company_name)
    VALUES ($1, $2, $3)
    RETURNING id, plate, shop_company_name
  `, [idA, plate, shopA]);
  result.crossShopAllowed = createdA.rows[0]?.shop_company_name === shopA;

  let sameShopBlocked = false;
  try {
    await client.query(`
      INSERT INTO public.garage_vehicles (customer_id, plate, shop_company_name)
      VALUES ($1, $2, $3)
    `, [idA, plate, shopA]);
  } catch (e) {
    sameShopBlocked = e.code === '23505' || /unique|duplicate/i.test(String(e.message || e));
    result.sameShopError = String(e.code || e.message || e).slice(0, 80);
  }
  result.sameShopBlocked = sameShopBlocked;
  result.savedShop = createdA.rows[0]?.shop_company_name || null;

  const visibleToB = await client.query(`
    SELECT id FROM public.garage_vehicles
    WHERE shop_company_name = $1
      AND lower(regexp_replace(plate, '[^0-9A-Za-z]', '', 'g'))
        = lower(regexp_replace($2, '[^0-9A-Za-z]', '', 'g'))
  `, [shopB, plate]);
  const visibleToA = await client.query(`
    SELECT id FROM public.garage_vehicles
    WHERE shop_company_name = $1
      AND lower(regexp_replace(plate, '[^0-9A-Za-z]', '', 'g'))
        = lower(regexp_replace($2, '[^0-9A-Za-z]', '', 'g'))
  `, [shopA, plate]);
  result.shopBSeesOnlyOwn = visibleToB.rows.length === 1;
  result.shopASeesOwn = visibleToA.rows.length === 1;

  if (openedBy) {
    const opened = await client.query(`
      INSERT INTO public.garage_cases (
        customer_id, vehicle_id, status, opened_by, opened_by_name,
        customer_name_snapshot, vehicle_plate_snapshot, shop_company_name, case_data
      )
      VALUES (
        $1, $2, 'פתוח', $5, 'QA',
        'QA לקוח א', $3, $4,
        jsonb_build_object('route', 'quote_first', 'quoteCreated', true, 'quoteWorks', jsonb_build_array(jsonb_build_object('desc','עבודה','price',100,'qty',1)))
      )
      RETURNING id, shop_company_name, case_data
    `, [idA, createdA.rows[0].id, plate, shopA, openedBy]);
    result.caseOpened = Boolean(opened.rows[0]?.id);
    result.reachedQuote = opened.rows[0]?.case_data?.quoteCreated === true
      && opened.rows[0]?.shop_company_name === shopA;
  }

  if (!result.crossShopAllowed || !result.sameShopBlocked || !result.shopBSeesOnlyOwn || !result.shopASeesOwn) {
    throw new Error(`probe failed ${JSON.stringify(result)}`);
  }
  if (openedBy && (!result.caseOpened || !result.reachedQuote)) {
    throw new Error(`case/quote probe failed ${JSON.stringify(result)}`);
  }

  await client.query('ROLLBACK');
  result.ok = true;
  result.rolledBack = true;
  console.log(JSON.stringify(result, null, 2));
} catch (e) {
  await client.query('ROLLBACK').catch(() => null);
  result.ok = false;
  result.error = String(e.message || e).slice(0, 800);
  console.log(JSON.stringify(result, null, 2));
  process.exit(1);
} finally {
  await client.end().catch(() => null);
}
