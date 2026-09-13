/**
 * Staging-only, additive SQL apply for driver-area settings.
 * Refuses production project refs. Does not accept arbitrary SQL.
 * Uses a vendored simple-query client because hosted Edge blocks remote imports.
 */
import { runSql } from './pg_simple.ts';
import { CONTROL_CENTER_SQL, MIGRATION_SQL } from './sql_bundle.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PRODUCTION_REFS = ['qasomfndnjuixgjmjwcm', 'kuenhflklivaxrmqbsee'];
const CONFIRM = 'driver-area-settings-expand-staging';
const SQL_FILES = [
  ['control-center.sql', CONTROL_CENTER_SQL],
  ['migration.sql', MIGRATION_SQL],
] as const;

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

function dbUrlHost(dbUrl: string): string {
  try {
    return new URL(dbUrl.replace(/^postgres(ql)?:/, 'http:')).host;
  } catch {
    return 'unparseable';
  }
}

async function loadSql(fileName: string): Promise<string> {
  const text = await Deno.readTextFile(new URL(`./${fileName}`, import.meta.url));
  if (!text.includes('ALTER TABLE') && !text.includes('CREATE')) {
    throw new Error(`sql_unexpected:${fileName}`);
  }
  return text;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    if (PRODUCTION_REFS.some((ref) => supabaseUrl.includes(ref))) {
      return json({ error: 'refused_production' }, 403);
    }
    if (!supabaseUrl.includes(STAGING_REF)) {
      return json({ error: 'refused_not_staging' }, 403);
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
      return json({ error: 'refused_not_staging_db_url', host: dbUrlHost(dbUrl) }, 403);
    }

    const applied: string[] = [];
    for (const [fileName, sqlText] of SQL_FILES) {
      if (!sqlText.includes('ALTER TABLE') && !sqlText.includes('CREATE')) {
        throw new Error(`sql_unexpected:${fileName}`);
      }
      await runSql(dbUrl, sqlText);
      applied.push(fileName);
    }
    return json({
      ok: true,
      applied,
      files: [
        '20260906120000_driver_app_control_center_expand.sql',
        '20260913200000_driver_area_settings_expand.sql',
      ],
      host: dbUrlHost(dbUrl),
      staging: true,
    });
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : 'unexpected',
    }, 500);
  }
});
