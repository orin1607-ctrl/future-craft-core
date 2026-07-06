/**
 * Probe marketing-site-build Edge status (no secret values).
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const EDGE = `${STAGING_URL}/functions/v1/marketing-site-build`;

const keys = JSON.parse(execSync(`npx supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key;
const anon = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key;
const admin = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });

const runId = Date.now();
const email = `build-eng-${runId}@staging-e2e.local`;
const password = `Be!${runId}`;
await admin.auth.admin.createUser({ email, password, email_confirm: true });
const uid = (await admin.auth.admin.listUsers()).data.users.find((u) => u.email === email)?.id;
await admin.from('profiles').upsert({ id: uid, full_name: 'Build Eng', company_name: 'דליה', is_active: true, approval_status: 'approved', two_factor_approved: true });
await admin.from('user_roles').delete().eq('user_id', uid);
await admin.from('user_roles').insert({ user_id: uid, role: 'super_admin' });
await new Promise((r) => setTimeout(r, 400));

const { data: auth } = await createClient(STAGING_URL, anon).auth.signInWithPassword({ email, password });
const headers = { apikey: anon, Authorization: `Bearer ${auth.session.access_token}`, 'Content-Type': 'application/json' };

const report = { at: new Date().toISOString(), edge: {}, probes: {}, ok: true };

const statusRes = await fetch(EDGE, { method: 'POST', headers, body: JSON.stringify({ action: 'status' }) });
report.edge.status = await statusRes.json();

for (const [action, key] of [
  ['images', 'openai'],
  ['v0', 'v0'],
  ['wordpress', 'wordpress'],
  ['figma', 'figma'],
  ['webflow', 'webflow'],
  ['builder', 'builder'],
  ['plasmic', 'plasmic'],
  ['stitch', 'stitch'],
  ['runway', 'runway'],
]) {
  const res = await fetch(EDGE, { method: 'POST', headers, body: JSON.stringify({ action, prompt: 'CO.CO test' }) });
  const data = await res.json();
  report.probes[action] = { http: res.status, ok: !!data.ok, needsKey: data.needsKey || null, error: data.error || null };
  if (action === 'images' && !data.ok) report.ok = false;
}

const outDir = join(process.cwd(), 'docs', 'audit-reports', 'build-engines');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'edge-probe.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
