/**
 * Staging only: replace garage_vehicles_plate_unique_idx so a plate is unique
 * per shop_company_name, keeping the existing plate normalization.
 * No DELETE, no RLS changes, no Production.
 */
const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';

function assertStagingUrl(url) {
  if (!url) throw new Error('no_url');
  if (url.includes(PROD_REF) || /dalia-car\.online/i.test(url)) {
    throw new Error('production_url_blocked');
  }
  if (!url.includes(STAGING_REF)) throw new Error('url_not_staging');
  return url;
}

async function connectPg(url) {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
}

async function openStagingClient() {
  const attempts = [];
  const urls = [];
  const direct = (process.env.STAGING_DATABASE_URL || process.env.DATABASE_URL || '').trim();
  if (direct) urls.push(['staging_database_url', direct]);
  const pwd = (process.env.STAGING_SUPABASE_DB_PASSWORD || '').trim();
  const host = (process.env.STAGING_POOLER_HOST || 'aws-0-eu-central-1.pooler.supabase.com').trim();
  if (pwd) {
    const encoded = encodeURIComponent(pwd);
    urls.push(['pooler_6543', `postgresql://postgres.${STAGING_REF}:${encoded}@${host}:6543/postgres?sslmode=require`]);
    urls.push(['pooler_5432', `postgresql://postgres.${STAGING_REF}:${encoded}@${host}:5432/postgres?sslmode=require`]);
    urls.push(['db_host', `postgresql://postgres:${encoded}@db.${STAGING_REF}.supabase.co:5432/postgres?sslmode=require`]);
  }
  for (const [name, url] of urls) {
    try {
      assertStagingUrl(url);
      const client = await connectPg(url);
      attempts.push({ name, ok: true });
      return { client, attempts };
    } catch (e) {
      attempts.push({ name, ok: false, error: String(e.message || e).slice(0, 240) });
    }
  }
  const err = new Error(`no staging postgres: ${JSON.stringify(attempts)}`);
  err.attempts = attempts;
  throw err;
}

const { client, attempts } = await openStagingClient();
try {
  const col = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'garage_vehicles'
      AND column_name = 'shop_company_name'
  `);
  if (!col.rows.length) {
    throw new Error('shop_company_name column missing on staging garage_vehicles — STOP');
  }

  const before = await client.query(`
    SELECT indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'garage_vehicles_plate_unique_idx'
  `);
  console.log(JSON.stringify({
    staging: STAGING_REF,
    connect: attempts.filter((a) => a.ok).map((a) => a.name),
    before: before.rows[0]?.indexdef || '',
  }, null, 2));

  await client.query('DROP INDEX IF EXISTS public.garage_vehicles_plate_unique_idx');
  await client.query(`
    CREATE UNIQUE INDEX garage_vehicles_plate_unique_idx
      ON public.garage_vehicles (
        shop_company_name,
        lower(regexp_replace(plate, '[^0-9A-Za-z]', '', 'g'))
      )
  `);

  const after = await client.query(`
    SELECT indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'garage_vehicles_plate_unique_idx'
  `);
  const indexdef = String(after.rows[0]?.indexdef || '');
  if (!/shop_company_name/i.test(indexdef)) {
    throw new Error(`index was not shop-scoped: ${indexdef}`);
  }
  if (!/regexp_replace/i.test(indexdef)) {
    throw new Error(`index lost plate normalization: ${indexdef}`);
  }

  console.log(JSON.stringify({
    ok: true,
    productionTouched: false,
    deletedRows: false,
    rlsChanged: false,
    after: indexdef,
  }, null, 2));
} finally {
  await client.end().catch(() => null);
}
