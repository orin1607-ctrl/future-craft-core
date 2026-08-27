/**
 * READ-ONLY Staging backup + restore point before work/inspect mode.
 * Does not mutate data. Refuses Production.
 * node scripts/telemarketing-entry-mode-backup.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const TAIR = { email: 'tairmizrahi311@gmail.com', id: 'cfadfd61-476b-4b19-83c8-19b62b7bb99e' };
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-entry-mode-2026-08-27');
const NUMS = Array.from({ length: 29 }, (_, i) => String(i + 1));
const YELLOW = ['1', '5', '12', '13', '16', '25'];

mkdirSync(OUT, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused: production');

const gitSha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
const gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
if (gitBranch !== 'feat/incident-alerts-staging') throw new Error(`wrong branch ${gitBranch}`);

const raw = execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
const keys = JSON.parse(raw);
const service = keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key
  || keys.find((k) => k.name === 'service_role')?.api_key;
const db = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { autoRefreshToken: false, persistSession: false } });

async function all(table, q) {
  let query = db.from(table).select('*');
  if (q) query = q(query);
  const { data, error } = await query.limit(5000);
  if (error) throw new Error(`${table}: ${error.message}`);
  return data || [];
}

const directory = await all('telemarketing_lead_directory');
const states = await all('telemarketing_lead_states');
const followups = await all('telemarketing_followups');
const calls = await all('telemarketing_calls');
const work = await all('telemarketing_work_sessions');
const hist = await all('telemarketing_historical_work', (q) => q.eq('employee_id', TAIR.id).eq('work_date', '2026-08-26'));
const tairCalls = calls.filter((r) => r.employee_id === TAIR.id);
const tairWork = work.filter((r) => r.employee_id === TAIR.id);
const sundayFu = followups.filter((r) => r.owner_employee_id === TAIR.id && r.due_date === '2026-08-30' && !r.call_id && r.status === 'open');
const histSum = hist.reduce((s, r) => s + Number(r.duration_seconds || 0), 0);
const tairCallSeconds = tairCalls.reduce((s, r) => s + Number(r.duration_seconds || 0) + Number(r.report_duration_seconds || 0), 0);
const tairWorkSeconds = tairWork.reduce((s, r) => s + Number(r.duration_seconds || 0) + Number(r.report_duration_seconds || 0), 0);

const backup = {
  at: new Date().toISOString(),
  environment: 'oren-car-staging',
  stagingRef: STAGING_REF,
  productionTouched: false,
  mainTouched: false,
  hostingerTouched: false,
  codeCommit: gitSha,
  branch: gitBranch,
  tair: TAIR,
  fingerprints: {
    directoryCount: directory.length,
    directoryNumbers: directory.map((r) => String(r.lead_number)).sort((a, b) => Number(a) - Number(b)),
    assignedToTair: directory.filter((r) => r.assigned_to === TAIR.id).length,
    statesCount: states.length,
    statesByColor: states.reduce((acc, r) => { acc[r.lead_color] = (acc[r.lead_color] || 0) + 1; return acc; }, {}),
    followupsOpenSunday: sundayFu.map((r) => ({ leadNumber: r.lead_number, company: r.company_name, due: r.due_date, dueTime: r.due_time, callId: r.call_id })),
    histSum,
    histRows: hist.length,
    tairCallCount: tairCalls.length,
    tairCallSeconds,
    tairWorkCount: tairWork.length,
    tairWorkSeconds,
    tairMeasuredSeconds: tairCallSeconds + tairWorkSeconds,
  },
  directory,
  states,
  followups,
  calls,
  work,
  historical: hist,
};

writeFileSync(join(OUT, 'backup-before.json'), JSON.stringify(backup, null, 2));

const restore = {
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
    tair: TAIR.id,
    directoryLeads: '1-29',
    historicalSeconds: 5400,
    sundayFollowups: YELLOW,
  },
  fingerprints: backup.fingerprints,
  rollback: [
    'This change is client sessionStorage + UI gates. No DB schema change.',
    'Restore code: git checkout <codeCommit> -- the files from this mission.',
    'Do not restore directory/calls/followups unless a later QA script mutated them; backup-before.json holds the snapshot.',
  ],
  note: 'Work/inspect mode. No inactivity timeout invented. Tab sessionStorage, same lifetime as existing security session.',
};

writeFileSync(join(OUT, 'RESTORE-POINT.json'), JSON.stringify(restore, null, 2));

const ok29 = NUMS.every((n) => backup.fingerprints.directoryNumbers.includes(n)) && directory.length === 29;
const okHist = histSum === 5400;
const okFu = sundayFu.length === 6;

console.log(JSON.stringify({
  ok: ok29 && okHist && okFu,
  ok29,
  okHist,
  okFu,
  fingerprints: backup.fingerprints,
  out: OUT,
}, null, 2));

if (!(ok29 && okHist && okFu)) process.exit(1);
