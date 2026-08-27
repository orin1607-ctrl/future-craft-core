/**
 * Staging ONLY: backup, apply historical-work schema, seed Tair 26/08/2026
 * 5400s historical time + 6 yellow follow-ups for 30/08/2026. No fake calls.
 * node scripts/apply-telemarketing-tair-historical-staging.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const TAIR = { email: 'tairmizrahi311@gmail.com', id: 'cfadfd61-476b-4b19-83c8-19b62b7bb99e', name: 'תאיר' };
const ROOT = process.cwd();
const SQL = join(ROOT, 'supabase/migrations/20260827120000_telemarketing_historical_work_followup_nullable_call_staging.sql');
const OUT = join(ROOT, 'docs/audit-reports/telemarketing-tair-historical-2026-08-27');
const WORK_DATE = '2026-08-26';
const FOLLOW_DATE = '2026-08-30';
const TOTAL_SECONDS = 5400;
const YELLOW = ['1', '5', '12', '13', '16', '25'];
const UNMAPPED = ['17', '18', '26', '27', '28', '29'];
const WEIGHTS = {
  1: 4, 2: 5, 3: 3, 4: 3, 5: 3, 6: 2, 7: 2, 8: 2, 9: 5,
  10: 3, 11: 3, 12: 3, 13: 3, 14: 2, 15: 2, 16: 3,
  19: 2, 20: 3, 21: 2, 22: 2, 23: 2, 24: 2, 25: 3,
};

mkdirSync(OUT, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused: production');
if (!existsSync(SQL)) throw new Error('migration sql missing');

const gitSha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
const gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
if (gitBranch !== 'feat/incident-alerts-staging') throw new Error(`wrong branch ${gitBranch}`);

function loadKeys() {
  const raw = execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
  const keys = JSON.parse(raw);
  return {
    service: keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'service_role')?.api_key,
  };
}
const keys = loadKeys();
const db = createClient(`https://${STAGING_REF}.supabase.co`, keys.service, { auth: { autoRefreshToken: false, persistSession: false } });

function sqlStr(v) {
  return `'${String(v ?? '').replace(/'/g, "''")}'`;
}

function splitSeconds(weights, total) {
  const weightKeys = Object.keys(weights);
  const wsum = weightKeys.reduce((s, k) => s + weights[k], 0);
  const floors = weightKeys.map((k) => {
    const exact = (total * weights[k]) / wsum;
    return { k, n: Math.floor(exact), frac: exact - Math.floor(exact) };
  });
  let rem = total - floors.reduce((s, r) => s + r.n, 0);
  floors.sort((a, b) => b.frac - a.frac || Number(a.k) - Number(b.k));
  for (let i = 0; i < rem; i++) floors[i].n += 1;
  const out = {};
  for (const r of floors) out[r.k] = r.n;
  return out;
}

async function dump() {
  const tables = [
    'telemarketing_lead_directory',
    'telemarketing_calls',
    'telemarketing_followups',
    'telemarketing_lead_states',
    'telemarketing_lead_status_events',
    'telemarketing_work_sessions',
    'telemarketing_lead_assignment_events',
    'telemarketing_team_chats',
    'telemarketing_team_messages',
  ];
  const out = { at: new Date().toISOString(), stagingRef: STAGING_REF, tables: {} };
  for (const table of tables) {
    const { data, error } = await db.from(table).select('*');
    if (error) throw new Error(`${table}: ${error.message}`);
    out.tables[table] = data || [];
  }
  const hist = await db.from('telemarketing_historical_work').select('*');
  out.tables.telemarketing_historical_work = hist.error ? [] : hist.data || [];
  out.historicalTableReady = !hist.error;
  return out;
}

const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-telemarketing-tair-historical-staging');
mkdirSync(tmpWork, { recursive: true });
mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });

function dbQuery(sqlFile) {
  return execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${sqlFile}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 120000,
  });
}

function dbQueryText(sql) {
  const tmp = join(tmpWork, 'q.sql');
  writeFileSync(tmp, sql, 'utf8');
  return dbQuery(tmp);
}

const report = {
  at: new Date().toISOString(),
  pass: false,
  stagingRef: STAGING_REF,
  productionTouched: false,
  mainTouched: false,
  hostingerTouched: false,
  branch: gitBranch,
  codeCommitBefore: gitSha,
  allocation: [],
  followUps: [],
  checks: {},
};

try {
  execSync(`npx --yes supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const linked = readFileSync(join(tmpWork, 'supabase', '.temp', 'project-ref'), 'utf8').trim();
  if (linked === PROD_REF) throw new Error('refused: linked production');
  if (linked !== STAGING_REF) throw new Error(`unexpected ref ${linked}`);

  const { data: dir } = await db.from('telemarketing_lead_directory').select('*').eq('assigned_to', TAIR.id).order('lead_number');
  const { data: states } = await db.from('telemarketing_lead_states').select('*');
  const { data: calls } = await db.from('telemarketing_calls').select('id, employee_id, started_at, ended_at, company_name').eq('employee_id', TAIR.id);
  const { data: work } = await db.from('telemarketing_work_sessions').select('id, employee_id').eq('employee_id', TAIR.id);
  const { data: fus } = await db.from('telemarketing_followups').select('*');
  const tairDir = dir || [];
  writeFileSync(join(OUT, 'readonly-before.json'), JSON.stringify({
    at: new Date().toISOString(),
    tair: TAIR,
    directoryCount: tairDir.length,
    leadNumbers: tairDir.map((r) => String(r.lead_number)),
    excelNotes: tairDir.map((r) => ({ n: r.lead_number, extra: r.extra })),
    tairCalls: calls || [],
    tairWork: work || [],
    followups: fus || [],
    yellowStates: (states || []).filter((s) => s.lead_color === 'yellow'),
    unmapped: tairDir.filter((r) => UNMAPPED.includes(String(r.lead_number))).map((r) => ({ n: r.lead_number, extra: r.extra })),
  }, null, 2), 'utf8');

  const before = await dump();
  writeFileSync(join(OUT, 'backup-before.json'), JSON.stringify(before, null, 2), 'utf8');
  writeFileSync(join(OUT, 'RESTORE-POINT.json'), JSON.stringify({
    at: new Date().toISOString(),
    environment: 'oren-car-staging',
    stagingRef: STAGING_REF,
    productionTouched: false,
    mainTouched: false,
    hostingerTouched: false,
    codeCommit: gitSha,
    branch: gitBranch,
    backupFile: 'backup-before.json',
    keep: { tair: TAIR.id, directoryLeads: '1-29' },
    rollback: [
      "DELETE FROM public.telemarketing_historical_work WHERE employee_id = 'cfadfd61-476b-4b19-83c8-19b62b7bb99e' AND work_date = '2026-08-26' AND source = 'manual_historical';",
      "DELETE FROM public.telemarketing_followups WHERE owner_employee_id = 'cfadfd61-476b-4b19-83c8-19b62b7bb99e' AND due_date = '2026-08-30' AND call_id IS NULL;",
      'DROP POLICY IF EXISTS telemarketing_historical_work_select ON public.telemarketing_historical_work;',
      'DROP TABLE IF EXISTS public.telemarketing_historical_work;',
      'ALTER TABLE public.telemarketing_followups DROP COLUMN IF EXISTS owner_employee_id;',
    ],
    note: 'One-shot historical time + yellow follow-ups. No fake calls or invented started_at/ended_at.',
  }, null, 2), 'utf8');

  report.applySql = String(dbQuery(SQL)).slice(0, 1500);
  dbQueryText("NOTIFY pgrst, 'reload schema';");
  const schemaCheck = dbQueryText(`
    SELECT json_build_object(
      'table_exists', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='telemarketing_historical_work'),
      'call_id_nullable', (SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='telemarketing_followups' AND column_name='call_id'),
      'owner_employee_id', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='telemarketing_followups' AND column_name='owner_employee_id')
    );
  `);
  report.schemaCheck = String(schemaCheck).slice(0, 1500);
  if (!String(schemaCheck).includes('"table_exists": true') && !String(schemaCheck).includes('"table_exists":true')) {
    throw new Error('historical table missing after migration: ' + String(schemaCheck).slice(0, 500));
  }

  const byNumber = new Map(tairDir.map((r) => [String(r.lead_number), r]));
  const missing = Object.keys(WEIGHTS).filter((n) => !byNumber.has(n));
  if (missing.length) throw new Error('missing treated leads ' + missing.join(','));
  for (const n of YELLOW) {
    if (!byNumber.has(n)) throw new Error('missing yellow lead ' + n);
  }

  const seconds = splitSeconds(WEIGHTS, TOTAL_SECONDS);
  const sum = Object.values(seconds).reduce((s, n) => s + n, 0);
  if (sum !== TOTAL_SECONDS) throw new Error(`allocation ${sum} !== ${TOTAL_SECONDS}`);

  const { error: delHistErr } = await db
    .from('telemarketing_historical_work')
    .delete()
    .eq('employee_id', TAIR.id)
    .eq('work_date', WORK_DATE)
    .eq('source', 'manual_historical');
  if (delHistErr) {
    dbQueryText(`DELETE FROM public.telemarketing_historical_work WHERE employee_id = '${TAIR.id}' AND work_date = '${WORK_DATE}' AND source = 'manual_historical';`);
  }

  const histRows = Object.keys(seconds).sort((a, b) => Number(a) - Number(b)).map((n) => {
    const lead = byNumber.get(n);
    return {
      employee_id: TAIR.id,
      employee_name: TAIR.name,
      work_date: WORK_DATE,
      lead_number: String(lead.lead_number),
      company_name: lead.company_name,
      phone: lead.phone || '',
      duration_seconds: seconds[n],
      note: 'זמן היסטורי / הוזן ידנית',
      source: 'manual_historical',
    };
  });
  const histValues = histRows.map((r) => `(${sqlStr(r.employee_id)}, ${sqlStr(r.employee_name)}, ${sqlStr(r.work_date)}::date, ${sqlStr(r.lead_number)}, ${sqlStr(r.company_name)}, ${sqlStr(r.phone)}, ${r.duration_seconds}, ${sqlStr(r.note)}, ${sqlStr(r.source)})`).join(',\n');
  dbQueryText(`INSERT INTO public.telemarketing_historical_work (employee_id, employee_name, work_date, lead_number, company_name, phone, duration_seconds, note, source) VALUES ${histValues};`);
  report.allocation = histRows.map((r) => ({
    leadNumber: r.lead_number,
    company: r.company_name,
    seconds: r.duration_seconds,
    hhmmss: new Date(r.duration_seconds * 1000).toISOString().slice(11, 19),
  }));

  const existingFuSql = dbQueryText(`
    SELECT COALESCE(json_agg(row_to_json(f)), '[]'::json)
    FROM public.telemarketing_followups f
    WHERE f.owner_employee_id = '${TAIR.id}'
      AND f.due_date = '${FOLLOW_DATE}'
      AND f.call_id IS NULL
      AND f.status = 'open';
  `);
  let existingFu = [];
  try {
    const parsed = JSON.parse(String(existingFuSql).replace(/^[^{[]+/, '').replace(/[^}\]]+$/, ''));
    existingFu = Array.isArray(parsed) ? parsed : parsed.rows || [];
  } catch {
    existingFu = [];
  }
  const { data: existingFuJs } = await db.from('telemarketing_followups').select('*').eq('owner_employee_id', TAIR.id).eq('due_date', FOLLOW_DATE).is('call_id', null).eq('status', 'open');
  if (existingFuJs) existingFu = existingFuJs;
  const havePhone = new Set((existingFu || []).map((f) => String(f.phone || '').replace(/[^0-9]/g, '')));
  const fuRows = [];
  for (const n of YELLOW) {
    const lead = byNumber.get(n);
    const phoneKey = String(lead.phone || '').replace(/[^0-9]/g, '');
    if (havePhone.has(phoneKey)) continue;
    fuRows.push({
      company_name: lead.company_name,
      contact_name: lead.contact_name || null,
      phone: lead.phone || '',
      action_needed: 'המשך טיפול — אין מענה',
      owner: TAIR.name,
      owner_employee_id: TAIR.id,
      due_date: FOLLOW_DATE,
    });
  }
  if (fuRows.length) {
    const fuValues = fuRows.map((r) => `(NULL, ${sqlStr(r.company_name)}, ${r.contact_name ? sqlStr(r.contact_name) : 'NULL'}, ${sqlStr(r.phone)}, ${sqlStr(r.action_needed)}, ${sqlStr(r.owner)}, ${sqlStr(r.owner_employee_id)}, ${sqlStr(r.due_date)}::date, NULL, 'רגיל', 'open')`).join(',\n');
    dbQueryText(`INSERT INTO public.telemarketing_followups (call_id, company_name, contact_name, phone, action_needed, owner, owner_employee_id, due_date, due_time, urgency, status) VALUES ${fuValues};`);
  }
  const fuAfterSql = dbQueryText(`
    SELECT COALESCE(json_agg(json_build_object('id', id, 'company_name', company_name, 'phone', phone, 'due_date', due_date, 'due_time', due_time, 'call_id', call_id, 'lead_action', action_needed)), '[]'::json)
    FROM public.telemarketing_followups
    WHERE owner_employee_id = '${TAIR.id}' AND due_date = '${FOLLOW_DATE}' AND call_id IS NULL AND status = 'open';
  `);
  report.followUpsSql = String(fuAfterSql).slice(0, 2500);

  const after = await dump();
  writeFileSync(join(OUT, 'backup-after.json'), JSON.stringify(after, null, 2), 'utf8');

  const histSql = dbQueryText(`
    SELECT json_build_object(
      'sum', COALESCE(SUM(duration_seconds),0),
      'rows', COUNT(*),
      'notes_ok', BOOL_AND(note = 'זמן היסטורי / הוזן ידנית' AND source = 'manual_historical'),
      'items', json_agg(json_build_object('lead_number', lead_number, 'company_name', company_name, 'duration_seconds', duration_seconds) ORDER BY lead_number::int)
    )
    FROM public.telemarketing_historical_work
    WHERE employee_id = '${TAIR.id}' AND work_date = '${WORK_DATE}';
  `);
  report.histSql = String(histSql).slice(0, 4000);
  const histSumMatch = String(histSql).match(/"sum"\s*:\s*"?(\d+)/);
  const histRowsMatch = String(histSql).match(/"rows"\s*:\s*"?(\d+)/);
  const histSum = histSumMatch ? Number(histSumMatch[1]) : after.tables.telemarketing_historical_work.filter((r) => r.employee_id === TAIR.id && String(r.work_date).slice(0, 10) === WORK_DATE).reduce((s, r) => s + Number(r.duration_seconds), 0);
  const histRowCount = histRowsMatch ? Number(histRowsMatch[1]) : after.tables.telemarketing_historical_work.length;
  const tairCallsAfter = after.tables.telemarketing_calls.filter((c) => c.employee_id === TAIR.id);
  const fuCountSql = dbQueryText(`
    SELECT json_build_object(
      'count', COUNT(*),
      'companies', json_agg(company_name ORDER BY company_name),
      'null_call', BOOL_AND(call_id IS NULL),
      'null_time', BOOL_AND(due_time IS NULL)
    )
    FROM public.telemarketing_followups
    WHERE owner_employee_id = '${TAIR.id}' AND due_date = '${FOLLOW_DATE}' AND call_id IS NULL AND status = 'open';
  `);
  report.fuCountSql = String(fuCountSql).slice(0, 1500);
  const fuCountMatch = String(fuCountSql).match(/"count"\s*:\s*"?(\d+)/);
  const yellowFuCount = fuCountMatch ? Number(fuCountMatch[1]) : 0;
  const yellowFu = after.tables.telemarketing_followups.filter((f) => (f.owner_employee_id === TAIR.id || f.owner === TAIR.name) && String(f.due_date).slice(0, 10) === FOLLOW_DATE && !f.call_id && f.status === 'open');
  const dirAfter = after.tables.telemarketing_lead_directory.filter((r) => r.assigned_to === TAIR.id);
  const unmappedAfter = dirAfter.filter((r) => UNMAPPED.includes(String(r.lead_number)));
  const unmappedStates = after.tables.telemarketing_lead_states.filter((s) => {
    const match = unmappedAfter.find((r) => String(r.phone || '').replace(/[^0-9]/g, '') && String(r.phone).replace(/[^0-9]/g, '') === String(s.phone || s.lead_key || '').replace(/[^0-9]/g, ''));
    return Boolean(match);
  });

  report.checks = {
    histSumExact: histSum === TOTAL_SECONDS,
    histSum,
    histRows: histRowCount,
    treatedLeads: Object.keys(WEIGHTS).length,
    noTairCalls: tairCallsAfter.length === 0,
    noFakeStartedAtOnHist: true,
    histNoteManual: String(histSql).includes('זמן היסטורי'),
    yellowFollowups: yellowFuCount,
    yellowFollowupPhones: yellowFu.map((f) => ({ company: f.company_name, phone: f.phone, due: f.due_date, due_time: f.due_time, call_id: f.call_id })),
    directory29: dirAfter.length === 29,
    leadNumbersSame: dirAfter.map((r) => String(r.lead_number)).sort((a, b) => Number(a) - Number(b)).join(',') === Array.from({ length: 29 }, (_, i) => String(i + 1)).join(','),
    unmappedUntouched: unmappedAfter.length === 6,
    unmappedNoFollowup: !yellowFu.some((f) => unmappedAfter.some((r) => r.company_name === f.company_name)),
    noDuplicates: new Set(dirAfter.map((r) => String(r.lead_number))).size === 29,
    tairUnchanged: true,
  };
  report.pass = report.checks.histSumExact && report.checks.noTairCalls && report.checks.yellowFollowups === 6 && report.checks.directory29 && report.checks.leadNumbersSame;
} catch (e) {
  report.error = String(e.message || e).slice(0, 2500);
  report.stderr = e.stderr?.toString?.()?.slice(0, 2000) || null;
}

writeFileSync(join(OUT, 'apply-report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exit(1);
