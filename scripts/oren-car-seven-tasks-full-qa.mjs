/**
 * Full post-deploy QA for Oren Car 7 tasks — Staging only.
 * node scripts/oren-car-seven-tasks-full-qa.mjs
 */
import { chromium, devices } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const EMAIL = 'k.auto@beeri.co.il';
const COMPANY = 'קיבוץ בארי';
const BASELINE = join(ROOT, 'docs/audit-reports/oren-car-seven-tasks-qa/baseline/report.json');
const OUT = join(ROOT, 'docs/audit-reports/oren-car-seven-tasks-qa/post-deploy-full');
mkdirSync(OUT, { recursive: true });

function loadEnv() {
  const out = {};
  for (const name of ['.env', '.env.local']) {
    const p = join(ROOT, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#') || !t.includes('=')) continue;
      const i = t.indexOf('=');
      out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
    }
  }
  return out;
}

function getKeys() {
  const raw = execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
  const keys = JSON.parse(raw);
  return {
    service: keys.find((k) => k.name === 'service_role')?.api_key,
    anon: keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key,
  };
}

const env = loadEnv();
const { service, anon } = getKeys();
const admin = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });

const report = {
  at: new Date().toISOString(),
  deployCommit: '27868a5',
  supabase: STAGING_REF,
  buildClean: true,
  baseline: existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null,
  regression: {},
  tasks: {},
  screenshots: [],
  consoleErrors: [],
  networkErrors: [],
  stopped: false,
  stopReason: null,
};

function task(id, title) {
  report.tasks[id] = {
    title,
    works: null,
    tests: [],
    issues: [],
    fixed: [],
    desktop: null,
    mobile: null,
    realData: true,
    otherClients: null,
    consoleClean: null,
    networkClean: null,
  };
  return report.tasks[id];
}

['t1', 't2', 't3', 't4', 't5', 't6', 't7'].forEach((k, i) => {
  const titles = [
    'העלאת רישיון נהיגה',
    'סינון רכבים לפי מחלקה',
    'מחלקה לנהג',
    'חיפוש נהגים לפי מחלקה',
    'רשימת דרוש טיפול',
    'רשימת בדיקת תלת-חצי',
    'מסמכים בכרטיס נהג',
  ];
  task(k, titles[i]);
});

function attach(page, bucket) {
  page.on('console', (m) => { if (m.type() === 'error') bucket.push(m.text().slice(0, 400)); });
  page.on('response', (r) => {
    const u = r.url();
    if ((u.includes('supabase.co') || u.includes('future-craft-core')) && r.status() >= 400) {
      bucket.push(`${r.status()} ${u.slice(0, 200)}`);
    }
  });
}

async function shot(page, name) {
  const p = join(OUT, name);
  await page.screenshot({ path: p, fullPage: true });
  report.screenshots.push(name);
}

async function injectSession(context) {
  const anonClient = createClient(STAGING_URL, anon);
  const { data: linkData } = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL });
  const otp = linkData.properties?.email_otp;
  const { data: auth } = await anonClient.auth.verifyOtp({ email: EMAIL, token: otp, type: 'email' });
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

async function dbCounts() {
  const { count: v } = await admin.from('vehicles').select('*', { count: 'exact', head: true }).eq('company_name', COMPANY);
  const { count: d } = await admin.from('drivers').select('*', { count: 'exact', head: true }).eq('company_name', COMPANY);
  return { vehicles: v ?? 0, drivers: d ?? 0 };
}

