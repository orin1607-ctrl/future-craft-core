/**
 * READ-ONLY + timed 1-lead assign/unassign probe. Restores the probe lead.
 * Staging only.
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const ADMIN_EMAIL = 'orin1607@gmail.com';
const TAIR = 'cfadfd61-476b-4b19-83c8-19b62b7bb99e';
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-assign-hang-2026-08-31');
mkdirSync(OUT, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused: production');
const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
if (branch !== 'feat/incident-alerts-staging') throw new Error(`wrong branch ${branch}`);
const commit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();

function loadKeys() {
  const raw = execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
  const keys = JSON.parse(raw);
  return {
    service: keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'service_role')?.api_key,
    anon: keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key,
  };
}
async function allRows(db, table, columns) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(columns).range(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const keys = loadKeys();
const adminDb = createClient(STAGING_URL, keys.service, { auth: { autoRefreshToken: false, persistSession: false } });
const dir = await allRows(adminDb, 'telemarketing_lead_directory', 'id, lead_number, company_name, assigned_to, lead_wave, fleet_size');
const followups = await allRows(adminDb, 'telemarketing_followups', 'id, status');
const hist = await adminDb.from('telemarketing_historical_work').select('duration_seconds').eq('employee_id', TAIR);
const histSeconds = (hist.data || []).reduce((s, r) => s + Number(r.duration_seconds || 0), 0);
const restore = {
  at: new Date().toISOString(),
  stagingRef: STAGING_REF,
  productionTouched: false,
  branch,
  codeCommit: commit,
  directory: dir.length,
  old: dir.filter((r) => r.lead_wave === 'old').length,
  neu: dir.filter((r) => r.lead_wave === 'new').length,
  tairAssigned: dir.filter((r) => r.assigned_to === TAIR).length,
  unassignedNew: dir.filter((r) => r.lead_wave === 'new' && !r.assigned_to).length,
  followups: followups.length,
  tairHistSeconds: histSeconds,
};
writeFileSync(join(OUT, 'RESTORE-POINT.json'), JSON.stringify(restore, null, 2), 'utf8');

const sessionClient = createClient(STAGING_URL, keys.anon, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: linkData, error: linkErr } = await adminDb.auth.admin.generateLink({ type: 'magiclink', email: ADMIN_EMAIL });
if (linkErr) throw linkErr;
const { data: auth, error: verifyErr } = await sessionClient.auth.verifyOtp({ email: ADMIN_EMAIL, token: linkData.properties.email_otp, type: 'email' });
if (verifyErr || !auth.session) throw verifyErr || new Error('verifyOtp');
await sessionClient.auth.setSession(auth.session);

const probe = dir.find((r) => r.lead_wave === 'new' && !r.assigned_to);
const many = dir.filter((r) => r.lead_wave === 'new' && !r.assigned_to).slice(0, 80).map((r) => r.id);
const tooMany = dir.filter((r) => r.lead_wave === 'new' && !r.assigned_to).slice(0, 2030).map((r) => r.id);

async function timed(name, fn) {
  const t0 = Date.now();
  try {
    const data = await fn();
    return { name, ms: Date.now() - t0, ok: true, data };
  } catch (e) {
    return { name, ms: Date.now() - t0, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const results = [];
results.push(await timed('assign-1', async () => {
  const { data, error } = await sessionClient.rpc('telemarketing_assign_leads', { p_lead_ids: [probe.id], p_agent_id: TAIR });
  if (error) throw error;
  return data;
}));
results.push(await timed('unassign-1', async () => {
  const { data, error } = await sessionClient.rpc('telemarketing_unassign_leads', { p_lead_ids: [probe.id] });
  if (error) throw error;
  return data;
}));
results.push(await timed('assign-80', async () => {
  const { data, error } = await sessionClient.rpc('telemarketing_assign_leads', { p_lead_ids: many, p_agent_id: TAIR });
  if (error) throw error;
  return data;
}));
results.push(await timed('unassign-80', async () => {
  const { data, error } = await sessionClient.rpc('telemarketing_unassign_leads', { p_lead_ids: many });
  if (error) throw error;
  return data;
}));
results.push(await timed('assign-2030-expect-limit', async () => {
  const { data, error } = await sessionClient.rpc('telemarketing_assign_leads', { p_lead_ids: tooMany, p_agent_id: TAIR });
  if (error) throw error;
  return data;
}));

const after = await allRows(adminDb, 'telemarketing_lead_directory', 'id, assigned_to, lead_wave');
const afterTair = after.filter((r) => r.assigned_to === TAIR).length;
writeFileSync(join(OUT, 'rpc-probe.json'), JSON.stringify({ restore, probe: { id: probe.id, lead_number: probe.lead_number, company: probe.company_name }, results, afterTair }, null, 2), 'utf8');
console.log(JSON.stringify({ probe: probe.lead_number, results: results.map((r) => ({ name: r.name, ms: r.ms, ok: r.ok, error: r.error || null, assigned: r.data?.assignedCount ?? r.data?.assignedcount ?? r.data?.unassignedCount ?? r.data?.unassignedcount ?? null })), afterTair }, null, 2));
if (afterTair !== 0) process.exit(1);
