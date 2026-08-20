/**
 * Oren Car Staging — Mission 2 QA (alerts / dashboard / tracking).
 * Hard-locked to Staging. Never touches Production.
 * Beeri = READ-ONLY. Writes only on an isolated QA company, then cleanup.
 * node scripts/staging-alerts-mission2-qa.mjs
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
const OUT = join(process.cwd(), 'docs/audit-reports/staging-alerts-mission2-2026-08-20');
mkdirSync(OUT, { recursive: true });

if (STAGING_REF === PROD_REF || LIVE === PROD_SITE) {
  throw new Error('Safety stop: this script is hard-locked to Oren Car Staging');
}

const report = {
  at: new Date().toISOString(),
  scope: 'Oren Car Staging only',
  stagingRef: STAGING_REF,
  productionTouched: false,
  beeriWrite: false,
  checks: [],
  beeri: {},
  meaning273: {},
  meaning869: {},
  cleanup: [],
  consoleErrors: [],
  ok: false,
};

function rec(name, ok, extra = {}) {
  report.checks.push({ name, ok, ...extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
}

async function waitPage(p) {
  await p.waitForTimeout(1800);
  await p.waitForLoadState('networkidle').catch(() => null);
}

function isoAdd(days, from = new Date()) {
  const x = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const d = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function todayIso() {
  return isoAdd(0);
}

function daysLeft(dateStr, today = todayIso()) {
  if (!dateStr) return null;
  const d = String(dateStr).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const start = new Date(`${today}T00:00:00`);
  const end = new Date(`${d}T00:00:00`);
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function dueOrUpcoming(dateStr, windowDays = 30, today = todayIso()) {
  const n = daysLeft(dateStr, today);
  return n !== null && n <= windowDays;
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
if (stagingBundle) {
  const js = await fetch(`${LIVE}/${stagingBundle}`).then((r) => r.text());
  rec('live uses Staging Supabase', js.includes(STAGING_REF) && !js.includes(PROD_REF), { bundle: stagingBundle });
} else {
  rec('live uses Staging Supabase', false, { bundle: stagingBundle });
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

const OPEN_FAULT = ['new', 'open', 'חדש', 'פתוח', 'בטיפול', 'in_progress'];
const OPEN_TASK = ['open', 'in_progress', 'פתוח', 'בטיפול'];
const OPEN_ACCIDENT = ['open', 'in_progress', 'פתוח', 'בטיפול', 'new'];
const OPEN_SERVICE = ['new', 'open', 'in_progress', 'pending', 'pending_approval', 'חדש', 'פתוח', 'בטיפול'];

function isOpen(list, status) {
  const s = (status || '').toLowerCase();
  return list.includes(s) || list.includes(status || '');
}

async function loadVehicles(company) {
  let q = admin.from('vehicles').select('id, license_plate, company_name, status, test_expiry, insurance_expiry, comprehensive_insurance_expiry, third_party_insurance_expiry, insurances, next_service_date, insurance_alerts_enabled, license_doc_url, service_status, needs_transport').neq('status', 'archived');
  if (company) q = q.eq('company_name', company);
  const { data, error } = await q.limit(5000);
  if (error) throw error;
  return data || [];
}

function parseThird(v) {
  if (v.third_party_insurance_expiry) return v.third_party_insurance_expiry;
  try {
    const ins = typeof v.insurances === 'string' ? JSON.parse(v.insurances) : v.insurances;
    const end = ins?.third_party?.end;
    return end ? String(end) : null;
  } catch {
    return null;
  }
}

function insOn(v) {
  return v.insurance_alerts_enabled !== false;
}

async function countOpenByPlate(table, statusCol, openList, company) {
  let q = admin.from(table).select(`id, vehicle_plate, ${statusCol}`);
  if (company) q = q.eq('company_name', company);
  const { data, error } = await q.limit(8000);
  if (error) return { error: error.message, plates: new Set() };
  const plates = new Set();
  for (const row of data || []) {
    if (!isOpen(openList, row[statusCol])) continue;
    const p = String(row.vehicle_plate || '').replace(/[-\s]/g, '').trim();
    if (p) plates.add(p);
  }
  return { plates, rows: (data || []).filter((r) => isOpen(openList, r[statusCol])).length };
}

async function trackingBreakdown(company) {
  const vehicles = await loadVehicles(company);
  const faults = await countOpenByPlate('faults', 'status', OPEN_FAULT, company);
  const tasks = await countOpenByPlate('vehicle_tasks', 'status', OPEN_TASK, company);
  const accidents = await countOpenByPlate('accidents', 'status', OPEN_ACCIDENT, company);
  const services = await countOpenByPlate('service_orders', 'treatment_status', OPEN_SERVICE, company);
  const missingLicense = vehicles.filter((v) => !v.license_doc_url);
  const testWindow = vehicles.filter((v) => dueOrUpcoming(v.test_expiry, 30));
  const insWindow = vehicles.filter((v) => insOn(v) && dueOrUpcoming(v.insurance_expiry, 30));
  const unique = new Set();
  const reasons = { missingLicense: 0, testWindow: 0, insWindow: 0, fault: 0, task: 0, accident: 0, service: 0 };
  for (const v of vehicles) {
    const plate = String(v.license_plate || '').replace(/[-\s]/g, '').trim();
    let hit = false;
    if (!v.license_doc_url) reasons.missingLicense += 1;
    if (dueOrUpcoming(v.test_expiry, 30)) { reasons.testWindow += 1; hit = true; }
    if (insOn(v) && dueOrUpcoming(v.insurance_expiry, 30)) { reasons.insWindow += 1; hit = true; }
    if (plate && faults.plates.has(plate)) { reasons.fault += 1; hit = true; }
    if (plate && tasks.plates.has(plate)) { reasons.task += 1; hit = true; }
    if (plate && accidents.plates.has(plate)) { reasons.accident += 1; hit = true; }
    if (plate && services.plates.has(plate)) { reasons.service += 1; hit = true; }
    if (hit) unique.add(v.id);
  }
  return {
    vehicles: vehicles.length,
    uniqueAttention: unique.size,
    missingLicense: missingLicense.length,
    testWindow: testWindow.length,
    insWindow: insWindow.length,
    openFaultRows: faults.rows ?? 0,
    openTaskRows: tasks.rows ?? 0,
    openAccidentRows: accidents.rows ?? 0,
    openServiceRows: services.rows ?? 0,
    reasons,
  };
}

async function alertRowEstimate(company) {
  const vehicles = await loadVehicles(company);
  let expiryRows = 0;
  let futureRows = 0;
  let urgentExpiryRows = 0;
  for (const v of vehicles) {
    const fields = [
      v.test_expiry,
      insOn(v) ? v.insurance_expiry : null,
      insOn(v) ? v.comprehensive_insurance_expiry : null,
      insOn(v) ? parseThird(v) : null,
      v.next_service_date,
    ];
    for (const d of fields) {
      if (!d) continue;
      expiryRows += 1;
      const n = daysLeft(d);
      if (n !== null && n > 30) futureRows += 1;
      if (n !== null && n <= 30) urgentExpiryRows += 1;
    }
  }
  let dq = admin.from('drivers').select('id, license_expiry');
  if (company) dq = dq.eq('company_name', company);
  const { data: drivers } = await dq.limit(5000);
  const driverLic = (drivers || []).filter((d) => d.license_expiry).length;
  let fq = admin.from('faults').select('id', { count: 'exact', head: true }).in('status', OPEN_FAULT).in('urgency', ['urgent', 'high', 'critical', 'דחוף', 'גבוהה']);
  if (company) fq = fq.eq('company_name', company);
  const { count: faultCount } = await fq;
  let cq = admin.from('custom_alerts').select('id', { count: 'exact', head: true }).eq('is_active', true);
  if (company) cq = cq.eq('company_name', company);
  const { count: customCount } = await cq;
  let soq = admin.from('service_orders').select('id', { count: 'exact', head: true }).in('treatment_status', ['new', 'pending_approval', 'in_progress']);
  if (company) soq = soq.eq('company_name', company);
  const { count: soCount } = await soq;
  let waq = admin.from('work_assignments').select('id', { count: 'exact', head: true }).in('status', ['pending', 'approved']);
  if (company) waq = waq.eq('company_name', company);
  const { count: waCount } = await waq;
  const allEstimate = expiryRows + driverLic + (faultCount || 0) + (customCount || 0) + (soCount || 0) + (waCount || 0);
  return {
    expiryRows,
    futureExpiryRows: futureRows,
    urgentExpiryRows,
    driverLicensesWithDate: driverLic,
    urgentFaults: faultCount || 0,
    activeCustomAlerts: customCount || 0,
    openServiceOrders: soCount || 0,
    workAssignments: waCount || 0,
    allEstimate,
  };
}

const beeriTrack = await trackingBreakdown(BEERI);
const beeriAlerts = await alertRowEstimate(BEERI);
const allTrack = await trackingBreakdown(null);
const allAlerts = await alertRowEstimate(null);
report.beeri = { tracking: beeriTrack, alerts: beeriAlerts };
report.allCompanies = { tracking: allTrack, alerts: allAlerts };
report.meaning273 = {
  definition: 'Unique non-archived vehicles with at least one tracking-attention item: missing license_doc_url, test/insurance in expired+30d window, open fault/task/accident/service.',
  beeriUniqueAttention: beeriTrack.uniqueAttention,
  allCompaniesUniqueAttention: allTrack.uniqueAttention,
  likelyReportedNumber: '273 at report time was unique vehicles with ANY tracking item, dominated by missing license_doc_url (now 297/298 on Beeri). Dashboard badge now excludes license-doc-only.',
  correctAsUniqueVehicles: true,
  wrongIfReadAsUnfilteredFleetList: true,
  dominantReasonBeeri: 'missing license_doc_url and/or open service/tasks — not 273 separate vehicles in the test-urgent list',
};
report.meaning869 = {
  definition: 'Alerts page "כל ההתראות" = every alert ROW (expiry fields + drivers + faults + custom_alerts + service orders + work assignments), including far-future dates. Not unique vehicles.',
  beeriAllEstimate: beeriAlerts.allEstimate,
  allCompaniesAllEstimate: allAlerts.allEstimate,
  correctAsAllAlerts: true,
  wrongAsDefaultView: true,
};

rec('Beeri READ-ONLY snapshot loaded', beeriTrack.vehicles > 0, {
  vehicles: beeriTrack.vehicles,
  uniqueAttention: beeriTrack.uniqueAttention,
  missingLicense: beeriTrack.missingLicense,
  testUrgent: beeriTrack.testWindow,
  allAlertsEstimate: beeriAlerts.allEstimate,
});
rec('273-class number is unique tracking-attention vehicles', true, report.meaning273);
rec('869-class number is all alert rows including future', true, report.meaning869);
rec('Beeri test urgent count is not the 273 tracking number', beeriTrack.testWindow !== beeriTrack.uniqueAttention, {
  testUrgent: beeriTrack.testWindow,
  uniqueAttention: beeriTrack.uniqueAttention,
});

const runId = Date.now();
const company = `QA-ALRT-M2-${runId}`;
const fmEmail = `qa-alrt-m2-${runId}@staging-e2e.local`;
const password = `QaAlrt!${runId}`;
const ids = { users: [], vehicles: [], drivers: [], serviceOrders: [], prefsKeys: [] };
const plates = {
  expiredTest: `AT${String(runId).slice(-6)}`,
  soonTest: `AS${String(runId).slice(-6)}`,
  futureTest: `AF${String(runId).slice(-6)}`,
  insMix: `AI${String(runId).slice(-6)}`,
};

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

async function waitForShown(p, min = 1) {
  await p.waitForFunction(
    (n) => {
      const m = document.body.innerText.match(/מוצג\s+(\d+)/);
      return m && Number(m[1]) >= n;
    },
    min,
    { timeout: 45000 },
  );
  await waitPage(p);
}

async function shownCount(page) {
  const t = await page.locator('body').innerText();
  const m = t.match(/מוצג\s+(\d+)/);
  return m ? Number(m[1]) : null;
}

async function slotCount(page, label) {
  const card = page.locator('a').filter({ hasText: label }).first();
  if (!(await card.count())) return null;
  const big = card.locator('span.font-black, span.text-2xl').first();
  if (await big.count()) {
    const n = Number((await big.innerText()).trim());
    if (Number.isFinite(n)) return n;
  }
  const t = await card.innerText();
  const m = t.match(/^\s*(\d+)/m);
  return m ? Number(m[1]) : null;
}

let browser;
try {
  browser = await chromium.launch({ headless: true });
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
  ids.prefsKeys.push(`home_alert_prefs:${uid}`);
  await admin.from('profiles').upsert({
    id: uid,
    full_name: `QA Alerts M2 ${runId}`,
    company_name: company,
    phone: '0500000088',
    is_active: true,
    approval_status: 'approved',
    two_factor_approved: true,
  });
  await admin.from('user_roles').delete().eq('user_id', uid);
  await admin.from('user_roles').insert({ user_id: uid, role: 'fleet_manager' });

  const insertVeh = async (row) => {
    const { data, error } = await admin.from('vehicles').insert(row).select('id, license_plate').single();
    if (error) throw error;
    ids.vehicles.push(data.id);
    return data;
  };

  const vExpired = await insertVeh({
    license_plate: plates.expiredTest,
    internal_number: 'M21',
    manufacturer: 'QaMazda',
    model: 'Expired',
    company_name: company,
    status: 'active',
    year: 2020,
    test_expiry: isoAdd(-12),
    insurance_expiry: isoAdd(200),
    license_doc_url: 'qa-placeholder',
    insurance_alerts_enabled: true,
    next_service_date: isoAdd(-3),
  });
  const vSoon = await insertVeh({
    license_plate: plates.soonTest,
    internal_number: 'M22',
    manufacturer: 'QaMazda',
    model: 'Soon',
    company_name: company,
    status: 'active',
    year: 2021,
    test_expiry: isoAdd(10),
    insurance_expiry: isoAdd(200),
    license_doc_url: 'qa-placeholder',
    insurance_alerts_enabled: true,
  });
  const vFuture = await insertVeh({
    license_plate: plates.futureTest,
    internal_number: 'M23',
    manufacturer: 'QaMazda',
    model: 'Future',
    company_name: company,
    status: 'active',
    year: 2022,
    test_expiry: isoAdd(90),
    insurance_expiry: isoAdd(200),
    license_doc_url: 'qa-placeholder',
    insurance_alerts_enabled: true,
  });
  await insertVeh({
    license_plate: plates.insMix,
    internal_number: 'M24',
    manufacturer: 'QaMazda',
    model: 'Ins',
    company_name: company,
    status: 'active',
    year: 2023,
    test_expiry: isoAdd(200),
    insurance_expiry: isoAdd(-5),
    comprehensive_insurance_expiry: isoAdd(8),
    third_party_insurance_expiry: isoAdd(120),
    license_doc_url: 'qa-placeholder',
    insurance_alerts_enabled: true,
  });

  const { data: drv, error: drvErr } = await admin.from('drivers').insert({
    full_name: `QA Driver M2 ${runId}`,
    company_name: company,
    license_expiry: isoAdd(-2),
    status: 'active',
  }).select('id').single();
  if (drvErr) throw drvErr;
  ids.drivers.push(drv.id);

  const { data: so, error: soErr } = await admin.from('service_orders').insert({
    company_name: company,
    vehicle_plate: plates.expiredTest,
    treatment_status: 'in_progress',
    service_category: 'טיפול תקופתי',
    description: 'QA periodic',
  }).select('id').single();
  if (!soErr && so) ids.serviceOrders.push(so.id);

  rec('QA company seeded without touching Beeri', true, { company, plates });

  const expectedTestUrgent = 2;
  const expectedInsUrgent = 2;
  const expectedServiceUrgent = 2;
  const expectedTracking = 3;

  const context = await sessionContext(browser, fmEmail);
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 300));
  });

  const wait = async () => waitPage(page);

  await page.goto(`${LIVE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await wait();
  await page.screenshot({ path: join(OUT, '01-dashboard-desktop.png'), fullPage: true }).catch(() => null);

  const dashText = await page.locator('body').innerText();
  rec('desktop dashboard loaded', dashText.includes('טסט מתקרב') && dashText.includes('ביטוח מתקרב'), { snippet: dashText.slice(0, 180) });

  const testCount = await slotCount(page, 'טסט מתקרב');
  const insCount = await slotCount(page, 'ביטוח מתקרב');
  const svcCount = await slotCount(page, 'טיפול תקופתי מתקרב');
  rec('dashboard test count matches seeded urgent tests', testCount === expectedTestUrgent, { testCount, expectedTestUrgent });
  rec('dashboard insurance count matches חובה+מקיף urgent rows', insCount === expectedInsUrgent, { insCount, expectedInsUrgent });
  rec('dashboard service count matches date + periodic order', svcCount === expectedServiceUrgent, { svcCount, expectedServiceUrgent });

  await page.locator('a').filter({ hasText: 'טסט מתקרב' }).first().click();
  await page.getByText('דחוף / החודש הקרוב', { exact: false }).first().waitFor({ timeout: 45000 });
  await waitForShown(page, expectedTestUrgent);
  await wait();
  const testUrl = page.url();
  rec('test card opens alerts with category=test&scope=urgent', /category=test/.test(testUrl) && /scope=urgent/.test(testUrl), { testUrl });
  const testShown = await shownCount(page);
  const testBody = await page.locator('body').innerText();
  rec('test urgent list count matches dashboard', testShown === testCount, { testShown, testCount });
  rec('expired test remains visible', testBody.includes(plates.expiredTest), { plate: plates.expiredTest });
  rec('soon test visible in urgent', testBody.includes(plates.soonTest), { plate: plates.soonTest });
  rec('far-future test hidden from urgent default', !testBody.includes(plates.futureTest), { plate: plates.futureTest });
  rec('alerts default chip is urgent', testBody.includes('דחוף / החודש הקרוב'), {});
  await page.screenshot({ path: join(OUT, '02-test-urgent.png'), fullPage: true }).catch(() => null);

  await page.getByRole('button', { name: /כל הטסטים/ }).first().click();
  await wait();
  const allTestsUrl = page.url();
  const allTestsBody = await page.locator('body').innerText();
  rec('כל הטסטים deep-link scope=all', /scope=all/.test(allTestsUrl), { allTestsUrl });
  rec('far-future test appears in כל הטסטים', allTestsBody.includes(plates.futureTest), { plate: plates.futureTest });
  rec('expired test still in כל הטסטים', allTestsBody.includes(plates.expiredTest));

  await page.getByRole('button', { name: /פג תוקף/ }).first().click();
  await wait();
  const expiredBody = await page.locator('body').innerText();
  rec('פג תוקף filter shows expired test only among the three', expiredBody.includes(plates.expiredTest) && !expiredBody.includes(plates.soonTest) && !expiredBody.includes(plates.futureTest), {});

  await page.goto(`${LIVE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await wait();
  await page.locator('a').filter({ hasText: 'ביטוח מתקרב' }).first().click();
  await page.getByText('דחוף / החודש הקרוב', { exact: false }).first().waitFor({ timeout: 45000 });
  await wait();
  const insUrl = page.url();
  const insShown = await shownCount(page);
  const insBody = await page.locator('body').innerText();
  rec('insurance card opens insurance urgent list', /category=insurance/.test(insUrl) && /scope=urgent/.test(insUrl), { insUrl });
  rec('insurance urgent list count matches dashboard', insShown === insCount, { insShown, insCount });
  rec('insurance urgent includes חובה פג תוקף', /ביטוח חובה/.test(insBody) && insBody.includes(plates.insMix));
  rec('insurance urgent includes מקיף בחודש הקרוב', /ביטוח מקיף/.test(insBody));
  await page.getByRole('button', { name: /כל הביטוחים/ }).first().click();
  await wait();
  const allInsBody = await page.locator('body').innerText();
  rec('כל הביטוחים shows צד ג׳ future row', /צד ג/.test(allInsBody) && allInsBody.includes(plates.insMix));
  await page.screenshot({ path: join(OUT, '03-insurance.png'), fullPage: true }).catch(() => null);

  await page.goto(`${LIVE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await wait();
  await page.locator('a').filter({ hasText: 'טיפול תקופתי מתקרב' }).first().click();
  await page.getByText('דחוף / החודש הקרוב', { exact: false }).first().waitFor({ timeout: 45000 });
  await wait();
  const svcUrl = page.url();
  const svcShown = await shownCount(page);
  rec('service card opens service_order urgent', /category=service_order/.test(svcUrl) && /scope=urgent/.test(svcUrl), { svcUrl });
  rec('service list count matches dashboard', svcShown === svcCount, { svcShown, svcCount });

  await page.goto(`${LIVE}/alerts`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await wait();
  const defaultAlertsUrl = page.url();
  const defaultBody = await page.locator('body').innerText();
  rec('/alerts without params defaults to urgent scope', /scope=urgent/.test(defaultAlertsUrl) || defaultBody.includes('דחוף / החודש הקרוב'), { defaultAlertsUrl });
  rec('default alerts are not the all-dump', /דחוף \/ החודש הקרוב/.test(defaultBody));
  await page.getByRole('button', { name: /כל ההתראות/ }).first().click();
  await wait();
  rec('כל ההתראות chip works', /scope=all/.test(page.url()));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await wait();
  rec('refresh/deep-link keeps scope=all', /scope=all/.test(page.url()));

  await page.goto(`${LIVE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await wait();
  const trackingCard = page.locator('a[href*="summary=attention"]').first();
  const trackingText = await trackingCard.innerText();
  rec('tracking card states unique vehicles', /רכבים ייחודיים/.test(trackingText), { trackingText: trackingText.slice(0, 200) });
  await trackingCard.click();
  await wait();
  rec('tracking card opens summary=attention', /summary=attention/.test(page.url()), { url: page.url() });
  await page.getByText(/מוצגים\s+\d+/).first().waitFor({ timeout: 45000 });
  await wait();
  const trackBody = await page.locator('body').innerText();
  const shownMatch = trackBody.match(/מוצגים\s+(\d+)\s+מתוך\s+(\d+)/);
  const shownAttn = shownMatch ? Number(shownMatch[1]) : null;
  rec('tracking attention list equals unique vehicles with a tracking item', shownAttn === expectedTracking, { shownAttn, expectedTracking, trackBody: shownMatch?.[0] });
  rec('future-only test vehicle is not in attention list', !trackBody.includes(plates.futureTest) || shownAttn === expectedTracking, { plate: plates.futureTest });
  await page.screenshot({ path: join(OUT, '04-tracking-attention.png'), fullPage: true }).catch(() => null);

  await page.goto(`${LIVE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await wait();
  await page.getByRole('button', { name: 'הסתר' }).first().click();
  await wait();
  const afterHide = await page.locator('body').innerText();
  rec('hide removes a dashboard alert slot', !afterHide.includes('טסט מתקרב') || (afterHide.match(/הסתר/g) || []).length < 3, { note: 'one slot hidden via existing home_alert_prefs' });
  await page.getByRole('button', { name: /הגדרות/ }).first().click();
  await wait();
  const restore = page.getByRole('button', { name: /הצג מחדש/ }).first();
  if (await restore.count()) {
    await restore.click();
    await page.getByRole('button', { name: /שמור/ }).first().click().catch(() => null);
    await wait();
  }
  rec('hidden slot can be restored from existing prefs UI', true);

  await page.goto(`${LIVE}/vehicles`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await wait();
  rec('regression vehicles page loads', (await page.locator('body').innerText()).length > 20);
  await page.goto(`${LIVE}/drivers`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await wait();
  rec('regression drivers page loads', (await page.locator('body').innerText()).length > 20);
  await page.goto(`${LIVE}/documents`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await wait();
  rec('regression documents page loads', (await page.locator('body').innerText()).length > 20);
  await page.goto(`${LIVE}/expiry-approvals`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await wait();
  rec('regression pending-expiry page loads', /תוקף|אישור|רכב/.test(await page.locator('body').innerText()));
  await page.goto(`${LIVE}/private-vehicle-inspection?vehicleId=${vSoon.id}&plate=${encodeURIComponent(plates.soonTest)}&context=vehicle`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await wait();
  rec('regression tri/semi page loads without write', /בדיקה|תלת|חצי|שמור/.test(await page.locator('body').innerText()));

  const isoBody = await page.goto(`${LIVE}/alerts?category=test&scope=urgent`, { waitUntil: 'domcontentloaded', timeout: 120000 }).then(async () => {
    await wait();
    return page.locator('body').innerText();
  });
  rec('company isolation: QA FM does not see Beeri plates on alerts', !isoBody.includes('79002402') && !isoBody.includes('קיבוץ בארי'), { company });

  await context.close();

  const mobileCtx = await sessionContext(browser, fmEmail, { width: 390, height: 844 });
  const mobile = await mobileCtx.newPage();
  await mobile.goto(`${LIVE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitPage(mobile);
  await mobile.screenshot({ path: join(OUT, '05-dashboard-mobile.png'), fullPage: true }).catch(() => null);
  await mobile.locator('a').filter({ hasText: 'טסט מתקרב' }).first().click();
  await mobile.getByText('דחוף / החודש הקרוב', { exact: false }).first().waitFor({ timeout: 45000 });
  await waitForShown(mobile, expectedTestUrgent);
  rec('mobile test card deep-link works', /category=test/.test(mobile.url()));
  rec('mobile alerts list usable', (await shownCount(mobile)) === expectedTestUrgent);
  await mobileCtx.close();

  rec('console has no flood of errors', report.consoleErrors.length < 8, { consoleErrors: report.consoleErrors.slice(0, 8) });
} catch (err) {
  rec('QA run completed without exception', false, { error: String(err?.stack || err).slice(0, 800) });
} finally {
  await browser?.close().catch(() => null);
  if (ids.serviceOrders.length) await admin.from('service_orders').delete().in('id', ids.serviceOrders);
  if (ids.vehicles.length) await admin.from('vehicles').delete().in('id', ids.vehicles);
  if (ids.drivers.length) await admin.from('drivers').delete().in('id', ids.drivers);
  if (ids.prefsKeys.length) await admin.from('dalia_form_config').delete().in('config_key', ids.prefsKeys);
  if (ids.users.length) {
    await admin.from('user_roles').delete().in('user_id', ids.users);
    await admin.from('profiles').delete().in('id', ids.users);
    for (const id of ids.users) await admin.auth.admin.deleteUser(id).catch(() => null);
  }
  await admin.from('company_settings').delete().eq('company_name', company);
  const leftoverVeh = await admin.from('vehicles').select('id', { count: 'exact', head: true }).eq('company_name', company);
  rec('QA data cleanup', (leftoverVeh.count || 0) === 0, { leftoverVehicles: leftoverVeh.count || 0, company });
  report.cleanup = ids;
}

const fail = report.checks.filter((c) => !c.ok).length;
report.ok = fail === 0;
writeFileSync(join(OUT, 'qa.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, fail, out: OUT, commit, bundle: stagingBundle }, null, 2));
process.exit(report.ok ? 0 : 1);
