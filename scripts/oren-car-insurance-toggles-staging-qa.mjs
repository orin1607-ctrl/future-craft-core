/**
 * Oren Car — insurance toggles + accidents fix QA (Staging only)
 * node scripts/oren-car-insurance-toggles-staging-qa.mjs
 */
import { chromium, devices } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const EMAIL = 'k.auto@beeri.co.il';
const COMPANY = 'קיבוץ בארי';
const TEST_VEHICLE_ID = '3378a2db-6492-44d8-82e9-577444c49794';
const OUT = join(ROOT, 'docs', 'audit-reports', 'oren-car-insurance-toggles-staging', 'post-deploy-qa');
mkdirSync(join(OUT, 'screenshots'), { recursive: true });

function getKeys() {
  const raw = execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
  const keys = JSON.parse(raw);
  return {
    service: keys.find((k) => k.name === 'service_role')?.api_key,
    anon: keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key,
  };
}

const { service, anon } = getKeys();
const url = `https://${STAGING_REF}.supabase.co`;
const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });

const report = {
  at: new Date().toISOString(),
  base: BASE,
  deployCommit: 'ceece69',
  bundleHint: 'index-DyQKhrL9.js',
  db: {},
  tasks: {},
  regression: { consoleErrors: [], network400: [], accidentsOk: false },
  screenshots: [],
  overall: 'pending',
};

async function injectSession(context) {
  const anonClient = createClient(url, anon);
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL });
  if (linkErr) throw linkErr;
  const otp = linkData.properties?.email_otp;
  const { data: auth, error: verifyErr } = await anonClient.auth.verifyOtp({ email: EMAIL, token: otp, type: 'email' });
  if (verifyErr || !auth.session) throw verifyErr || new Error('verifyOtp failed');
  const projectRef = new URL(url).hostname.split('.')[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    {
      key: storageKey,
      value: {
        access_token: auth.session.access_token,
        refresh_token: auth.session.refresh_token,
        expires_at: auth.session.expires_at,
        expires_in: auth.session.expires_in,
        token_type: auth.session.token_type,
        user: auth.session.user,
      },
    },
  );
}

async function shot(page, name) {
  const p = join(OUT, 'screenshots', name);
  await page.screenshot({ path: p, fullPage: true });
  report.screenshots.push(name);
}

async function runViewport(browser, label, viewport) {
  const context = await browser.newContext({ ...viewport, locale: 'he-IL' });
  await injectSession(context);
  const page = await context.newPage();
  const net400 = [];
  page.on('response', (res) => {
    const u = res.url();
    if (res.status() === 400 && u.includes('accidents')) net400.push({ label, url: u });
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') report.regression.consoleErrors.push({ label, text: msg.text() });
  });

  await page.goto(`${BASE}/vehicle-tracking`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(2500);
  report.regression.accidentsOk = net400.length === 0;
  report.regression.network400.push(...net400);
  await shot(page, `${label}-vehicle-tracking.png`);

  await page.goto(`${BASE}/vehicles`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1500);

  const hubUrl = `${BASE}/vehicles?vehicleId=${TEST_VEHICLE_ID}&view=hub&hubSection=manage`;
  await page.goto(hubUrl, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(2500);
  const bodyText = await page.locator('body').innerText();
  report.tasks[`${label}_both_toggles_visible`] =
    bodyText.includes('הפעל התראות ביטוח') && bodyText.includes('הצג התראות ביטוח באדום');
  const switches = page.locator('button[role="switch"]');
  const states = await switches.evaluateAll((els) => els.map((el) => el.getAttribute('data-state')));
  report.tasks[`${label}_toggle_states`] = states;
  await shot(page, `${label}-vehicle-hub-toggles.png`);

  await context.close();
}

async function main() {
  const { count: insOn } = await admin
    .from('vehicles')
    .select('id', { count: 'exact', head: true })
    .eq('company_name', COMPANY)
    .eq('insurance_alerts_enabled', true);
  const { count: redOff } = await admin
    .from('vehicles')
    .select('id', { count: 'exact', head: true })
    .eq('company_name', COMPANY)
    .eq('insurance_alerts_red_enabled', false);
  const { count: total } = await admin
    .from('vehicles')
    .select('id', { count: 'exact', head: true })
    .eq('company_name', COMPANY);

  report.db = {
    beeri_total: total,
    insurance_on: insOn,
    red_off: redOff,
    pass_task1: insOn === total,
    pass_task2: redOff === total,
  };

  const browser = await chromium.launch({ headless: true });
  await runViewport(browser, 'desktop', { viewport: { width: 1280, height: 900 } });
  await runViewport(browser, 'mobile', devices['iPhone 13']);
  await browser.close();

  const ok =
    report.db.pass_task1 &&
    report.db.pass_task2 &&
    report.regression.accidentsOk &&
    report.tasks.desktop_both_toggles_visible &&
    report.tasks.mobile_both_toggles_visible;
  report.overall = ok ? 'PASS' : 'FAIL';
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
