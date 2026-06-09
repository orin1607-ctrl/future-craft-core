/**
 * Test create-admin-user for all 4 user types (dalia-staging only).
 * Usage: TEST_EMAIL=... TEST_PASSWORD=... node scripts/test-user-management-create.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const STAGING_HOST = 'usfeoerkpcafxxlyuldl.supabase.co';

function loadEnv() {
  const env = {};
  for (const name of ['.env', '.env.local']) {
    const p = join(process.cwd(), name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      env[t.slice(0, eq).trim()] = v;
    }
  }
  return env;
}

const fileEnv = loadEnv();
const url = process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || fileEnv.VITE_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.TEST_EMAIL || fileEnv.TEST_EMAIL;
const password = process.env.TEST_PASSWORD || fileEnv.TEST_PASSWORD;

const report = { at: new Date().toISOString(), project: STAGING_HOST, results: [] };

async function extractError(error, data) {
  if (data?.error) return data.error;
  if (error?.context?.json) {
    try {
      const body = await error.context.json();
      if (body?.error) return body.error;
    } catch { /* ignore */ }
  }
  return error?.message || 'unknown';
}

async function run() {
  if (!url?.includes(STAGING_HOST)) {
    console.error('Refusing: not staging URL');
    process.exit(1);
  }
  if (!email || !password) {
    console.error('Set TEST_EMAIL + TEST_PASSWORD');
    process.exit(2);
  }

  const supabase = createClient(url, key);
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
  if (authErr) {
    console.error('Sign-in failed:', authErr.message);
    process.exit(1);
  }
  console.log('Signed in as', auth.user.email);

  const ts = Date.now();
  const company = 'חברת בדיקה UM';
  const cases = [
    {
      name: 'private_customer',
      body: {
        email: `um-private-${ts}@staging-e2e.local`,
        password: 'TestPass1',
        full_name: 'לקוח פרטי בדיקה',
        phone: '0501111001',
        role: 'private_customer',
        company_name: '',
        is_active: false,
        approval_status: 'pending',
        nickname: 'כינוי פרטי',
      },
    },
    {
      name: 'business_customer',
      body: {
        email: `um-business-${ts}@staging-e2e.local`,
        password: 'TestPass1',
        full_name: 'איש קשר עסקי',
        phone: '0501111002',
        role: 'business_customer',
        company_name: 'עסק בדיקה בע״מ',
        is_active: false,
        approval_status: 'pending',
        nickname: 'כינוי עסקי',
        contact_role: 'מנהל',
        activity_field: 'הובלה',
      },
    },
    {
      name: 'fleet_manager',
      body: {
        email: `um-fleet-${ts}@staging-e2e.local`,
        password: 'TestPass1',
        full_name: 'מנהל צי בדיקה',
        phone: '0501111003',
        role: 'fleet_manager',
        company_name: company,
        is_active: false,
        approval_status: 'pending',
      },
    },
    {
      name: 'driver',
      body: {
        email: `um-driver-${ts}@staging-e2e.local`,
        password: 'TestPass1',
        full_name: 'נהג בדיקה',
        phone: '0501111004',
        role: 'driver',
        company_name: company,
        is_active: false,
        approval_status: 'pending',
        license_number: 'LIC123456',
      },
    },
  ];

  for (const tc of cases) {
    const { data, error } = await supabase.functions.invoke('create-admin-user', { body: tc.body });
    const errMsg = await extractError(error, data);
    const ok = !error && data?.success && data?.user_id;
    report.results.push({
      type: tc.name,
      ok,
      user_id: data?.user_id,
      error: ok ? null : errMsg,
    });
    console.log(ok ? 'OK' : 'FAIL', tc.name, ok ? data.user_id : errMsg);

    if (ok) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, nickname, approval_status, is_active, customer_id')
        .eq('id', data.user_id)
        .single();
      console.log('  profile:', profile);
    }
  }

  mkdirSync('test-results', { recursive: true });
  writeFileSync(join('test-results', 'user-management-create-test.json'), JSON.stringify(report, null, 2));
  const failed = report.results.filter((r) => !r.ok);
  process.exit(failed.length ? 1 : 0);
}

run();
