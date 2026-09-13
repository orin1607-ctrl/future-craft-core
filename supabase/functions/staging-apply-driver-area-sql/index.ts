/**
 * Staging-only, additive SQL apply for driver-area settings.
 * Refuses production project refs. Does not accept arbitrary SQL.
 * No top-level imports: a failed postgres client import must not 500 the isolate.
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PRODUCTION_REFS = ['qasomfndnjuixgjmjwcm', 'kuenhflklivaxrmqbsee'];
const CONFIRM = 'driver-area-settings-expand-staging';
const SQL_FILES = [
  'control-center.sql',
  'migration.sql',
] as const;
const SQL_URL =
  'https://raw.githubusercontent.com/orin1607-ctrl/future-craft-core/cursor/driver-area-settings-b784/supabase/migrations/20260913200000_driver_area_settings_expand.sql';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function envNames(): string[] {
  try {
    return Object.keys(Deno.env.toObject()).sort();
  } catch {
    return [];
  }
}

function pickDbUrl(): string {
  const keys = [
    'SUPABASE_DB_URL',
    'POSTGRES_URL',
    'DATABASE_URL',
    'DB_URL',
    'SUPABASE_POSTGRES_URL',
    'POSTGRES_CONNECTION_STRING',
  ];
  for (const key of keys) {
    const value = Deno.env.get(key) || '';
    if (value.startsWith('postgres')) return value;
  }
  return '';
}

async function loadSql(fileName: string): Promise<string> {
  try {
    const text = await Deno.readTextFile(new URL(`./${fileName}`, import.meta.url));
    if (text.includes('ALTER TABLE') || text.includes('CREATE')) return text;
  } catch {
    // Bundled file missing — fall through.
  }
  if (fileName !== 'migration.sql') {
    throw new Error(`sql_file_missing:${fileName}`);
  }
  const sqlRes = await fetch(SQL_URL);
  if (!sqlRes.ok) throw new Error(`sql_fetch_failed:${sqlRes.status}`);
  const sqlText = await sqlRes.text();
  if (!sqlText.includes('report_driver_odometer')) throw new Error('sql_unexpected');
  return sqlText;
}

async function loadPostgres() {
  const specifiers = [
    'npm:postgres@3.4.5',
    'https://esm.sh/postgres@3.4.5',
    'https://deno.land/x/postgresjs@v3.4.5/mod.js',
  ];
  const errors: string[] = [];
  for (const spec of specifiers) {
    try {
      const mod = await import(spec);
      const fn = mod.default || mod.postgres;
      if (typeof fn === 'function') return { postgres: fn, spec };
      errors.push(`${spec}:no-default`);
    } catch (error) {
      errors.push(`${spec}:${error instanceof Error ? error.message : 'import_failed'}`);
    }
  }
  throw new Error(`postgres_import_failed:${errors.join('|')}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    if (PRODUCTION_REFS.some((ref) => supabaseUrl.includes(ref))) {
      return json({ error: 'refused_production' }, 403);
    }
    if (!supabaseUrl.includes(STAGING_REF)) {
      return json({ error: 'refused_not_staging', supabaseUrlHost: supabaseUrl.replace(/^https?:\/\//, '').split('/')[0] }, 403);
    }

    const body = await req.json().catch(() => ({}));
    if (body.confirm !== CONFIRM) {
      return json({ error: 'confirm_required' }, 400);
    }

    const dbUrl = pickDbUrl();
    if (!dbUrl) {
      return json({ error: 'no_db_url', envNames: envNames() }, 500);
    }
    if (PRODUCTION_REFS.some((ref) => dbUrl.includes(ref))) {
      return json({ error: 'refused_production_db_url' }, 403);
    }
    if (!dbUrl.includes(STAGING_REF)) {
      return json({ error: 'refused_not_staging_db_url' }, 403);
    }

    const { postgres, spec } = await loadPostgres();
    const sql = postgres(dbUrl, { max: 1, idle_timeout: 5, connect_timeout: 20, prepare: false });
    const applied: string[] = [];
    try {
      for (const fileName of SQL_FILES) {
        const sqlText = await loadSql(fileName);
        await sql.unsafe(sqlText);
        applied.push(fileName);
      }
      return json({
        ok: true,
        applied,
        files: ['20260906120000_driver_app_control_center_expand.sql', '20260913200000_driver_area_settings_expand.sql'],
        postgres: spec,
        staging: true,
      });
    } finally {
      await sql.end({ timeout: 5 });
    }
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : 'unexpected',
      envNames: envNames(),
    }, 500);
  }
});
