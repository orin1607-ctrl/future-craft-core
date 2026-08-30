import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const ExcelJS = require('exceljs');
const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const XLSX = join(process.env.USERPROFILE || '', 'Downloads', 'מאגר לקוחות דן אנד ברדסטייט (1).xlsx');
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-dnb-leads-2026-08-30');

function phoneKey(v) { return String(v || '').replace(/[^0-9*]/g, ''); }
function cell(v) {
  if (v == null) return '';
  if (typeof v === 'object' && v.text) return String(v.text).trim();
  if (typeof v === 'object' && v.richText) return v.richText.map((p) => p.text || '').join('').trim();
  if (typeof v === 'object' && v.result != null) return String(v.result).trim();
  return String(v).trim();
}
function normCompany(s) {
  return String(s || '').replace(/["'׳״]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

const raw = execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
const keys = JSON.parse(raw);
const service = keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'service_role')?.api_key;
const db = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { autoRefreshToken: false, persistSession: false } });

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(XLSX);
const sheet = wb.worksheets[0];
const headers = [];
sheet.getRow(1).eachCell({ includeEmpty: true }, (c, col) => { headers[col - 1] = cell(c.value); });
const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
const rows = [];
for (let r = 2; r <= sheet.rowCount; r += 1) {
  const row = sheet.getRow(r);
  const get = (h) => cell(row.getCell((idx[h] ?? -1) + 1).value);
  rows.push({ rowIndex: r, company: get('שם עסק'), email: get('מייל'), phone: get('טלפון ראשי') });
}
const dir = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from('telemarketing_lead_directory').select('lead_number,company_name,phone,email').range(from, from + 999);
  if (error) throw error;
  dir.push(...(data || []));
  if (!data || data.length < 1000) break;
}
const byPhone = new Map(dir.map((r) => [phoneKey(r.phone), r]));
const byCo = new Map(dir.map((r) => [normCompany(r.company_name), r]));
const phoneHits = [];
for (const row of rows) {
  const pk = phoneKey(row.phone);
  const hit = pk && byPhone.get(pk);
  if (hit) {
    phoneHits.push({
      file: row.company,
      existing: hit.company_name,
      phone: row.phone,
      sameCompany: normCompany(row.company) === normCompany(hit.company_name),
    });
  }
}
const coHits = [];
for (const row of rows) {
  const hit = byCo.get(normCompany(row.company));
  if (hit) coHits.push({ file: row.company, existing: hit.company_name, lead: hit.lead_number, phoneFile: row.phone, phoneExisting: hit.phone });
}
const out = {
  phoneHits,
  sameCompanyPhoneHits: phoneHits.filter((x) => x.sameCompany).length,
  differentCompanyPhoneHits: phoneHits.filter((x) => !x.sameCompany).length,
  companyNameHits: coHits,
};
writeFileSync(join(OUT, 'dedup-company-vs-phone.json'), JSON.stringify(out, null, 2), 'utf8');
console.log(JSON.stringify(out, null, 2));
