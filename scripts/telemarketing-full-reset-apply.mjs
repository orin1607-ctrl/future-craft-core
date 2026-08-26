/**
 * Staging data reset after verified full backup.
 * Keeps Tair + directory 1-29. Removes proven test activity only.
 * node scripts/telemarketing-full-reset-apply.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const TAIR_ID = 'cfadfd61-476b-4b19-83c8-19b62b7bb99e';
const AVI_TEST_ID = 'e260ae41-c144-4545-bbf3-36f1d2735180';
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-full-reset-2026-08-26');

if (STAGING_REF === PROD_REF) throw new Error('refused: production');
const backupPath = join(OUT, 'full-backup.json');
const auditPath = join(OUT, 'audit.json');
if (!existsSync(backupPath) || !existsSync(auditPath)) throw new Error('backup missing — refuse to mutate');
const backup = JSON.parse(readFileSync(backupPath, 'utf8'));
if (backup.stagingRef !== STAGING_REF) throw new Error('backup ref mismatch');
if ((backup.dumps?.telemarketing_lead_directory?.rows || []).length < 29) throw new Error('directory backup too small');

const raw = execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
const keys = JSON.parse(raw);
const service = keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'service_role')?.api_key;
const db = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: dirBefore } = await db.from('telemarketing_lead_directory').select('id, lead_number, company_name, phone, assigned_to');
const keep29 = (dirBefore || []).filter((r) => {
  const n = Number(r.lead_number);
  return n >= 1 && n <= 29;
});
if (keep29.length !== 29) throw new Error(`expected 29 keepers, got ${keep29.length}`);
if (keep29.some((r) => r.assigned_to !== TAIR_ID)) throw new Error('a 1-29 lead is not assigned to Tair — refuse');

const extra30 = (dirBefore || []).filter((r) => String(r.lead_number) === '30' && r.company_name === 'יוסי בדיקה' && r.phone === '555555');
const { data: tair } = await db.from('profiles').select('full_name').eq('id', TAIR_ID).single();
if (tair?.full_name !== 'תאיר') throw new Error('Tair missing');

const { data: calls } = await db.from('telemarketing_calls').select('id, company_name, phone, employee_name, result, summary, status');
const { data: followups } = await db.from('telemarketing_followups').select('id, call_id, company_name, phone, action_needed, status');
const { data: work } = await db.from('telemarketing_work_sessions').select('id, company_name, employee_name, status');
const { data: chats } = await db.from('telemarketing_team_chats').select('id, company_name, agent_name, care_type');
const { data: states } = await db.from('telemarketing_lead_states').select('id, lead_key, company_name, phone, reason');
const callIds = (calls || []).map((c) => c.id);
const chatIds = (chats || []).map((c) => c.id);
const stateKeys = (states || []).map((s) => s.lead_key);

if (callIds.length) {
  const closed = await db.from('telemarketing_followups').update({ closed_by_call_id: null }).in('closed_by_call_id', callIds);
  if (closed.error && !/column/i.test(closed.error.message)) throw closed.error;
  await db.from('telemarketing_followups').delete().in('call_id', callIds);
}
await db.from('telemarketing_followups').delete().neq('id', '00000000-0000-0000-0000-000000000000');
if (chatIds.length) {
  await db.from('telemarketing_team_chat_reads').delete().in('chat_id', chatIds);
  await db.from('telemarketing_team_messages').delete().in('chat_id', chatIds);
  await db.from('telemarketing_team_chats').delete().in('id', chatIds);
}
if (stateKeys.length) {
  await db.from('telemarketing_lead_status_events').delete().in('lead_key', stateKeys);
  await db.from('telemarketing_lead_states').delete().in('id', (states || []).map((s) => s.id));
}
if (callIds.length) await db.from('telemarketing_calls').delete().in('id', callIds);
if ((work || []).length) await db.from('telemarketing_work_sessions').delete().in('id', (work || []).map((w) => w.id));

await db.from('telemarketing_lead_directory').update({ claimed_by: null, claimed_at: null }).not('id', 'is', null);

for (const row of extra30) {
  await db.from('telemarketing_lead_assignment_events').delete().eq('lead_id', row.id);
  await db.from('telemarketing_lead_directory').delete().eq('id', row.id).eq('lead_number', '30').eq('company_name', 'יוסי בדיקה');
}

const { data: agentRoles } = await db.from('user_roles').select('user_id, role').eq('role', 'telemarketing_agent');
const removedRoles = [];
for (const row of agentRoles || []) {
  if (row.user_id === TAIR_ID) continue;
  const { data: authUser } = await db.auth.admin.getUserById(row.user_id);
  const email = authUser?.user?.email || '';
  const { data: profile } = await db.from('profiles').select('full_name').eq('id', row.user_id).maybeSingle();
  const { data: allRoles } = await db.from('user_roles').select('role').eq('user_id', row.user_id);
  const roles = (allRoles || []).map((r) => r.role);
  const qaEmail = /@staging-e2e\.local$/i.test(email);
  const isAviTest = row.user_id === AVI_TEST_ID && email === 'yoni133333@gmail.com' && roles.length === 1 && roles[0] === 'telemarketing_agent';
  if (qaEmail || isAviTest) {
    await db.from('user_roles').delete().eq('user_id', row.user_id).eq('role', 'telemarketing_agent');
    removedRoles.push({ id: row.user_id, email, name: profile?.full_name, reason: qaEmail ? 'staging-e2e QA user — removed telemarketing role only' : 'Avi test agent — removed telemarketing role only, user kept' });
  } else {
    removedRoles.push({ id: row.user_id, email, name: profile?.full_name, reason: 'SKIPPED — not proven QA-only', skipped: true });
  }
}

const { count: stillDir } = await db.from('telemarketing_lead_directory').select('id', { count: 'exact', head: true });
const { data: numbers } = await db.from('telemarketing_lead_directory').select('lead_number, company_name, assigned_to, claimed_by').order('lead_number');
const { count: callsLeft } = await db.from('telemarketing_calls').select('id', { count: 'exact', head: true });
const { count: fuLeft } = await db.from('telemarketing_followups').select('id', { count: 'exact', head: true });
const { count: workLeft } = await db.from('telemarketing_work_sessions').select('id', { count: 'exact', head: true });
const { count: chatsLeft } = await db.from('telemarketing_team_chats').select('id', { count: 'exact', head: true });
const { count: statesLeft } = await db.from('telemarketing_lead_states').select('id', { count: 'exact', head: true });
const { count: claimedLeft } = await db.from('telemarketing_lead_directory').select('id', { count: 'exact', head: true }).not('claimed_by', 'is', null);
const { data: agentsNow } = await db.from('user_roles').select('user_id').eq('role', 'telemarketing_agent');
const { data: tair2 } = await db.from('profiles').select('full_name').eq('id', TAIR_ID).single();

const report = {
  at: new Date().toISOString(),
  productionTouched: false,
  deleted: {
    calls: calls || [],
    followups: followups || [],
    work: work || [],
    chats: chats || [],
    states: states || [],
    extraDirectory: extra30,
  },
  returnedToQueue: ['1 מערכות אשד', '2 פייר אאוט'],
  removedTelemarketingRoles: removedRoles,
  verify: {
    directory: stillDir,
    numbers: (numbers || []).map((r) => r.lead_number),
    allAssignedTair: (numbers || []).every((r) => r.assigned_to === TAIR_ID),
    claimed: claimedLeft,
    callsLeft,
    fuLeft,
    workLeft,
    chatsLeft,
    statesLeft,
    tair: tair2?.full_name,
    telemarketingAgents: (agentsNow || []).map((a) => a.user_id),
    onlyTairAgent: (agentsNow || []).length === 1 && agentsNow?.[0]?.user_id === TAIR_ID,
  },
};
writeFileSync(join(OUT, 'apply-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.verify.directory === 29 && report.verify.onlyTairAgent && report.verify.callsLeft === 0 && report.verify.tair === 'תאיר', verify: report.verify, removed: removedRoles, deletedCounts: { calls: (calls || []).length, followups: (followups || []).length, work: (work || []).length, chats: (chats || []).length, extra: extra30.length } }, null, 2));
if (!(report.verify.directory === 29 && report.verify.onlyTairAgent && report.verify.callsLeft === 0)) process.exit(2);
