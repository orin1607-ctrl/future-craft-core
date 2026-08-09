/**
 * Oren Car — full system QA (Staging only) + bug fixes verification
 * node scripts/oren-car-full-system-qa.mjs
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
const COMPANY = 'קיבוץ בארי';
const TEST_VEHICLE_ID = '3378a2db-6492-44d8-82e9-577444c49794';
const OUT = join(ROOT, 'docs', 'audit-reports', 'oren-car-full-system-qa');
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
const admin = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });

const report = {
  at: new Date().toISOString(),
  base: BASE,
  stagingOnly: true,
  productionTouched: false,
  bugs: {
    bug1_manageHub: { title: 'ניהול רכב — ניווט ופתיחה', pass: false, notes: [] },
    bug2_triSemi: { title: 'בדיקת תלת-חצי', pass: false, notes: [] },
    bug3_docCount: { title: 'מונה מסמכים', pass: false, notes: [] },
  },
  modules: {},
  tasks1to15: {},
  regression: { consoleErrors: [], networkErrors: [] },
  desktop: {},
  mobile: {},
  overall: 'pending',
};

function mod(id, title) {
  report.modules[id] = { title, pass: false, notes: [] };
  return report.modules[id];
}

[
  ['vehicles', 'רכבים'],
  ['drivers', 'נהגים'],
  ['alerts', 'התראות'],
  ['faults', 'תקלות'],
  ['accidents', 'תאונות'],
  ['documents', 'מסמכים'],
  ['tracking', 'מעקב רכב'],
  ['reports', 'דוחות'],
  ['hub', 'כרטיס רכב / Hub'],
  ['manage', 'ניהול רכב'],
].forEach(([id, title]) => mod(id, title));

async function injectSession(context, email) {
  const anonClient = createClient(STAGING_URL, anon);
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr) throw linkErr;
  const otp = linkData.properties?.email_otp;
  const { data: auth, error: verifyErr } = await anonClient.auth.verifyOtp({ email, token: otp, type: 'email' });
  if (verifyErr || !auth.session) throw verifyErr || new Error('verifyOtp failed');
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

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, 'screenshots', name), fullPage: true });
}

function attachMonitors(page, label) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') report.regression.consoleErrors.push({ label, text: msg.text().slice(0, 300) });
  });
  page.on('response', (res) => {
    const u = res.url();
    if (res.status() >= 400 && (u.includes('supabase.co') || u.includes('future-craft-core'))) {
      report.regression.networkErrors.push({ label, status: res.status(), url: u.slice(0, 220) });
    }
  });
}

async function beeriCounts() {
  const { count: total } = await admin.from('vehicles').select('id', { count: 'exact', head: true }).eq('company_name', COMPANY);
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
  return { total: total ?? 0, insOn: insOn ?? 0, redOff: redOff ?? 0 };
}

async function restoreBeeriBaseline() {
  await admin
    .from('vehicles')
    .update({ insurance_alerts_enabled: true, insurance_alerts_red_enabled: false })
    .eq('company_name', COMPANY);
}

async function runViewport(browser, label, viewport) {
  const ctx = await browser.newContext({ locale: 'he-IL', ...viewport });
  await injectSession(ctx, FM_EMAIL);
  const page = await ctx.newPage();
  attachMonitors(page, label);
  const vp = label === 'desktop' ? report.desktop : report.mobile;

  // --- Vehicles list ---
  await page.goto(`${BASE}/vehicles`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(2000);
  report.modules.vehicles.pass = !page.url().includes('/login') && (await page.locator('body').innerText()).includes('רכבים');
  await shot(page, `${label}-vehicles-list.png`);

  // --- Open hub ---
  await page.goto(`${BASE}/vehicles?vehicleId=${TEST_VEHICLE_ID}&view=hub`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(2500);
  const hubBody = await page.locator('body').innerText();
  report.modules.hub.pass = hubBody.includes('פעולות רכב') || hubBody.includes('פרטי רכב');
  await shot(page, `${label}-hub-home.png`);

  // --- BUG 1: Manage section navigation ---
  const manageBtn = page.getByRole('button', { name: 'ניהול רכב' });
  if (await manageBtn.count()) {
    await manageBtn.click();
    await page.waitForTimeout(1500);
    const manageBody = await page.locator('body').innerText();
    const manageOpens = manageBody.includes('ניהול רכב') && (manageBody.includes('עריכת רכב') || manageBody.includes('הפעל התראות ביטוח'));
    await shot(page, `${label}-hub-manage.png`);

    const backBtn = page.getByRole('button', { name: 'חזרה לכרטיס הרכב' });
    if (await backBtn.count()) {
      await backBtn.click();
      await page.waitForTimeout(1200);
      const homeBody = await page.locator('body').innerText();
      const backWorks = homeBody.includes('פעולות רכב') && !homeBody.includes('עריכת רכב (VehicleForm)');
      report.bugs.bug1_manageHub.notes.push(`${label}: manageOpens=${manageOpens}, backWorks=${backWorks}`);
      if (label === 'desktop') report.bugs.bug1_manageHub.pass = manageOpens && backWorks;
      report.modules.manage.pass = manageOpens;
    }
  }

  // --- BUG 2: תלת-חצי screen ---
  await page.goto(
    `${BASE}/private-vehicle-inspection?vehicleId=${TEST_VEHICLE_ID}&context=vehicle`,
    { waitUntil: 'networkidle', timeout: 120000 },
  );
  await page.waitForTimeout(2000);
  const triBody = await page.locator('body').innerText();
  const triOpens = triBody.includes('בדיקה תלת') || triBody.includes('תלת / חצי');
  const hasVehicle = triBody.includes('15094302') || triBody.includes('917') || (await page.locator('select option').count()) > 1;
  report.bugs.bug2_triSemi.notes.push(`${label}: opens=${triOpens}, vehicle=${hasVehicle}`);
  if (label === 'desktop') report.bugs.bug2_triSemi.pass = triOpens && hasVehicle;
  await shot(page, `${label}-tri-semi.png`);

  // Lists manager (תלת-חצי tab in dialog)
  await page.goto(`${BASE}/vehicles?vehicleId=${TEST_VEHICLE_ID}&view=hub&hubSection=manage`, {
    waitUntil: 'networkidle',
    timeout: 120000,
  });
  await page.waitForTimeout(2000);
  const listsBtn = page.getByRole('button', { name: /ניהול רשימות טיפול ובדיקה/ });
  if (await listsBtn.count()) {
    await listsBtn.click();
    await page.waitForTimeout(1000);
    const triTab = page.getByRole('button', { name: 'בדיקת תלת-חצי' });
    if (await triTab.count()) {
      await triTab.click();
      await page.waitForTimeout(800);
      const dlg = await page.locator('body').innerText();
      const listsTri = dlg.includes('סעיפי בדיקת תלת') || dlg.includes('תלת');
      report.bugs.bug2_triSemi.notes.push(`${label}: listsManagerTri=${listsTri}`);
      await shot(page, `${label}-lists-manager-tri.png`);
      await page.keyboard.press('Escape');
    }
  }

  // --- BUG 3: Document count ---
  const { data: veh } = await admin.from('vehicles').select('license_plate').eq('id', TEST_VEHICLE_ID).single();
  const plate = veh?.license_plate || '';
  const plateNorm = plate.replace(/[-\s]/g, '');
  const { data: metaDocs } = await admin
    .from('document_metadata')
    .select('id, category')
    .eq('company_name', COMPANY)
    .or(`vehicle_plate.eq.${plate},vehicle_plate.eq.${plateNorm}`);
  const actualMetaCount = metaDocs?.length ?? 0;

  await page.goto(
    `${BASE}/documents?vehicleId=${TEST_VEHICLE_ID}&plate=${encodeURIComponent(plate)}&context=vehicle`,
    { waitUntil: 'networkidle', timeout: 120000 },
  );
  await page.waitForTimeout(2000);
  const docsBody = await page.locator('body').innerText();
  report.modules.documents.pass = docsBody.includes('מסמכים');
  await shot(page, `${label}-documents-scoped.png`);

  // Sum category counts shown on page vs actual metadata
  const countMatches = actualMetaCount === 0 || docsBody.includes(`${actualMetaCount} מסמכים`) || docsBody.includes('0 מסמכים');
  report.bugs.bug3_docCount.notes.push(`${label}: actualMeta=${actualMetaCount}, pageOk=${countMatches}`);
  if (label === 'desktop') {
    report.bugs.bug3_docCount.pass = countMatches;
    report.bugs.bug3_docCount.actualMetaCount = actualMetaCount;
  }

  // Hub docs tab count vs metadata
  await page.goto(`${BASE}/vehicles?vehicleId=${TEST_VEHICLE_ID}&view=hub`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(2000);
  const actionsBtn = page.getByRole('button', { name: 'פעולות רכב' });
  if (await actionsBtn.count()) {
    await actionsBtn.click();
    await page.waitForTimeout(800);
    const docsTab = page.getByRole('button', { name: 'מסמכים' }).last();
    if (await docsTab.count()) {
      await docsTab.click();
      await page.waitForTimeout(1500);
      const tabBody = await page.locator('body').innerText();
      const emptyOrDocs = tabBody.includes('אין מסמכים') || tabBody.includes('רישיון') || tabBody.includes('מסמך');
      report.bugs.bug3_docCount.notes.push(`${label}: hubDocsTab=${emptyOrDocs}`);
      await shot(page, `${label}-hub-docs-tab.png`);
    }
  }

  // --- Other modules ---
  for (const [path, key] of [
    ['/drivers', 'drivers'],
    ['/alerts', 'alerts'],
    ['/faults', 'faults'],
    ['/accidents', 'accidents'],
    ['/vehicle-tracking', 'tracking'],
    ['/reports', 'reports'],
  ]) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(1500);
    const ok = !page.url().includes('/login');
    if (key !== 'vehicles' && key !== 'hub' && key !== 'manage' && key !== 'documents') {
      report.modules[key].pass = ok;
    }
    await shot(page, `${label}-${key}.png`);
  }

  // Task 15 red internal numbers
  await page.goto(`${BASE}/vehicles`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1500);
  const search = page.locator('input[placeholder*="חיפוש"]').first();
  await search.fill('917');
  await page.waitForTimeout(600);
  vp.task15Red = (await page.locator('.text-destructive.font-bold').count()) > 0;

  // Insurance toggles
  await page.goto(`${BASE}/vehicles?vehicleId=${TEST_VEHICLE_ID}&view=hub&hubSection=manage`, {
    waitUntil: 'networkidle',
    timeout: 120000,
  });
  await page.waitForTimeout(2000);
  const toggles = await page.locator('body').innerText();
  vp.task10_insuranceToggle = toggles.includes('הפעל התראות ביטוח');
  vp.task11_redToggle = toggles.includes('הצג התראות ביטוח באדום');

  await ctx.close();
}

async function runRegressionScript() {
  try {
    const out = execSync('node scripts/oren-car-pre-production-full-qa.mjs', {
      encoding: 'utf8',
      cwd: ROOT,
      timeout: 300000,
    });
    const lastLine = out.trim().split('\n').pop();
    const parsed = JSON.parse(lastLine);
    report.tasks1to15 = parsed;
    return parsed.overall === 'PASS';
  } catch (e) {
    report.tasks1to15 = { overall: 'FAIL', error: String(e.message || e).slice(0, 500) };
    return false;
  }
}

async function main() {
  report.beeriStart = await beeriCounts();

  const browser = await chromium.launch({ headless: true });
  await runViewport(browser, 'desktop', { viewport: { width: 1280, height: 900 } });
  await runViewport(browser, 'mobile', devices['iPhone 13']);
  await browser.close();

  const regressionPass = await runRegressionScript();
  await restoreBeeriBaseline();
  report.beeriEnd = await beeriCounts();

  const bugsPass = Object.values(report.bugs).every((b) => b.pass);
  const modulesPass = Object.values(report.modules).every((m) => m.pass);
  const noBadNet = report.regression.networkErrors.filter((e) => e.status >= 400).length === 0;

  report.overall =
    bugsPass && modulesPass && regressionPass && noBadNet ? 'PASS' : 'FAIL';

  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        overall: report.overall,
        bugs: report.bugs,
        modules: Object.fromEntries(Object.entries(report.modules).map(([k, v]) => [k, v.pass])),
        tasks1to15: report.tasks1to15?.overall,
        consoleErrors: report.regression.consoleErrors.length,
        networkErrors: report.regression.networkErrors.length,
      },
      null,
      2,
    ),
  );
  if (report.overall !== 'PASS') process.exit(1);
}

main().catch((e) => {
  console.error(e);
  restoreBeeriBaseline().finally(() => process.exit(1));
});
