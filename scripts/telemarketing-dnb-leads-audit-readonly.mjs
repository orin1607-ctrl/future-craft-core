/**
 * READ-ONLY: audit Tair assignments + Dan & Bradstreet xlsx vs existing directory.
 * Staging only. Does not write.
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const ExcelJS = require('exceljs');

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const TAIR = 'cfadfd61-476b-4b19-83c8-19b62b7bb99e';
const XLSX = join(process.env.USERPROFILE || '', 'Downloads', 'מאגר לקוחות דן אנד ברדסטייט (1).xlsx');
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-dnb-leads-2026-08-30');
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
  };
}
function phoneKey(v) { return String(v || '').replace(/[^0-9*]/g, ''); }
function emailKey(v) { return String(v || '').trim().toLowerCase(); }
function cell(v) {
  if (v == null) return '';
  if (typeof v === 'object' && v.text) return String(v.text).trim();
  if (typeof v === 'object' && v.richText) return v.richText.map((p) => p.text || '').join('').trim();
  if (typeof v === 'object' && v.result != null) return String(v.result).trim();
  return String(v).trim();
}

async function allRows(db, table, columns) {
  const page = 1000;
  const out = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await db.from(table).select(columns).range(from, from + page - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < page) break;
  }
  return out;
}

const keys = loadKeys();
const db = createClient(STAGING_URL, keys.service, { auth: { autoRefreshToken: false, persistSession: false } });

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(XLSX);
const sheet = workbook.worksheets[0];
const headers = [];
sheet.getRow(1).eachCell({ includeEmpty: true }, (c, col) => { headers[col - 1] = cell(c.value); });
const fileRows = [];
for (let r = 2; r <= sheet.rowCount; r += 1) {
  const row = sheet.getRow(r);
  const rec = {};
  let empty = true;
  headers.forEach((h, i) => {
    const v = cell(row.getCell(i + 1).value);
    rec[h || `col${i}`] = v;
    if (v) empty = false;
  });
  if (!empty) fileRows.push({ rowIndex: r, ...rec });
}

const headerNorm = headers.map((h) => String(h || '').replace(/\s+/g, ' ').trim());
const directory = await allRows(db, 'telemarketing_lead_directory', '*');
const followups = await allRows(db, 'telemarketing_followups', 'id, status, owner, owner_employee_id, phone, company_name, due_date, call_id');
const calls = await allRows(db, 'telemarketing_calls', 'id, employee_id, status, duration_seconds, report_duration_seconds, company_name');
const hist = await allRows(db, 'telemarketing_historical_work', 'id, employee_id, duration_seconds, work_date');
const states = await allRows(db, 'telemarketing_lead_states', 'id, lead_color, lead_status, phone, company_name');
const batches = await allRows(db, 'telemarketing_lead_import_batches', 'id, source, file_name, imported_count, row_count, created_at');

const tairAssigned = directory.filter((r) => r.assigned_to === TAIR);
const tairClaimed = directory.filter((r) => r.claimed_by === TAIR);
const tairFollowups = followups.filter((r) => r.owner_employee_id === TAIR);
const tairFollowupsOpen = tairFollowups.filter((r) => r.status === 'open');
const tairCalls = calls.filter((r) => r.employee_id === TAIR);
const tairHist = hist.filter((r) => r.employee_id === TAIR);
const histSeconds = tairHist.reduce((s, r) => s + Number(r.duration_seconds || 0), 0);

function pickCol(names) {
  const i = headerNorm.findIndex((h) => names.some((n) => h === n || h.toLowerCase() === n.toLowerCase() || h.includes(n)));
  return i >= 0 ? headers[i] : null;
}
const colCompany = pickCol(['שם החברה', 'חברה', 'שם חברה', 'company']);
const colCity = pickCol(['עיר', 'אזור', 'עיר/אזור']);
const colPhone = headerNorm.find((h) => h === 'טלפון' || h.toLowerCase() === 'phone') ? headers[headerNorm.findIndex((h) => h === 'טלפון' || h.toLowerCase() === 'phone')] : null;
const colMobile = headerNorm.find((h) => ['פלאפון', 'נייד', 'סלולר', 'mobile'].some((n) => h === n || h.includes(n))) ? headers[headerNorm.findIndex((h) => ['פלאפון', 'נייד', 'סלולר', 'mobile'].some((n) => h === n || h.includes(n)))] : null;
const colEmail = pickCol(['מייל', 'אימייל', 'דוא']);
const colFleet = pickCol(['רכבים', 'צי']);
const colIndustry = pickCol(['תחום']);

const existingPhones = new Set(directory.map((r) => phoneKey(r.phone)).filter(Boolean));
const existingEmails = new Set(directory.map((r) => emailKey(r.email)).filter(Boolean));
const existingNums = new Set(directory.map((r) => String(r.lead_number || '')).filter(Boolean));

const seenPhones = new Map();
const seenEmails = new Map();
const issues = [];
let bothPhones = 0;
let onlyMobile = 0;
let onlyPhone = 0;
let noFleet = 0;
let noIdentity = 0;

for (const row of fileRows) {
  const company = colCompany ? row[colCompany] : '';
  const phone = colPhone ? row[colPhone] : '';
  const mobile = colMobile ? row[colMobile] : '';
  const email = colEmail ? row[colEmail] : '';
  const fleet = colFleet ? row[colFleet] : '';
  const primary = phone || mobile;
  if (phone && mobile && phoneKey(phone) !== phoneKey(mobile)) bothPhones += 1;
  if (!phone && mobile) onlyMobile += 1;
  if (phone && !mobile) onlyPhone += 1;
  if (!String(fleet || '').match(/\d+/)) noFleet += 1;
  if (!company && !primary) {
    noIdentity += 1;
    issues.push({ rowIndex: row.rowIndex, kind: 'invalid', company, reason: 'חסרים שם חברה וטלפון' });
  }
  const pk = phoneKey(primary);
  if (pk) {
    if (seenPhones.has(pk)) issues.push({ rowIndex: row.rowIndex, kind: 'duplicate_in_file_phone', company, phone: primary, other: seenPhones.get(pk) });
    else seenPhones.set(pk, row.rowIndex);
    if (existingPhones.has(pk)) issues.push({ rowIndex: row.rowIndex, kind: 'existing_phone', company, phone: primary });
  }
  const ek = emailKey(email);
  if (ek) {
    if (seenEmails.has(ek)) issues.push({ rowIndex: row.rowIndex, kind: 'duplicate_in_file_email', company, email, other: seenEmails.get(ek) });
    else seenEmails.set(ek, row.rowIndex);
    if (existingEmails.has(ek)) issues.push({ rowIndex: row.rowIndex, kind: 'existing_email', company, email });
  }
}
const blocked = new Set(issues.map((i) => i.rowIndex));
const byKind = {};
for (const i of issues) byKind[i.kind] = (byKind[i.kind] || 0) + 1;

const restore = {
  at: new Date().toISOString(),
  environment: 'oren-car-staging',
  stagingRef: STAGING_REF,
  productionTouched: false,
  branch,
  codeCommit: commit,
  counts: {
    directory: directory.length,
    tairAssigned: tairAssigned.length,
    tairClaimed: tairClaimed.length,
    unassigned: directory.filter((r) => !r.assigned_to).length,
    otherAssigned: directory.filter((r) => r.assigned_to && r.assigned_to !== TAIR).length,
    followups: followups.length,
    followupsOpen: followups.filter((r) => r.status === 'open').length,
    tairFollowups: tairFollowups.length,
    tairFollowupsOpen: tairFollowupsOpen.length,
    calls: calls.length,
    completedCalls: calls.filter((r) => r.status === 'completed').length,
    tairCalls: tairCalls.length,
    states: states.length,
    histRows: hist.length,
    tairHistSeconds: histSeconds,
  },
};
writeFileSync(join(OUT, 'RESTORE-POINT.json'), JSON.stringify(restore, null, 2), 'utf8');
writeFileSync(join(OUT, 'directory-before.json'), JSON.stringify(directory, null, 2), 'utf8');
writeFileSync(join(OUT, 'followups-before.json'), JSON.stringify(followups, null, 2), 'utf8');
writeFileSync(join(OUT, 'states-before.json'), JSON.stringify(states, null, 2), 'utf8');
writeFileSync(join(OUT, 'hist-before.json'), JSON.stringify(tairHist, null, 2), 'utf8');

const filePreview = {
  xlsx: XLSX,
  sheet: sheet.name,
  headers,
  headerNorm,
  mappedColumns: { colCompany, colCity, colPhone, colMobile, colEmail, colFleet, colIndustry },
  fileRows: fileRows.length,
  bothPhones,
  onlyMobile,
  onlyPhone,
  noFleet,
  noIdentity,
  issuesByKind: byKind,
  blockedRows: blocked.size,
  wouldImportIfCurrentDedup: fileRows.length - blocked.size,
  sampleIssues: issues.slice(0, 40),
  sampleRows: fileRows.slice(0, 5),
};
writeFileSync(join(OUT, 'xlsx-preview.json'), JSON.stringify(filePreview, null, 2), 'utf8');
writeFileSync(join(OUT, 'xlsx-issues.json'), JSON.stringify(issues, null, 2), 'utf8');

const summary = {
  ...restore.counts,
  batches: batches.map((b) => ({ id: b.id, file: b.file_name, imported: b.imported_count, rows: b.row_count })),
  existingLeadNumbers: {
    min: Math.min(...directory.map((r) => Number(r.lead_number)).filter((n) => Number.isFinite(n))),
    max: Math.max(...directory.map((r) => Number(r.lead_number)).filter((n) => Number.isFinite(n))),
    count: existingNums.size,
  },
  followUpRisk: {
    unassignTouchesAssignedToOnly: true,
    followupsUseOwnerEmployeeIdNotAssignedTo: true,
    claimNextUsesAssignedTo: true,
    tairWouldKeepOpenFollowupsOnBoard: tairFollowupsOpen.length,
  },
  file: filePreview,
};
writeFileSync(join(OUT, 'audit-summary.json'), JSON.stringify(summary, null, 2), 'utf8');
console.log(JSON.stringify({
  directory: directory.length,
  tairAssigned: tairAssigned.length,
  tairClaimed: tairClaimed.length,
  tairFollowupsOpen: tairFollowupsOpen.length,
  tairHistSeconds: histSeconds,
  completedCalls: restore.counts.completedCalls,
  fileRows: fileRows.length,
  headers: headerNorm,
  mappedColumns: filePreview.mappedColumns,
  blockedRows: blocked.size,
  wouldImport: fileRows.length - blocked.size,
  issuesByKind: byKind,
  bothPhones,
  onlyMobile,
  noFleet,
}, null, 2));
