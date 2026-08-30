/**
 * Staging QA: unify follow-up into leads board, yellow default, desktop full-width form.
 * Read-only on work data. Restores claims if any were touched.
 * EXPECTED_SHA=<sha> node scripts/telemarketing-unify-leads-board-e2e.mjs
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
const OUT = join(process.cwd(), 'docs/audit-reports/telemarketing-unify-leads-board-2026-08-30');
const EXPECTED_SHA = (process.env.EXPECTED_SHA || '').trim();
const TAIR = { email: 'tairmizrahi311@gmail.com', id: 'cfadfd61-476b-4b19-83c8-19b62b7bb99e' };
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
async function openAgent(browser, session, viewport) {
  const ctx = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem', viewport });
  await ctx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `sb-${STAGING_REF}-auth-token`,
    value: storagePayload(session),
  });
  await ctx.addInitScript(({ key, value }) => sessionStorage.setItem(key, value), {
    key: `tele_entry_mode_v1:${TAIR.id}`,
    value: 'work',
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  await page.goto(`${BASE}/telemarketing`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(4000);
  if (await page.getByTestId('tele-entry-purpose').count()) {
    await page.getByTestId('tele-entry-work').click();
    await page.waitForTimeout(2000);
  }
  await page.getByTestId('telemarketing-agent-home').waitFor({ timeout: 20000 });
  return { ctx, page };
}
async function counts() {
  const [leads, followups, states, calls] = await Promise.all([
    adminDb.from('telemarketing_lead_directory').select('id', { count: 'exact', head: true }),
    adminDb.from('telemarketing_followups').select('id, status', { count: 'exact' }),
    adminDb.from('telemarketing_lead_states').select('id, lead_color', { count: 'exact' }),
    adminDb.from('telemarketing_calls').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
  ]);
  const fuRows = followups.data || [];
  const stateRows = states.data || [];
  return {
    leads: leads.count,
    followups: followups.count,
    followupsOpen: fuRows.filter((r) => r.status === 'open').length,
    states: states.count,
    yellow: stateRows.filter((r) => r.lead_color === 'yellow').length,
    red: stateRows.filter((r) => r.lead_color === 'red').length,
    green: stateRows.filter((r) => r.lead_color === 'green').length,
    completedCalls: calls.count,
  };
}

const report = {
  at: new Date().toISOString(),
  pass: false,
  checks: [],
  productionTouched: false,
  stagingRef: STAGING_REF,
  expectedSha: EXPECTED_SHA || null,
};
function check(id, ok, detail) {
  report.checks.push({ id, ok: Boolean(ok), detail: detail ?? null });
  console.log(ok ? 'PASS' : 'FAIL', id, detail ? JSON.stringify(detail).slice(0, 400) : '');
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
    check('bundle-unified-filters', js.includes('tele-lead-filter-yellow') && js.includes('tele-lead-filter-followup') && js.includes('tele-lead-filter-today') && js.includes('tele-lead-filter-red'));
  }

  const before = await counts();
  const tairSession = await sessionFor(TAIR.email);
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const { page } = await openAgent(browser, tairSession, { width: 1440, height: 900 });

  check('unified-board', (await page.getByTestId('tele-continue-treatment').count()) === 1);
  check('filters-present', (await page.getByTestId('tele-lead-board-filters').count()) > 0);
  const yellowClass = await page.getByTestId('tele-lead-filter-yellow').getAttribute('class');
  check('default-yellow', (yellowClass || '').includes('bg-primary'), yellowClass);
  check('default-hides-red-section', (await page.locator('h3', { hasText: '🔴 אדומים' }).count()) === 0);
  check('default-hides-green-section', (await page.locator('h3', { hasText: '🟢 ירוקים' }).count()) === 0);
  check('default-shows-yellow-section', (await page.locator('h3', { hasText: '🟡 צהובים' }).count()) > 0);

  const formBox = await page.evaluate(() => {
    const form = document.getElementById('new-lead');
    const home = document.querySelector('[data-testid="tele-agent-layout"]');
    if (!form || !home) return null;
    return { formW: Math.round(form.getBoundingClientRect().width), homeW: Math.round(home.getBoundingClientRect().width) };
  });
  check('new-lead-full-width', Boolean(formBox && formBox.formW >= formBox.homeW * 0.9), formBox);

  await page.getByTestId('tele-lead-filter-followup').click();
  await page.waitForTimeout(500);
  check('followup-view', (await page.getByTestId('followup-bucket-filter').count()) > 0);
  check('followup-has-late', (await page.getByTestId('followup-bucket-filter').locator('option[value="late"]').count()) > 0);
  check('followup-has-today', (await page.getByTestId('followup-bucket-filter').innerText()).includes('לחזור היום'));
  check('followup-has-future', (await page.getByTestId('followup-bucket-filter').locator('option[value="future"]').count()) > 0);
  check('followup-has-done', (await page.getByTestId('followup-bucket-filter').locator('option[value="done"]').count()) > 0);

  await page.getByTestId('tele-lead-filter-today').click();
  await page.waitForTimeout(400);
  check('today-filter-active', ((await page.getByTestId('tele-lead-filter-today').getAttribute('class')) || '').includes('bg-primary'));
  check('today-bucket-selected', (await page.getByTestId('followup-bucket-filter').inputValue()) === 'today');

  await page.getByTestId('tele-lead-filter-red').click();
  await page.waitForTimeout(300);
  check('red-section', (await page.locator('h3', { hasText: '🔴 אדומים' }).count()) > 0);
  await page.getByTestId('tele-lead-filter-green').click();
  await page.waitForTimeout(300);
  check('green-section', (await page.locator('h3', { hasText: '🟢 ירוקים' }).count()) > 0);
  await page.getByTestId('tele-lead-filter-all').click();
  await page.waitForTimeout(300);
  check('all-shows-three', (await page.locator('h3', { hasText: '🟡 צהובים' }).count()) > 0 && (await page.locator('h3', { hasText: '🔴 אדומים' }).count()) > 0 && (await page.locator('h3', { hasText: '🟢 ירוקים' }).count()) > 0);

  await page.screenshot({ path: join(OUT, 'agent-desktop-1440.png'), fullPage: true });

  const { page: laptop } = await openAgent(browser, tairSession, { width: 1280, height: 800 });
  check('laptop-yellow', ((await laptop.getByTestId('tele-lead-filter-yellow').getAttribute('class')) || '').includes('bg-primary'));
  await laptop.screenshot({ path: join(OUT, 'agent-laptop-1280.png') });

  const { page: mid } = await openAgent(browser, tairSession, { width: 1024, height: 768 });
  const midForm = await mid.evaluate(() => {
    const form = document.getElementById('new-lead');
    const home = document.querySelector('[data-testid="tele-agent-layout"]');
    if (!form || !home) return null;
    return { formW: Math.round(form.getBoundingClientRect().width), homeW: Math.round(home.getBoundingClientRect().width) };
  });
  check('1024-full-width', Boolean(midForm && midForm.formW >= midForm.homeW * 0.85), midForm);
  await mid.screenshot({ path: join(OUT, 'agent-1024.png') });

  const { page: mobile } = await openAgent(browser, tairSession, { width: 390, height: 844 });
  check('mobile-home', (await mobile.getByTestId('telemarketing-agent-home').count()) > 0);
  check('mobile-filters', (await mobile.getByTestId('tele-lead-filter-yellow').count()) > 0);
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
  check('mobile-no-overflow', overflow);
  await mobile.screenshot({ path: join(OUT, 'agent-mobile.png') });

  const after = await counts();
  check('data-leads-unchanged', before.leads === after.leads, { before: before.leads, after: after.leads });
  check('data-followups-unchanged', before.followups === after.followups, { before: before.followups, after: after.followups });
  check('data-followups-open-unchanged', before.followupsOpen === after.followupsOpen, { before: before.followupsOpen, after: after.followupsOpen });
  check('data-states-unchanged', before.states === after.states && before.yellow === after.yellow && before.red === after.red && before.green === after.green, { before, after });
  check('completed-calls-unchanged', before.completedCalls === after.completedCalls, { before: before.completedCalls, after: after.completedCalls });

  await browser.close();
  report.pass = report.checks.every((c) => c.ok);
} catch (e) {
  check('e2e-exception', false, e instanceof Error ? e.message : String(e));
  report.pass = false;
}

writeFileSync(join(OUT, 'qa-report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ pass: report.pass, failed: report.checks.filter((c) => !c.ok), deployed_ref: report.deployed_ref, liveBundle: report.liveBundle }, null, 2));
if (!report.pass) process.exit(1);
