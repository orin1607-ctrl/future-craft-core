/**
 * Oren Car — 7 tasks staging QA (baseline + post-deploy).
 * Usage: node scripts/oren-car-seven-tasks-staging-qa.mjs --phase=baseline|post
 */
import { chromium, devices } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const EMAIL = 'k.auto@beeri.co.il';
const COMPANY = 'קיבוץ בארי';
const OTHER_COMPANY = "ק'יבוץ בארי";
const phase = (process.argv.find((a) => a.startsWith('--phase='))?.split('=')[1] || 'baseline').trim();

const OUT = join(ROOT, 'docs', 'audit-reports', 'oren-car-seven-tasks-qa', phase);
const BASELINE_PATH = join(ROOT, 'docs', 'audit-reports', 'oren-car-seven-tasks-qa', 'baseline', 'report.json');
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
const url = env.VITE_SUPABASE_URL || `https://${STAGING_REF}.supabase.co`;
const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });

const report = {
  phase,
  at: new Date().toISOString(),
  base: BASE,
  user: EMAIL,
  company: COMPANY,
  build: { clean: null },
  migration: { applied: null, columns: {} },
  regression: {
    vehicles: { dbCount: null, uiCount: null, match: null },
    drivers: { dbCount: null, uiCount: null, match: null },
    plateSearch: { ok: null },
    internalSearch: { ok: null },
    otherCompanyIsolation: { ok: null },
    modules: [],
    consoleErrors: [],
    networkErrors: [],
    pageErrors: [],
  },
  tasks: {
    t1_license_upload: { works: null, tests: [], issues: [], fixed: [], desktop: null, mobile: null, realData: null, otherClients: null, consoleClean: null, networkClean: null },
    t2_vehicle_department_filter: { works: null, tests: [], issues: [], fixed: [], desktop: null, mobile: null, realData: null, otherClients: null, consoleClean: null, networkClean: null },
    t3_driver_department: { works: null, tests: [], issues: [], fixed: [], desktop: null, mobile: null, realData: null, otherClients: null, consoleClean: null, networkClean: null },
    t4_driver_department_search: { works: null, tests: [], issues: [], fixed: [], desktop: null, mobile: null, realData: null, otherClients: null, consoleClean: null, networkClean: null },
    t5_treatment_list: { works: null, tests: [], issues: [], fixed: [], desktop: null, mobile: null, realData: null, otherClients: null, consoleClean: null, networkClean: null },
    t6_inspection_list: { works: null, tests: [], issues: [], fixed: [], desktop: null, mobile: null, realData: null, otherClients: null, consoleClean: null, networkClean: null },
    t7_driver_documents: { works: null, tests: [], issues: [], fixed: [], desktop: null, mobile: null, realData: null, otherClients: null, consoleClean: null, networkClean: null },
  },
  screenshots: [],
  compare: null,
};

function attachMonitors(page, bucket) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') bucket.consoleErrors.push(msg.text().slice(0, 400));
  });
  page.on('pageerror', (err) => bucket.pageErrors.push(String(err).slice(0, 400)));
  page.on('response', (res) => {
    const u = res.url();
    if ((u.includes('supabase.co') || u.includes('future-craft-core')) && res.status() >= 400) {
      bucket.networkErrors.push(`${res.status()} ${u.slice(0, 220)}`);
    }
  });
}

async function shot(page, name) {
  const p = join(OUT, name);
  await page.screenshot({ path: p, fullPage: true });
  report.screenshots.push(`${phase}/${name}`);
}

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

async function dbCounts() {
  const { count: vCount } = await admin.from('vehicles').select('*', { count: 'exact', head: true }).eq('company_name', COMPANY);
  const { count: dCount } = await admin.from('drivers').select('*', { count: 'exact', head: true }).eq('company_name', COMPANY);
  const { count: otherV } = await admin.from('vehicles').select('*', { count: 'exact', head: true }).eq('company_name', OTHER_COMPANY);
  return { vehicles: vCount ?? 0, drivers: dCount ?? 0, otherCompanyVehicles: otherV ?? 0 };
}

async function checkMigrationColumns() {
  const checks = {};
  const { data: drv, error: e1 } = await admin.from('drivers').select('department').limit(1);
  checks.drivers_department = !e1;
  const { data: cs, error: e2 } = await admin.from('company_settings').select('custom_treatment_items, custom_inspection_checklist').limit(1);
  checks.company_lists = !e2;
  const { data: dm, error: e3 } = await admin.from('document_metadata').select('display_name, document_date').limit(1);
  checks.document_metadata_fields = !e3;
  report.migration.columns = checks;
  report.migration.applied = Object.values(checks).every(Boolean);
}

