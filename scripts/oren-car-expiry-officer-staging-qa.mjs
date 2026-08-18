/**
 * Staging-only QA for officer expiry approval.
 * Writes ONLY isolated QA-Expiry-Officer rows; never touches real client companies.
 * node scripts/oren-car-expiry-officer-staging-qa.mjs
 */
import { chromium, devices } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const FM_EMAIL = 'k.auto@beeri.co.il';
const BEERI = 'קיבוץ בארי';
const QA_COMPANY = 'QA-Expiry-Officer';
const QA_PLATE = 'QA-EXP-18';
const QA_DRIVER = 'QA Expiry Driver';
const OUT = join(ROOT, 'docs', 'audit-reports', 'oren-car-expiry-officer-staging');
mkdirSync(join(OUT, 'screenshots'), { recursive: true });

const keys = JSON.parse(execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const anon = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key;
const admin = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });

const report = {
  at: new Date().toISOString(),
  stagingOnly: true,
  productionTouched: false,
  schemaChange: false,
  rlsChange: false,
  checks: {},
  screenshots: [],
  consoleErrors: [],
  network500: [],
  overall: 'pending',
};

async function getSuperAdminEmail() {
  const { data: roles } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin').limit(1);
  if (!roles?.[0]?.user_id) return null;
  const { data: userData } = await admin.auth.admin.getUserById(roles[0].user_id);
  return userData?.user?.email || null;
}

async function injectSession(context, email) {
  const anonClient = createClient(STAGING_URL, anon);
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr) throw linkErr;
  const { data: auth, error: verifyErr } = await anonClient.auth.verifyOtp({
    email,
    token: linkData.properties.email_otp,
    type: 'email',
  });
  if (verifyErr || !auth.session) throw verifyErr || new Error('verifyOtp');
  const ref = new URL(STAGING_URL).hostname.split('.')[0];
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    {
      key: `sb-${ref}-auth-token`,
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

async function beeriCounts() {
  const { count: vehicles } = await admin.from('vehicles').select('id', { count: 'exact', head: true }).eq('company_name', BEERI);
  const { count: drivers } = await admin.from('drivers').select('id', { count: 'exact', head: true }).eq('company_name', BEERI);
  return { vehicles: vehicles ?? 0, drivers: drivers ?? 0 };
}

async function cleanupQa() {
  await admin.from('approval_requests').delete().eq('company_name', QA_COMPANY);
  await admin.from('vehicle_tasks').delete().eq('company_name', QA_COMPANY);
  await admin.from('vehicles').delete().eq('company_name', QA_COMPANY);
  await admin.from('drivers').delete().eq('company_name', QA_COMPANY);
}

async function seedQa() {
  await cleanupQa();
  const { data: vehicle, error: vErr } = await admin
    .from('vehicles')
    .insert({
      license_plate: QA_PLATE,
      internal_number: 'QAEXP',
      company_name: QA_COMPANY,
      manufacturer: 'QA',
      model: 'Expiry',
      year: 2020,
      status: 'active',
      test_expiry: '2026-08-01',
      insurance_expiry: '2026-08-02',
    })
    .select('id')
    .single();
  if (vErr) throw vErr;
  const { data: driver, error: dErr } = await admin
    .from('drivers')
    .insert({
      full_name: QA_DRIVER,
      company_name: QA_COMPANY,
      license_expiry: '2026-08-03',
      phone: '0500000018',
      status: 'active',
    })
    .select('id')
    .single();
  if (dErr) throw dErr;
  return { vehicleId: vehicle.id, driverId: driver.id };
}

async function shot(page, name) {
  const file = `${name}.png`;
  await page.screenshot({ path: join(OUT, 'screenshots', file), fullPage: true });
  report.screenshots.push(file);
}

function attach(page, label) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') report.consoleErrors.push({ label, text: msg.text().slice(0, 240) });
  });
  page.on('response', (res) => {
    if (res.status() >= 500) report.network500.push({ label, status: res.status(), url: res.url().slice(0, 180) });
  });
}

