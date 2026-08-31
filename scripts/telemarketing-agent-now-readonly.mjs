/**
 * READ-ONLY: Tair live activity + assignment snapshot. No Tair login. No mutations.
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const TAIR = 'cfadfd61-476b-4b19-83c8-19b62b7bb99e';
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-agent-now-status-2026-08-31');
mkdirSync(OUT, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused: production');
const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
if (branch !== 'feat/incident-alerts-staging') throw new Error(`wrong branch ${branch}`);

const raw = execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
const keys = JSON.parse(raw);
const service = keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key
  || keys.find((k) => k.name === 'service_role')?.api_key;
const db = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { autoRefreshToken: false, persistSession: false } });

async function allDir() {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('telemarketing_lead_directory')
      .select('id, lead_number, company_name, assigned_to, lead_wave, claimed_by, claimed_at, region, phone')
      .range(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const dir = await allDir();
const { data: openCalls, error: callErr } = await db.from('telemarketing_calls')
  .select('id, employee_id, company_name, phone, started_at, ended_at, report_started_at, status, duration_seconds')
  .eq('employee_id', TAIR)
  .eq('status', 'in_progress');
const { data: openWork, error: workErr } = await db.from('telemarketing_work_sessions')
  .select('id, employee_id, company_name, phone, started_at, ended_at, report_started_at, status, task_type')
  .eq('employee_id', TAIR)
  .eq('status', 'in_progress');
if (callErr) throw callErr;
if (workErr) throw workErr;

const claimed = dir.filter((r) => r.claimed_by === TAIR);
const tairAssigned = dir.filter((r) => r.assigned_to === TAIR);
const call = (openCalls || [])[0] || null;
const work = (openWork || [])[0] || null;
let nowKind = 'idle';
if (call && !call.ended_at) nowKind = 'on_call';
else if (call && call.ended_at) nowKind = 'on_report';
else if (work && !work.ended_at) nowKind = 'on_work_task';
else if (work && work.ended_at) nowKind = 'on_work_report';
else if (claimed.length) nowKind = 'on_claimed_lead';

const regions = {};
for (const r of dir.filter((x) => x.lead_wave === 'new')) {
  const key = String(r.region || '').trim() || '(empty)';
  regions[key] = (regions[key] || 0) + 1;
}

const report = {
  at: new Date().toISOString(),
  stagingRef: STAGING_REF,
  productionTouched: false,
  mutated: false,
  tairLoginUsed: false,
  branch,
  assignments: {
    directory: dir.length,
    new: dir.filter((r) => r.lead_wave === 'new').length,
    old: dir.filter((r) => r.lead_wave === 'old').length,
    tairTotal: tairAssigned.length,
    tairNew: tairAssigned.filter((r) => r.lead_wave === 'new').length,
    tairOld: tairAssigned.filter((r) => r.lead_wave === 'old').length,
  },
  live: {
    nowKind,
    openCalls: openCalls || [],
    openWork: openWork || [],
    claimedLeads: claimed.map((r) => ({
      lead_number: r.lead_number,
      company_name: r.company_name,
      claimed_at: r.claimed_at,
      lead_wave: r.lead_wave,
    })),
  },
  geo: {
    newLeadsWithRegion: dir.filter((r) => r.lead_wave === 'new' && String(r.region || '').trim()).length,
    newLeadsTotal: dir.filter((r) => r.lead_wave === 'new').length,
    topRegions: Object.entries(regions).sort((a, b) => b[1] - a[1]).slice(0, 15),
  },
};
writeFileSync(join(OUT, 'RESTORE-POINT.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