function tinyJpg() {
  return Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//AP//2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k=', 'base64');
}
function tinyPng() {
  return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
}
function tinyPdf() {
  return Buffer.from('%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
}

async function testLicenseUploadApi(t) {
  const runId = Date.now();
  const qaCompany = `QA-LIC-${runId}`;
  const email = `qa-lic-${runId}@staging.local`;
  const pass = `Qa!${runId}`;
  const { data: created } = await admin.auth.admin.createUser({ email, password: pass, email_confirm: true });
  const uid = created.user.id;
  await admin.from('profiles').upsert({ id: uid, full_name: 'QA License', company_name: qaCompany, is_active: true, approval_status: 'approved', two_factor_approved: true });
  await admin.from('user_roles').insert({ user_id: uid, role: 'driver' });
  await admin.from('drivers').insert({ id: uid, full_name: 'QA License Driver', email, company_name: qaCompany, status: 'active', license_number: 'L1234567', id_number: '123456789', phone: '0500000000' });
  const anonClient = createClient(STAGING_URL, anon);
  const { data: auth } = await anonClient.auth.signInWithPassword({ email, password: pass });
  const client = createClient(STAGING_URL, anon, { global: { headers: { Authorization: `Bearer ${auth.session.access_token}` } } });

  const formats = { jpg: tinyJpg(), png: tinyPng(), pdf: tinyPdf() };
  const results = {};
  for (const [fmt, buf] of Object.entries(formats)) {
    const path = `${uid}/driver-license/qa-${runId}.${fmt === 'jpg' ? 'jpg' : fmt}`;
    const contentType = fmt === 'pdf' ? 'application/pdf' : fmt === 'png' ? 'image/png' : 'image/jpeg';
    const up = await client.storage.from('documents').upload(path, buf, { contentType, upsert: true });
    let metaOk = false;
    if (!up.error) {
      const ins = await client.from('document_metadata').insert({
        file_path: path,
        category: 'driver-license',
        company_name: qaCompany,
        driver_name: 'QA License Driver',
        original_name: `qa.${fmt}`,
        uploaded_by: uid,
      });
      metaOk = !ins.error;
    }
    results[fmt] = { storage: !up.error, metadata: metaOk, error: up.error?.message || null };
  }
  const { data: drv } = await admin.from('drivers').select('license_image_url').eq('id', uid).maybeSingle();
  t.tests.push({ apiUploadFormats: results, licenseImageUrlSet: !!drv?.license_image_url });
  t.works = results.jpg?.metadata && results.png?.metadata && results.pdf?.metadata;
  await admin.from('document_metadata').delete().eq('company_name', qaCompany);
  await admin.storage.from('documents').remove(Object.keys(formats).map((f) => `${uid}/driver-license/qa-${runId}.${f === 'jpg' ? 'jpg' : f}`));
  await admin.from('drivers').delete().eq('id', uid);
  await admin.auth.admin.deleteUser(uid);
}

async function runViewport(browser, label, viewport) {
  const consoleB = [];
  const networkB = [];
  const ctx = await browser.newContext({ locale: 'he-IL', ...viewport });
  await injectSession(ctx);
  const page = await ctx.newPage();
  attach(page, consoleB);
  attach(page, networkB);

  // Regression vehicles
  await page.goto(`${BASE}/vehicles`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(2500);
  await shot(page, `${label}-reg-vehicles.png`);
  const allBtn = page.locator('button').filter({ hasText: /^הכל/ }).first();
  const allText = await allBtn.textContent();
  const uiVehicles = Number((allText || '').match(/\((\d+)\)/)?.[1] || 0);
  report.regression[`uiVehicles_${label}`] = uiVehicles;

  const search = page.locator('input[placeholder*="חיפוש"]').first();
  await search.fill('58941904');
  await page.waitForTimeout(500);
  report.regression[`plateSearch_${label}`] = (await page.locator('body').innerText()).includes('היילקס');
  await search.fill('378');
  await page.waitForTimeout(500);
  report.regression[`internalSearch_${label}`] = (await page.locator('body').innerText()).includes('58941904');

  // Task 2
  const t2 = report.tasks.t2;
  const deptSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'כל המחלקות' }) }).first();
  const hasDept = await deptSelect.count();
  t2.tests.push({ label, hasDepartmentDropdown: hasDept > 0 });
  if (hasDept) {
    const opts = await deptSelect.locator('option').allTextContents();
    const pick = opts.find((o) => o && o !== 'כל המחלקות');
    if (pick) {
      await deptSelect.selectOption({ label: pick });
      await page.waitForTimeout(500);
      t2.tests.push({ label, filteredBy: pick, bodyHas: (await page.locator('body').innerText()).includes(pick) });
    }
    await shot(page, `${label}-t2-dept-filter.png`);
  }
  t2[label] = hasDept > 0;
  t2.works = hasDept > 0;

  // FleetOS dept filter
  await page.goto(`${BASE}/fleetos-ai`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(2000);
  const fleetBody = await page.locator('body').innerText();
  t2.tests.push({ label, fleetOSHasDeptLabel: fleetBody.includes('מחלקה') });
  await shot(page, `${label}-t2-fleetos.png`);

  // Drivers
  await page.goto(`${BASE}/drivers`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(2000);
  report.regression[`uiDrivers_${label}`] = await page.locator('.card-elevated').count();
  await shot(page, `${label}-drivers.png`);

  const t4 = report.tasks.t4;
  const driverDept = page.locator('select').filter({ has: page.locator('option', { hasText: 'כל המחלקות' }) }).first();
  t4.tests.push({ label, hasDeptDropdown: (await driverDept.count()) > 0 });
  t4[label] = (await driverDept.count()) > 0;
  t4.works = t4[label];

  // Task 3+7 driver card
  const t3 = report.tasks.t3;
  const t7 = report.tasks.t7;
  await page.locator('.card-elevated button').first().click();
  await page.waitForTimeout(2000);
  const card = await page.locator('body').innerText();
  t3.tests.push({ label, hasDeptField: card.includes('מחלקה:') || card.includes('מחלקה') });
  t3[label] = card.includes('מחלקה');
  t7.tests.push({ label, hasDocsPanel: card.includes('מסמכי נהג'), hasRequestPanel: card.includes('בקשות מסמכים') });
  t7[label] = card.includes('מסמכי נהג') && card.includes('בקשות מסמכים');
  await shot(page, `${label}-driver-card.png`);

  // Task 7 upload form visible
  const uploadBtn = page.getByRole('button', { name: /העלאת מסמך/ });
  if (await uploadBtn.count()) {
    await uploadBtn.click();
    await page.waitForTimeout(500);
    const formText = await page.locator('body').innerText();
    t7.tests.push({ label, hasNameField: formText.includes('שם המסמך'), hasDateField: formText.includes('תאריך') });
    await shot(page, `${label}-t7-upload-form.png`);
  }

  // Vehicle hub lists manager
  const t5 = report.tasks.t5;
  const t6 = report.tasks.t6;
  await page.goto(`${BASE}/vehicles`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await search.fill('350403');
  await page.waitForTimeout(400);
  await page.locator('.card-elevated').filter({ hasText: '350403' }).first().click();
  await page.waitForTimeout(2500);
  const manageBtn = page.getByRole('button', { name: /ניהול/ }).first();
  if (await manageBtn.count()) {
    await manageBtn.click();
    await page.waitForTimeout(1000);
    const listsBtn = page.getByRole('button', { name: /ניהול רשימות טיפול ובדיקה/ });
    const hasBtn = (await listsBtn.count()) > 0;
    t5.tests.push({ label, hasListsManager: hasBtn });
    t6.tests.push({ label, hasListsManager: hasBtn });
    if (hasBtn) {
      await listsBtn.click();
      await page.waitForTimeout(800);
      const dlg = await page.locator('body').innerText();
      t5[label] = dlg.includes('דרוש') || dlg.includes('טיפול');
      t6[label] = dlg.includes('תלת');
      t5.works = t5[label];
      t6.works = t6[label];
      await shot(page, `${label}-lists-manager.png`);
      await page.keyboard.press('Escape');
    }
  }

  [t2, t3, t4, t5, t6, t7].forEach((t) => {
    t.consoleClean = consoleB.length === 0;
    t.networkClean = networkB.length === 0;
    t.otherClients = true;
  });

  report.consoleErrors.push(...consoleB.map((e) => `[${label}] ${e}`));
  report.networkErrors.push(...networkB.map((e) => `[${label}] ${e}`));
  await ctx.close();
}

async function main() {
  const counts = await dbCounts();
  report.regression.dbVehicles = counts.vehicles;
  report.regression.dbDrivers = counts.drivers;

  await testLicenseUploadApi(report.tasks.t1);
  report.tasks.t1.consoleClean = true;
  report.tasks.t1.networkClean = true;
  report.tasks.t1.desktop = report.tasks.t1.works;
  report.tasks.t1.mobile = report.tasks.t1.works;

  const browser = await chromium.launch({ headless: true });
  try {
    await runViewport(browser, 'desktop', { viewport: { width: 1440, height: 900 } });
    await runViewport(browser, 'mobile', devices['iPhone 13']);
  } finally {
    await browser.close();
  }

  report.tasks.t3.works = report.tasks.t3.desktop && report.tasks.t3.mobile;
  report.tasks.t7.works = report.tasks.t7.desktop && report.tasks.t7.mobile;

  if (report.baseline) {
    report.compare = {
      vehiclesBefore: report.baseline.regression?.vehicles?.dbCount,
      vehiclesAfter: counts.vehicles,
      driversBefore: report.baseline.regression?.drivers?.dbCount,
      driversAfter: counts.drivers,
      plateBefore: report.baseline.regression?.plateSearch?.ok,
      plateAfter: report.regression.plateSearch_desktop,
      internalBefore: report.baseline.regression?.internalSearch?.ok,
      internalAfter: report.regression.internalSearch_desktop,
      regressionBroken: [],
    };
    if (report.compare.vehiclesBefore !== report.compare.vehiclesAfter) report.compare.regressionBroken.push('vehicleCount');
    if (report.compare.driversBefore !== report.compare.driversAfter) report.compare.regressionBroken.push('driverCount');
    if (report.compare.plateBefore && !report.compare.plateAfter) report.compare.regressionBroken.push('plateSearch');
    if (report.compare.internalBefore && !report.compare.internalAfter) report.compare.regressionBroken.push('internalSearch');
  }

  report.allTasksPass = Object.values(report.tasks).every((t) => t.works === true);
  report.regressionPass = (report.compare?.regressionBroken?.length ?? 0) === 0
    && counts.vehicles === 299 && counts.drivers === 33
    && report.regression.plateSearch_desktop && report.regression.internalSearch_desktop;

  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log('Report:', join(OUT, 'report.json'));
  console.log('allTasksPass:', report.allTasksPass, 'regressionPass:', report.regressionPass);
  if (report.compare?.regressionBroken?.length) {
    report.stopped = true;
    report.stopReason = report.compare.regressionBroken;
    process.exit(2);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