async function main() {
  const beforeBeeri = await beeriCounts();
  report.beeriBefore = beforeBeeri;
  const ids = await seedQa();
  report.qaIds = ids;

  const saEmail = await getSuperAdminEmail();
  if (!saEmail) throw new Error('no super_admin');

  const browser = await chromium.launch({ headless: true });

  const desktop = await browser.newContext({ locale: 'he-IL', viewport: { width: 1280, height: 900 } });
  await injectSession(desktop, saEmail);
  const page = await desktop.newPage();
  attach(page, 'desktop');

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(2000);
  const dashText = await page.locator('body').innerText();
  report.checks.dashboardCard = dashText.includes('ממתינים לאישור קצין רכב');
  await shot(page, '01-dashboard');

  await page.goto(`${BASE}/expiry-approvals`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1500);
  const listText = await page.locator('body').innerText();
  report.checks.listHasTest = listText.includes(QA_PLATE) && listText.includes('טסט');
  report.checks.listHasInsurance = listText.includes('ביטוח חובה');
  report.checks.listHasLicense = listText.includes(QA_DRIVER) && listText.includes('רישיון נהיגה');
  await shot(page, '02-pending-list');

  await page.getByRole('button', { name: 'רכבים' }).click();
  await page.waitForTimeout(400);
  report.checks.filterVehicles = (await page.locator('body').innerText()).includes(QA_PLATE);
  await page.getByRole('button', { name: 'נהגים' }).click();
  await page.waitForTimeout(400);
  const driversOnly = await page.locator('body').innerText();
  report.checks.filterDrivers = driversOnly.includes(QA_DRIVER) && !driversOnly.includes(QA_PLATE);
  await page.getByRole('button', { name: 'הכל' }).click();

  await page.goto(`${BASE}/vehicles?vehicleId=${ids.vehicleId}&view=hub&hubSection=home&hubDrill=insurance_licenses&hubFocus=test`, {
    waitUntil: 'networkidle',
    timeout: 120000,
  });
  await page.waitForTimeout(2000);
  const vehText = await page.locator('body').innerText();
  report.checks.vehiclePending = vehText.includes('ממתין לאישור');
  report.checks.vehicleNav = !page.url().includes('/login');
  await shot(page, '03-vehicle-hub');

  const renewBtn = page.getByRole('button', { name: 'עדכן ואשר' }).first();
  report.checks.renewButton = (await renewBtn.count()) > 0;
  if (await renewBtn.count()) {
    await renewBtn.click();
    await page.waitForTimeout(400);
    await shot(page, '05-renew-dialog');
    const confirm = page.getByRole('button', { name: 'אשר חידוש' });
    report.checks.cannotApproveEmpty = !(await confirm.isEnabled());
    await page.locator('#expiry-new-date').fill('2026-08-10');
    await page.waitForTimeout(200);
    report.checks.cannotApprovePast = !(await confirm.isEnabled());
    await page.locator('#expiry-new-date').fill('2027-09-01');
    await page.waitForTimeout(200);
    report.checks.canApproveFuture = await confirm.isEnabled();
    await confirm.click();
    await page.waitForTimeout(2000);
  }

  await page.goto(`${BASE}/drivers?driverId=${ids.driverId}&section=documents`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(2000);
  const drvText = await page.locator('body').innerText();
  report.checks.driverPending = drvText.includes('ממתין לאישור') && drvText.includes(QA_DRIVER);
  await shot(page, '04-driver-hub');
  await desktop.close();

  const mobile = await browser.newContext({ locale: 'he-IL', ...devices['iPhone 13'] });
  await injectSession(mobile, saEmail);
  const mpage = await mobile.newPage();
  attach(mpage, 'mobile');
  await mpage.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle', timeout: 120000 });
  await mpage.waitForTimeout(1500);
  report.checks.mobileDashboard = (await mpage.locator('body').innerText()).includes('ממתינים לאישור קצין רכב');
  await shot(mpage, '06-mobile-dashboard');
  await mpage.goto(`${BASE}/expiry-approvals`, { waitUntil: 'networkidle', timeout: 120000 });
  await mpage.waitForTimeout(1200);
  await shot(mpage, '07-mobile-list');
  await mobile.close();

  const fm = await browser.newContext({ locale: 'he-IL', viewport: { width: 1280, height: 900 } });
  await injectSession(fm, FM_EMAIL);
  const fpage = await fm.newPage();
  attach(fpage, 'beeri-fm');
  await fpage.goto(`${BASE}/expiry-approvals`, { waitUntil: 'networkidle', timeout: 120000 });
  await fpage.waitForTimeout(1500);
  const fmText = await fpage.locator('body').innerText();
  report.checks.companyIsolation = !fmText.includes(QA_PLATE) && !fmText.includes(QA_DRIVER) && !fmText.includes(QA_COMPANY);
  await fm.close();
  await browser.close();

  const { data: remainingVehicle } = await admin.from('vehicles').select('test_expiry, insurance_expiry').eq('id', ids.vehicleId).maybeSingle();
  report.checks.dateUpdated = remainingVehicle?.test_expiry === '2027-09-01';
  report.checks.insuranceUntouched = remainingVehicle?.insurance_expiry === '2026-08-02';
  const { data: approvals } = await admin
    .from('approval_requests')
    .select('approved_by, approved_at, approved_by_name, description, action_type')
    .eq('company_name', QA_COMPANY)
    .eq('action_type', 'expiry_renewal_test');
  const stamp = approvals?.[0];
  report.checks.savedWho = Boolean(stamp?.approved_by && stamp?.approved_by_name);
  report.checks.savedWhen = Boolean(stamp?.approved_at);
  let oldNew = false;
  try {
    const desc = JSON.parse(stamp?.description || '{}');
    oldNew = desc.oldDate === '2026-08-01' && desc.newDate === '2027-09-01';
  } catch {
    oldNew = false;
  }
  report.checks.savedOldNew = oldNew;

  const afterBeeri = await beeriCounts();
  report.beeriAfter = afterBeeri;
  report.checks.beeriUnchanged = beforeBeeri.vehicles === afterBeeri.vehicles && beforeBeeri.drivers === afterBeeri.drivers;

  await cleanupQa();
  const { count: qaLeft } = await admin.from('vehicles').select('id', { count: 'exact', head: true }).eq('company_name', QA_COMPANY);
  report.checks.qaCleaned = (qaLeft ?? 0) === 0;

  const required = [
    'dashboardCard',
    'listHasTest',
    'listHasInsurance',
    'listHasLicense',
    'filterVehicles',
    'filterDrivers',
    'vehiclePending',
    'vehicleNav',
    'driverPending',
    'cannotApproveEmpty',
    'cannotApprovePast',
    'canApproveFuture',
    'dateUpdated',
    'savedWho',
    'savedWhen',
    'savedOldNew',
    'companyIsolation',
    'mobileDashboard',
    'beeriUnchanged',
    'qaCleaned',
  ];
  report.overall = required.every((k) => report.checks[k]) ? 'PASS' : 'FAIL';
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ overall: report.overall, checks: report.checks }, null, 2));
  if (report.overall !== 'PASS') process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await cleanupQa().catch(() => {});
  process.exit(1);
});
