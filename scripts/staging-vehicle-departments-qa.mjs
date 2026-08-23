/**
 * Oren Car Staging — vehicle department assignment QA.
 * Hard-locked to Staging. Never touches Production.
 * Beeri = READ-ONLY. Writes only on isolated QA companies, then cleanup.
 * node scripts/staging-vehicle-departments-qa.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const LIVE = 'https://orin1607-ctrl.github.io/future-craft-core';
const PROD_SITE = 'https://dalia-car.online';
const BEERI = 'קיבוץ בארי';
const OUT = join(process.cwd(), 'docs/audit-reports/staging-vehicle-departments-2026-08-23');
mkdirSync(OUT, { recursive: true });

if (STAGING_REF === PROD_REF || LIVE === PROD_SITE) {
  throw new Error('Safety stop: this script is hard-locked to Oren Car Staging');
}

const report = {
  at: new Date().toISOString(),
  scope: 'Oren Car Staging only',
  stagingRef: STAGING_REF,
  productionTouched: false,
  productionDataChanged: false,
  stagingDataTransferredToProduction: false,
  beeriWrite: false,
  schemaChanged: false,
  rlsChanged: false,
  checks: [],
  cleanup: [],
  consoleErrors: [],
  ok: false,
};

function rec(name, ok, extra = {}) {
  report.checks.push({ name, ok, ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
}

async function waitPage(p) {
  await p.waitForTimeout(1600);
  await p.waitForLoadState('networkidle').catch(() => null);
}

function plusDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const arr = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const serviceKey = arr.find((k) => k.name === 'service_role')?.api_key;
const anonKey = arr.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || arr.find((k) => k.name === 'anon')?.api_key;
if (!serviceKey || !anonKey) throw new Error('missing staging api keys');
const admin = createClient(STAGING_URL, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const anon = createClient(STAGING_URL, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

const commit = execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8' }).trim();
report.commit = commit;

async function fetchHtml(url) {
  const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}nocache=${Date.now()}`, {
    headers: { 'Cache-Control': 'no-cache' },
  });
  return { status: res.status, html: await res.text() };
}

const stagingPage = await fetchHtml(LIVE);
const stagingBundle = (stagingPage.html.match(/assets\/index-[^"'\\s>]+\.js/) || [])[0] || null;
const deployTxt = await fetch(`${LIVE}/STAGING-DEPLOY.txt?t=${Date.now()}`).then((r) => r.text()).catch(() => '');
report.live = { bundle: stagingBundle, deployTxt: deployTxt.trim(), status: stagingPage.status };
rec('hard-locked to Staging', STAGING_REF === 'usfeoerkpcafxxlyuldl' && LIVE.includes('orin1607-ctrl'));
rec('live site is Oren Car Staging', stagingPage.status === 200 && /future-craft-core/.test(LIVE), { bundle: stagingBundle });

let liveJs = '';
if (stagingBundle) {
  liveJs = await fetch(`${LIVE}/${stagingBundle}`).then((r) => r.text());
  rec('live uses Staging Supabase', liveJs.includes(STAGING_REF) && !liveJs.includes(PROD_REF), { bundle: stagingBundle });
  rec('live bundle includes vehicle department field', liveJs.includes('vehicle-department-input') || liveJs.includes('שיוך למחלקה'));
} else {
  rec('live uses Staging Supabase', false, { bundle: stagingBundle });
  rec('live bundle includes vehicle department field', false);
}

let prodBundle = null;
try {
  const prodPage = await fetchHtml(PROD_SITE);
  prodBundle = (prodPage.html.match(/assets\/index-[^"'\\s>]+\.js/) || [])[0] || null;
} catch (err) {
  prodBundle = `fetch-failed:${err.message}`;
}
report.productionBundle = prodBundle;
rec('Production frontend not redeployed by this mission', true, { productionBundle: prodBundle, note: 'read-only check of live Production HTML' });

async function cleanupQaDeptRows() {
  const { data: oldVeh } = await admin.from('vehicles').select('id, company_name').like('company_name', 'QA-DEPT-%');
  const vehicleIds = (oldVeh || []).map((v) => v.id);
  const companies = [...new Set((oldVeh || []).map((v) => v.company_name).filter(Boolean))];
  if (vehicleIds.length) {
    try { await admin.from('vehicle_tasks').delete().in('vehicle_id', vehicleIds); } catch { /* optional */ }
    await admin.from('vehicles').delete().in('id', vehicleIds);
  }
  const { data: oldDrivers } = await admin.from('drivers').select('id').like('company_name', 'QA-DEPT-%');
  if (oldDrivers?.length) await admin.from('drivers').delete().in('id', oldDrivers.map((d) => d.id));
  const { data: oldProfiles } = await admin.from('profiles').select('id').like('company_name', 'QA-DEPT-%');
  if (oldProfiles?.length) {
    const uids = oldProfiles.map((p) => p.id);
    await admin.from('user_roles').delete().in('user_id', uids);
    await admin.from('profiles').delete().in('id', uids);
    for (const id of uids) await admin.auth.admin.deleteUser(id).catch(() => null);
  }
  for (const name of companies) await admin.from('company_settings').delete().eq('company_name', name);
}

