/**
 * Staging ONLY: apply lead_wave/unassign RPC, unassign Tair from old leads, import D&B file as new unassigned leads.
 * Does not delete leads/history/follow-ups. Does not auto-assign.
 * node scripts/apply-telemarketing-dnb-leads-staging.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const ExcelJS = require('exceljs');

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const ADMIN_EMAIL = 'orin1607@gmail.com';
const TAIR = 'cfadfd61-476b-4b19-83c8-19b62b7bb99e';
const ROOT = process.cwd();
const SQL = join(ROOT, 'supabase/migrations/20260830233000_telemarketing_lead_wave_unassign_staging.sql');
const OUT = join(ROOT, 'docs/audit-reports/telemarketing-dnb-leads-2026-08-30');
const XLSX = join(process.env.USERPROFILE || '', 'Downloads', 'מאגר לקוחות דן אנד ברדסטייט (1).xlsx');

mkdirSync(OUT, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused: production');
const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
if (branch !== 'feat/incident-alerts-staging') throw new Error(`wrong branch ${branch}`);
if (!existsSync(SQL)) throw new Error('migration sql missing');
if (!existsSync(XLSX)) throw new Error('xlsx missing');

function loadKeys() {
  const raw = execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
  const keys = JSON.parse(raw);
  return {
    service: keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'service_role')?.api_key,
    anon: keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key,
  };
}
function phoneKey(v) { return String(v || '').replace(/[^0-9*]/g, ''); }
function companyKey(v) {
  return String(v || '').replace(/["'׳״]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}
function cell(v) {
  if (v == null) return '';
  if (typeof v === 'object' && v.text) return String(v.text).trim();
  if (typeof v === 'object' && v.richText) return v.richText.map((p) => p.text || '').join('').trim();
  if (typeof v === 'object' && v.result != null) return String(v.result).trim();
  return String(v).trim();
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

const tmpWork = join(process.env.TEMP || '/tmp', 'fcc-telemarketing-dnb-leads');
mkdirSync(tmpWork, { recursive: true });
mkdirSync(join(tmpWork, 'supabase', 'migrations'), { recursive: true });
function dbQuery(sqlFile) {
  return execSync(`npx --yes supabase db query --linked --workdir "${tmpWork}" -f "${sqlFile}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 180000,
  });
}

const keys = loadKeys();
const adminDb = createClient(STAGING_URL, keys.service, { auth: { autoRefreshToken: false, persistSession: false } });
const report = { at: new Date().toISOString(), stagingRef: STAGING_REF, productionTouched: false };

execSync(`npx --yes supabase link --project-ref ${STAGING_REF} --workdir "${tmpWork}" --yes`, { encoding: 'utf8', stdio: 'pipe' });
const linked = readFileSync(join(tmpWork, 'supabase', '.temp', 'project-ref'), 'utf8').trim();
if (linked === PROD_REF) throw new Error('refused: linked production');
if (linked !== STAGING_REF) throw new Error(`unexpected ref ${linked}`);

const beforeDir = await allRows(adminDb, 'telemarketing_lead_directory', 'id, lead_number, company_name, phone, email, assigned_to, claimed_by, fleet_size');
const beforeFollowups = await allRows(adminDb, 'telemarketing_followups', 'id, status, owner_employee_id');
const beforeCalls = await allRows(adminDb, 'telemarketing_calls', 'id, status, employee_id, duration_seconds');
const beforeHist = await allRows(adminDb, 'telemarketing_historical_work', 'id, employee_id, duration_seconds');
const beforeStates = await allRows(adminDb, 'telemarketing_lead_states', 'id, lead_color');
const tairAssignedIds = beforeDir.filter((r) => r.assigned_to === TAIR).map((r) => r.id);
report.before = {
  directory: beforeDir.length,
  tairAssigned: tairAssignedIds.length,
  tairClaimed: beforeDir.filter((r) => r.claimed_by === TAIR).length,
  followups: beforeFollowups.length,
  followupsOpen: beforeFollowups.filter((r) => r.status === 'open').length,
  tairFollowupsOpen: beforeFollowups.filter((r) => r.status === 'open' && r.owner_employee_id === TAIR).length,
  completedCalls: beforeCalls.filter((r) => r.status === 'completed').length,
  states: beforeStates.length,
  tairHistSeconds: beforeHist.filter((r) => r.employee_id === TAIR).reduce((s, r) => s + Number(r.duration_seconds || 0), 0),
};

report.applySql = String(dbQuery(SQL)).slice(0, 1500);

const sessionClient = createClient(STAGING_URL, keys.anon, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: linkData, error: linkErr } = await adminDb.auth.admin.generateLink({ type: 'magiclink', email: ADMIN_EMAIL });
if (linkErr) throw linkErr;
const { data: auth, error: verifyErr } = await sessionClient.auth.verifyOtp({ email: ADMIN_EMAIL, token: linkData.properties.email_otp, type: 'email' });
if (verifyErr || !auth.session) throw verifyErr || new Error('verifyOtp');
await sessionClient.auth.setSession(auth.session);

if (tairAssignedIds.length) {
  const { data: unassignData, error: unassignErr } = await sessionClient.rpc('telemarketing_unassign_leads', { p_lead_ids: tairAssignedIds });
  if (unassignErr) throw unassignErr;
  report.unassign = unassignData;
} else {
  report.unassign = { unassignedCount: 0, skippedCount: 0, skipped: [], alreadyDone: true };
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(XLSX);
const sheet = wb.worksheets[0];
const headers = [];
sheet.getRow(1).eachCell({ includeEmpty: true }, (c, col) => { headers[col - 1] = cell(c.value); });
const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
function get(row, name) { return cell(row.getCell((idx[name] ?? -1) + 1).value); }

const existingCompanies = new Set(beforeDir.map((r) => companyKey(r.company_name)).filter(Boolean));
const mapped = [];
const skippedExisting = [];
for (let r = 2; r <= sheet.rowCount; r += 1) {
  const row = sheet.getRow(r);
  const company = get(row, 'שם עסק');
  const phone = get(row, 'טלפון ראשי') || get(row, 'טלפון1');
  if (!company && !phone) continue;
  if (companyKey(company) && existingCompanies.has(companyKey(company))) {
    skippedExisting.push({ rowIndex: r, company });
    continue;
  }
  const extra = {};
  const p1 = get(row, 'טלפון1');
  const p2 = get(row, 'טלפון2');
  const p3 = get(row, 'טלפון3');
  const p4 = get(row, 'טלפון4');
  if (p1 && phoneKey(p1) !== phoneKey(phone)) extra.phone1 = p1;
  if (p2 && phoneKey(p2) !== phoneKey(phone)) extra.phone2 = p2;
  if (p3) extra.phone3 = p3;
  if (p4) extra.phone4 = p4;
  const hp = get(row, 'ח.פ.'); if (hp) extra.hp = hp;
  const site = get(row, 'אתר'); if (site) extra.website = site;
  const dun = get(row, 'דנס'); if (dun) extra.dun = dun;
  const address = get(row, 'כתובת'); if (address) extra.address = address;
  const zip = get(row, 'מיקוד'); if (zip) extra.zip = zip;
  const notes = get(row, 'הערות'); if (notes) extra.notes = notes;
  const group = get(row, 'שם הקבוצה'); if (group) extra.group = group;
  const c1 = get(row, 'שם מנהל1'); if (c1) extra.contact1_name = c1;
  const r1 = get(row, 'תפקיד1'); if (r1) extra.contact1_role = r1;
  const e1 = get(row, 'אימייל1'); if (e1) extra.contact1_email = e1;
  mapped.push({
    rowIndex: r,
    lead_number: '',
    company_name: company,
    industry: get(row, 'תחום פעילות עיקרי'),
    region: get(row, 'עיר'),
    fleet_size: '',
    phone,
    email: get(row, 'מייל'),
    extra,
  });
}

const maxNo = Math.max(0, ...beforeDir.map((r) => Number(r.lead_number)).filter((n) => Number.isFinite(n) && n > 0));
mapped.forEach((row, i) => { row.lead_number = String(maxNo + 1 + i); });
report.file = {
  rowsInFile: sheet.rowCount - 1,
  mapped: mapped.length,
  skippedExistingCompany: skippedExisting,
  nextLeadNumbers: mapped.length ? { from: mapped[0].lead_number, to: mapped[mapped.length - 1].lead_number } : null,
  noFleet: mapped.filter((r) => !r.fleet_size).length,
};
if (mapped.length > 3000) throw new Error('too many rows');

const CHUNK = 80;
report.importChunks = [];
let importedTotal = 0;
let skippedTotal = 0;
let duplicateTotal = 0;
let lastBatchId = '';
for (let i = 0; i < mapped.length; i += CHUNK) {
  const chunk = mapped.slice(i, i + CHUNK);
  const sha = createHash('sha256').update(`dnb:${i}:${chunk.length}:${chunk[0]?.company_name}`).digest('hex');
  const { data: rpcData, error: rpcErr } = await sessionClient.rpc('telemarketing_commit_lead_import', {
    p_source: 'xlsx',
    p_file_name: i === 0 ? 'מאגר לקוחות דן אנד ברדסטייט (1).xlsx' : `מאגר לקוחות דן אנד ברדסטייט (1).xlsx#${i}`,
    p_mapping: { 0: 'company_name', 5: 'phone', 3: 'email', 11: 'region', 14: 'industry' },
    p_raw_sha: sha,
    p_raw_preview: `D&B chunk ${i / CHUNK + 1} rows ${chunk.length}`,
    p_rows: chunk,
  });
  if (rpcErr) throw rpcErr;
  report.importChunks.push(rpcData);
  importedTotal += Number(rpcData.importedCount ?? rpcData.importedcount ?? 0);
  skippedTotal += Number(rpcData.skippedCount ?? rpcData.skippedcount ?? 0);
  duplicateTotal += Number(rpcData.duplicateCount ?? rpcData.duplicatecount ?? 0);
  lastBatchId = String(rpcData.batchId ?? rpcData.batchid ?? lastBatchId);
  console.log(JSON.stringify({ chunk: i / CHUNK + 1, from: i, imported: rpcData.importedCount ?? rpcData.importedcount, skipped: rpcData.skippedCount ?? rpcData.skippedcount }));
}
report.import = {
  batchId: lastBatchId,
  importedCount: importedTotal,
  skippedCount: skippedTotal,
  duplicateCount: duplicateTotal,
  invalidCount: 0,
  rowCount: mapped.length,
  chunks: report.importChunks.length,
};

const afterDir = await allRows(adminDb, 'telemarketing_lead_directory', 'id, lead_number, assigned_to, claimed_by, lead_wave, fleet_size, extra');
const afterFollowups = await allRows(adminDb, 'telemarketing_followups', 'id, status, owner_employee_id');
const afterCalls = await allRows(adminDb, 'telemarketing_calls', 'id, status');
const afterHist = await allRows(adminDb, 'telemarketing_historical_work', 'id, employee_id, duration_seconds');
const afterStates = await allRows(adminDb, 'telemarketing_lead_states', 'id, lead_color');
const newRows = afterDir.filter((r) => r.lead_wave === 'new');
report.after = {
  directory: afterDir.length,
  old: afterDir.filter((r) => r.lead_wave === 'old').length,
  new: newRows.length,
  newUnassigned: newRows.filter((r) => !r.assigned_to).length,
  tairAssigned: afterDir.filter((r) => r.assigned_to === TAIR).length,
  tairClaimed: afterDir.filter((r) => r.claimed_by === TAIR).length,
  followups: afterFollowups.length,
  followupsOpen: afterFollowups.filter((r) => r.status === 'open').length,
  tairFollowupsOpen: afterFollowups.filter((r) => r.status === 'open' && r.owner_employee_id === TAIR).length,
  completedCalls: afterCalls.filter((r) => r.status === 'completed').length,
  states: afterStates.length,
  tairHistSeconds: afterHist.filter((r) => r.employee_id === TAIR).reduce((s, r) => s + Number(r.duration_seconds || 0), 0),
  newWithoutFleet: newRows.filter((r) => !String(r.fleet_size || '').trim()).length,
};
report.guards = {
  oldLeadsNotDeleted: report.after.old === report.before.directory,
  historySecondsSame: report.after.tairHistSeconds === report.before.tairHistSeconds,
  followupsSame: report.after.followups === report.before.followups,
  callsSame: report.after.completedCalls === report.before.completedCalls,
  statesSame: report.after.states === report.before.states,
  tairUnassigned: report.after.tairAssigned === 0,
  newNotAutoAssigned: report.after.newUnassigned === report.after.new,
};
writeFileSync(join(OUT, 'apply-report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ before: report.before, unassign: report.unassign, import: report.import, after: report.after, guards: report.guards }, null, 2));
if (!Object.values(report.guards).every(Boolean)) process.exit(1);
