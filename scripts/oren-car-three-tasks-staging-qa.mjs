/**
 * Oren Car — 3 tasks post-deploy QA (Staging only)
 * node scripts/oren-car-three-tasks-staging-qa.mjs
 */
import { chromium, devices } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const EMAIL = 'k.auto@beeri.co.il';
const COMPANY = 'קיבוץ בארי';
const V917_UUID = '3378a2db-6492-44d8-82e9-577444c49794';
const V917_PLATE = '15094302';
const OUT = join(ROOT, 'docs', 'audit-reports', 'oren-car-three-tasks-staging', 'post-deploy-qa');
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
  deployCommit: '8c94383',
  migration: {},
  tasks: { t1_nav: {}, t2_test_tier: {}, t3_insurance_toggle: {} },
  regression: { consoleErrors: [], networkErrors: [], modules: [] },
  screenshots: [],
  overall: 'pending',
};

async function injectSession(context) {
  const anonClient = createClient(url, anon);
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL });
  if (linkErr) throw linkErr;
  const otp = linkData.properties?.email_otp;
  if (!otp) throw new Error('No email_otp');
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

async function login(page) {
  await page.goto(`${BASE}/vehicles`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(2000);
  if (page.url().includes('/login')) throw new Error('Login failed — session not injected');
}

async function collectErrors(page, label) {
  const errs = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errs.push({ label, text: msg.text() });
  });
  page.on('pageerror', (e) => errs.push({ label, text: e.message }));
  page.on('response', (res) => {
    if (res.status() >= 400 && !res.url().includes('favicon')) {
      report.regression.networkErrors.push({ label, url: res.url(), status: res.status() });
    }
  });
  return errs;
}

async function shot(page, name) {
  const p = join(OUT, 'screenshots', name);
  await page.screenshot({ path: p, fullPage: true });
  report.screenshots.push(p.replace(ROOT + '\\', '').replace(ROOT + '/', ''));
}

async function runViewport(browser, viewport, tag) {
  const ctx = await browser.newContext({ locale: 'he-IL', ...devices[viewport] });
  await injectSession(ctx);
  const page = await ctx.newPage();
  const consoleErrs = await collectErrors(page, tag);
  await login(page);

  // Task 2: tracking — 917 should NOT show test alert at 57d
  await page.goto(`${BASE}/vehicle-tracking`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  const trackingText = await page.locator('body').innerText();
  const row917 = trackingText.includes(V917_PLATE);
  const testChipOn917 =
    (await page.locator(`text=${V917_PLATE}`).count()) > 0 &&
    (await page.locator(`tr:has-text("${V917_PLATE}")`).locator('text=/טסט/').count()) > 0;
  report.tasks.t2_test_tier[`${tag}_917_visible`] = row917;
  report.tasks.t2_test_tier[`${tag}_917_test_chip`] = testChipOn917;
  await shot(page, `${tag}-01-tracking.png`);

  await page.goto(`${BASE}/vehicles?vehicleId=${V917_UUID}&view=hub`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  await shot(page, `${tag}-02-vehicle-hub.png`);

  // Task 3: insurance toggle in ניהול רכב section
  await page.goto(`${BASE}/vehicles?vehicleId=${V917_UUID}&view=hub&hubSection=manage`, {
    waitUntil: 'networkidle',
    timeout: 60000,
  });
  await page.waitForTimeout(2500);
  const manageText = await page.locator('body').innerText();
  report.tasks.t3_insurance_toggle[`${tag}_toggle_visible`] = manageText.includes('הפעל התראות ביטוח');
  const sw = page.locator('button[role="switch"]').first();
  report.tasks.t3_insurance_toggle[`${tag}_toggle_off`] =
    manageText.includes('הפעל התראות ביטוח') && (await sw.getAttribute('data-state')) === 'unchecked';
  await shot(page, `${tag}-02b-manage-toggle.png`);

  // Task 1: deep link test focus
  await page.goto(
    `${BASE}/vehicles?vehicleId=${V917_UUID}&view=hub&hubSection=home&hubDrill=insurance_licenses&hubFocus=test`,
    { waitUntil: 'domcontentloaded', timeout: 60000 },
  );
  await page.waitForTimeout(3000);
  const deeplinkText = await page.locator('body').innerText();
  report.tasks.t1_nav[`${tag}_test_deeplink`] =
    deeplinkText.includes('טסט') || deeplinkText.includes('ביטוחים ורישיונות');
  await shot(page, `${tag}-03-test-deeplink.png`);

  // Alerts page — no insurance for beeri default off
  await page.goto(`${BASE}/alerts`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  const alertsText = await page.locator('body').innerText();
  const insAlerts = (alertsText.match(/ביטוח/g) || []).length;
  report.tasks.t3_insurance_toggle[`${tag}_alerts_insurance_mentions`] = insAlerts;
  await shot(page, `${tag}-04-alerts.png`);

  // Regression: vehicles list loads
  await page.goto(`${BASE}/vehicles`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);
  const vehCount = await page.locator('text=/\\d{5,}/').count();
  report.regression.modules.push({ tag, vehicles_plates_visible: vehCount > 0 });
  await shot(page, `${tag}-05-vehicles.png`);

  report.regression.consoleErrors.push(...consoleErrs);
  await ctx.close();
}

async function verifyDb() {
  const { count: beeriOff } = await admin
    .from('vehicles')
    .select('id', { count: 'exact', head: true })
    .eq('company_name', COMPANY)
    .eq('insurance_alerts_enabled', false);
  const { data: settings } = await admin
    .from('company_settings')
    .select('alert_days_before')
    .eq('company_name', COMPANY)
    .maybeSingle();
  const { data: v917 } = await admin
    .from('vehicles')
    .select('id, license_plate, test_expiry, insurance_alerts_enabled')
    .eq('id', V917_UUID)
    .maybeSingle();
  report.migration = {
    beeri_insurance_off_count: beeriOff,
    alert_days_before: settings?.alert_days_before,
    v917: v917,
  };
}

async function main() {
  await verifyDb();
  const browser = await chromium.launch({ headless: true });
  try {
    await runViewport(browser, 'Desktop Chrome', 'desktop');
    await runViewport(browser, 'iPhone 13', 'mobile');
  } finally {
    await browser.close();
  }

  const fails = [];
  if (report.tasks.t2_test_tier.desktop_917_test_chip) fails.push('917 shows test chip at 57d');
  if (report.migration.alert_days_before !== 30) fails.push('alert_days_before changed');
  if (report.migration.beeri_insurance_off_count !== 299) fails.push('beeri insurance toggle count');
  if (report.tasks.t3_insurance_toggle.desktop_toggle_off !== true) fails.push('insurance toggle not off desktop');
  if (report.tasks.t3_insurance_toggle.mobile_toggle_off !== true) fails.push('insurance toggle not off mobile');

  report.overall = fails.length === 0 ? 'pass' : 'fail';
  report.failures = fails;
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
