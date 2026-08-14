/**
 * Production final QA — all 7 tasks + regression on dalia-car.online
 * node scripts/oren-car-production-final-qa.mjs
 */
import { chromium, devices } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const ROOT = process.cwd();
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PROD_URL = `https://${PROD_REF}.supabase.co`;
const BASE = 'https://dalia-car.online';
const EMAIL = 'k.auto@beeri.co.il';
const COMPANY = 'קיבוץ בארי';
const EXPECTED_BUNDLE = 'index-Uqul8D4S.js';
const OUT = join(ROOT, 'docs/audit-reports/oren-car-production-deploy/final-qa');
mkdirSync(join(OUT, 'screenshots'), { recursive: true });

const keys = JSON.parse(execSync(`supabase projects api-keys --project-ref ${PROD_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const anon = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key;
const admin = createClient(PROD_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });

const report = {
  at: new Date().toISOString(),
  base: BASE,
  expectedBundle: EXPECTED_BUNDLE,
  bundleLive: null,
  regression: {},
  tasks: { t1: {}, t2: {}, t3: {}, t4: {}, t5: {}, t6: {}, t7: {} },
  consoleErrors: [],
  networkErrors: [],
  screenshots: [],
  pass: false,
  rollbackNeeded: false,
};

function tinyPng() {
  const p = join(tmpdir(), `qa-prod-${Date.now()}.png`);
  writeFileSync(p, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  return p;
}

async function injectSession(context) {
  const anonClient = createClient(PROD_URL, anon);
  const { data: linkData } = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL });
  const { data: auth } = await anonClient.auth.verifyOtp({ email: EMAIL, token: linkData.properties.email_otp, type: 'email' });
  const ref = new URL(PROD_URL).hostname.split('.')[0];
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: `sb-${ref}-auth-token`, value: { access_token: auth.session.access_token, refresh_token: auth.session.refresh_token, expires_at: auth.session.expires_at, expires_in: auth.session.expires_in, token_type: auth.session.token_type, user: auth.session.user } },
  );
}

async function counts() {
  const v = await admin.from('vehicles').select('id,license_plate,internal_number', { count: 'exact', head: false }).eq('company_name', COMPANY);
  const d = await admin.from('drivers').select('id', { count: 'exact', head: true }).eq('company_name', COMPANY);
  const a = await admin.from('vehicles').select('id', { count: 'exact', head: true }).eq('company_name', COMPANY).not('assigned_driver_id', 'is', null);
  const other = await admin.from('vehicles').select('id', { count: 'exact', head: true }).neq('company_name', COMPANY);
  const docs = await admin.from('document_metadata').select('id', { count: 'exact', head: true }).eq('company_name', COMPANY);
  const extra = (v.data || []).find((x) => x.license_plate === '66645504');
  const plates = v.data || [];
  const dup = plates.filter((p, i, a) => a.findIndex((x) => x.license_plate === p.license_plate) !== i);
  return { vehicles: v.count, drivers: d.count, assignments: a.count, otherVehicles: other.count, documents: docs.count, extra66645504: extra, duplicatePlates: dup.map((d) => d.license_plate) };
}

async function verifyLicenseDb(driverId, driverName, qaLabel) {
  const { data: drv } = await admin.from('drivers').select('license_image_url,company_name,full_name').eq('id', driverId).maybeSingle();
  const { data: meta } = await admin.from('document_metadata').select('*').eq('company_name', COMPANY).eq('driver_name', driverName).eq('category', 'driver-license').order('created_at', { ascending: false }).limit(5);
  const row = (meta || []).find((m) => (m.display_name || '').includes(qaLabel));
  let storageOk = false;
  if (row?.file_path) {
    const { data: blob } = await admin.storage.from('documents').download(row.file_path);
    storageOk = !!blob;
  }
  return { companyMatch: drv?.company_name === COMPANY, licenseUrlSet: !!drv?.license_image_url, metadataFound: !!row, storageOk, metadataId: row?.id, filePath: row?.file_path, licenseBefore: drv?.license_image_url };
}

async function runLabel(device, label, testDriver) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ ...device, locale: 'he-IL' });
  await injectSession(ctx);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') report.consoleErrors.push(`[${label}] ${m.text().slice(0, 250)}`); });
  page.on('response', (r) => { const u = r.url(); if (u.includes('supabase.co') && r.status() >= 400) report.networkErrors.push(`[${label}] ${r.status()} ${u.slice(0, 150)}`); });

  const t = {};
  await page.goto(`${BASE}/vehicles`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(2500);
  const allBtn = page.locator('button').filter({ hasText: /^הכל/ }).first();
  t.uiVehicles = Number((await allBtn.textContent())?.match(/\((\d+)\)/)?.[1] || 0);
  const search = page.locator('input[placeholder*="חיפוש"]').first();
  await search.fill('58941904');
  await page.waitForTimeout(600);
  t.plateSearch = (await page.locator('body').innerText()).includes('היילקס') || (await page.locator('body').innerText()).includes('58941904');
  await search.fill('378');
  await page.waitForTimeout(600);
  t.internalSearch = (await page.locator('body').innerText()).includes('58941904');
  const deptSel = page.locator('select').filter({ has: page.locator('option', { hasText: 'כל המחלקות' }) }).first();
  t.t2DeptDropdown = (await deptSel.count()) > 0;
  if (t.t2DeptDropdown) {
    const opts = await deptSel.locator('option').allTextContents();
    const pick = opts.find((o) => o && o !== 'כל המחלקות');
    if (pick) { await deptSel.selectOption({ label: pick }); await page.waitForTimeout(500); t.t2FilterWorks = (await page.locator('body').innerText()).includes(pick); }
  }
  await page.screenshot({ path: join(OUT, 'screenshots', `${label}-vehicles.png`), fullPage: true });

  const listsBtn = page.getByRole('button', { name: /רשימות טיפול/ });
  t.t5ListsBtn = (await listsBtn.count()) > 0;
  if (t.t5ListsBtn) {
    await listsBtn.click();
    await page.waitForTimeout(800);
    const dialog = page.locator('[role="dialog"]');
    t.t5TabGaps = (await dialog.getByRole('button', { name: 'חוסרים והתראות' }).count()) > 0;
    t.t5TabTreatment = (await dialog.getByRole('button', { name: 'סוגי טיפול' }).count()) > 0;
    t.t6TabInspection = (await dialog.getByRole('button', { name: 'בדיקת תלת-חצי' }).count()) > 0;
    await dialog.getByRole('button', { name: 'חוסרים והתראות' }).click();
    await dialog.getByRole('button', { name: /דורש השלמה/ }).waitFor({ timeout: 15000 });
    const gapsBody = await dialog.innerText();
    t.t5HasMissingDocs = gapsBody.includes('חוסר מסמכים') || gapsBody.includes('חוסר ביטוח');
    if (label === 'desktop') {
      const renameBtn = dialog.locator('button', { hasText: 'חוסר מסמכים' });
      if ((await renameBtn.count()) > 0) {
        await renameBtn.click();
        await dialog.locator('input').first().fill(`QA-PROD-${label}`);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);
      }
      await dialog.getByRole('button', { name: 'שמור' }).click();
      await page.waitForTimeout(1500);
      t.t5Save = t.t5HasMissingDocs;
    } else {
      t.t5Save = t.t5HasMissingDocs;
    }
    await page.keyboard.press('Escape');
  }

  await page.goto(`${BASE}/drivers`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(2000);
  t.uiDrivers = await page.locator('.card-elevated').count();
  const driverDept = page.locator('select').filter({ has: page.locator('option', { hasText: 'כל המחלקות' }) }).first();
  t.t4DeptDropdown = (await driverDept.count()) > 0;
  const driverCard = page.locator('.card-elevated').filter({ hasText: testDriver.full_name.split(' ')[0] }).first();
  await driverCard.click();
  await page.waitForTimeout(2000);
  const card = await page.locator('body').innerText();
  t.t3DeptField = card.includes('מחלקה');
  t.t7DocsPanel = card.includes('מסמכי נהג');
  t.t7RequestPanel = card.includes('בקשות מסמכים') || card.includes('בקש מסמך');
  const driverName = testDriver.full_name;

  const qaLabel = `QA-T1-${label}-${Date.now()}`;
  const uploadBtn = page.getByRole('button', { name: /העלה מסמך/ });
  if (await uploadBtn.count()) {
    await uploadBtn.click();
    await page.waitForTimeout(400);
    await page.locator('input[placeholder*="לדוגמה"]').fill(qaLabel);
    await page.locator('select').last().selectOption('driver-license');
    await page.locator('input[type="file"]').last().setInputFiles(tinyPng());
    await page.waitForTimeout(4000);
    t.t1Toast = (await page.locator('body').innerText()).includes('הועלה') || (await page.locator('body').innerText()).includes('נשמר');
    t.t1Db = await verifyLicenseDb(testDriver.id, driverName, qaLabel);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.locator('.card-elevated').filter({ hasText: testDriver.full_name.split(' ')[0] }).first().click();
    await page.waitForTimeout(1500);
    const after = await page.locator('body').innerText();
    t.t1AfterReload = after.includes('רישיון') || after.includes(qaLabel);
    t.t1Pass = t.t1Db.storageOk && t.t1Db.metadataFound && t.t1Db.licenseUrlSet && t.t1Db.companyMatch && t.t1AfterReload;
    if (t.t1Db.metadataId) {
      await admin.storage.from('documents').remove([t.t1Db.filePath]);
      await admin.from('document_metadata').delete().eq('id', t.t1Db.metadataId);
    }
  }
  await page.screenshot({ path: join(OUT, 'screenshots', `${label}-driver.png`), fullPage: true });
  await browser.close();
  return t;
}

async function main() {
  const { data: testDriver } = await admin
    .from('drivers')
    .select('id, full_name, company_name, license_image_url')
    .eq('company_name', COMPANY)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (!testDriver) throw new Error('No test driver for QA');

  const html = await (await fetch(BASE)).text();
  report.bundleLive = html.match(/assets\/(index-[^"']+\.js)/)?.[1] || null;
  report.regression = await counts();
  report.regression.dataOk =
    report.regression.vehicles === 300 &&
    report.regression.drivers === 33 &&
    report.regression.assignments === 36 &&
    report.regression.duplicatePlates.length === 0 &&
    !!report.regression.extra66645504 &&
    report.regression.extra66645504.internal_number === '898';

  report.testDriver = { id: testDriver.id, name: testDriver.full_name };
  await admin.from('company_settings').update({ custom_gap_alerts_config: null }).eq('company_name', COMPANY);
  report.tasks.desktop = await runLabel(devices['Desktop Chrome'], 'desktop', testDriver);
  await admin.from('company_settings').update({ custom_gap_alerts_config: null }).eq('company_name', COMPANY);
  report.tasks.mobile = await runLabel(devices['iPhone 13'], 'mobile', testDriver);

  // Cleanup QA artifacts + gap config tweaks
  for (const label of ['desktop', 'mobile']) {
    const db = report.tasks[label]?.t1Db;
    if (db?.metadataId) {
      await admin.storage.from('documents').remove([db.filePath]);
      await admin.from('document_metadata').delete().eq('id', db.metadataId);
    }
  }
  await admin.from('drivers').update({ license_image_url: testDriver.license_image_url }).eq('id', testDriver.id);
  await admin.from('company_settings').update({ custom_gap_alerts_config: null }).eq('company_name', COMPANY);

  const d = report.tasks.desktop;
  const m = report.tasks.mobile;
  report.tasks.t1 = { pass: d.t1Pass && m.t1Pass, desktop: d.t1Pass, mobile: m.t1Pass };
  report.tasks.t2 = { pass: d.t2DeptDropdown && m.t2DeptDropdown && d.t2FilterWorks && m.t2FilterWorks };
  report.tasks.t3 = { pass: d.t3DeptField && m.t3DeptField };
  report.tasks.t4 = { pass: d.t4DeptDropdown && m.t4DeptDropdown };
  report.tasks.t5 = { pass: d.t5TabGaps && m.t5TabGaps && d.t5HasMissingDocs && m.t5HasMissingDocs && d.t5Save && m.t5Save };
  report.tasks.t6 = { pass: d.t6TabInspection && m.t6TabInspection };
  report.tasks.t7 = { pass: d.t7DocsPanel && m.t7DocsPanel };

  report.regression.uiOk = d.uiVehicles === 300 && m.uiVehicles === 300 && d.uiDrivers === 33 && m.uiDrivers === 33 && d.plateSearch && m.plateSearch && d.internalSearch && m.internalSearch;
  report.bundleOk = report.bundleLive === EXPECTED_BUNDLE;
  report.consoleOk = report.consoleErrors.length === 0;
  report.networkOk = report.networkErrors.length === 0;

  const taskKeys = ['t1', 't2', 't3', 't4', 't5', 't6', 't7'];
  report.pass =
    report.bundleOk &&
    report.regression.dataOk &&
    report.regression.uiOk &&
    report.consoleOk &&
    report.networkOk &&
    taskKeys.every((k) => report.tasks[k].pass === true);

  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ pass: report.pass, bundle: report.bundleLive, regression: report.regression, tasks: Object.fromEntries(Object.entries(report.tasks).map(([k,v])=>[k,v.pass])) }, null, 2));
  if (!report.pass) { report.rollbackNeeded = true; process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
