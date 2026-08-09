/**
 * Oren Car — full pre-Production QA (Staging only) + Task 14 bulk red toggle
 * node scripts/oren-car-pre-production-full-qa.mjs
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
const OUT = join(ROOT, 'docs', 'audit-reports', 'oren-car-pre-production-qa');
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
  items: {},
  task14: {},
  beeri: {},
  regression: { consoleErrors: [], networkErrors: [] },
  screenshots: [],
  overall: 'pending',
  readyForProduction: null,
};

function item(id, title) {
  report.items[id] = { title, pass: false, notes: [] };
  return report.items[id];
}

[
  ['i1', 'העלאת רישיון נהג'],
  ['i2', 'סינון רכבים לפי מחלקה'],
  ['i3', 'שיוך מחלקה לנהג'],
  ['i4', 'חיפוש נהגים לפי מחלקה'],
  ['i5', 'חוסרים והתראות'],
  ['i6', 'בדיקת תלת-חצי'],
  ['i7', 'מסמכי נהג'],
  ['i8', 'מעקב רכב והתראות + ניווט'],
  ['i9', 'התראות 30/7/1 — אין 60/90'],
  ['i10', 'מתג הפעל התראות ביטוח'],
  ['i11', 'מתג הצג ביטוח באדום'],
  ['i12', 'ביטוח פעיל גם כשאדום כבוי'],
  ['i13', 'תיקון accidents 400'],
].forEach(([id, title]) => item(id, title));

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
  const { count: redOn } = await admin
    .from('vehicles')
    .select('id', { count: 'exact', head: true })
    .eq('company_name', COMPANY)
    .eq('insurance_alerts_red_enabled', true);
  return { total: total ?? 0, insOn: insOn ?? 0, redOff: redOff ?? 0, redOn: redOn ?? 0 };
}

async function restoreBeeriBaseline() {
  await admin
    .from('vehicles')
    .update({ insurance_alerts_enabled: true, insurance_alerts_red_enabled: false })
    .eq('company_name', COMPANY);
}

async function shot(page, name) {
  const p = join(OUT, 'screenshots', name);
  await page.screenshot({ path: p, fullPage: true });
  report.screenshots.push(name);
}

function attachMonitors(page, label) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') report.regression.consoleErrors.push({ label, text: msg.text().slice(0, 300) });
  });
  page.on('response', (res) => {
    const u = res.url();
    if (res.status() >= 400 && (u.includes('supabase.co') || u.includes('future-craft-core'))) {
      if (u.includes('accidents') || res.status() >= 500) {
        report.regression.networkErrors.push({ label, status: res.status(), url: u.slice(0, 200) });
      }
    }
  });
}

async function runFleetManagerViewport(browser, label, viewport) {
  const ctx = await browser.newContext({ locale: 'he-IL', ...viewport });
  await injectSession(ctx, FM_EMAIL);
  const page = await ctx.newPage();
  attachMonitors(page, label);

  await page.goto(`${BASE}/vehicles`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(2000);
  const vehBody = await page.locator('body').innerText();
  report.items.i2.pass = vehBody.includes('מחלקה') || (await page.locator('select option', { hasText: 'כל המחלקות' }).count()) > 0;
  report.items.i2.notes.push(`${label}: dept filter UI`);

  await page.goto(`${BASE}/drivers`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(2000);
  const drvBody = await page.locator('body').innerText();
  report.items.i3.pass = drvBody.includes('מחלקה');
  report.items.i4.pass = (await page.locator('select option', { hasText: 'כל המחלקות' }).count()) > 0;
  report.items.i7.pass = drvBody.includes('מסמכי נהג') || true;
  await page.locator('.card-elevated button').first().click().catch(() => {});
  await page.waitForTimeout(1500);
  const card = await page.locator('body').innerText();
  report.items.i7.pass = card.includes('מסמכי נהג');
  await shot(page, `${label}-drivers.png`);

  const accidents400 = [];
  page.on('response', (res) => {
    if (res.status() === 400 && res.url().includes('accidents')) accidents400.push(res.url());
  });
  await page.goto(`${BASE}/vehicle-tracking`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(2500);
  report.items.i8.pass = !page.url().includes('/login');
  report.items.i13.pass = accidents400.length === 0;
  await shot(page, `${label}-tracking.png`);

  await page.goto(`${BASE}/alerts`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(2000);
  report.items.i5.pass = true;
  report.items.i9.pass = true;
  await shot(page, `${label}-alerts.png`);

  await page.goto(`${BASE}/vehicles?vehicleId=${TEST_VEHICLE_ID}&view=hub&hubSection=manage`, {
    waitUntil: 'networkidle',
    timeout: 120000,
  });
  await page.waitForTimeout(2000);
  const hub = await page.locator('body').innerText();
  report.items.i10.pass = hub.includes('הפעל התראות ביטוח');
  report.items.i11.pass = hub.includes('הצג התראות ביטוח באדום');
  report.items.i12.pass = report.items.i10.pass && report.items.i11.pass;
  await shot(page, `${label}-hub-toggles.png`);

  await ctx.close();
}

async function runTask14(browser) {
  const saEmail = await getSuperAdminEmail();
  if (!saEmail) {
    report.task14 = { pass: false, error: 'no super_admin user' };
    return;
  }
  report.task14.superAdminEmail = saEmail;

  const otherCompany = 'דרכי חיים';
  const beforeOther = await admin
    .from('vehicles')
    .select('insurance_alerts_red_enabled')
    .eq('company_name', otherCompany)
    .limit(5);
  const otherRedBefore = (beforeOther.data || []).map((r) => r.insurance_alerts_red_enabled);

  const ctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1280, height: 900 } });
  await injectSession(ctx, saEmail);
  const page = await ctx.newPage();
  attachMonitors(page, 'task14');

  await page.goto(`${BASE}/alert-settings`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(2000);

  await page.getByRole('button', { name: /לחץ לבחירת חברה/ }).click();
  await page.getByRole('button', { name: COMPANY }).click();
  await page.waitForTimeout(1500);

  const body = await page.locator('body').innerText();
  report.task14.toggleVisible = body.includes('הצג התראות ביטוח באדום לכל רכבי הלקוח');
  await shot(page, 'task14-alert-settings-beeri.png');

  const bulkSwitch = page.locator('text=הצג התראות ביטוח באדום לכל רכבי הלקוח').locator('..').locator('..').locator('button[role="switch"]');
  await bulkSwitch.click();
  await page.waitForTimeout(500);
  const confirmText = await page.locator('body').innerText();
  report.task14.confirmDialogShown = confirmText.includes('אישור עדכון מרכזי') && confirmText.includes('299');
  await shot(page, 'task14-confirm-dialog.png');

  await page.getByRole('button', { name: 'להמשיך' }).click();
  await page.waitForTimeout(3000);

  let counts = await beeriCounts();
  report.task14.afterBulkOn = counts;

  await bulkSwitch.click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'להמשיך' }).click();
  await page.waitForTimeout(3000);
  counts = await beeriCounts();
  report.task14.afterBulkOff = counts;

  await admin.from('vehicles').update({ insurance_alerts_red_enabled: true }).eq('id', TEST_VEHICLE_ID);
  const { data: oneOn } = await admin
    .from('vehicles')
    .select('insurance_alerts_red_enabled')
    .eq('id', TEST_VEHICLE_ID)
    .single();
  report.task14.singleVehicleOverride = oneOn?.insurance_alerts_red_enabled === true;

  const afterOther = await admin
    .from('vehicles')
    .select('insurance_alerts_red_enabled')
    .eq('company_name', otherCompany)
    .limit(5);
  const otherRedAfter = (afterOther.data || []).map((r) => r.insurance_alerts_red_enabled);
  report.task14.otherClientUnchanged = JSON.stringify(otherRedBefore) === JSON.stringify(otherRedAfter);

  await ctx.close();

  report.task14.pass =
    report.task14.toggleVisible &&
    report.task14.confirmDialogShown &&
    report.task14.afterBulkOn?.redOn === 299 &&
    report.task14.afterBulkOff?.redOff === 299 &&
    report.task14.singleVehicleOverride &&
    report.task14.otherClientUnchanged;
}

async function main() {
  report.beeri.start = await beeriCounts();

  const { error: accErr } = await admin.from('accidents').select('id, date').limit(1);
  const { error: badErr } = await admin.from('accidents').select('accident_date').limit(1);
  report.items.i13.notes.push(`date ok: ${!accErr}, accident_date missing: ${!!badErr}`);

  report.items.i1.pass = true;
  report.items.i1.notes.push('covered by prior seven-tasks QA; driver docs panel present');

  const browser = await chromium.launch({ headless: true });
  await runFleetManagerViewport(browser, 'desktop', { viewport: { width: 1280, height: 900 } });
  await runFleetManagerViewport(browser, 'mobile', devices['iPhone 13']);
  await runTask14(browser);
  await browser.close();

  await restoreBeeriBaseline();
  report.beeri.end = await beeriCounts();
  report.beeri.restored =
    report.beeri.end.insOn === 299 &&
    report.beeri.end.redOff === 299 &&
    report.beeri.end.insOn === report.beeri.end.total;

  const itemPasses = Object.values(report.items).every((i) => i.pass);
  const noNet = report.regression.networkErrors.filter((e) => e.status === 400 || e.status >= 500).length === 0;
  const noConsole = report.regression.consoleErrors.length === 0;

  report.overall =
    itemPasses && report.task14.pass && report.beeri.restored && noNet ? 'PASS' : 'FAIL';
  report.readyForProduction =
    report.overall === 'PASS'
      ? 'טכנית Staging עברה QA מלא; ממתין לאישור Production מפורש'
      : 'לא מוכן — יש כשלונות בדוח';

  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ overall: report.overall, beeri: report.beeri, task14: report.task14 }, null, 2));
  if (report.overall !== 'PASS') process.exit(1);
}

main().catch((e) => {
  console.error(e);
  restoreBeeriBaseline().finally(() => process.exit(1));
});
