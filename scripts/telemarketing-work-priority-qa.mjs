/**
 * Staging QA for admin work-priority. Admin login only. Does not login as Tair.
 * Marks at most one lead, then removes it. Does not claim, assign, or unassign.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const TAIR = 'cfadfd61-476b-4b19-83c8-19b62b7bb99e';
const ADMIN = 'orin1607@gmail.com';
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-work-priority-2026-08-31');
const EXPECTED = execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8' }).trim();
mkdirSync(OUT, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused: production');

function loadKeys() {
  const raw = execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
  const keys = JSON.parse(raw);
  return {
    service: keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key
      || keys.find((k) => k.name === 'service_role')?.api_key,
    anon: keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key
      || keys.find((k) => k.name === 'anon')?.api_key,
  };
}
function digits(v) { return String(v || '').replace(/[^0-9*]/g, ''); }
function isMobile(v) { return /^05\d{7,9}$/.test(digits(v)); }
async function allDir(db) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('telemarketing_lead_directory')
      .select('id, lead_number, company_name, region, industry, fleet_size, phone, extra, assigned_to, claimed_by, lead_wave, work_priority_at')
      .range(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}
async function snapshot(db) {
  const dir = await allDir(db);
  const { count: followups } = await db.from('telemarketing_followups').select('id', { count: 'exact', head: true });
  const { count: completed } = await db.from('telemarketing_calls').select('id', { count: 'exact', head: true }).eq('status', 'completed');
  const { data: openCalls } = await db.from('telemarketing_calls').select('id').eq('employee_id', TAIR).eq('status', 'in_progress');
  const { data: openWork } = await db.from('telemarketing_work_sessions').select('id').eq('employee_id', TAIR).eq('status', 'in_progress');
  const hist = await db.from('telemarketing_historical_work').select('duration_seconds').eq('employee_id', TAIR);
  const neu = dir.filter((r) => r.lead_wave === 'new');
  return {
    directory: dir.length,
    tairNew: dir.filter((r) => r.assigned_to === TAIR && r.lead_wave === 'new').length,
    tairOld: dir.filter((r) => r.assigned_to === TAIR && r.lead_wave === 'old').length,
    tairClaims: dir.filter((r) => r.claimed_by === TAIR).length,
    priority: dir.filter((r) => r.work_priority_at).length,
    followups,
    completed,
    openCalls: (openCalls || []).length,
    openWork: (openWork || []).length,
    histSeconds: (hist.data || []).reduce((s, r) => s + Number(r.duration_seconds || 0), 0),
    rishonNew: neu.filter((r) => r.region === 'ראשון לציון').length,
    rishonMobile: neu.filter((r) => r.region === 'ראשון לציון' && [r.phone, r.extra?.phone1, r.extra?.phone2, r.extra?.phone3, r.extra?.phone4].some(isMobile)).length,
    unknownFleetNew: neu.filter((r) => !/\d/.test(String(r.fleet_size || ''))).length,
  };
}

const keys = loadKeys();
const adminDb = createClient(STAGING_URL, keys.service, { auth: { autoRefreshToken: false, persistSession: false } });
const report = { at: new Date().toISOString(), pass: false, checks: [], productionTouched: false, expected: EXPECTED };
function check(id, ok, detail) {
  report.checks.push({ id, ok: Boolean(ok), detail: detail ?? null });
  console.log(ok ? 'PASS' : 'FAIL', id, detail ? JSON.stringify(detail).slice(0, 500) : '');
}

try {
  const stamp = Date.now();
  const html = await fetch(`${BASE}/?t=${stamp}`, { headers: { 'Cache-Control': 'no-cache' } }).then((r) => r.text());
  const bundle = html.match(/assets\/index-[^"'\\\s>]+\.js/)?.[0];
  const deployTxt = await fetch(`${BASE}/STAGING-DEPLOY.txt?t=${stamp}`).then((r) => r.text());
  report.deployed_ref = deployTxt.trim();
  report.liveBundle = bundle || null;
  check('deploy-sha', deployTxt.includes(EXPECTED), deployTxt.trim());
  const js = bundle ? await fetch(`${BASE}/${bundle}`).then((r) => r.text()) : '';
  check('bundle-priority-ui', js.includes('עדיפות לעבודה') && js.includes('lead-work-priority'));
  check('bundle-add', js.includes('הוסף לעדיפות לעבודה'));
  check('bundle-remove', js.includes('הסר מעדיפות לעבודה'));
  check('bundle-no-km', !js.includes('עד 2 ק"מ') && !js.includes('עד 5 ק״מ'));
  check('bundle-now-status', js.includes('מצב עכשיו'));

  const before = await snapshot(adminDb);
  report.before = before;
  check('before-tair-new', before.tairNew === 2030, before);
  check('before-tair-old', before.tairOld === 0, before);
  check('before-priority-zero', before.priority === 0, before.priority);
  check('before-no-open-call', before.openCalls === 0);
  check('before-no-open-work', before.openWork === 0);
  check('before-hist', before.histSeconds === 5400, before.histSeconds);

  const sample = (await allDir(adminDb))
    .filter((r) => r.assigned_to === TAIR && r.lead_wave === 'new' && !r.claimed_by && r.lead_number)
    .sort((a, b) => Number(b.lead_number) - Number(a.lead_number))[0];
  check('sample-lead', Boolean(sample), sample ? { n: sample.lead_number, city: sample.region } : null);
  if (!sample) throw new Error('no isolated new Tair sample');

  const anon = createClient(STAGING_URL, keys.anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: linkData, error: linkErr } = await adminDb.auth.admin.generateLink({ type: 'magiclink', email: ADMIN });
  if (linkErr) throw linkErr;
  const { data: auth, error: verifyErr } = await anon.auth.verifyOtp({
    email: ADMIN,
    token: linkData.properties.email_otp,
    type: 'email',
  });
  if (verifyErr || !auth.session) throw verifyErr || new Error('admin session');

  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem', viewport: { width: 1440, height: 1100 } });
  await ctx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `sb-${STAGING_REF}-auth-token`,
    value: {
      access_token: auth.session.access_token,
      refresh_token: auth.session.refresh_token,
      expires_at: auth.session.expires_at,
      expires_in: auth.session.expires_in,
      token_type: auth.session.token_type,
      user: auth.session.user,
    },
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  await page.goto(`${BASE}/telemarketing/admin`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.getByTestId('tele-agent-now-status').waitFor({ timeout: 40000 });
  const nowText = await page.getByTestId('tele-agent-now-status').innerText();
  check('now-status-visible', nowText.includes('מצב עכשיו'), nowText.slice(0, 160));
  const tairCard = await page.getByTestId(`tele-agent-now-${TAIR}`).innerText();
  check('tair-not-interrupted', tairCard.includes('🟢 פנויה') || tairCard.includes('🟡') || tairCard.includes('📞') || tairCard.includes('📝'), tairCard);

  await page.getByTestId('lead-directory-toggle').click();
  await page.getByTestId('lead-directory-list').waitFor({ timeout: 20000 });
  await page.getByTestId('lead-wave-new').click();
  await page.getByTestId('lead-city-ראשון לציון').click();
  const rishonCount = await page.getByTestId('lead-directory-count').innerText();
  check('city-rishon', rishonCount.includes(String(before.rishonNew)), { rishonCount, expected: before.rishonNew });
  await page.getByTestId('lead-contact-mobile').click();
  const mobileCount = await page.getByTestId('lead-directory-count').innerText();
  check('contact-mobile-combo', mobileCount.includes(String(before.rishonMobile)), { mobileCount, expected: before.rishonMobile });
  const selectLabel = await page.getByTestId('lead-select-all').innerText();
  check('select-all-filtered-only', selectLabel.includes(`בתוצאות המסוננות (${before.rishonMobile})`) && selectLabel.includes('לא את כל המאגר (2344)'), selectLabel);
  await page.getByTestId('lead-select-all').click();
  await page.getByTestId('lead-priority-add').click();
  const preview = await page.getByTestId('lead-priority-preview-count').innerText();
  check('preview-count', preview.includes(String(before.rishonMobile)), preview);
  await page.getByRole('button', { name: 'ביטול' }).click();
  await page.getByTestId('lead-clear-selection').click();

  await page.getByTestId('lead-city-all').click();
  await page.getByTestId('lead-contact-all').click();
  await page.getByTestId('lead-fleet-preset-unknown').click();
  const unknownCount = await page.getByTestId('lead-directory-count').innerText();
  check('fleet-unknown-new', unknownCount.includes(String(before.unknownFleetNew)), { unknownCount, expected: before.unknownFleetNew });
  await page.getByTestId('lead-fleet-preset-all').click();

  await page.getByTestId('lead-directory-search').fill(sample.lead_number);
  await page.getByTestId(`lead-row-checkbox-${sample.lead_number}`).check();
  await page.getByTestId('lead-priority-add').click();
  const onePreview = await page.getByTestId('lead-priority-preview-count').innerText();
  check('preview-one', onePreview.includes('1'), onePreview);
  await page.getByTestId('lead-priority-confirm').click();
  await page.getByTestId('lead-priority-result').waitFor({ timeout: 20000 });
  const { data: marked } = await adminDb.from('telemarketing_lead_directory').select('assigned_to, lead_wave, work_priority_at, claimed_by').eq('id', sample.id).maybeSingle();
  check('add-priority', Boolean(marked?.work_priority_at), marked);
  check('assigned-unchanged-after-add', marked?.assigned_to === TAIR && marked?.lead_wave === 'new', marked);

  await page.getByTestId('lead-work-priority-count').filter({ hasText: '1 לידים' }).waitFor({ timeout: 15000 });
  await page.getByTestId('lead-priority-view-priority').click();
  const priorityCount = await page.getByTestId('lead-work-priority-count').innerText();
  check('priority-count-after-add', priorityCount.includes('1 לידים'), priorityCount);
  const clearBtn = page.getByTestId('lead-clear-selection');
  if (await clearBtn.isEnabled()) await clearBtn.click();
  await page.getByTestId(`lead-row-checkbox-${sample.lead_number}`).check();
  await page.getByTestId('lead-priority-remove').click();
  await page.getByTestId('lead-priority-confirm').click();
  await page.getByTestId('lead-priority-result').waitFor({ timeout: 20000 });
  const { data: unmarked } = await adminDb.from('telemarketing_lead_directory').select('assigned_to, work_priority_at, claimed_by').eq('id', sample.id).maybeSingle();
  check('remove-priority', unmarked?.work_priority_at == null, unmarked);
  check('assigned-unchanged-after-remove', unmarked?.assigned_to === TAIR, unmarked);

  await page.screenshot({ path: join(OUT, 'admin-work-priority.png'), fullPage: false });
  await browser.close();

  const after = await snapshot(adminDb);
  report.after = after;
  check('after-tair-new', after.tairNew === 2030, after);
  check('after-tair-old', after.tairOld === 0);
  check('after-priority-zero', after.priority === 0, after.priority);
  check('after-claims-unchanged', after.tairClaims === before.tairClaims);
  check('after-followups', after.followups === before.followups);
  check('after-calls', after.completed === before.completed);
  check('after-hist', after.histSeconds === 5400);
  check('after-still-no-open-call', after.openCalls === 0);
  report.pass = report.checks.every((c) => c.ok);
} catch (e) {
  check('e2e-exception', false, e instanceof Error ? e.message : String(e));
  report.pass = false;
}
writeFileSync(join(OUT, 'qa-deploy.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ pass: report.pass, failed: report.checks.filter((c) => !c.ok), deployed_ref: report.deployed_ref, liveBundle: report.liveBundle }, null, 2));
if (!report.pass) process.exit(1);
