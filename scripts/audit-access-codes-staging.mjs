/** Access codes + OTP separation audit — staging only */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const ref = 'usfeoerkpcafxxlyuldl';
const url = `https://${ref}.supabase.co`;
const OUT = join(process.cwd(), 'docs', 'audit-reports');
mkdirSync(OUT, { recursive: true });

const keys = JSON.parse(execSync(`supabase projects api-keys --project-ref ${ref} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role' && k.type === 'legacy').api_key;
const anon = keys.find((k) => k.name === 'anon' && k.type === 'legacy').api_key;
const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
const client = createClient(url, anon);

const runId = Date.now();
const pass = `Audit!${runId}`;
const report = { at: new Date().toISOString(), tests: {} };

const saEmail = `audit-sa-${runId}@staging-e2e.local`;
const { data: sa } = await admin.auth.admin.createUser({ email: saEmail, password: pass, email_confirm: true });
const saId = sa.user.id;
await admin.from('profiles').upsert({ id: saId, full_name: 'SA', company_name: 'E2E', is_active: true, approval_status: 'approved' });
await admin.from('user_roles').delete().eq('user_id', saId);
await admin.from('user_roles').insert({ user_id: saId, role: 'super_admin' });
await new Promise((r) => setTimeout(r, 800));
const { data: saAuth } = await client.auth.signInWithPassword({ email: saEmail, password: pass });
const saToken = saAuth.session.access_token;

const targetEmail = `audit-user-${runId}@staging-e2e.local`;
const { data: tu } = await admin.auth.admin.createUser({ email: targetEmail, password: pass, email_confirm: true });
const tuId = tu.user.id;
await admin.from('profiles').upsert({ id: tuId, full_name: 'Target', company_name: 'E2E', is_active: true, approval_status: 'approved' });
await admin.from('user_roles').insert({ user_id: tuId, role: 'private_customer' });

async function invoke(body) {
  const res = await fetch(`${url}/functions/v1/send-user-access-code`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${saToken}`, apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

report.tests.manual_code = await invoke({ user_id: tuId, code: `MAN${runId}`.slice(-6), mode: 'manual', send_email: false });
report.tests.auto_code = await invoke({ user_id: tuId, code: `AUTO${runId}`.slice(-6), mode: 'auto', send_email: false });

const { data: codes } = await admin.from('user_access_codes').select('mode,is_active,sent_to_email_at,verified_at,code_hash').eq('user_id', tuId);
report.tests.db_codes = codes;

const purposes = ['login_2fa', 'password_reset'];
report.tests.otp_purposes = {};
for (const p of purposes) {
  const { count } = await admin.from('auth_verification_codes').select('*', { count: 'exact', head: true }).eq('purpose', p);
  report.tests.otp_purposes[p] = count;
}
report.tests.access_codes_total = (await admin.from('user_access_codes').select('*', { count: 'exact', head: true })).count;

await admin.auth.admin.deleteUser(tuId);
await admin.auth.admin.deleteUser(saId);

writeFileSync(join(OUT, 'access-codes-audit.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
