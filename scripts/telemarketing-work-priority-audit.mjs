/**
 * READ-ONLY audit: new-lead fields + Tair live activity. No mutations.
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const TAIR = 'cfadfd61-476b-4b19-83c8-19b62b7bb99e';
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-work-priority-2026-08-31');
mkdirSync(OUT, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused: production');

const raw = execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
const keys = JSON.parse(raw);
const service = keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key
  || keys.find((k) => k.name === 'service_role')?.api_key;
const db = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { autoRefreshToken: false, persistSession: false } });

function digits(v) { return String(v || '').replace(/[^0-9*]/g, ''); }
function isMobile(v) { return /^05\d{7,9}$/.test(digits(v)); }
function isLandline(v) {
  const d = digits(v);
  return /^0[23489]\d{6,8}$/.test(d) || /^07\d{7,9}$/.test(d);
}
function bump(map, key) { map[key] = (map[key] || 0) + 1; }

const dir = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from('telemarketing_lead_directory')
    .select('id, lead_number, company_name, industry, region, fleet_size, phone, email, extra, assigned_to, claimed_by, claimed_at, lead_wave, archived_at')
    .range(from, from + 999);
  if (error) throw error;
  dir.push(...(data || []));
  if (!data || data.length < 1000) break;
}

const neu = dir.filter((r) => r.lead_wave === 'new');
const old = dir.filter((r) => r.lead_wave === 'old');
const extraKeys = {};
const extraNonEmpty = {};
const regions = {};
const industries = {};
const fleetKnown = neu.filter((r) => /\d/.test(String(r.fleet_size || '')));
let mobile = 0, landline = 0, both = 0, email = 0, noPhone = 0, extraPhone = 0;
for (const r of neu) {
  bump(regions, String(r.region || '').trim() || '(empty)');
  bump(industries, String(r.industry || '').trim() || '(empty)');
  const extra = r.extra && typeof r.extra === 'object' ? r.extra : {};
  for (const [k, v] of Object.entries(extra)) {
    bump(extraKeys, k);
    if (String(v || '').trim()) bump(extraNonEmpty, k);
  }
  const phones = [r.phone, extra.phone1, extra.phone2, extra.phone3, extra.phone4].filter((p) => digits(p).length >= 8);
  if (!phones.length) noPhone += 1;
  const hasM = phones.some(isMobile);
  const hasL = phones.some(isLandline) || (!hasM && phones.length > 0);
  if (hasM) mobile += 1;
  if (hasL) landline += 1;
  if (hasM && hasL) both += 1;
  if (String(r.email || '').includes('@')) email += 1;
  if ([extra.phone1, extra.phone2, extra.phone3, extra.phone4].some((p) => digits(p).length >= 8)) extraPhone += 1;
}

const { data: openCalls } = await db.from('telemarketing_calls').select('id, company_name, started_at, ended_at, status').eq('employee_id', TAIR).eq('status', 'in_progress');
const { data: openWork } = await db.from('telemarketing_work_sessions').select('id, company_name, started_at, ended_at, status').eq('employee_id', TAIR).eq('status', 'in_progress');
const tairAssigned = dir.filter((r) => r.assigned_to === TAIR);
const claimed = dir.filter((r) => r.claimed_by === TAIR);

const report = {
  at: new Date().toISOString(),
  stagingRef: STAGING_REF,
  mutated: false,
  live: {
    openCalls: openCalls || [],
    openWork: openWork || [],
    claimed: claimed.map((r) => ({ n: r.lead_number, c: r.company_name })),
    tairBusy: (openCalls || []).length > 0 || (openWork || []).length > 0 || claimed.length > 0,
  },
  assignments: {
    directory: dir.length,
    new: neu.length,
    old: old.length,
    tairTotal: tairAssigned.length,
    tairNew: tairAssigned.filter((r) => r.lead_wave === 'new').length,
    tairOld: tairAssigned.filter((r) => r.lead_wave === 'old').length,
  },
  fields: {
    extraKeys,
    extraNonEmpty,
    topRegions: Object.entries(regions).sort((a, b) => b[1] - a[1]).slice(0, 40),
    regionCount: Object.keys(regions).length,
    topIndustries: Object.entries(industries).sort((a, b) => b[1] - a[1]).slice(0, 30),
    industryEmpty: industries['(empty)'] || 0,
    fleetKnown: fleetKnown.length,
    fleetUnknown: neu.length - fleetKnown.length,
    hasEmail: email,
    hasMobile: mobile,
    hasLandline: landline,
    hasBothPhones: both,
    noPhone,
    hasExtraPhone: extraPhone,
  },
};
writeFileSync(join(OUT, 'RESTORE-POINT.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({
  live: report.live,
  assignments: report.assignments,
  fields: {
    extraKeys: report.fields.extraKeys,
    extraNonEmpty: report.fields.extraNonEmpty,
    regionCount: report.fields.regionCount,
    topRegions: report.fields.topRegions.slice(0, 15),
    topIndustries: report.fields.topIndustries.slice(0, 12),
    industryEmpty: report.fields.industryEmpty,
    fleetKnown: report.fields.fleetKnown,
    fleetUnknown: report.fields.fleetUnknown,
    hasEmail: report.fields.hasEmail,
    hasMobile: report.fields.hasMobile,
    hasLandline: report.fields.hasLandline,
    hasBothPhones: report.fields.hasBothPhones,
    noPhone: report.fields.noPhone,
    hasExtraPhone: report.fields.hasExtraPhone,
  },
}, null, 2));
