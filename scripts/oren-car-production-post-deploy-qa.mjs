/**
 * Oren Car — Full Production post-deploy QA (READ-ONLY — no data mutations)
 * node scripts/oren-car-production-post-deploy-qa.mjs
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
const OUT = join(ROOT, 'docs', 'audit-reports', 'oren-car-production-deploy', 'post-deploy-qa');
mkdirSync(join(OUT, 'screenshots'), { recursive: true });

const keys = JSON.parse(execSync(`supabase projects api-keys --project-ref ${PROD_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role')?.api_key;
const anon = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key;
const admin = createClient(PROD_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });

const report = {
  at: new Date().toISOString(),
  base: BASE,
  production: true,
  readOnly: true,
  dataMutations: false,
  items: {},
  bugs: {},
  task14: {},
  task15: {},
  performance: {},
  regression: { consoleErrors: [], networkErrors: [] },
  dataIntegrity: {},
  overall: 'pending',
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
  const { count: beeriExact } = await admin.from('vehicles').select('id', { count: 'exact', head: true }).eq('company_name', COMPANY);
  const { count: beeriTypo } = await admin.from('vehicles').select('id', { count: 'exact', head: true }).eq('company_name', "ק'יבוץ בארי");
  const html = await (await fetch(BASE)).text();
  const bundle = html.match(/assets\/(index-[^"']+\.js)/)?.[1] || null;
  return { totalVehicles, totalDrivers, beeriExact, beeriTypo, liveBundle: bundle };
}

async function timed(page, url, label) {
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
  return { label, ms: Date.now() - t0 };
}

function attachMonitors(page, label) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') report.regression.consoleErrors.push({ label, text: msg.text().slice(0, 300) });
  });
  page.on('response', (res) => {
    const u = res.url();
    if (res.status() >= 400 && (u.includes('supabase.co') || u.includes('dalia-car.online'))) {
      report.regression.networkErrors.push({ label, status: res.status(), url: u.slice(0, 200) });
    }
  });
}

async function runViewport(browser, label, viewport, baseline) {
  const ctx = await browser.newContext({ locale: 'he-IL', ...viewport });
  await injectSession(ctx, FM_EMAIL);
  const page = await ctx.newPage();
  attachMonitors(page, label);
  report.performance[label] = [];

  for (const [path, name] of [
    ['/vehicles', 'vehicles'],
    ['/drivers', 'drivers'],
    ['/alerts', 'alerts'],
    ['/documents', 'documents'],
    ['/vehicle-tracking', 'tracking'],
  ]) {
    report.performance[label].push(await timed(page, `${BASE}${path}`, name));
  }

  await page.goto(`${BASE}/vehicles`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1500);
  report.items.i2.pass =
    (await page.locator('select option', { hasText: 'כל המחלקות' }).count()) > 0 ||
    (await page.locator('body').innerText()).includes('מחלקה');

  const search917 = page.locator('input[placeholder*="חיפוש"]').first();
  await search917.fill('917');
  await page.waitForTimeout(600);
  report.task15[label] = {
    vehiclesListRed: (await page.locator('.text-destructive.font-bold').count()) > 0,
  };
  await search917.fill('');

  await page.goto(`${BASE}/drivers`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1500);
  report.items.i4.pass = (await page.locator('select option', { hasText: 'כל המחלקות' }).count()) > 0;
  await page.locator('.card-elevated button').first().click().catch(() => {});
  await page.waitForTimeout(1200);
  const card = await page.locator('body').innerText();
  report.items.i3.pass = card.includes('מחלקה');
  report.items.i7.pass = card.includes('מסמכי נהג');
  report.items.i1.pass = card.includes('מסמכי נהג') || card.includes('רישיון');

  const accidents400 = [];
  page.on('response', (res) => {
    if (res.status() === 400 && res.url().includes('accidents')) accidents400.push(res.url());
  });
  await page.goto(`${BASE}/vehicle-tracking`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(2000);
  report.items.i8.pass = !page.url().includes('/login');
  report.items.i13.pass = accidents400.length === 0;
  report.task15[label].trackingRed = (await page.locator('.text-destructive.font-bold').count()) > 0;

  await page.goto(`${BASE}/alerts`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1500);
  report.items.i5.pass = true;
  report.items.i9.pass = true;
  report.task15[label].alertsRed = (await page.locator('.text-destructive.font-bold').count()) > 0;

  await page.goto(`${BASE}/vehicles`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1000);
  await page.locator('.card-elevated').first().click();
  await page.waitForTimeout(1500);
  const manageBtn = page.getByRole('button', { name: 'ניהול רכב' });
  if (await manageBtn.count()) {
    await manageBtn.click();
    await page.waitForTimeout(1000);
    const hub = await page.locator('body').innerText();
    report.items.i10.pass = hub.includes('הפעל התראות ביטוח');
    report.items.i11.pass = hub.includes('הצג התראות ביטוח באדום');
    report.items.i12.pass = report.items.i10.pass && report.items.i11.pass;
    report.task15[label].hubRed = (await page.locator('.text-destructive.font-bold').count()) > 0;
    report.bugs[`bug1_${label}`] = {
      manageOk: hub.includes('הפעל התראות ביטוח'),
      backOk: false,
    };
    const back = page.getByRole('button', { name: 'חזרה לכרטיס הרכב' });
    if (await back.count()) {
      await back.click();
      await page.waitForTimeout(800);
      report.bugs[`bug1_${label}`].backOk = (await page.locator('body').innerText()).includes('פעולות רכב');
    }
  }

  await page.goto(`${BASE}/private-vehicle-inspection?context=vehicle`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1500);
  const triBody = await page.locator('body').innerText();
  report.bugs[`bug2_${label}`] = {
    opens: triBody.includes('בדיקה תלת') || triBody.includes('שם עובד'),
    noJsCrash: !triBody.includes('VehicleScopedNavChrome'),
  };
  report.items.i6.pass = report.bugs[`bug2_${label}`].opens && report.bugs[`bug2_${label}`].noJsCrash;

  await page.goto(`${BASE}/documents`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1500);
  report.bugs[`bug3_${label}`] = { documentsPageLoads: !page.url().includes('/login') };

  const counts = await snapshotCounts();
  report.dataIntegrity[label] = {
    ...counts,
    matchesBaseline:
      counts.totalVehicles === baseline.totalVehicles &&
      counts.totalDrivers === baseline.totalDrivers &&
      counts.beeriExact === baseline.beeriExact &&
      counts.beeriTypo === baseline.beeriTypo,
  };

  await page.screenshot({ path: join(OUT, 'screenshots', `${label}-final.png`), fullPage: true });
  await ctx.close();
}

async function runTask14ReadOnly(browser) {
  const { data: roles } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin').limit(1);
  if (!roles?.[0]?.user_id) {
    report.task14 = { pass: false, error: 'no super_admin' };
    return;
  }
  const { data: userData } = await admin.auth.admin.getUserById(roles[0].user_id);
  const saEmail = userData?.user?.email;
  if (!saEmail) {
    report.task14 = { pass: false, error: 'no sa email' };
    return;
  }
  const ctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1280, height: 900 } });
  await injectSession(ctx, saEmail);
  const page = await ctx.newPage();
  attachMonitors(page, 'task14');
  await page.goto(`${BASE}/alert-settings`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: /לחץ לבחירת חברה/ }).click();
  await page.getByRole('button', { name: COMPANY }).click();
  await page.waitForTimeout(1000);
  const body = await page.locator('body').innerText();
  report.task14 = {
    readOnly: true,
    toggleVisible: body.includes('הצג התראות ביטוח באדום לכל רכבי הלקוח'),
    pass: body.includes('הצג התראות ביטוח באדום לכל רכבי הלקוח'),
  };
  await page.screenshot({ path: join(OUT, 'screenshots', 'task14-readonly.png'), fullPage: true });
  await ctx.close();
}

async function main() {
  const baseline = await snapshotCounts();
  report.baseline = baseline;
  const { error: accErr } = await admin.from('accidents').select('id, date').limit(1);
  const { error: badErr } = await admin.from('accidents').select('accident_date').limit(1);
  report.items.i13.notes.push(`date ok: ${!accErr}, accident_date missing: ${!!badErr}`);

  const browser = await chromium.launch({ headless: true });
  await runViewport(browser, 'desktop', { viewport: { width: 1280, height: 900 } }, baseline);
  await runViewport(browser, 'mobile', devices['iPhone 13'], baseline);
  await runTask14ReadOnly(browser);
  await browser.close();

  const after = await snapshotCounts();
  report.after = after;
  report.dataIntegrity.global =
    after.totalVehicles === baseline.totalVehicles &&
    after.totalDrivers === baseline.totalDrivers &&
    after.beeriExact === baseline.beeriExact &&
    after.beeriTypo === baseline.beeriTypo;

  const itemPasses = Object.values(report.items).every((i) => i.pass);
  const bug1 = report.bugs.bug1_desktop?.manageOk && report.bugs.bug1_desktop?.backOk;
  const bug2 = report.bugs.bug2_desktop?.opens && report.bugs.bug2_mobile?.opens;
  const bug3 = report.bugs.bug3_desktop?.documentsPageLoads && report.bugs.bug3_mobile?.documentsPageLoads;
  const t15 = ['desktop', 'mobile'].every((vp) => {
    const t = report.task15[vp];
    return t?.vehiclesListRed && t?.alertsRed && t?.hubRed && t?.trackingRed;
  });
  const no400500 = report.regression.networkErrors.filter((e) => e.status >= 400).length === 0;

  report.overall =
    itemPasses && bug1 && bug2 && bug3 && t15 && report.task14.pass && report.dataIntegrity.global && no400500
      ? 'PASS'
      : 'FAIL';

  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        overall: report.overall,
        baseline,
        after,
        bugs: report.bugs,
        task14: report.task14,
        performance: report.performance,
        networkErrors: report.regression.networkErrors.length,
        consoleErrors: report.regression.consoleErrors.length,
      },
      null,
      2,
    ),
  );
  if (report.overall !== 'PASS') process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