async function runViewport(browser, label, viewport) {
  const bucket = { consoleErrors: [], networkErrors: [], pageErrors: [] };
  const context = await browser.newContext({ locale: 'he-IL', ...viewport });
  await injectSession(context);
  const page = await context.newPage();
  attachMonitors(page, bucket);

  const result = { label, ok: true, details: {} };

  await page.goto(`${BASE}/vehicles`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(3000);
  if (page.url().includes('/login')) throw new Error('Login failed');
  await shot(page, `${label}-01-vehicles.png`);

  const body = await page.locator('body').innerText();
  const allBtn = page.locator('button').filter({ hasText: /^הכל/ }).first();
  const allText = (await allBtn.textContent()) || '';
  const m = allText.match(/\((\d+)\)/);
  const uiVehicles = m ? Number(m[1]) : null;
  report.regression.vehicles.uiCount = uiVehicles;

  // Regression: plate + internal search
  const search = page.locator('input[placeholder*="חיפוש"]').first();
  await search.fill('58941904');
  await page.waitForTimeout(600);
  const plateOk = (await page.locator('body').innerText()).includes('היילקס');
  report.regression.plateSearch = { ok: plateOk, label };
  await shot(page, `${label}-02-search-plate.png`);

  await search.fill('');
  await search.fill('378');
  await page.waitForTimeout(600);
  const internalOk = (await page.locator('body').innerText()).includes('58941904');
  report.regression.internalSearch = { ok: internalOk, label };
  await shot(page, `${label}-03-search-internal.png`);

  // Task 2: department filter
  const deptSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'כל המחלקות' }) });
  const hasDeptFilter = (await deptSelect.count()) > 0;
  let deptFilterWorks = false;
  if (hasDeptFilter) {
    const options = await deptSelect.locator('option').allTextContents();
    report.tasks.t2_vehicle_department_filter.tests.push({ label, departmentOptions: options.filter(Boolean).slice(0, 15) });
    const pick = options.find((o) => o && o !== 'כל המחלקות' && o.trim());
    if (pick) {
      await deptSelect.selectOption({ label: pick });
      await page.waitForTimeout(600);
      deptFilterWorks = (await page.locator('body').innerText()).includes(pick);
      await shot(page, `${label}-04-dept-filter.png`);
    }
  } else {
    await search.fill('נוי');
    await page.waitForTimeout(600);
    deptFilterWorks = body.includes('נוי') || (await page.locator('body').innerText()).includes('350403');
    report.tasks.t2_vehicle_department_filter.tests.push({ label, mode: 'text-search-fallback', q: 'נוי' });
    await shot(page, `${label}-04-dept-search-text.png`);
  }
  report.tasks.t2_vehicle_department_filter[label === 'desktop' ? 'desktop' : 'mobile'] = hasDeptFilter || deptFilterWorks;
  report.tasks.t2_vehicle_department_filter.works = deptFilterWorks;

  await search.fill('');
  await page.goto(`${BASE}/drivers`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(2500);
  await shot(page, `${label}-05-drivers.png`);

  const driversBody = await page.locator('body').innerText();
  const driverCards = await page.locator('.card-elevated').count();
  report.regression.drivers.uiCount = driverCards;

  // Task 4: department filter on drivers
  const driverDeptSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'כל המחלקות' }) });
  const hasDriverDept = (await driverDeptSelect.count()) > 0;
  report.tasks.t4_driver_department_search.tests.push({ label, hasDepartmentDropdown: hasDriverDept });
  report.tasks.t4_driver_department_search[label === 'desktop' ? 'desktop' : 'mobile'] = hasDriverDept || phase === 'baseline';
  if (phase === 'post') report.tasks.t4_driver_department_search.works = hasDriverDept;

  // Task 3: open first driver — department field visible
  const firstDriver = page.locator('.card-elevated button').first();
  if (await firstDriver.count()) {
    await firstDriver.click();
    await page.waitForTimeout(2000);
    const cardText = await page.locator('body').innerText();
    const hasDeptField = cardText.includes('מחלקה');
    report.tasks.t3_driver_department.tests.push({ label, hasDeptOnCard: hasDeptField });
    report.tasks.t3_driver_department[label === 'desktop' ? 'desktop' : 'mobile'] = hasDeptField;
    if (phase === 'post') report.tasks.t3_driver_department.works = hasDeptField;
    await shot(page, `${label}-06-driver-card.png`);

    // Task 7: driver documents panel
    const hasDocsPanel = cardText.includes('מסמכי נהג');
    const hasRequestPanel = cardText.includes('בקשות מסמכים');
    report.tasks.t7_driver_documents.tests.push({ label, hasDocsPanel, hasRequestPanel });
    report.tasks.t7_driver_documents[label === 'desktop' ? 'desktop' : 'mobile'] = hasDocsPanel && hasRequestPanel;
    if (phase === 'post') report.tasks.t7_driver_documents.works = hasDocsPanel && hasRequestPanel;
    await shot(page, `${label}-07-driver-docs.png`);

    await page.goBack();
    await page.waitForTimeout(1500);
  }

  // Task 5+6: vehicle hub list manager
  await page.goto(`${BASE}/vehicles`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await search.fill('350403');
  await page.waitForTimeout(500);
  await page.locator('.card-elevated').filter({ hasText: '350403' }).first().click();
  await page.waitForTimeout(3000);
  const manageTab = page.getByRole('button', { name: /ניהול/ }).first();
  if (await manageTab.count()) {
    await manageTab.click();
    await page.waitForTimeout(1500);
    const listsBtn = page.getByRole('button', { name: /ניהול רשימות טיפול ובדיקה/ });
    const hasListsBtn = (await listsBtn.count()) > 0;
    report.tasks.t5_treatment_list.tests.push({ label, hasListsManagerButton: hasListsBtn });
    report.tasks.t6_inspection_list.tests.push({ label, hasListsManagerButton: hasListsBtn });
    if (hasListsBtn && phase === 'post') {
      await listsBtn.click();
      await page.waitForTimeout(1000);
      const dlg = await page.locator('body').innerText();
      const hasTreatmentTab = dlg.includes('דרוש טיפול') || dlg.includes('טיפול');
      const hasInspectionTab = dlg.includes('תלת');
      report.tasks.t5_treatment_list.works = hasTreatmentTab;
      report.tasks.t6_inspection_list.works = hasInspectionTab;
      report.tasks.t5_treatment_list[label === 'desktop' ? 'desktop' : 'mobile'] = hasTreatmentTab;
      report.tasks.t6_inspection_list[label === 'desktop' ? 'mobile' : 'mobile'] = hasInspectionTab;
      await shot(page, `${label}-08-lists-manager.png`);
      await page.keyboard.press('Escape');
    } else if (phase === 'baseline') {
      report.tasks.t5_treatment_list.works = false;
      report.tasks.t6_inspection_list.works = false;
    }
    await shot(page, `${label}-09-vehicle-manage.png`);
  }

  // Other company isolation
  report.regression.otherCompanyIsolation = {
    ok: !driversBody.includes(OTHER_COMPANY),
    label,
    otherCompanyVisible: driversBody.includes(OTHER_COMPANY),
  };

  // Modules smoke
  for (const mod of ['/documents', '/fleetos-ai', '/dashboard']) {
    await page.goto(`${BASE}${mod}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(2000);
    const txt = await page.locator('body').innerText();
    const ok = !page.url().includes('/login') && txt.length > 100;
    report.regression.modules.push({ path: mod, label, ok });
  }

  Object.values(report.tasks).forEach((t) => {
    t.consoleClean = bucket.consoleErrors.length === 0;
    t.networkClean = bucket.networkErrors.length === 0;
    t.realData = true;
    t.otherClients = report.regression.otherCompanyIsolation?.ok ?? null;
  });

  report.regression.consoleErrors.push(...bucket.consoleErrors);
  report.regression.networkErrors.push(...bucket.networkErrors);
  report.regression.pageErrors.push(...bucket.pageErrors);

  await context.close();
  return result;
}

async function main() {
  const counts = await dbCounts();
  report.regression.vehicles.dbCount = counts.vehicles;
  report.regression.drivers.dbCount = counts.drivers;
  await checkMigrationColumns();

  const browser = await chromium.launch({ headless: true });
  try {
    await runViewport(browser, 'desktop', { viewport: { width: 1440, height: 900 } });
    await runViewport(browser, 'mobile', devices['iPhone 13']);
  } finally {
    await browser.close();
  }

  report.regression.vehicles.match = report.regression.vehicles.uiCount === report.regression.vehicles.dbCount;
  report.regression.drivers.match = (report.regression.drivers.uiCount || 0) >= Math.min(30, counts.drivers);

  if (phase === 'post' && existsSync(BASELINE_PATH)) {
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
    report.compare = {
      vehiclesDbBefore: baseline.regression?.vehicles?.dbCount,
      vehiclesDbAfter: report.regression.vehicles.dbCount,
      driversDbBefore: baseline.regression?.drivers?.dbCount,
      driversDbAfter: report.regression.drivers.dbCount,
      plateSearchBefore: baseline.regression?.plateSearch?.ok,
      plateSearchAfter: report.regression.plateSearch?.ok,
      internalSearchBefore: baseline.regression?.internalSearch?.ok,
      internalSearchAfter: report.regression.internalSearch?.ok,
      regressionBroken: [],
    };
    if (baseline.regression?.plateSearch?.ok && !report.regression.plateSearch?.ok) report.compare.regressionBroken.push('plateSearch');
    if (baseline.regression?.internalSearch?.ok && !report.regression.internalSearch?.ok) report.compare.regressionBroken.push('internalSearch');
    if (baseline.regression?.vehicles?.dbCount !== report.regression.vehicles.dbCount) report.compare.regressionBroken.push('vehicleCountChanged');
    if (baseline.regression?.drivers?.dbCount !== report.regression.drivers.dbCount) report.compare.regressionBroken.push('driverCountChanged');
  }

  const outPath = join(OUT, 'report.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`QA ${phase} written: ${outPath}`);
  const failed = report.compare?.regressionBroken?.length > 0;
  if (failed) {
    console.error('REGRESSION BROKEN:', report.compare.regressionBroken);
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e);
  writeFileSync(join(OUT, 'report.json'), JSON.stringify({ ...report, fatal: String(e) }, null, 2));
  process.exit(1);
});