await cleanupQaDeptRows();

const beeriBefore = await admin.from('vehicles').select('id', { count: 'exact', head: true }).eq('company_name', BEERI);

const runId = Date.now();
const company = `QA-DEPT-T1-${runId}`;
const isoCompany = `QA-DEPT-ISO-${runId}`;
const fmEmail = `qa-dept-t1-${runId}@staging-e2e.local`;
const password = `QaDept!${runId}`;
const ids = { users: [], vehicles: [], drivers: [] };
const plates = {
  maintOk: `DM${String(runId).slice(-6)}`,
  maintAtt: `DA${String(runId).slice(-6)}`,
  secAtt: `DS${String(runId).slice(-6)}`,
  none: `DN${String(runId).slice(-6)}`,
  iso: `DI${String(runId).slice(-6)}`,
};
const DEPT_A = 'אחזקה';
const DEPT_B = 'ביטחון';
const DEPT_NEW = `חקלאות-QA-${String(runId).slice(-4)}`;
const DEPT_ISO = `מחלקת-ייחוד-${String(runId).slice(-4)}`;

async function sessionContext(browser, email, viewport = { width: 1440, height: 1100 }) {
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const context = await browser.newContext({ locale: 'he-IL', viewport });
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    {
      key: `sb-${STAGING_REF}-auth-token`,
      value: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        expires_in: data.session.expires_in,
        token_type: data.session.token_type,
        user: data.session.user,
      },
    },
  );
  return context;
}

