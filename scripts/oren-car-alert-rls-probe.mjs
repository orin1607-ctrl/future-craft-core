/**
 * Proof of the reported alert failure: custom_alerts RLS demands
 * user_id = auth.uid(). While viewing the system as another user (impersonation)
 * the app writes the impersonated profile id, so every alert insert is rejected.
 * Isolated QA company, cleaned up at the end.
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const OUT = join(process.cwd(), 'docs/audit-reports/oren-car-tasks-1-10-staging/alert-rls-probe');
mkdirSync(OUT, { recursive: true });

const arr = JSON.parse(execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = arr.find((k) => k.name === 'service_role').api_key;
const anonKey = arr.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || arr.find((k) => k.name === 'anon').api_key;

const admin = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });
const anon = createClient(STAGING_URL, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

const runId = Date.now();
const company = `QA-RLS-${runId}`;
const password = `QaRls!${runId}`;
const findings = [];

async function makeUser(email, role, companyName) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  await admin.from('profiles').upsert({
    id: data.user.id,
    full_name: `QA ${role}`,
    company_name: companyName,
    is_active: true,
    approval_status: 'approved',
    two_factor_approved: true,
  });
  await admin.from('user_roles').delete().eq('user_id', data.user.id);
  await admin.from('user_roles').insert({ user_id: data.user.id, role });
  return data.user.id;
}

const ids = [];
try {
  await admin.from('company_settings').insert({ company_name: company, reminder_30_days: true, reminder_7_days: true, reminder_1_day: true, hidden_buttons: [] });
  const superAdminId = await makeUser(`qa-rls-sa-${runId}@staging-e2e.local`, 'super_admin', null);
  const fleetManagerId = await makeUser(`qa-rls-fm-${runId}@staging-e2e.local`, 'fleet_manager', company);
  ids.push(superAdminId, fleetManagerId);

  const { data: auth, error: authErr } = await anon.auth.signInWithPassword({
    email: `qa-rls-sa-${runId}@staging-e2e.local`,
    password,
  });
  if (authErr) throw authErr;
  const asSuperAdmin = createClient(STAGING_URL, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${auth.session.access_token}` } },
  });

  const base = {
    company_name: company,
    alert_type: 'officer',
    title: `RLS probe ${runId}`,
    alert_date: new Date(Date.now() + 45 * 86400000).toISOString(),
    next_trigger_at: new Date(Date.now() + 45 * 86400000).toISOString(),
    recurrence: 'none',
    is_active: true,
  };

  const impersonated = await asSuperAdmin.from('custom_alerts').insert({ ...base, user_id: fleetManagerId });
  findings.push({
    case: 'user_id = impersonated profile (what the app writes while viewing as another user)',
    ok: !impersonated.error,
    code: impersonated.error?.code || null,
    message: impersonated.error?.message || null,
  });

  const own = await asSuperAdmin.from('custom_alerts').insert({ ...base, user_id: superAdminId, title: `RLS probe own ${runId}` });
  findings.push({
    case: 'user_id = authenticated user (the fix)',
    ok: !own.error,
    code: own.error?.code || null,
    message: own.error?.message || null,
  });
} finally {
  await admin.from('custom_alerts').delete().eq('company_name', company);
  await admin.from('company_settings').delete().eq('company_name', company);
  for (const id of ids) {
    await admin.from('user_roles').delete().eq('user_id', id);
    await admin.from('profiles').delete().eq('id', id);
    await admin.auth.admin.deleteUser(id).catch(() => null);
  }
}

writeFileSync(join(OUT, 'rls-probe.json'), JSON.stringify({ at: new Date().toISOString(), company, findings }, null, 2), 'utf8');
console.log(JSON.stringify(findings, null, 2));
