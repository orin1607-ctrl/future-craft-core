/**
 * Staging only: replace garage_vehicles_plate_unique_idx so a plate is unique
 * per shop_company_name, keeping the existing plate normalization.
 * No DELETE, no RLS changes, no Production.
 */
const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';

const token = (process.env.SUPABASE_ACCESS_TOKEN || '').replace(/[\r\n]/g, '').trim();
if (!token) throw new Error('MISSING_ACCESS_TOKEN');
if (token.includes(PROD_REF)) throw new Error('production token blocked');

async function mgmtQuery(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${STAGING_REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 800) }; }
  if (!res.ok) {
    throw new Error(`staging query ${res.status}: ${text.slice(0, 800)}`);
  }
  return json;
}

const colRows = await mgmtQuery(`
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'garage_vehicles'
    AND column_name = 'shop_company_name'
`);
const hasShop = Array.isArray(colRows) && colRows.some((r) => r.column_name === 'shop_company_name');
if (!hasShop) {
  throw new Error(`shop_company_name column missing on staging garage_vehicles — STOP ${JSON.stringify(colRows).slice(0, 400)}`);
}

const beforeRows = await mgmtQuery(`
  SELECT indexdef
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname = 'garage_vehicles_plate_unique_idx'
`);
const before = String(beforeRows?.[0]?.indexdef || '');
console.log(JSON.stringify({ staging: STAGING_REF, before }, null, 2));

await mgmtQuery('DROP INDEX IF EXISTS public.garage_vehicles_plate_unique_idx');
await mgmtQuery(`
  CREATE UNIQUE INDEX garage_vehicles_plate_unique_idx
    ON public.garage_vehicles (
      shop_company_name,
      lower(regexp_replace(plate, '[^0-9A-Za-z]', '', 'g'))
    )
`);

const afterRows = await mgmtQuery(`
  SELECT indexdef
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname = 'garage_vehicles_plate_unique_idx'
`);
const after = String(afterRows?.[0]?.indexdef || '');
if (!/shop_company_name/i.test(after)) {
  throw new Error(`index was not shop-scoped: ${after}`);
}
if (!/regexp_replace/i.test(after)) {
  throw new Error(`index lost plate normalization: ${after}`);
}

console.log(JSON.stringify({
  ok: true,
  productionTouched: false,
  deletedRows: false,
  rlsChanged: false,
  after,
}, null, 2));
