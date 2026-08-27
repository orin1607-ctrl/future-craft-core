/**
 * READ-ONLY Staging backup before Dalia CSV import + fleet filter.
 * node scripts/telemarketing-dalia-leads-import-backup.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const TAIR = { id: 'cfadfd61-476b-4b19-83c8-19b62b7bb99e' };
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-dalia-leads-import-2026-08-27');
const CSV_SRC = join(process.env.USERPROFILE || '', 'Downloads', 'לידים דליה 1 - גיליון1.csv');
const NUMS = Array.from({ length: 29 }, (_, i) => String(i + 1));

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

async function all(table) {
  const { data, error } = await db.from(table).select('*').limit(5000);
  if (error) throw new Error(`${table}: ${error.message}`);
  return data || [];
}

const directory = await all('telemarketing_lead_directory');
const states = await all('telemarketing_lead_states');
const followups = await all('telemarketing_followups');
const calls = await all('telemarketing_calls');
const work = await all('telemarketing_work_sessions');
const hist = (await db.from('telemarketing_historical_work').select('*').eq('employee_id', TAIR.id).eq('work_date', '2026-08-26')).data || [];
const sundayFu = followups.filter((r) => r.owner_employee_id === TAIR.id && r.due_date === '2026-08-30' && !r.call_id && r.status === 'open');
const histSum = hist.reduce((s, r) => s + Number(r.duration_seconds || 0), 0);
const numbers = directory.map((r) => String(r.lead_number)).sort((a, b) => Number(a) - Number(b));

try {
  copyFileSync(CSV_SRC, join(OUT, 'source-leads-dalia-1.csv'));
} catch (e) {
  console.warn('csv copy skipped', e.message);
}

const backup = {
  at: new Date().toISOString(),
  environment: 'oren-car-staging',
  stagingRef: STAGING_REF,
  codeCommit: gitSha,
  branch: gitBranch,
  fingerprints: {
    directoryCount: directory.length,
    directoryNumbers: numbers,
    assignedToTair: directory.filter((r) => r.assigned_to === TAIR.id).length,
    histSum,
    sundayFu: sundayFu.length,
    tairCallCount: calls.filter((r) => r.employee_id === TAIR.id).length,
    statesCount: states.length,
  },
  directory,
  states,
  followups,
  calls,
  work,
  historical: hist,
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
  keep: { directoryLeads: '1-29', historicalSeconds: 5400, sundayFollowups: 6 },
  fingerprints: backup.fingerprints,
  rollback: [
    'DELETE FROM public.telemarketing_lead_directory WHERE lead_number ~ \'^[0-9]+$\' AND lead_number::int > 29;',
    'Do not delete or update lead_number 1-29.',
    'UI rollback: git checkout <codeCommit> -- src/features/telemarketing/lib/leadAssign src/features/telemarketing/lib/leadImport/mapColumns.ts src/features/telemarketing/components/Leads/LeadDirectoryBoard.tsx',
  ],
}, null, 2));

const ok29 = NUMS.every((n) => numbers.includes(n)) && directory.length === 29;
const okHist = histSum === 5400;
const okFu = sundayFu.length === 6;
console.log(JSON.stringify({
  ok: ok29 && okHist && okFu,
  restorePoint: join(OUT, 'RESTORE-POINT.json'),
  fingerprints: backup.fingerprints,
}, null, 2));
if (!(ok29 && okHist && okFu)) process.exit(1);
