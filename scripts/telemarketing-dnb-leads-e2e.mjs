/**
 * Staging QA: old/new lead waves, Tair unassigned, new D&B leads unassigned.
 * Read-only on history. EXPECTED_SHA=<sha> node scripts/telemarketing-dnb-leads-e2e.mjs
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
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-dnb-leads-2026-08-30');
const EXPECTED_SHA = (process.env.EXPECTED_SHA || '').trim();
const TAIR = { email: 'tairmizrahi311@gmail.com', id: 'cfadfd61-476b-4b19-83c8-19b62b7bb99e' };
const ADMIN = { email: 'orin1607@gmail.com' };
mkdirSync(OUT, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused: production');

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

async function sessionFor(email) {
  const client = createClient(STAGING_URL, keys.anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: linkData, error: linkErr } = await adminDb.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr) throw linkErr;
  const { data: auth, error: verifyErr } = await client.auth.verifyOtp({ email, token: linkData.properties.email_otp, type: 'email' });
  if (verifyErr || !auth.session) throw verifyErr || new Error(`verifyOtp ${email}`);
  return auth.session;
}
function storagePayload(session) {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type,
    user: session.user,
  };
}

const report = { at: new Date().toISOString(), pass: false, checks: [], productionTouched: false, stagingRef: STAGING_REF };
function check(id, ok, detail) {
  report.checks.push({ id, ok: Boolean(ok), detail: detail ?? null });
  console.log(ok ? 'PASS' : 'FAIL', id, detail ? JSON.stringify(detail).slice(0, 300) : '');
}

try {
  const stamp = Date.now();
  const html = await fetch(`${BASE}/?t=${stamp}`, { headers: { 'Cache-Control': 'no-cache' } }).then((r) => r.text());
  const bundle = html.match(/assets\/index-[^"'\\\s>]+\.js/)?.[0] || html.match(/assets\/index-[^"'>\s]+\.js/)?.[0];
  report.liveBundle = bundle || null;
  const deployTxt = await fetch(`${BASE}/STAGING-DEPLOY.txt?t=${stamp}`).then((r) => r.text()).catch(() => '');
  report.deployed_ref = deployTxt.trim();
  check('deploy-staging', /feat\/incident-alerts-staging/.test(deployTxt), deployTxt.trim());
  if (EXPECTED_SHA) check('deploy-expected-sha', deployTxt.includes(EXPECTED_SHA.slice(0, 7)), deployTxt.trim());
  if (bundle) {
    const js = await fetch(`${BASE}/${bundle}`).then((r) => r.text());
    check('bundle-wave-filters', js.includes('lead-wave-new') && js.includes('lead-wave-old') && js.includes('לידים חדשים'));
  }

  const dir = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await adminDb.from('telemarketing_lead_directory').select('id, lead_number, assigned_to, lead_wave, fleet_size').range(from, from + 999);
    if (error) throw error;
    dir.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  const { count: followups } = await adminDb.from('telemarketing_followups').select('id', { count: 'exact', head: true });
  const { count: states } = await adminDb.from('telemarketing_lead_states').select('id', { count: 'exact', head: true });
  const { count: completed } = await adminDb.from('telemarketing_calls').select('id', { count: 'exact', head: true }).eq('status', 'completed');
  const hist = await adminDb.from('telemarketing_historical_work').select('duration_seconds').eq('employee_id', TAIR.id);
  const histSeconds = (hist.data || []).reduce((s, r) => s + Number(r.duration_seconds || 0), 0);
  const old = dir.filter((r) => r.lead_wave === 'old');
  const neu = dir.filter((r) => r.lead_wave === 'new');
  check('old-kept', old.length === 314, old.length);
  check('new-imported', neu.length === 2030, neu.length);
  check('new-unassigned', neu.every((r) => !r.assigned_to), neu.filter((r) => r.assigned_to).length);
  check('tair-not-assigned', dir.filter((r) => r.assigned_to === TAIR.id).length === 0);
  check('new-no-fleet', neu.filter((r) => !String(r.fleet_size || '').trim()).length === 2030);
  check('followups-kept', followups === 24, followups);
  check('states-kept', states === 28, states);
  check('calls-kept', completed === 38, completed);
  check('hist-5400', histSeconds === 5400, histSeconds);

  const adminSession = await sessionFor(ADMIN.email);
  const tairSession = await sessionFor(TAIR.email);
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const adminCtx = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem', viewport: { width: 1440, height: 900 } });
  await adminCtx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `sb-${STAGING_REF}-auth-token`,
    value: storagePayload(adminSession),
  });
  const adminPage = await adminCtx.newPage();
  adminPage.setDefaultTimeout(60000);
  await adminPage.goto(`${BASE}/telemarketing/admin`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await adminPage.waitForTimeout(5000);
  if (await adminPage.getByTestId('lead-directory-toggle').count()) {
    const expanded = await adminPage.getByTestId('lead-directory-toggle').getAttribute('aria-expanded');
    if (expanded !== 'true') await adminPage.getByTestId('lead-directory-toggle').click();
  }
  await adminPage.getByTestId('lead-wave-filter').waitFor({ timeout: 20000 });
  await adminPage.getByTestId('lead-wave-new').click();
  await adminPage.waitForTimeout(800);
  const newCountText = await adminPage.getByTestId('lead-directory-count').innerText();
  check('admin-new-filter', newCountText.includes('2030'), newCountText);
  await adminPage.getByTestId('lead-fleet-preset-unknown').click();
  await adminPage.waitForTimeout(500);
  const unknownText = await adminPage.getByTestId('lead-directory-count').innerText();
  check('admin-unknown-fleet', unknownText.includes('2030'), unknownText);
  await adminPage.getByTestId('lead-select-all').click();
  await adminPage.waitForTimeout(300);
  const assignLabel = await adminPage.getByTestId('lead-assign-open').innerText();
  check('select-all-filtered', assignLabel.includes('2030'), assignLabel);
  await adminPage.screenshot({ path: join(OUT, 'admin-new-leads.png'), fullPage: true });

  await adminPage.getByTestId('lead-fleet-preset-all').click();
  await adminPage.getByTestId('lead-wave-old').click();
  await adminPage.waitForTimeout(600);
  const oldText = await adminPage.getByTestId('lead-directory-count').innerText();
  check('admin-old-filter', oldText.includes('314'), oldText);
  await adminPage.screenshot({ path: join(OUT, 'admin-old-leads.png') });

  const tairCtx = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem', viewport: { width: 1440, height: 900 } });
  await tairCtx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `sb-${STAGING_REF}-auth-token`,
    value: storagePayload(tairSession),
  });
  await tairCtx.addInitScript(({ key, value }) => sessionStorage.setItem(key, value), {
    key: `tele_entry_mode_v1:${TAIR.id}`,
    value: 'work',
  });
  const tairPage = await tairCtx.newPage();
  tairPage.setDefaultTimeout(60000);
  await tairPage.goto(`${BASE}/telemarketing`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await tairPage.waitForTimeout(4000);
  if (await tairPage.getByTestId('tele-entry-purpose').count()) {
    await tairPage.getByTestId('tele-entry-work').click();
    await tairPage.waitForTimeout(2000);
  }
  await tairPage.getByTestId('telemarketing-agent-home').waitFor({ timeout: 20000 });
  const tairDirCount = await tairPage.getByTestId('lead-directory-count').count()
    ? await tairPage.getByTestId('lead-directory-count').innerText()
    : '';
  check('tair-no-old-queue', !tairDirCount.includes('119') && !tairDirCount.includes('314'), tairDirCount);
  check('tair-followup-still-there', (await tairPage.getByTestId('tele-continue-treatment').count()) > 0);
  await tairPage.screenshot({ path: join(OUT, 'tair-home.png') });

  await browser.close();
  report.pass = report.checks.every((c) => c.ok);
} catch (e) {
  check('e2e-exception', false, e instanceof Error ? e.message : String(e));
  report.pass = false;
}
writeFileSync(join(OUT, 'qa-report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ pass: report.pass, failed: report.checks.filter((c) => !c.ok), deployed_ref: report.deployed_ref, liveBundle: report.liveBundle }, null, 2));
if (!report.pass) process.exit(1);
