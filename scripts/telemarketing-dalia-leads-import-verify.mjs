/**
 * READ-ONLY Staging verify after Dalia CSV import. Does not mutate data.
 * node scripts/telemarketing-dalia-leads-import-verify.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const TAIR = 'cfadfd61-476b-4b19-83c8-19b62b7bb99e';
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-dalia-leads-import-2026-08-27');
const NUMS = Array.from({ length: 29 }, (_, i) => String(i + 1));
if (STAGING_REF === PROD_REF) throw new Error('refused: production');

function loadKeys() {
  const raw = execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
  const keys = JSON.parse(raw);
  return keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key
    || keys.find((k) => k.name === 'service_role')?.api_key;
}

function fleetNum(v) {
  const m = String(v || '').match(/\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function buckets(sizes) {
  return {
    '5-10': sizes.filter((n) => n != null && n >= 5 && n <= 10).length,
    '11-20': sizes.filter((n) => n != null && n >= 11 && n <= 20).length,
    '21-30': sizes.filter((n) => n != null && n >= 21 && n <= 30).length,
    '31-40': sizes.filter((n) => n != null && n >= 31 && n <= 40).length,
    '5-40': sizes.filter((n) => n != null && n >= 5 && n <= 40).length,
    over40: sizes.filter((n) => n != null && n > 40).length,
    under5: sizes.filter((n) => n != null && n < 5).length,
    unknown: sizes.filter((n) => n == null).length,
  };
}

const db = createClient(`https://${STAGING_REF}.supabase.co`, loadKeys(), { auth: { autoRefreshToken: false, persistSession: false } });
const backup = JSON.parse(readFileSync(join(OUT, 'backup-before.json'), 'utf8'));
const preview = JSON.parse(readFileSync(join(OUT, 'import-preview.json'), 'utf8'));

const { data: dir, error: dirErr } = await db.from('telemarketing_lead_directory')
  .select('id, lead_number, company_name, phone, email, assigned_to, fleet_size, claimed_by, claimed_at, archived_at');
if (dirErr) throw dirErr;
const { data: hist } = await db.from('telemarketing_historical_work').select('duration_seconds').eq('employee_id', TAIR).eq('work_date', '2026-08-26');
const { data: fus } = await db.from('telemarketing_followups').select('id, company_name').eq('owner_employee_id', TAIR).eq('due_date', '2026-08-30').is('call_id', null).eq('status', 'open');
const { data: calls } = await db.from('telemarketing_calls').select('id').eq('employee_id', TAIR);
const { data: states } = await db.from('telemarketing_lead_states').select('id');

const rows = dir || [];
const byNum = new Map(rows.map((r) => [String(r.lead_number), r]));
const beforeByNum = new Map((backup.directory || []).map((r) => [String(r.lead_number), r]));
const keep29 = NUMS.every((n) => {
  const a = byNum.get(n);
  const b = beforeByNum.get(n);
  return a && b
    && a.id === b.id
    && a.company_name === b.company_name
    && a.phone === b.phone
    && a.email === b.email
    && a.assigned_to === b.assigned_to
    && String(a.fleet_size || '') === String(b.fleet_size || '');
});
const histSum = (hist || []).reduce((s, r) => s + Number(r.duration_seconds || 0), 0);
const sizes = rows.map((r) => fleetNum(r.fleet_size));
const newRows = rows.filter((r) => !NUMS.includes(String(r.lead_number)));

const byRow = new Map();
for (const i of preview.issues || []) {
  const cur = byRow.get(i.rowIndex) || new Set();
  cur.add(i.kind);
  byRow.set(i.rowIndex, cur);
}
const blocked = { existing: 0, inFileOnly: 0, both: 0, invalid: 0 };
for (const kinds of byRow.values()) {
  const ex = [...kinds].some((k) => k.startsWith('existing_'));
  const dup = [...kinds].some((k) => k.startsWith('duplicate_in_file'));
  if (kinds.has('invalid')) blocked.invalid += 1;
  else if (ex && dup) blocked.both += 1;
  else if (ex) blocked.existing += 1;
  else if (dup) blocked.inFileOnly += 1;
}

const sampleNew = newRows.slice(0, 5).map((r) => ({ n: r.lead_number, company: r.company_name, fleet: r.fleet_size, assigned: r.assigned_to }));
const assignedNew = newRows.filter((r) => r.assigned_to).length;

const report = {
  at: new Date().toISOString(),
  stagingRef: STAGING_REF,
  productionTouched: false,
  afterCount: rows.length,
  keep29,
  tairAssigned29: rows.filter((r) => r.assigned_to === TAIR && NUMS.includes(String(r.lead_number))).length,
  histSum,
  sundayFu: (fus || []).length,
  tairCallCount: (calls || []).length,
  statesCount: (states || []).length,
  newLeads: newRows.length,
  newLeadsAssigned: assignedNew,
  bucketsAll: buckets(sizes),
  bucketsNew: buckets(newRows.map((r) => fleetNum(r.fleet_size))),
  bucketsKeep29: buckets(NUMS.map((n) => fleetNum(byNum.get(n)?.fleet_size))),
  fileRows: preview.fileRows,
  imported: preview.willImport,
  blockedUnique: preview.blocked,
  blocked,
  numbersMinMax: {
    min: Math.min(...rows.map((r) => Number(r.lead_number)).filter((n) => Number.isFinite(n))),
    max: Math.max(...rows.map((r) => Number(r.lead_number)).filter((n) => Number.isFinite(n))),
  },
  sampleNew,
};

writeFileSync(join(OUT, 'verify-after.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!keep29 || report.tairAssigned29 !== 29 || histSum !== 5400 || report.sundayFu !== 6 || rows.length !== 314) process.exit(1);
