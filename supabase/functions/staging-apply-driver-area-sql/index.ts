/**
 * Staging-only, additive SQL apply for driver-area settings.
 * Refuses production project refs. Does not accept arbitrary SQL.
 * Uses a vendored simple-query client because hosted Edge blocks remote imports.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { runSql } from './pg_simple.ts';
import { CONTROL_CENTER_SQL, MIGRATION_SQL } from './sql_bundle.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PRODUCTION_REFS = ['qasomfndnjuixgjmjwcm', 'kuenhflklivaxrmqbsee'];
const CONFIRM = 'driver-area-settings-expand-staging';
const PAGES_REDIRECT = 'https://orin1607-ctrl.github.io/future-craft-core/';
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

    if (body.inspect === 'driver-area-qa') {
      const admin = createClient(
        Deno.env.get('SUPABASE_URL') || '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
      );
      const { data: roleRows } = await admin.from('user_roles').select('user_id, role');
      const { data: profiles } = await admin.from('profiles').select('id, company_name, full_name');
      const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const emailById = new Map((users || []).map((u) => [u.id, u.email || '']));
      const profileById = new Map((profiles || []).map((p) => [p.id, p]));
      const companies = [...new Set(
        (profiles || [])
          .map((p) => p.company_name)
          .filter((n): n is string => !!n && n.trim() !== ''),
      )].sort();
      const roleCounts: Record<string, number> = {};
      for (const row of roleRows || []) {
        roleCounts[row.role] = (roleCounts[row.role] || 0) + 1;
      }

      const skipCompany = (name: string) =>
        /^(e2e|qa|staging qa|test|tesy|d|df|dosh44|transportpreview)/i.test(name.trim())
        || /QA-|Preview-|STRICT|DOC-UX|LIC-|RLS-PROBE/i.test(name);

      const realCompanies = companies.filter((name) => !skipCompany(name));
      const preferredCompanies = ['אורן קאר', 'חברה 1', 'חברה 2', 'קיבוץ בארי', 'מוסך יוני', 'פרחי בוקי בע"מ']
        .filter((name) => realCompanies.includes(name));
      const driverCompanyPool = [...preferredCompanies, ...realCompanies.filter((n) => !preferredCompanies.includes(n))];

      const wanted: Array<{ role: string; company?: string; email?: string }> = [
        { role: 'super_admin', email: 'orin1607@gmail.com' },
      ];
      const seen = new Set<string>();
      for (const company of driverCompanyPool) {
        if (wanted.filter((w) => w.role === 'driver').length >= 2) break;
        const hasDriver = (roleRows || []).some((row) => {
          if (row.role !== 'driver') return false;
          return profileById.get(row.user_id)?.company_name === company && !!emailById.get(row.user_id);
        });
        if (!hasDriver || seen.has(company)) continue;
        seen.add(company);
        wanted.push({ role: 'driver', company });
      }

      const sessions: Array<Record<string, unknown>> = [];
      for (const want of wanted) {
        const match = (roleRows || []).find((row) => {
          if (row.role !== want.role) return false;
          const email = emailById.get(row.user_id) || '';
          if (want.email) return email.toLowerCase() === want.email.toLowerCase();
          if (!want.company) return !!email;
          return profileById.get(row.user_id)?.company_name === want.company && !!email;
        });
        if (!match) continue;
        const email = emailById.get(match.user_id) || '';
        const profile = profileById.get(match.user_id);
        const { data, error } = await admin.auth.admin.generateLink({
          type: 'magiclink',
          email,
          options: { redirectTo: PAGES_REDIRECT },
        });
        sessions.push({
          role: want.role,
          company: profile?.company_name || null,
          full_name: profile?.full_name || null,
          email,
          error: error?.message || null,
          action_link: data?.properties?.action_link || null,
        });
      }

      return json({
        ok: true,
        inspect: true,
        staging: true,
        companies: realCompanies,
        all_company_count: companies.length,
        roleCounts,
        sessions,
        pages: PAGES_REDIRECT,
      });
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
