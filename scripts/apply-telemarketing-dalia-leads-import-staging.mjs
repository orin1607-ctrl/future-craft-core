/**
 * Staging ONLY: import Dalia CSV into lead directory using existing commit RPC.
 * Does not assign leads. Does not touch numbers 1-29.
 * node scripts/apply-telemarketing-dalia-leads-import-staging.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const ADMIN_EMAIL = 'orin1607@gmail.com';
const TAIR = 'cfadfd61-476b-4b19-83c8-19b62b7bb99e';
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-dalia-leads-import-2026-08-27');
const CSV_CANDIDATES = [
  join(OUT, 'source-leads-dalia-1.csv'),
  join(process.env.USERPROFILE || '', 'Downloads', 'לידים דליה 1 - גיליון1.csv'),
];
const NUMS = new Set(Array.from({ length: 29 }, (_, i) => String(i + 1)));

mkdirSync(OUT, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused: production');
const gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
if (gitBranch !== 'feat/incident-alerts-staging') throw new Error(`wrong branch ${gitBranch}`);

const csvPath = CSV_CANDIDATES.find((p) => existsSync(p));
if (!csvPath) throw new Error('CSV not found');

function loadKeys() {
  const raw = execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
  const keys = JSON.parse(raw);
  return {
    service: keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'service_role')?.api_key,
    anon: keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key,
  };
}
const keys = loadKeys();
const adminDb = createClient(STAGING_URL, keys.service, { auth: { autoRefreshToken: false, persistSession: false } });

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const rows = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { cells.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    cells.push(cur.trim());
    rows.push(cells);
  }
  return { headers: rows[0], rows: rows.slice(1) };
}

function phoneKey(v) { return (v || '').replace(/[^0-9*]/g, ''); }
function emailKey(v) { return (v || '').trim().toLowerCase(); }
function fleetNum(v) {
  const m = String(v || '').match(/\d+/);
  return m ? Number(m[0]) : null;
}

const csvText = readFileSync(csvPath, 'utf8');
const parsed = parseCsv(csvText);
const headerMap = {};
parsed.headers.forEach((h, i) => {
  const n = h.replace(/\s+/g, ' ').trim();
  if (n === 'שם החברה') headerMap.company_name = i;
  if (n === 'עיר/אזור' || n === 'אזור') headerMap.region = i;
  if (n === 'טלפון') headerMap.phone = i;
  if (n.includes('מייל')) headerMap.email = i;
  if (n.includes('רכבים')) headerMap.fleet_size = i;
});
if (headerMap.company_name == null || headerMap.phone == null) throw new Error(`headers not mapped: ${parsed.headers.join('|')}`);

const mapped = parsed.rows.map((cells, idx) => ({
  rowIndex: idx + 2,
  lead_number: '',
  company_name: cells[headerMap.company_name] || '',
  industry: '',
  region: cells[headerMap.region] || '',
  fleet_size: cells[headerMap.fleet_size] || '',
  phone: cells[headerMap.phone] || '',
  email: cells[headerMap.email] || '',
  extra: {},
}));

const { data: existing, error: exErr } = await adminDb.from('telemarketing_lead_directory').select('id, lead_number, company_name, phone, email, assigned_to, fleet_size');
if (exErr) throw exErr;
const existingRows = existing || [];
if (existingRows.length !== 29) throw new Error(`expected 29 leads before import, got ${existingRows.length}`);
const existingNums = new Set(existingRows.map((r) => String(r.lead_number)));
if (![...NUMS].every((n) => existingNums.has(n))) throw new Error('1-29 missing before import');

const phones = new Set(existingRows.map((r) => phoneKey(r.phone)).filter(Boolean));
const emails = new Set(existingRows.map((r) => emailKey(r.email)).filter(Boolean));
const seenPhones = new Map();
const seenEmails = new Map();
const issues = [];
for (const row of mapped) {
  if (!row.company_name && !row.phone) issues.push({ rowIndex: row.rowIndex, kind: 'invalid', message: 'חסרים שם חברה וטלפון', company: row.company_name });
  const pk = phoneKey(row.phone);
  if (pk) {
    if (seenPhones.has(pk)) issues.push({ rowIndex: row.rowIndex, kind: 'duplicate_in_file_phone', message: `טלפון כפול בקלט (שורה ${seenPhones.get(pk)})`, company: row.company_name, phone: row.phone });
    else seenPhones.set(pk, row.rowIndex);
    if (phones.has(pk)) issues.push({ rowIndex: row.rowIndex, kind: 'existing_phone', message: 'טלפון כבר קיים במאגר', company: row.company_name, phone: row.phone });
  }
  const ek = emailKey(row.email);
  if (ek) {
    if (seenEmails.has(ek)) issues.push({ rowIndex: row.rowIndex, kind: 'duplicate_in_file_email', message: `מייל כפול בקלט (שורה ${seenEmails.get(ek)})`, company: row.company_name, email: row.email });
    else seenEmails.set(ek, row.rowIndex);
    if (emails.has(ek)) issues.push({ rowIndex: row.rowIndex, kind: 'existing_email', message: 'מייל כבר קיים במאגר', company: row.company_name, email: row.email });
  }
}
const blocked = new Set(issues.map((i) => i.rowIndex));
const ready = mapped.filter((r) => !blocked.has(r.rowIndex));
const maxNo = Math.max(0, ...existingRows.map((r) => Number(r.lead_number)).filter((n) => Number.isFinite(n)));
ready.forEach((row, i) => { row.lead_number = String(maxNo + 1 + i); });

const preview = {
  csvPath,
  fileRows: mapped.length,
  willImport: ready.length,
  blocked: blocked.size,
  invalid: issues.filter((i) => i.kind === 'invalid').length,
  duplicates: issues.filter((i) => i.kind !== 'invalid').length,
  issues,
  nextLeadNumbers: ready.length ? { from: ready[0].lead_number, to: ready[ready.length - 1].lead_number } : null,
};
writeFileSync(join(OUT, 'import-preview.json'), JSON.stringify(preview, null, 2));

const sessionClient = createClient(STAGING_URL, keys.anon, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: linkData, error: linkErr } = await adminDb.auth.admin.generateLink({ type: 'magiclink', email: ADMIN_EMAIL });
if (linkErr) throw linkErr;
const { data: auth, error: verifyErr } = await sessionClient.auth.verifyOtp({ email: ADMIN_EMAIL, token: linkData.properties.email_otp, type: 'email' });
if (verifyErr || !auth.session) throw verifyErr || new Error('verifyOtp');
await sessionClient.auth.setSession(auth.session);

const sha = createHash('sha256').update(csvText).digest('hex');
const { data: rpcData, error: rpcErr } = await sessionClient.rpc('telemarketing_commit_lead_import', {
  p_source: 'csv',
  p_file_name: 'לידים דליה 1 - גיליון1.csv',
  p_mapping: {
    0: 'company_name',
    1: 'region',
    2: 'phone',
    3: 'email',
    4: 'fleet_size',
  },
  p_raw_sha: sha,
  p_raw_preview: csvText.slice(0, 4000),
  p_rows: ready.map((row) => ({
    lead_number: row.lead_number,
    company_name: row.company_name,
    industry: row.industry,
    region: row.region,
    fleet_size: row.fleet_size,
    phone: row.phone,
    email: row.email,
    extra: {},
  })),
});
if (rpcErr) throw rpcErr;

const { data: after } = await adminDb.from('telemarketing_lead_directory').select('lead_number, company_name, phone, email, assigned_to, fleet_size');
const afterRows = after || [];
const still29 = [...NUMS].every((n) => afterRows.some((r) => String(r.lead_number) === n));
const tairStill = afterRows.filter((r) => r.assigned_to === TAIR && NUMS.has(String(r.lead_number))).length;
const sizes = afterRows.map((r) => fleetNum(r.fleet_size));
const result = {
  at: new Date().toISOString(),
  rpc: rpcData,
  preview,
  afterCount: afterRows.length,
  keep29: still29,
  tairAssigned29: tairStill,
  buckets: {
    '5-10': sizes.filter((n) => n != null && n >= 5 && n <= 10).length,
    '5-40': sizes.filter((n) => n != null && n >= 5 && n <= 40).length,
    over40: sizes.filter((n) => n != null && n > 40).length,
    unknown: sizes.filter((n) => n == null).length,
  },
};
writeFileSync(join(OUT, 'apply-result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (!still29 || tairStill !== 29) process.exit(1);
