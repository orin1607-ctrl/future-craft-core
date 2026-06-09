/**
 * RLS / anon access audit — Staging usfeoerkpcafxxlyuldl
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const OUT = join(process.cwd(), 'docs', 'audit-reports');
mkdirSync(OUT, { recursive: true });

const keys = JSON.parse(
  execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }),
);
const anon = keys.find((k) => k.name === 'anon' && k.type === 'legacy').api_key;
const service = keys.find((k) => k.name === 'service_role' && k.type === 'legacy').api_key;
const anonClient = createClient(STAGING_URL, anon);
const admin = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });

const sensitiveTables = [
  'auth_verification_codes',
  'auth_login_challenges',
  'auth_account_lockouts',
  'auth_password_reset_tokens',
  'auth_audit_log',
  'user_access_codes',
];

const report = { at: new Date().toISOString(), staging: STAGING_REF, anon_access: {}, audit_log_super_admin: null };

for (const table of sensitiveTables) {
  const { data, error } = await anonClient.from(table).select('*').limit(1);
  report.anon_access[table] = {
    blocked: !!error || (Array.isArray(data) && data.length === 0),
    error: error?.message ?? null,
    row_count: data?.length ?? 0,
  };
}

// Super admin should read audit log via RLS
const runId = Date.now();
const email = `rls-sa-${runId}@staging-e2e.local`;
const pass = `Rls!${runId}`;
const { data: created } = await admin.auth.admin.createUser({ email, password: pass, email_confirm: true });
const uid = created.user.id;
await admin.from('profiles').upsert({ id: uid, full_name: 'RLS SA', company_name: 'QA', is_active: true, approval_status: 'approved' });
await admin.from('user_roles').insert({ user_id: uid, role: 'super_admin' });
await new Promise((r) => setTimeout(r, 400));
const { data: auth } = await anonClient.auth.signInWithPassword({ email, password: pass });
const saClient = createClient(STAGING_URL, anon, {
  global: { headers: { Authorization: `Bearer ${auth.session.access_token}` } },
});
const { data: auditRows, error: auditErr } = await saClient.from('auth_audit_log').select('id').limit(1);
report.audit_log_super_admin = {
  can_read: !auditErr && Array.isArray(auditRows),
  error: auditErr?.message ?? null,
};
await admin.auth.admin.deleteUser(uid);

writeFileSync(join(OUT, 'rls-audit.json'), JSON.stringify(report, null, 2));
const blocked = Object.values(report.anon_access).filter((t) => t.blocked).length;
console.log(`Anon blocked: ${blocked}/${sensitiveTables.length}`);
console.log('Super admin audit read:', report.audit_log_super_admin.can_read ? 'OK' : 'FAIL');
process.exit(blocked === sensitiveTables.length && report.audit_log_super_admin.can_read ? 0 : 1);
