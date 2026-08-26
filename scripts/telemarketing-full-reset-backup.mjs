/**
 * READ-ONLY full telemarketing backup + audit on Staging.
 * Does not mutate data. Refuses Production.
 * node scripts/telemarketing-full-reset-backup.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const TAIR_ID = 'cfadfd61-476b-4b19-83c8-19b62b7bb99e';
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-full-reset-2026-08-26');
mkdirSync(OUT, { recursive: true });

if (STAGING_REF === PROD_REF) throw new Error('refused: production');

const raw = execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
const keys = JSON.parse(raw);
const service = keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'service_role')?.api_key;
const db = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });

async function allRows(table, orderCol) {
  const { data, error, count } = await db.from(table).select('*', { count: 'exact' }).order(orderCol || 'created_at', { ascending: true }).limit(5000);
  if (error) throw new Error(`${table}: ${error.message}`);
  return { table, count: count ?? (data || []).length, rows: data || [] };
}

const tables = [
  ['telemarketing_lead_directory', 'lead_number'],
  ['telemarketing_lead_assignment_events', 'created_at'],
  ['telemarketing_lead_import_batches', 'created_at'],
  ['telemarketing_calls', 'created_at'],
  ['telemarketing_followups', 'created_at'],
  ['telemarketing_work_sessions', 'created_at'],
  ['telemarketing_lead_states', 'updated_at'],
  ['telemarketing_lead_status_events', 'created_at'],
  ['telemarketing_team_chats', 'opened_at'],
  ['telemarketing_team_messages', 'created_at'],
  ['telemarketing_team_chat_reads', 'last_read_at'],
  ['telemarketing_settings', 'key'],
];

const dumps = {};
for (const [table, orderCol] of tables) {
  try {
    dumps[table] = await allRows(table, orderCol);
  } catch (e) {
    dumps[table] = { table, error: String(e.message || e), rows: [], count: 0 };
  }
}

const { data: agentRoles, error: roleErr } = await db.from('user_roles').select('user_id, role').eq('role', 'telemarketing_agent');
if (roleErr) throw roleErr;
const agentIds = [...new Set((agentRoles || []).map((r) => r.user_id))];
const agents = [];
for (const id of agentIds) {
  const { data: profile } = await db.from('profiles').select('id, full_name, is_active, job_title, notes, customer_id').eq('id', id).maybeSingle();
  const { data: authUser } = await db.auth.admin.getUserById(id);
  const { data: allRoles } = await db.from('user_roles').select('role').eq('user_id', id);
  agents.push({
    id,
    full_name: profile?.full_name || null,
    is_active: profile?.is_active ?? null,
    job_title: profile?.job_title || null,
    email: authUser?.user?.email || null,
    roles: (allRoles || []).map((r) => r.role),
    isTair: id === TAIR_ID,
  });
}

const { data: tairAuth } = await db.auth.admin.getUserById(TAIR_ID);
const { data: tairProfile } = await db.from('profiles').select('*').eq('id', TAIR_ID).single();
const directory = dumps.telemarketing_lead_directory.rows || [];
const calls = dumps.telemarketing_calls.rows || [];
const followups = dumps.telemarketing_followups.rows || [];
const work = dumps.telemarketing_work_sessions.rows || [];
const chats = dumps.telemarketing_team_chats.rows || [];
const states = dumps.telemarketing_lead_states.rows || [];

const qaRe = /qa|demo|test|e2e|qa-continue|qa-list|qa-assign|qa-followup|tele-0/i;
function looksQa(row) {
  const blob = JSON.stringify(row || {});
  return qaRe.test(blob);
}

const numbers = directory.map((r) => String(r.lead_number)).sort((a, b) => Number(a) - Number(b));
const audit = {
  at: new Date().toISOString(),
  environment: 'oren-car-staging',
  stagingRef: STAGING_REF,
  productionTouched: false,
  tair: {
    id: TAIR_ID,
    full_name: tairProfile?.full_name,
    email: tairAuth?.user?.email,
    is_active: tairProfile?.is_active,
    roles: (await db.from('user_roles').select('role').eq('user_id', TAIR_ID)).data?.map((r) => r.role) || [],
  },
  directory: {
    count: directory.length,
    numbers,
    expected29: directory.length === 29 && numbers.join(',') === Array.from({ length: 29 }, (_, i) => String(i + 1)).join(','),
    assignedToTair: directory.filter((r) => r.assigned_to === TAIR_ID).length,
    claimed: directory.filter((r) => r.claimed_by).map((r) => ({ lead_number: r.lead_number, company_name: r.company_name, claimed_by: r.claimed_by, claimed_at: r.claimed_at })),
    archived: directory.filter((r) => r.archived_at).map((r) => r.lead_number),
    leads: directory.map((r) => ({
      lead_number: r.lead_number,
      company_name: r.company_name,
      phone: r.phone,
      email: r.email,
      assigned_to: r.assigned_to,
      assigned_name: r.assigned_name,
      claimed_by: r.claimed_by,
      claimed_at: r.claimed_at,
      archived_at: r.archived_at,
    })),
  },
  agents,
  counts: {
    calls: calls.length,
    followups: followups.length,
    work: work.length,
    chats: chats.length,
    states: states.length,
    statusEvents: dumps.telemarketing_lead_status_events.count,
    assignmentEvents: dumps.telemarketing_lead_assignment_events.count,
    messages: dumps.telemarketing_team_messages.count,
  },
  callsSlim: calls.map((c) => ({
    id: c.id,
    company_name: c.company_name,
    phone: c.phone,
    employee_name: c.employee_name,
    employee_id: c.employee_id,
    result: c.result,
    summary: c.summary,
    status: c.status,
    started_at: c.started_at,
    qa: looksQa(c),
  })),
  followupsSlim: followups.map((f) => ({
    id: f.id,
    company_name: f.company_name,
    phone: f.phone,
    status: f.status,
    action_needed: f.action_needed,
    qa: looksQa(f),
  })),
  workSlim: work.map((w) => ({
    id: w.id,
    company_name: w.company_name,
    employee_name: w.employee_name,
    status: w.status,
    task_type: w.task_type,
    qa: looksQa(w),
  })),
  chatsSlim: chats.map((t) => ({
    id: t.id,
    company_name: t.company_name,
    agent_name: t.agent_name,
    care_type: t.care_type,
    status: t.status,
    qa: looksQa(t),
  })),
  statesSlim: states.map((s) => ({
    id: s.id,
    lead_key: s.lead_key,
    company_name: s.company_name,
    color: s.color,
    status: s.status,
    reason: s.reason,
    qa: looksQa(s),
  })),
};

writeFileSync(join(OUT, 'RESTORE-POINT.json'), JSON.stringify({
  at: audit.at,
  environment: 'oren-car-staging',
  stagingRef: STAGING_REF,
  productionTouched: false,
  codeCommit: execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(),
  branch: execSync('git branch --show-current', { encoding: 'utf8' }).trim(),
  keep: { tair: TAIR_ID, directoryLeads: '1-29' },
  note: 'Data reset only. Do not revert feature commits. Restore tables from full-backup.json if needed.',
}, null, 2));
writeFileSync(join(OUT, 'audit.json'), JSON.stringify(audit, null, 2));
writeFileSync(join(OUT, 'full-backup.json'), JSON.stringify({ at: audit.at, stagingRef: STAGING_REF, dumps, agents }, null, 2));
writeFileSync(join(OUT, 'directory-1-29.json'), JSON.stringify(audit.directory, null, 2));
console.log(JSON.stringify({
  backupDir: OUT,
  directory: audit.directory.count,
  expected29: audit.directory.expected29,
  assignedToTair: audit.directory.assignedToTair,
  claimed: audit.directory.claimed.length,
  tair: audit.tair,
  agents: agents.map((a) => ({ id: a.id, name: a.full_name, email: a.email, roles: a.roles, isTair: a.isTair })),
  counts: audit.counts,
  qaCalls: audit.callsSlim.filter((c) => c.qa).length,
  nonQaCalls: audit.callsSlim.filter((c) => !c.qa).length,
  qaFollowups: audit.followupsSlim.filter((f) => f.qa).length,
  nonQaFollowups: audit.followupsSlim.filter((f) => !f.qa).length,
}, null, 2));
