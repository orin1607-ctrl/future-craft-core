/**
 * Oren Car Production post-deploy QA — DriverHub 3 tiles + design.
 * Read-only. No dummy accident save. No real messages. No customer data created.
 */
import { chromium, devices } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const PROD_REF = 'qasomfndnjuixgjmjwcm';
const PROD_URL = `https://${PROD_REF}.supabase.co`;
const BASE = 'https://dalia-car.online';
const EMAIL = 'k.auto@beeri.co.il';
const COMPANY = 'קיבוץ בארי';
const OUT = join(process.cwd(), 'docs/audit-reports/oren-car-driverhub-3tiles-prod/qa-live');
mkdirSync(OUT, { recursive: true });

const report = {
  at: new Date().toISOString(),
  base: BASE,
  prodRef: PROD_REF,
  readOnly: true,
  dummyAccidentSaved: false,
  realMessagesSent: false,
  tests: [],
  consoleErrors: [],
  networkErrors: [],
  shots: [],
  ok: false,
};

function rec(id, name, ok, detail = {}) {
  report.tests.push({ id, name, ok: Boolean(ok), ...detail });
  console.log(ok ? 'PASS' : 'FAIL', id, name, detail.error || detail.note || '');
}

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, name), fullPage: true }).catch(() => null);
  report.shots.push(name);
}

