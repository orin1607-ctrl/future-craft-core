/**
 * READ-ONLY backup before treatment-timing work. No data reset.
 * node scripts/telemarketing-treatment-timing-backup.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const TAIR_ID = 'cfadfd61-476b-4b19-83c8-19b62b7bb99e';
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-treatment-timing-2026-08-26');
mkdirSync(OUT, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused: production');

const raw = execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
const keys = JSON.parse(raw);
const service = keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'service_role')?.api_key;
const db = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { autoRefreshToken: false, persistSession: false } });

async function count(table) {
  const { count } = await db.from(table).select('id', { count: 'exact', head: true });
  return count ?? 0;
}

const { data: directory } = await db.from('telemarketing_lead_directory').select('lead_number, company_name, assigned_to, claimed_by').order('lead_number');
const { data: tair } = await db.from('profiles').select('full_name, is_active').eq('id', TAIR_ID).single();
const { data: tairAuth } = await db.auth.admin.getUserById(TAIR_ID);
const { data: agents } = await db.from('user_roles').select('user_id').eq('role', 'telemarketing_agent');
const { data: callCols } = await db.from('telemarketing_calls').select('*').limit(1);
const { data: workCols } = await db.from('telemarketing_work_sessions').select('*').limit(1);

const audit = {
  at: new Date().toISOString(),
  stagingRef: STAGING_REF,
  productionTouched: false,
  beforeMechanism: {
    calls: 'started_at, ended_at, duration_seconds. Timer stops on End Call. Report submit has no separate clock.',
    work: 'started_at, ended_at, duration_seconds. Same pattern.',
    dalia: 'opened_at/closed_at exist but are not reliable typing time.',
  },
  tair: { id: TAIR_ID, name: tair?.full_name, email: tairAuth?.user?.email, active: tair?.is_active },
  directoryCount: directory?.length || 0,
  numbers: (directory || []).map((r) => r.lead_number),
  claimed: (directory || []).filter((r) => r.claimed_by).length,
  assignedTair: (directory || []).filter((r) => r.assigned_to === TAIR_ID).length,
  agents: (agents || []).map((a) => a.user_id),
  counts: {
    calls: await count('telemarketing_calls'),
    followups: await count('telemarketing_followups'),
    work: await count('telemarketing_work_sessions'),
    chats: await count('telemarketing_team_chats'),
  },
  callColumnSample: callCols?.[0] ? Object.keys(callCols[0]) : [],
  workColumnSample: workCols?.[0] ? Object.keys(workCols[0]) : [],
};
writeFileSync(join(OUT, 'audit-before.json'), JSON.stringify(audit, null, 2));
writeFileSync(join(OUT, 'RESTORE-POINT.json'), JSON.stringify({
  at: audit.at,
  environment: 'oren-car-staging',
  stagingRef: STAGING_REF,
  productionTouched: false,
  codeCommit: execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(),
  branch: execSync('git branch --show-current', { encoding: 'utf8' }).trim(),
  keep: { tair: TAIR_ID, directoryLeads: '1-29' },
  rollbackSql: 'ALTER TABLE telemarketing_calls DROP COLUMN IF EXISTS report_started_at, DROP COLUMN IF EXISTS report_ended_at, DROP COLUMN IF EXISTS report_duration_seconds, DROP COLUMN IF EXISTS treated_ended_at, DROP COLUMN IF EXISTS treatment_duration_seconds; same for telemarketing_work_sessions. Do not revert feature commits that are unrelated.',
  note: 'No directory rows deleted. Timing columns only.',
}, null, 2));
console.log(JSON.stringify({
  tairOk: audit.tair.name === 'תאיר' && audit.tair.email === 'tairmizrahi311@gmail.com',
  dir29: audit.directoryCount === 29,
  assignedTair: audit.assignedTair,
  claimed: audit.claimed,
  counts: audit.counts,
  onlyTair: audit.agents.length === 1 && audit.agents[0] === TAIR_ID,
  callColumns: audit.callColumnSample,
}, null, 2));
if (audit.directoryCount !== 29 || audit.tair.name !== 'תאיר') process.exit(2);
