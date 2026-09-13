/**
 * Staging-only, additive SQL apply for driver-area settings.
 * Refuses to run on production project refs. Does not accept arbitrary SQL.
 */
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PRODUCTION_REFS = ['qasomfndnjuixgjmjwcm', 'kuenhflklivaxrmqbsee'];
const CONFIRM = 'driver-area-settings-expand-staging';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isStaging(url: string): boolean {
  if (PRODUCTION_REFS.some((ref) => url.includes(ref))) return false;
  return url.includes(STAGING_REF);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  if (!isStaging(supabaseUrl)) {
    return json({ error: 'refused_not_staging', url_host: supabaseUrl }, 403);
  }

  const body = await req.json().catch(() => ({}));
  if (body.confirm !== CONFIRM) {
    return json({ error: 'confirm_required' }, 400);
  }

  const sqlText = await Deno.readTextFile(new URL('./migration.sql', import.meta.url));
  const dbUrl =
    Deno.env.get('SUPABASE_DB_URL') ||
    Deno.env.get('POSTGRES_URL') ||
    Deno.env.get('DATABASE_URL') ||
    '';

  if (!dbUrl) {
    const envNames = Object.keys(Deno.env.toObject()).sort();
    return json({
      error: 'no_db_url',
      hint: 'Set SUPABASE_DB_URL on the staging project (Dashboard → Edge Functions → Secrets), staging only.',
      envNames,
    }, 500);
  }

  const sql = postgres(dbUrl, { max: 1, idle_timeout: 5, connect_timeout: 20, prepare: false });
  try {
    await sql.unsafe(sqlText);
    return json({ ok: true, applied: '20260913200000_driver_area_settings_expand.sql', staging: true });
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : 'sql_failed',
    }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