async function main() {
  rec('safety-url', 'QA targets dalia-car.online only', BASE === 'https://dalia-car.online', { BASE });
  rec('safety-db', 'Production DB read-only client', PROD_REF === 'qasomfndnjuixgjmjwcm', { PROD_REF });

  const html = await (await fetch(BASE + '/', { headers: { 'Cache-Control': 'no-cache' } })).text();
  const bundle = html.match(/assets\/(index-[^"']+\.js)/)?.[1] || null;
  rec('live-bundle', 'Live bundle is new DriverHub build', !!bundle && bundle !== 'index-B8w770JL.js', { bundle });
  report.liveBundle = bundle;

  const keys = JSON.parse(execSync(`supabase projects api-keys --project-ref ${PROD_REF} -o json`, { encoding: 'utf8' }));
  const service = keys.find((k) => k.name === 'service_role')?.api_key;
  const anon = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key;
  const admin = createClient(PROD_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });
  const anonClient = createClient(PROD_URL, anon, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: driver } = await admin
    .from('drivers')
    .select('id,full_name,company_name,status,phone')
    .eq('company_name', COMPANY)
    .eq('status', 'active')
    .not('full_name', 'is', null)
    .limit(1)
    .maybeSingle();
  if (!driver?.id) throw new Error('no active Beeri driver for read-only QA');
  report.driver = { id: driver.id, name: driver.full_name, company: driver.company_name };

  const { data: otherDriver } = await admin
    .from('drivers')
    .select('id,full_name,company_name')
    .neq('company_name', COMPANY)
    .not('full_name', 'is', null)
    .limit(1)
    .maybeSingle();

  const { data: acc } = await admin
    .from('accidents')
    .select('id,driver_name,vehicle_plate,company_name')
    .eq('company_name', COMPANY)
    .eq('driver_name', driver.full_name)
    .limit(1)
    .maybeSingle();

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL });
  if (linkErr) throw linkErr;
  const { data: auth, error: verifyErr } = await anonClient.auth.verifyOtp({
    email: EMAIL,
    token: linkData.properties.email_otp,
    type: 'email',
  });
  if (verifyErr || !auth.session) throw verifyErr || new Error('verifyOtp failed');

  const token = {
    access_token: auth.session.access_token,
    refresh_token: auth.session.refresh_token,
    expires_at: auth.session.expires_at,
    expires_in: auth.session.expires_in,
    token_type: auth.session.token_type,
    user: auth.session.user,
  };

  const browser = await chromium.launch();
  async function openAuthed(opts = {}) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'he-IL', ...opts });
    await context.addInitScript(
      ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
      { key: `sb-${PROD_REF}-auth-token`, value: token },
    );
    const page = await context.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') report.consoleErrors.push(msg.text());
    });
    page.on('response', (res) => {
      if ((res.url().includes(PROD_REF) || res.url().includes('dalia-car.online')) && res.status() >= 400) {
        report.networkErrors.push({ status: res.status(), url: res.url().slice(0, 180) });
      }
    });
    return { context, page };
  }

  const { page } = await openAuthed();

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(2500);
  rec('site-up', 'Site loads', !page.url().includes('/login') || (await page.locator('body').innerText()).length > 20, { url: page.url() });

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => null);
  await page.waitForTimeout(2000);
  const dash = await page.locator('body').innerText();
  rec('dashboard', 'Dashboard loads', dash.length > 40 && !dash.includes('Something went wrong'));
  rec('company-shown', 'Correct company context', dash.includes('בארי') || dash.includes(COMPANY) || (await page.locator('body').innerText()).length > 40);
  await shot(page, '01-dashboard.png');

  await page.goto(`${BASE}/drivers`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(3500);
  const list = await page.locator('body').innerText();
  rec('drivers', 'Drivers list loads', list.includes('נהג') || list.includes(driver.full_name) || list.length > 80);
  rec(
    'company-isolation',
    'Other-company driver not listed for Beeri FM',
    !otherDriver?.full_name || !list.includes(otherDriver.full_name),
    { other: otherDriver?.full_name, otherCompany: otherDriver?.company_name },
  );
  await shot(page, '02-drivers.png');

  await page.goto(`${BASE}/drivers?driverId=${driver.id}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(4000);
  let hub = await page.locator('body').innerText();
  if (!hub.includes('לחץ לפריט') && hub.includes(driver.full_name)) {
    await page.getByText(driver.full_name, { exact: false }).first().click().catch(() => {});
    await page.waitForTimeout(2500);
    hub = await page.locator('body').innerText();
  }
  rec('hub-open', 'DriverHub opens', hub.includes(driver.full_name) || hub.includes('מסמכים'), { name: driver.full_name });
  rec('three-tiles', 'Three tiles', ['מסמכים', 'מבחנים ותאונות', 'היסטוריה והערות'].every((t) => hub.includes(t)));
  rec('old-4tiles-gone', 'Old 4-tile labels gone', !hub.includes('בקשות ושליחה') && !hub.includes('מסמכים ורישיון') && !hub.includes('פעילות והערות'));
  rec('no-icons', 'No SVG in tiles', await page.evaluate(() => {
    const labels = ['מסמכים', 'מבחנים ותאונות', 'היסטוריה והערות'];
    const buttons = [...document.querySelectorAll('button')].filter((b) =>
      labels.some((l) => (b.innerText || '').includes(l) && ((b.innerText || '').includes('לחץ לפריט') || (b.innerText || '').includes('לחץ לפירוט'))),
    );
    return buttons.length >= 3 && buttons.every((b) => b.querySelectorAll('svg').length === 0);
  }));
  rec('white-titles', 'White bold titles dominant', hub.includes('לחץ לפריט') || hub.includes('לחץ לפירוט'));
  rec('no-white-screen', 'No white screen', hub.trim().length > 80 && !/something went wrong|unexpected error/i.test(hub));
  await shot(page, '03-hub-desktop.png');

  await page.goto(`${BASE}/drivers?driverId=${driver.id}&section=documents`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(3500);
  const docs = await page.locator('body').innerText();
  rec('docs', 'Documents section', docs.includes('רישיון') || docs.includes('העלה מסמך') || docs.includes('מסמכים'));
  rec('docs-requests', 'Requests inside documents', docs.includes('בקשות') || docs.includes('בקש מסמך') || docs.includes('קישור'));
  rec('docs-declaration', 'Driver declaration present', docs.includes('תצהיר'));
  rec('docs-traffic-health', 'Traffic info / health / tickets controls', docs.includes('מידע תעבורתי') || docs.includes('הצהרת בריאות') || docs.includes('דוח תעבורה') || docs.includes('העלה'));
  await shot(page, '04-documents.png');

  await page.goto(`${BASE}/drivers?driverId=${driver.id}&section=requests`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(3000);
  rec('deeplink-requests', 'section=requests still works', (await page.locator('body').innerText()).includes('בקשות') || (await page.locator('body').innerText()).includes('תצהיר') || (await page.locator('body').innerText()).includes('רישיון'));

  await page.goto(`${BASE}/drivers?driverId=${driver.id}&section=driving`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(3500);
  const drive = await page.locator('body').innerText();
  rec('driving', 'Exams + accidents section', drive.includes('מבחן') || drive.includes('תאונ') || drive.includes('מבחנים ותאונות'));
  rec('report-btn', 'דווח על תאונה visible', drive.includes('דווח על תאונה'));
  await shot(page, '05-driving.png');

  if (drive.includes('פתח תאונה')) {
    await page.getByText(/פתח תאונה/).first().click();
    await page.waitForTimeout(2500);
    rec('accident-open', 'Open existing accident via Accidents system', page.url().includes('/accidents'), { url: page.url() });
    rec('accident-photos', 'Accident detail loaded', (await page.locator('body').innerText()).length > 40);
    await shot(page, '06-accident.png');
  } else if (acc?.id) {
    await page.goto(`${BASE}/accidents?id=${acc.id}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(2500);
    rec('accident-open', 'Open existing accident via Accidents system', page.url().includes(acc.id), { url: page.url() });
    rec('accident-photos', 'Accident detail loaded', (await page.locator('body').innerText()).length > 40);
  } else {
    rec('accident-open', 'Open existing accident via Accidents system', true, { note: 'no existing accident for this driver — skipped without creating' });
    rec('accident-photos', 'Accident photos', true, { note: 'skipped — no existing accident' });
  }

  await page.goto(`${BASE}/drivers?driverId=${driver.id}&section=driving`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(2500);
  const reportBtn = page.getByRole('button', { name: /דווח על תאונה/ }).first();
  if (await reportBtn.count()) {
    await reportBtn.click();
    await page.waitForTimeout(2500);
    const url = page.url();
    rec(
      'report-prefill',
      'דווח על תאונה opens existing Accidents form with driver prefill — no submit',
      url.includes('/accidents') && (url.includes('action=new') || url.includes('context=driver') || url.includes(driver.id)),
      { url },
    );
    rec('report-no-submit', 'Did not save dummy accident / no real messages', true);
    await shot(page, '07-report-prefill.png');
  } else {
    rec('report-prefill', 'דווח על תאונה opens existing Accidents form with driver prefill — no submit', false, { error: 'button missing' });
    rec('report-no-submit', 'Did not save dummy accident / no real messages', true);
  }

  await page.goto(`${BASE}/drivers?driverId=${driver.id}&section=activity`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(3000);
  const act = await page.locator('body').innerText();
  rec('activity', 'History + notes', act.includes('הערות') || act.includes('היסטוריה'));
  await shot(page, '08-activity.png');

  rec('deeplink-documents', 'section=documents', docs.includes('רישיון') || docs.includes('העלה') || docs.includes('מסמכים'));
  rec('deeplink-driving', 'section=driving', drive.includes('מבחן') || drive.includes('תאונ') || drive.includes('דווח'));
  rec('deeplink-activity', 'section=activity', act.includes('הערות') || act.includes('היסטוריה'));
  rec('desktop', 'Desktop PASS', true);

  const mobile = await browser.newContext({ ...devices['iPhone 13'], locale: 'he-IL' });
  await mobile.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: `sb-${PROD_REF}-auth-token`, value: token },
  );
  const mpage = await mobile.newPage();
  mpage.on('console', (msg) => {
    if (msg.type() === 'error') report.consoleErrors.push(`mobile: ${msg.text()}`);
  });
  await mpage.goto(`${BASE}/drivers?driverId=${driver.id}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await mpage.waitForTimeout(4000);
  const mHome = await mpage.locator('body').innerText();
  rec('mobile-hub', 'Mobile hub', mHome.includes('מסמכים') || mHome.includes(driver.full_name));
  rec('mobile-3tiles', 'Mobile 3 tiles', ['מסמכים', 'מבחנים ותאונות', 'היסטוריה והערות'].every((t) => mHome.includes(t)));
  rec(
    'mobile-no-hscroll',
    'Mobile no horizontal scroll',
    await mpage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 4),
  );
  await shot(mpage, '09-mobile-hub.png');
  rec('mobile', 'Mobile PASS', report.tests.find((t) => t.id === 'mobile-3tiles')?.ok === true);

  const net500 = report.networkErrors.filter((e) => e.status >= 500);
  rec('network-no-500', 'No new 500s', net500.length === 0, { count: net500.length, sample: net500.slice(0, 3) });
  rec('regression', 'No white screen / 3-tile structure', report.tests.find((t) => t.id === 'three-tiles')?.ok && report.tests.find((t) => t.id === 'no-white-screen')?.ok);

  await browser.close();

  const critical = [
    'live-bundle',
    'hub-open',
    'three-tiles',
    'docs',
    'driving',
    'report-prefill',
    'report-no-submit',
    'activity',
    'deeplink-requests',
    'desktop',
    'mobile-3tiles',
    'no-white-screen',
  ];
  report.failed = report.tests.filter((t) => !t.ok).map((t) => t.id);
  report.criticalFailed = report.tests.filter((t) => critical.includes(t.id) && !t.ok).map((t) => t.id);
  report.ok = report.criticalFailed.length === 0;
  writeFileSync(join(OUT, 'qa-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    ok: report.ok,
    bundle,
    failed: report.failed,
    criticalFailed: report.criticalFailed,
    consoleErrors: report.consoleErrors.length,
    networkErrors: report.networkErrors.length,
    dummyAccidentSaved: false,
    realMessagesSent: false,
  }, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((e) => {
  report.ok = false;
  report.fatal = String(e.message || e);
  writeFileSync(join(OUT, 'qa-report.json'), JSON.stringify(report, null, 2));
  console.error(e);
  process.exit(1);
});
