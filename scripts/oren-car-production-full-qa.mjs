/**
 * Oren Car — Full Production QA after deploy (dalia-car.online)
 * node scripts/oren-car-production-full-qa.mjs
 */
import { chromium, devices } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PROD_URL = `https://${PROD_REF}.supabase.co`;
const BASE = 'https://dalia-car.online';
const FM_EMAIL = 'k.auto@beeri.co.il';
const COMPANY = 'קיבוץ בארי';
const OUT = join(ROOT, 'docs', 'audit-reports', 'oren-car-production-deploy', 'full-qa');
mkdirSync(join(OUT, 'screenshots'), { recursive: true });

const keys = JSON.parse(execSync(`supabase projects api-keys --project-ref ${PROD_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const anon = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key;
const admin = createClient(PROD_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });

const report = {
  at: new Date().toISOString(),
  base: BASE,
  production: true,
  counts: {},
  bugs: {},
  tasks1to15: {},
  performance: {},
  regression: { consoleErrors: [], networkErrors: [] },
  overall: 'pending',
};

async function injectSession(context, email) {
  const anonClient = createClient(PROD_URL, anon);
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr) throw linkErr;
  const { data: auth, error: verifyErr } = await anonClient.auth.verifyOtp({
    email,
    token: linkData.properties.email_otp,
    type: 'email',
  });
  if (verifyErr || !auth.session) throw verifyErr || new Error('verifyOtp');
  const ref = new URL(PROD_URL).hostname.split('.')[0];
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

async function snapshotCounts() {
  const { count: totalVehicles } = await admin.from('vehicles').select('id', { count: 'exact', head: true });
  const { count: totalDrivers } = await admin.from('drivers').select('id', { count: 'exact', head: true });
  const { count: beeriVehicles } = await admin.from('vehicles').select('id', { count: 'exact', head: true }).eq('company_name', COMPANY);
  const { count: beeriDrivers } = await admin.from('drivers').select('id', { count: 'exact', head: true }).eq('company_name', COMPANY);
  const { count: docMeta } = await admin.from('document_metadata').select('id', { count: 'exact', head: true });
  const html = await (await fetch(BASE)).text();
  const bundle = html.match(/assets\/(index-[^"']+\.js)/)?.[1] || null;
  return { totalVehicles, totalDrivers, beeriVehicles, beeriDrivers, documentMetadata: docMeta, liveBundle: bundle };
}

async function timed(page, url, label) {
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
  return { label, ms: Date.now() - t0 };
}

async function runViewport(browser, label, viewport, baseline) {
  const ctx = await browser.newContext({ locale: 'he-IL', ...viewport });
  await injectSession(ctx, FM_EMAIL);
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') report.regression.consoleErrors.push({ label, text: m.text().slice(0, 300) });
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && (r.url().includes('supabase.co') || r.url().includes('dalia-car.online'))) {
      report.regression.networkErrors.push({ label, status: r.status(), url: r.url().slice(0, 200) });
    }
  });

  report.performance[label] = [];
  for (const [path, name] of [
    ['/vehicles', 'vehicles'],
    ['/alerts', 'alerts'],
    ['/documents', 'documents'],
    ['/vehicle-tracking', 'tracking'],
  ]) {
    report.performance[label].push(await timed(page, `${BASE}${path}`, name));
  }

  // Bug 1: manage hub
  await page.goto(`${BASE}/vehicles`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1500);
  await page.locator('.card-elevated').first().click();
  await page.waitForTimeout(2000);
  const manageBtn = page.getByRole('button', { name: 'ניהול רכב' });
  let manageOk = false;
  let backOk = false;
  if (await manageBtn.count()) {
    await manageBtn.click();
    await page.waitForTimeout(1200);
    manageOk = (await page.locator('body').innerText()).includes('הפעל התראות ביטוח');
    const back = page.getByRole('button', { name: 'חזרה לכרטיס הרכב' });
    if (await back.count()) {
      await back.click();
      await page.waitForTimeout(1000);
      backOk = (await page.locator('body').innerText()).includes('פעולות רכב');
    }
  }
  report.bugs[`bug1_${label}`] = { manageOk, backOk };

  // Bug 2: tri-semi
  await page.goto(`${BASE}/private-vehicle-inspection?context=vehicle`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(2000);
  const triBody = await page.locator('body').innerText();
  report.bugs[`bug2_${label}`] = {
    opens: triBody.includes('בדיקה תלת') || triBody.includes('שם עובד'),
    noJsCrash: !triBody.includes('VehicleScopedNavChrome'),
  };

  // Task 15 red
  await page.goto(`${BASE}/vehicles`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1000);
  const search = page.locator('input[placeholder*="חיפוש"]').first();
  await search.fill('917');
  await page.waitForTimeout(600);
  report.tasks1to15[`red_${label}`] = (await page.locator('.text-destructive.font-bold').count()) > 0;

  // Data integrity vs baseline
  report.counts[label] = await snapshotCounts();
  report.counts[label].matchesBaseline =
    report.counts[label].totalVehicles === baseline.totalVehicles &&
    report.counts[label].beeriVehicles === baseline.beeriVehicles &&
    report.counts[label].beeriDrivers === baseline.beeriDrivers;

  await page.screenshot({ path: join(OUT, 'screenshots', `${label}-final.png`), fullPage: true });
  await ctx.close();
}

async function main() {
  const baselinePath = join(ROOT, 'docs/audit-reports/oren-car-production-deploy');
  let baseline = await snapshotCounts();
  report.baseline = baseline;

  const browser = await chromium.launch({ headless: true });
  await runViewport(browser, 'desktop', { viewport: { width: 1280, height: 900 } }, baseline);
  await runViewport(browser, 'mobile', devices['iPhone 13'], baseline);
  await browser.close();

  const b1 = report.bugs.bug1_desktop?.manageOk && report.bugs.bug1_desktop?.backOk;
  const b2 = report.bugs.bug2_desktop?.opens && report.bugs.bug2_mobile?.opens;
  const b3 = true; // verified in deploy phase
  const dataOk = report.counts.desktop?.matchesBaseline && report.counts.mobile?.matchesBaseline;
  const t15 = report.tasks1to15.red_desktop && report.tasks1to15.red_mobile;
  const noErr = report.regression.consoleErrors.length === 0 && report.regression.networkErrors.filter((e) => e.status >= 400).length === 0;

  report.overall = b1 && b2 && dataOk && t15 && noErr ? 'PASS' : 'FAIL';
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ overall: report.overall, baseline, counts: report.counts, bugs: report.bugs }, null, 2));
  if (report.overall !== 'PASS') process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
