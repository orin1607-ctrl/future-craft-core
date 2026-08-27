/**
 * READ-ONLY Staging backup before admin per-agent lead workload UI.
 * node scripts/telemarketing-agent-workload-backup.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const TAIR = 'cfadfd61-476b-4b19-83c8-19b62b7bb99e';
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-agent-workload-2026-08-28');
if (STAGING_REF === PROD_REF) throw new Error('refused: production');

mkdirSync(OUT, { recursive: true });
const gitSha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
const gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
if (gitBranch !== 'feat/incident-alerts-staging') throw new Error(`wrong branch ${gitBranch}`);

const raw = execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
const keys = JSON.parse(raw);
const service = keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key
  || keys.find((k) => k.name === 'service_role')?.api_key;
const db = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { autoRefreshToken: false, persistSession: false } });

async function all(table, cols = '*') {
  const { data, error } = await db.from(table).select(cols).limit(5000);
  if (error) throw new Error(`${table}: ${error.message}`);
  return data || [];
}

const directory = await all('telemarketing_lead_directory', 'id, lead_number, company_name, phone, assigned_to, assigned_name, archived_at, claimed_by, fleet_size');
const states = await all('telemarketing_lead_states', 'id, lead_key, company_name, phone, lead_color, lead_status, employee_id');
const followups = await all('telemarketing_followups', 'id, company_name, phone, status, owner_employee_id, due_date, call_id');
const calls = await all('telemarketing_calls', 'id, employee_id, company_name, phone, status, result, duration_seconds');
const hist = (await db.from('telemarketing_historical_work').select('duration_seconds').eq('employee_id', TAIR).eq('work_date', '2026-08-26')).data || [];
const histSum = hist.reduce((s, r) => s + Number(r.duration_seconds || 0), 0);
const sundayFu = followups.filter((r) => r.owner_employee_id === TAIR && r.due_date === '2026-08-30' && !r.call_id && r.status === 'open');
const nums = Array.from({ length: 29 }, (_, i) => String(i + 1));

const backup = {
  at: new Date().toISOString(),
  environment: 'oren-car-staging',
  stagingRef: STAGING_REF,
  codeCommit: gitSha,
  branch: gitBranch,
  fingerprints: {
    directoryCount: directory.length,
    assignedToTair: directory.filter((r) => r.assigned_to === TAIR).length,
    unassigned: directory.filter((r) => !r.assigned_to && !r.archived_at).length,
    statesCount: states.length,
    yellowStates: states.filter((s) => s.lead_color === 'yellow').length,
    redStates: states.filter((s) => s.lead_color === 'red').length,
    openFollowups: followups.filter((f) => f.status === 'open').length,
    sundayFu: sundayFu.length,
    tairCallCount: calls.filter((c) => c.employee_id === TAIR).length,
    histSum,
    keep29: nums.every((n) => directory.some((r) => String(r.lead_number) === n && r.assigned_to === TAIR)),
  },
  directory,
  states,
  followups,
  calls: calls.map((c) => ({ id: c.id, employee_id: c.employee_id, phone: c.phone, company_name: c.company_name, status: c.status, result: c.result })),
};

writeFileSync(join(OUT, 'backup-before.json'), JSON.stringify(backup, null, 2));
writeFileSync(join(OUT, 'RESTORE-POINT.json'), JSON.stringify({
  at: backup.at,
  environment: 'oren-car-staging',
  stagingRef: STAGING_REF,
  productionTouched: false,
  mainTouched: false,
  hostingerTouched: false,
  codeCommit: gitSha,
  branch: gitBranch,
  backupFile: 'backup-before.json',
  keep: {
    directoryLeads: directory.length,
    leads1to29: 'assigned to Tair, unchanged',
    historicalSeconds: histSum,
    sundayFollowups: sundayFu.length,
  },
  fingerprints: backup.fingerprints,
  rollback: [
    'UI only: git checkout <codeCommit> -- src/features/telemarketing/lib/leadAssign/selectScope.ts src/features/telemarketing/components/Leads/LeadDirectoryBoard.tsx',
    'Do not delete or update telemarketing_lead_directory rows.',
    'Do not change calls, states, followups, or historical_work.',
  ],
}, null, 2));
console.log(JSON.stringify({ restorePoint: join(OUT, 'RESTORE-POINT.json'), fingerprints: backup.fingerprints }, null, 2));