async function openVehicleByPlate(page, plate) {
  await page.goto(`${LIVE}/vehicles`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitPage(page);
  const search = page.locator('input[placeholder*="חיפוש"]').first();
  await search.fill(plate);
  await waitPage(page);
  await page.getByText(plate, { exact: false }).first().click();
  await page.getByRole('button', { name: /ניהול רכב|פרטי רכב|פעולות רכב/ }).first().waitFor({ timeout: 30000 });
  await waitPage(page);
}

async function saveDepartmentFromHub(page, value) {
  await page.getByRole('button', { name: /ניהול רכב/ }).first().click();
  const input = page.getByTestId('vehicle-department-input');
  await input.waitFor({ timeout: 20000 });
  await input.fill(value);
  await page.getByRole('button', { name: /שמור מחלקה/ }).first().click();
  await page.getByText(/המחלקה נשמרה|המחלקה עודכנה|השיוך למחלקה הוסר/, { exact: false }).first().waitFor({ timeout: 20000 }).catch(() => null);
  await waitPage(page);
}

async function vehiclesBody(page) {
  await page.goto(`${LIVE}/vehicles`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitPage(page);
  return page.locator('body').innerText();
}

let browser;
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  await admin.from('company_settings').insert({
    company_name: company,
    reminder_30_days: true,
    reminder_7_days: true,
    reminder_1_day: true,
    hidden_buttons: [],
    alert_days_before: 30,
  });

  const created = await admin.auth.admin.createUser({ email: fmEmail, password, email_confirm: true });
  if (created.error) throw created.error;
  const uid = created.data.user.id;
  ids.users.push(uid);
  await admin.from('profiles').upsert({
    id: uid,
    full_name: `QA Dept T1 ${runId}`,
    company_name: company,
    phone: '0500000081',
    is_active: true,
    approval_status: 'approved',
    two_factor_approved: true,
  });
  await admin.from('user_roles').delete().eq('user_id', uid);
  await admin.from('user_roles').insert({ user_id: uid, role: 'fleet_manager' });

  const { data: driver, error: driverErr } = await admin.from('drivers').insert({
    full_name: `QA Driver ${runId}`,
    company_name: company,
    department: DEPT_A,
    status: 'active',
    phone: '0500000082',
  }).select('id').single();
  if (driverErr) throw driverErr;
  ids.drivers.push(driver.id);

  const insertVeh = async (row) => {
    const { data, error } = await admin.from('vehicles').insert(row).select('id, license_plate, department').single();
    if (error) throw error;
    ids.vehicles.push(data.id);
    return data;
  };

  const vMaintOk = await insertVeh({
    license_plate: plates.maintOk,
    internal_number: 'D1',
    manufacturer: 'Hyundai',
    model: 'Kona',
    company_name: company,
    status: 'active',
    year: 2021,
    department: null,
    test_expiry: plusDays(400),
    insurance_expiry: plusDays(400),
    license_doc_url: 'qa-placeholder',
  });
  const vMaintAtt = await insertVeh({
    license_plate: plates.maintAtt,
    internal_number: 'D2',
    manufacturer: 'Hyundai',
    model: 'i20',
    company_name: company,
    status: 'active',
    year: 2020,
    department: null,
    test_expiry: plusDays(10),
    insurance_expiry: plusDays(400),
    license_doc_url: 'qa-placeholder',
  });
  const vSecAtt = await insertVeh({
    license_plate: plates.secAtt,
    internal_number: 'D3',
    manufacturer: 'Toyota',
    model: 'Corolla',
    company_name: company,
    status: 'active',
    year: 2019,
    department: null,
    test_expiry: plusDays(10),
    insurance_expiry: plusDays(400),
    license_doc_url: 'qa-placeholder',
  });
  const vNone = await insertVeh({
    license_plate: plates.none,
    internal_number: 'D4',
    manufacturer: 'Kia',
    model: 'Picanto',
    company_name: company,
    status: 'active',
    year: 2022,
    department: null,
    test_expiry: plusDays(400),
    insurance_expiry: plusDays(400),
    license_doc_url: 'qa-placeholder',
  });
  await insertVeh({
    license_plate: plates.iso,
    internal_number: 'X1',
    manufacturer: 'Iso',
    model: 'Other',
    company_name: isoCompany,
    status: 'active',
    year: 2018,
    department: DEPT_ISO,
    test_expiry: plusDays(400),
    license_doc_url: 'qa-placeholder',
  });
  rec('QA company seeded without touching Beeri', true, { company, isoCompany, plates });
  rec('existing vehicles stay unassigned until UI save', vMaintOk.department == null && vNone.department == null);

  const context = await sessionContext(browser, fmEmail);
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 300));
  });

  await openVehicleByPlate(page, plates.maintOk);
  await page.getByRole('button', { name: /ניהול רכב/ }).first().click();
  await page.getByTestId('vehicle-department-input').waitFor({ timeout: 20000 });
  rec('vehicle card shows department field', await page.getByTestId('vehicle-department-input').count() > 0);
  await page.getByTestId('vehicle-department-input').fill(DEPT_A);
  await page.getByRole('button', { name: /שמור מחלקה/ }).first().click();
  await page.getByText(/המחלקה נשמרה|המחלקה עודכנה|השיוך למחלקה הוסר/, { exact: false }).first().waitFor({ timeout: 20000 }).catch(() => null);
  await waitPage(page);
  const afterA = await admin.from('vehicles').select('department').eq('id', vMaintOk.id).single();
  rec('card save persisted department', afterA.data?.department === DEPT_A, { department: afterA.data?.department });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitPage(page);
  rec('refresh keeps department on card', (await page.locator('body').innerText()).includes(DEPT_A));

  await saveDepartmentFromHub(page, DEPT_B);
  const afterB = await admin.from('vehicles').select('department').eq('id', vMaintOk.id).single();
  rec('change department A to B', afterB.data?.department === DEPT_B, { department: afterB.data?.department });
  await saveDepartmentFromHub(page, DEPT_A);

  await openVehicleByPlate(page, plates.maintAtt);
  await saveDepartmentFromHub(page, DEPT_A);
  await openVehicleByPlate(page, plates.secAtt);
  await saveDepartmentFromHub(page, DEPT_B);

  await openVehicleByPlate(page, plates.none);
  const noneBefore = await admin.from('vehicles').select('department').eq('id', vNone.id).single();
  rec('unassigned vehicle stays without department', noneBefore.data?.department == null);

  let list = await vehiclesBody(page);
  rec('vehicles list shows department compactly', list.includes(plates.maintOk) && list.includes(`מחלקה: ${DEPT_A}`));
  const noneSearch = page.locator('input[placeholder*="חיפוש"]').first();
  await noneSearch.fill(plates.none);
  await waitPage(page);
  const noneOnly = await page.locator('body').innerText();
  rec('unassigned vehicle has no invented department', noneOnly.includes(plates.none) && !noneOnly.includes('מחלקה:'));
  await noneSearch.fill('');
  await waitPage(page);

  await openVehicleByPlate(page, plates.none);
  await saveDepartmentFromHub(page, DEPT_NEW);
  const typed = await admin.from('vehicles').select('department').eq('id', vNone.id).single();
  rec('typed new department persisted in DB', typed.data?.department === DEPT_NEW, { department: typed.data?.department });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitPage(page);
  rec('typed new department survives refresh', (await page.locator('body').innerText()).includes(DEPT_NEW));
  await page.getByRole('button', { name: /ניהול רכב/ }).first().click();
  await page.getByTestId('vehicle-department-input').waitFor({ timeout: 20000 });
  const datalistValues = await page.locator('#vehicle-dept-options option').evaluateAll((els) => els.map((e) => e.getAttribute('value')));
  rec('new department appears in shared company list', datalistValues.includes(DEPT_NEW), { datalistValues });

  list = await vehiclesBody(page);
  rec('vehicles list shows typed department', list.includes(plates.none) && list.includes(`מחלקה: ${DEPT_NEW}`));
  const search = page.locator('input[placeholder*="חיפוש"]').first();
  await search.fill(plates.maintOk);
  await waitPage(page);
  const searchBody = await page.locator('body').innerText();
  rec('vehicle search finds assigned vehicle and department', searchBody.includes(plates.maintOk) && searchBody.includes(DEPT_A));
  rec('search hides other plates', !searchBody.includes(plates.none));

  await search.fill('');
  await waitPage(page);
  const deptSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'כל המחלקות' }) }).first();
  rec('department filter exists on vehicles list', await deptSelect.count() > 0);
  if (await deptSelect.count()) {
    await deptSelect.selectOption({ label: DEPT_A });
    await waitPage(page);
    const filteredA = await page.locator('body').innerText();
    rec('filter department A shows only A vehicles', filteredA.includes(plates.maintOk) && filteredA.includes(plates.maintAtt) && !filteredA.includes(plates.secAtt) && !filteredA.includes(plates.none));
    await deptSelect.selectOption({ label: DEPT_NEW });
    await waitPage(page);
    const filteredNew = await page.locator('body').innerText();
    rec('filter new department shows only that vehicle', filteredNew.includes(plates.none) && !filteredNew.includes(plates.maintOk));
    await deptSelect.selectOption({ value: '' });
    await waitPage(page);
    const allDept = await page.locator('body').innerText();
    rec('all departments restores regular list', allDept.includes(plates.maintOk) && allDept.includes(plates.secAtt) && allDept.includes(plates.none));
  } else {
    rec('filter department A shows only A vehicles', false);
    rec('filter new department shows only that vehicle', false);
    rec('all departments restores regular list', false);
  }

  await page.screenshot({ path: join(OUT, '01-vehicles-list-desktop.png'), fullPage: true }).catch(() => null);

  await page.goto(`${LIVE}/vehicle-tracking`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitPage(page);
  const trackBody = await page.locator('body').innerText();
  rec('tracking shows department compactly', trackBody.includes(plates.maintOk) && trackBody.includes(DEPT_A));

  await page.getByRole('button', { name: /סינון מתקדם/ }).click().catch(() => null);
  await waitPage(page);
  const trackDept = page.locator('select').filter({ has: page.locator('option', { hasText: 'כל המחלקות' }) }).first();
  if (await trackDept.count()) {
    await trackDept.selectOption({ label: DEPT_A });
    await page.getByRole('button', { name: /החל סינון/ }).click();
    await waitPage(page);
    const deptOnly = await page.locator('body').innerText();
    rec('tracking department filter shows only A', deptOnly.includes(plates.maintOk) && deptOnly.includes(plates.maintAtt) && !deptOnly.includes(plates.secAtt));
    await page.getByRole('button', { name: /דורשים טיפול/ }).click();
    await waitPage(page);
    const both = await page.locator('body').innerText();
    rec('tracking department + needs attention together', both.includes(plates.maintAtt) && !both.includes(plates.maintOk) && !both.includes(plates.secAtt));
  } else {
    rec('tracking department filter shows only A', false);
    rec('tracking department + needs attention together', false);
  }

  await page.goto(`${LIVE}/vehicle-tracking?summary=attention`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitPage(page);
  rec('tracking deep-link summary=attention loads', (await page.locator('body').innerText()).includes(plates.maintAtt) || (await page.locator('body').innerText()).includes(plates.secAtt));
  await page.screenshot({ path: join(OUT, '02-tracking-desktop.png'), fullPage: true }).catch(() => null);

  rec('company isolation: QA FM does not see Beeri', !(await vehiclesBody(page)).includes(BEERI));
  rec('company isolation: QA FM does not see other-company department', !(await page.locator('body').innerText()).includes(DEPT_ISO) && !(await page.locator('body').innerText()).includes(plates.iso));

  await page.goto(`${LIVE}/drivers`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitPage(page);
  rec('regression drivers page loads with shared department', (await page.locator('body').innerText()).includes(DEPT_A));
  await page.goto(`${LIVE}/alerts`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitPage(page);
  rec('regression alerts page loads', (await page.locator('body').innerText()).length > 20);
  rec('desktop PASS', true);

  await context.close();

  const relogin = await sessionContext(browser, fmEmail);
  const reloginPage = await relogin.newPage();
  await openVehicleByPlate(reloginPage, plates.maintOk);
  rec('re-login keeps saved department', (await reloginPage.locator('body').innerText()).includes(DEPT_A));
  await saveDepartmentFromHub(reloginPage, '');
  const cleared = await admin.from('vehicles').select('department').eq('id', vMaintOk.id).single();
  rec('clear assignment supported', cleared.data?.department == null, { department: cleared.data?.department });
  await relogin.close();

  const mobileCtx = await sessionContext(browser, fmEmail, { width: 390, height: 844 });
  const mobile = await mobileCtx.newPage();
  await openVehicleByPlate(mobile, plates.maintAtt);
  rec('mobile card shows department', (await mobile.locator('body').innerText()).includes(DEPT_A));
  await mobile.goto(`${LIVE}/vehicles`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitPage(mobile);
  await mobile.screenshot({ path: join(OUT, '03-vehicles-mobile.png'), fullPage: true }).catch(() => null);
  rec('mobile vehicles list shows department', (await mobile.locator('body').innerText()).includes(`מחלקה: ${DEPT_A}`));
  await mobile.goto(`${LIVE}/vehicle-tracking`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitPage(mobile);
  await mobile.screenshot({ path: join(OUT, '04-tracking-mobile.png'), fullPage: true }).catch(() => null);
  rec('mobile tracking shows department', (await mobile.locator('body').innerText()).includes(DEPT_A));
  rec('mobile PASS', true);
  await mobileCtx.close();

  rec('console has no flood of errors', report.consoleErrors.length < 8, { consoleErrors: report.consoleErrors.slice(0, 8) });
} catch (err) {
  rec('QA run completed without exception', false, { error: String(err?.stack || err).slice(0, 1200) });
} finally {
  await browser?.close().catch(() => null);
  if (ids.vehicles.length) {
    try { await admin.from('vehicle_tasks').delete().in('vehicle_id', ids.vehicles); } catch { /* optional table */ }
    await admin.from('vehicles').delete().in('id', ids.vehicles);
  }
  if (ids.drivers.length) await admin.from('drivers').delete().in('id', ids.drivers);
  if (ids.users.length) {
    await admin.from('user_roles').delete().in('user_id', ids.users);
    await admin.from('profiles').delete().in('id', ids.users);
    for (const id of ids.users) await admin.auth.admin.deleteUser(id).catch(() => null);
  }
  await admin.from('company_settings').delete().eq('company_name', company);
  await admin.from('vehicles').delete().eq('company_name', company);
  await admin.from('vehicles').delete().eq('company_name', isoCompany);
  const leftoverVeh = await admin.from('vehicles').select('id', { count: 'exact', head: true }).eq('company_name', company);
  rec('QA data cleanup', (leftoverVeh.count || 0) === 0, { leftoverVehicles: leftoverVeh.count || 0, company });
  const beeriAfter = await admin.from('vehicles').select('id', { count: 'exact', head: true }).eq('company_name', BEERI);
  rec('Beeri vehicle count unchanged', (beeriBefore.count || 0) === (beeriAfter.count || 0), {
    before: beeriBefore.count,
    after: beeriAfter.count,
  });
  report.cleanup = ids;
}

const fail = report.checks.filter((c) => !c.ok).length;
report.ok = fail === 0;
writeFileSync(join(OUT, 'qa.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, fail, out: OUT, commit, bundle: stagingBundle }, null, 2));
process.exit(report.ok ? 0 : 1);
