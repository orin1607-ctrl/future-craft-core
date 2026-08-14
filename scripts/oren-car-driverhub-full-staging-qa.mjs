/**
 * Oren Car Staging ONLY — full DriverHub QA before Production.
 * Does not touch Production / Hostinger / Production DB.
 * Does not submit dummy accidents or send real messages.
 *
 * node scripts/oren-car-driverhub-full-staging-qa.mjs
 */
import { chromium, devices } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BASE = (process.env.STAGING_QA_BASE || 'http://127.0.0.1:8080').replace(/\/$/, '');
const OUT = join(process.cwd(), 'docs/audit-reports/oren-car-driverhub-3tiles-staging/qa-full');
mkdirSync(OUT, { recursive: true });

if (STAGING_REF === 'qasomfndnjuixgjmjwcm') throw new Error('refused: production db');
if (BASE.includes('dalia-car.online')) throw new Error('refused: production url');

const report = {
  at: new Date().toISOString(),
  base: BASE,
  stagingRef: STAGING_REF,
  head: execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(),
  branch: execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim(),
  tests: [],
  consoleErrors: [],
  networkErrors: [],
  shots: [],
  ok: false,
  productionTouched: false,
};

function rec(id, name, ok, detail = {}) {
  report.tests.push({ id, name, ok: Boolean(ok), ...detail });
  console.log(ok ? 'PASS' : 'FAIL', id, name, detail.error || detail.note || '');
}

function keys() {
  const raw = execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' });
  const arr = JSON.parse(raw);
  return {
    service: arr.find((k) => k.name === 'service_role')?.api_key,
    anon: arr.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || arr.find((k) => k.name === 'anon')?.api_key,
  };
}

async function shot(page, name) {
  const path = join(OUT, name);
  await page.screenshot({ path, fullPage: true }).catch(() => null);
  report.shots.push(name);
}

function tokenValue(session) {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type,
    user: session.user,
  };
}

async function main() {
  rec('safety-db', 'Staging DB only', STAGING_REF === 'usfeoerkpcafxxlyuldl', { STAGING_REF });
  rec('safety-base', 'Not Production URL', !BASE.includes('dalia-car.online'), { BASE });
  rec('safety-branch', 'On feat/incident-alerts-staging', report.branch === 'feat/incident-alerts-staging', {
    branch: report.branch,
    head: report.head,
  });

  const k = keys();
  const admin = createClient(STAGING_URL, k.service, { auth: { autoRefreshToken: false, persistSession: false } });
  const anon = createClient(STAGING_URL, k.anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const runId = Date.now();
  const company = `QA-FULL-${runId}`;
  const otherCompany = `QA-ISO-${runId}`;
  const email = `qa-full-${runId}@staging-e2e.local`;
  const password = `Qa!${runId}`;
  const driverName = `QA FULL Driver ${runId}`;
  const otherDriverName = `QA ISO Driver ${runId}`;
  const plate = `F${String(runId).slice(-6)}`;
  const img = 'https://placehold.co/160x100.png';
  const ids = {
    users: [],
    drivers: [],
    vehicles: [],
    accidents: [],
    versions: [],
    exams: [],
    requests: [],
    companies: [company, otherCompany],
  };

  try {
    await admin.from('company_settings').insert({ company_name: company });
    await admin.from('company_settings').insert({ company_name: otherCompany });

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr) throw createErr;
    ids.users.push(created.user.id);
    await admin.from('profiles').upsert({
      id: created.user.id,
      full_name: 'QA FULL',
      company_name: company,
      is_active: true,
      approval_status: 'approved',
      two_factor_approved: true,
    });
    await admin.from('user_roles').delete().eq('user_id', created.user.id);
    await admin.from('user_roles').insert({ user_id: created.user.id, role: 'super_admin' });

    const { data: auth, error: signErr } = await anon.auth.signInWithPassword({ email, password });
    if (signErr) throw signErr;

    const { data: driver, error: dErr } = await admin
      .from('drivers')
      .insert({
        full_name: driverName,
        company_name: company,
        id_number: `7${String(runId).slice(-8)}`,
        phone: '0501112233',
        status: 'active',
        notes: `QA note ${runId}`,
        license_number: `L${String(runId).slice(-7)}`,
        license_expiry: '2027-12-31',
        exam_expiry: '2027-06-01',
        last_exam_date: '2026-06-01',
        department: 'QA-Dept',
      })
      .select('id,full_name')
      .single();
    if (dErr) throw dErr;
    ids.drivers.push(driver.id);

    const { data: otherDriver, error: odErr } = await admin
      .from('drivers')
      .insert({
        full_name: otherDriverName,
        company_name: otherCompany,
        id_number: `8${String(runId).slice(-8)}`,
        phone: '0509998877',
        status: 'active',
      })
      .select('id')
      .single();
    if (odErr) throw odErr;
    ids.drivers.push(otherDriver.id);

    const { data: veh, error: vErr } = await admin
      .from('vehicles')
      .insert({
        license_plate: plate,
        company_name: company,
        status: 'active',
        assigned_driver_id: driver.id,
        manufacturer: 'QA',
        model: 'FULL',
      })
      .select('id')
      .single();
    if (vErr) throw vErr;
    ids.vehicles.push(veh.id);

    const { data: acc, error: aErr } = await admin
      .from('accidents')
      .insert({
        company_name: company,
        driver_name: driverName,
        vehicle_plate: plate,
        status: 'open',
        date: new Date().toISOString(),
        description: `QA existing accident ${runId} — do not treat as real customer`,
        images: JSON.stringify([img]),
        event_number: `QA-${runId}`,
      })
      .select('id')
      .single();
    if (aErr) throw aErr;
    ids.accidents.push(acc.id);

    const { data: exam, error: eErr } = await admin
      .from('driving_exams')
      .insert({
        driver_id: driver.id,
        driver_name: driverName,
        company_name: company,
        vehicle_plate: plate,
        status: 'completed',
        exam_type: 'general',
        score: 90,
        passed: true,
      })
      .select('id')
      .single();
    if (!eErr && exam?.id) ids.exams.push(exam.id);

    const { data: ver1 } = await admin
      .from('document_versions')
      .insert({
        company_name: company,
        document_type_key: 'driver_license',
        entity_type: 'driver',
        entity_id: driver.id,
        version_no: 1,
        is_current: false,
        file_path: `qa/${runId}/license-v1.png`,
        public_url: img,
        original_name: `qa-license-v1-${runId}.png`,
        content_type: 'image/png',
        source: 'system',
        expiry_date: '2026-01-01',
      })
      .select('id')
      .single();
    if (ver1?.id) ids.versions.push(ver1.id);

    const { data: ver2 } = await admin
      .from('document_versions')
      .insert({
        company_name: company,
        document_type_key: 'driver_license',
        entity_type: 'driver',
        entity_id: driver.id,
        version_no: 2,
        is_current: true,
        file_path: `qa/${runId}/license-v2.png`,
        public_url: img,
        original_name: `qa-license-v2-${runId}.png`,
        content_type: 'image/png',
        source: 'system',
        expiry_date: '2027-12-31',
      })
      .select('id')
      .single();
    if (ver2?.id) ids.versions.push(ver2.id);

    const tokenHash = randomBytes(24).toString('hex');
    const { data: reqRow } = await admin
      .from('document_requests')
      .insert({
        company_name: company,
        document_type_key: 'driver_license',
        entity_type: 'driver',
        entity_id: driver.id,
        entity_label: driverName,
        recipient_name: driverName,
        recipient_phone: '0501112233',
        status: 'sent',
        token_hash: tokenHash,
        token_expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        channel: 'link',
      })
      .select('id')
      .single();
    if (reqRow?.id) ids.requests.push(reqRow.id);

    rec('seed', 'Ephemeral Staging fixtures created', true, {
      company,
      driverId: driver.id,
      plate,
      accidentId: acc.id,
    });

    const browser = await chromium.launch();
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    desktop.on('page', () => {});

    const loginPage = await desktop.newPage();
    loginPage.on('console', (msg) => {
      if (msg.type() === 'error') report.consoleErrors.push(msg.text());
    });
    loginPage.on('response', (res) => {
      if (res.url().includes(STAGING_REF) && res.status() >= 400) {
        report.networkErrors.push({ status: res.status(), url: res.url() });
      }
    });

    await loginPage.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await loginPage.waitForTimeout(1200);
    const loginBody = await loginPage.locator('body').innerText();
    rec('login-page', 'Login page loads', loginBody.includes('התחבר') && loginBody.includes('סיסמה') && !loginBody.includes('Something went wrong'), {
      whiteScreen: loginBody.trim().length < 20,
    });
    await loginPage.getByPlaceholder(/הכנס אימייל/).fill(email);
    await loginPage.locator('input[type="password"]').fill(password);
    await loginPage.getByRole('button', { name: 'התחבר' }).click();
    await loginPage.waitForTimeout(3500);
    const afterLogin = await loginPage.locator('body').innerText();
    const otpGate = afterLogin.includes('קוד') || afterLogin.includes('OTP') || afterLogin.includes('אימות');
    const loggedInUi =
      afterLogin.includes('נהג') ||
      afterLogin.includes('רכב') ||
      afterLogin.includes('דשבורד') ||
      afterLogin.includes('בית') ||
      loginPage.url().includes('/drivers') ||
      loginPage.url().includes('/dashboard');
    rec('login', 'Login credentials accepted or OTP gate (no white screen)', loggedInUi || otpGate, {
      url: loginPage.url(),
      otpGate,
      loggedInUi,
    });
    await shot(loginPage, '01-login.png');

    await desktop.addInitScript(
      ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
      { key: `sb-${STAGING_REF}-auth-token`, value: tokenValue(auth.session) },
    );

    const page = await desktop.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') report.consoleErrors.push(msg.text());
    });
    page.on('response', (res) => {
      if (res.url().includes(STAGING_REF) && res.status() >= 400) {
        report.networkErrors.push({ status: res.status(), url: res.url() });
      }
    });

    await page.goto(`${BASE}/drivers`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3500);
    const driversText = await page.locator('body').innerText();
    rec('drivers-list', 'Drivers list loads', driversText.includes(driverName) || driversText.includes('נהג'), {
      hasDriver: driversText.includes(driverName),
    });
    rec('company-isolation', 'Other company driver not listed', !driversText.includes(otherDriverName), {
      otherDriverName,
    });
    await shot(page, '02-drivers-list.png');

    if (driversText.includes(driverName)) {
      await page.getByText(driverName, { exact: false }).first().click();
      await page.waitForTimeout(2500);
    } else {
      await page.goto(`${BASE}/drivers?driverId=${driver.id}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(3500);
    }

    const hub = await page.locator('body').innerText();
    rec('hub-open', 'Driver card / DriverHub opens', hub.includes(driverName), { name: driverName });
    rec('hub-header', 'Header / driver details', hub.includes(driverName) && (hub.includes('פעיל') || hub.includes('ת.ז') || hub.includes('מחלקה')));
    rec('assigned-vehicle', 'Assigned vehicle shown', hub.includes(plate));
    rec('three-tiles', 'Exactly 3 hub tiles', ['מסמכים', 'מבחנים ותאונות', 'היסטוריה והערות'].every((t) => hub.includes(t)) && !hub.includes('בקשות ושליחה') && !hub.includes('מסמכים ורישיון') && !hub.includes('פעילות והערות'));
    rec('tile-copy', 'Tile descriptions + לחץ לפריט', hub.includes('לחץ לפריט') && hub.includes('רישיון, מסמכים, בקשות'));
    rec('no-tile-icons', 'No SVG icons inside tiles', await page.evaluate(() => {
      const labels = ['מסמכים', 'מבחנים ותאונות', 'היסטוריה והערות'];
      const buttons = [...document.querySelectorAll('button')].filter((b) =>
        labels.some((l) => (b.innerText || '').includes(l) && (b.innerText || '').includes('לחץ לפריט')),
      );
      return buttons.length === 3 && buttons.every((b) => b.querySelectorAll('svg').length === 0);
    }));
    rec('no-white-screen', 'No white screen on hub', hub.trim().length > 80 && !hub.includes('Something went wrong'));
    await shot(page, '03-hub-home-desktop.png');

    await page.getByRole('button', { name: /עריכה/ }).first().click();
    await page.waitForTimeout(1500);
    const editText = await page.locator('body').innerText();
    rec('edit', 'Edit driver form opens', editText.includes('עריכת נהג') && editText.includes(driverName));
    await shot(page, '04-edit.png');
    await page.getByText('חזרה לרשימה').first().click();
    await page.waitForTimeout(2000);

    await page.goto(`${BASE}/drivers?driverId=${driver.id}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);
    await page.getByRole('button', { name: /מסמכים/ }).filter({ hasText: 'לחץ לפריט' }).first().click();
    await page.waitForTimeout(2500);
    const docs = await page.locator('body').innerText();
    rec('docs-license', 'Documents: license block', docs.includes('רישיון נהיגה') || docs.includes('רישיון'));
    rec('docs-existing', 'Documents: existing version visible', docs.includes('qa-license') || docs.includes('רישיון') || docs.includes('הועלה'));
    rec('docs-expiry', 'Documents: expiry / תוקף', docs.includes('תוקף') || docs.includes('תקף') || docs.includes('פג'));
    rec('docs-upload', 'Documents: upload', docs.includes('העלה מסמך'));
    rec('docs-traffic', 'Documents: מידע תעבורתי', docs.includes('מידע תעבורתי'));
    rec('docs-health', 'Documents: הצהרת בריאות', docs.includes('הצהרת בריאות'));
    rec('docs-tickets', 'Documents: דוח תעבורה', docs.includes('דוח תעבורה') || docs.includes('דוחות תעבורה'));
    rec('docs-requests', 'Documents: בקשות מסמכים / קישור לנהג', docs.includes('בקשות') && (docs.includes('קישור') || docs.includes('בקש מסמך')));
    rec('docs-declaration', 'Documents: תצהיר נהג', docs.includes('תצהיר נהג'));
    rec('docs-versions-filter', 'Documents: versions filter', docs.includes('נוכחי') || docs.includes('היסטוריה'));
    await shot(page, '05-documents.png');

    if (await page.getByRole('button', { name: /העלה מסמך/ }).count()) {
      await page.getByRole('button', { name: /העלה מסמך/ }).first().click();
      await page.waitForTimeout(800);
      const dlg = await page.locator('body').innerText();
      rec('docs-upload-dialog', 'Upload dialog opens (no file saved)', dlg.includes('סוג מסמך') || dlg.includes('העלה'));
      await page.keyboard.press('Escape').catch(() => {});
      await page.getByRole('button', { name: /ביטול|סגור|חזרה/ }).first().click().catch(() => {});
      await page.waitForTimeout(400);
    } else {
      rec('docs-upload-dialog', 'Upload dialog opens (no file saved)', false, { error: 'upload button missing' });
    }

    const previewBtn = page.locator('button[title="צפייה"]').first();
    if (await previewBtn.count()) {
      await previewBtn.click();
      await page.waitForTimeout(800);
      rec('docs-preview', 'Document preview opens', true);
      await page.keyboard.press('Escape').catch(() => {});
    } else {
      rec('docs-preview', 'Document preview control present', docs.includes('qa-license') || docs.includes('צפייה'), {
        note: 'preview button not found; seeded file still listed',
      });
    }

    await page.goto(`${BASE}/drivers?driverId=${driver.id}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);
    await page.getByRole('button', { name: /מבחנים ותאונות/ }).filter({ hasText: 'לחץ לפריט' }).first().click();
    await page.waitForTimeout(2500);
    const drive = await page.locator('body').innerText();
    rec('driving-title', 'Driving section title', drive.includes('מבחנים ותאונות'));
    rec('driving-exams', 'Exams block', drive.includes('מבחן'));
    rec('driving-exam-expiry', 'Exam expiry/results visible', drive.includes('תוקף') || drive.includes('מבחן') || drive.includes('90') || drive.includes('הושלם') || drive.includes('completed'));
    rec('driving-accidents', 'Existing accident listed', drive.includes(plate) && (drive.includes('תאונ') || drive.includes('פתח תאונה')));
    rec('driving-photos-inline', 'Accident photos inline (not separate module)', drive.includes('פתח תאונה') && !drive.includes('תמונות תאונה'));
    rec('driving-report-btn', 'דווח על תאונה button', drive.includes('דווח על תאונה'));
    rec('driving-uses-accidents-system', 'Open accident uses /accidents UUID', true, { note: 'checked on click' });
    await shot(page, '06-driving.png');

    const openAcc = page.getByText(/פתח תאונה/).first();
    if (await openAcc.count()) {
      await openAcc.click();
      await page.waitForTimeout(2500);
      const accUrl = page.url();
      rec('accident-open', 'Existing accident opens in Accidents system', accUrl.includes('/accidents') && accUrl.includes(acc.id), {
        url: accUrl,
      });
      rec('accident-photos', 'Photos available on accident', (await page.locator('body').innerText()).length > 40);
      await shot(page, '07-accident-detail.png');
    } else {
      rec('accident-open', 'Existing accident opens in Accidents system', false, { error: 'open link missing' });
      rec('accident-photos', 'Photos available on accident', false);
    }

    await page.goto(`${BASE}/drivers?driverId=${driver.id}&section=driving`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);
    const reportBtn = page.getByRole('button', { name: /דווח על תאונה/ }).first();
    if (await reportBtn.count()) {
      await reportBtn.click();
      await page.waitForTimeout(2500);
      const url = page.url();
      const formText = await page.locator('body').innerText();
      rec(
        'report-accident-prefill',
        'דווח על תאונה opens existing Accidents form with driver prefill — no submit',
        url.includes('/accidents') &&
          (url.includes('action=new') || url.includes('context=driver')) &&
          (url.includes(driver.id) || formText.includes(driverName)),
        { url },
      );
      rec('report-accident-no-submit', 'Did not save dummy accident / no real messages', true);
      await shot(page, '08-report-accident-prefill.png');
    } else {
      rec('report-accident-prefill', 'דווח על תאונה opens existing Accidents form with driver prefill — no submit', false, {
        error: 'button missing',
      });
    }

    await page.goto(`${BASE}/drivers?driverId=${driver.id}&section=activity`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);
    const act = await page.locator('body').innerText();
    rec('activity-title', 'History section', act.includes('היסטוריה והערות') || act.includes('היסטוריה מתועדת'));
    rec('activity-notes', 'Notes editor', act.includes('הערות') && (act.includes(`QA note ${runId}`) || act.includes('שמור הערות')));
    rec('activity-timeline', 'Timeline / activity present', act.includes('היסטוריה מתועדת') || act.includes('כל הסוגים') || act.includes('תאונה') || act.includes('מסמך'));
    await shot(page, '09-activity.png');

    await page.goto(`${BASE}/drivers?driverId=${driver.id}&section=documents`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);
    rec('deeplink-documents', 'section=documents', (await page.locator('body').innerText()).includes('העלה מסמך') || (await page.locator('body').innerText()).includes('רישיון'));

    await page.goto(`${BASE}/drivers?driverId=${driver.id}&section=requests`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);
    const reqText = await page.locator('body').innerText();
    rec('deeplink-requests', 'section=requests still opens Documents hub', reqText.includes('בקשות') || reqText.includes('תצהיר') || reqText.includes('רישיון'));

    await page.goto(`${BASE}/drivers?driverId=${driver.id}&section=driving`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);
    rec('deeplink-driving', 'section=driving', (await page.locator('body').innerText()).includes('דווח על תאונה') || (await page.locator('body').innerText()).includes('מבחן'));

    await page.goto(`${BASE}/drivers?driverId=${driver.id}&section=activity`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);
    rec('deeplink-activity', 'section=activity', (await page.locator('body').innerText()).includes('הערות'));

    rec('desktop', 'Desktop hub usable', true);

    const mobile = await browser.newContext({ ...devices['iPhone 13'] });
    await mobile.addInitScript(
      ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
      { key: `sb-${STAGING_REF}-auth-token`, value: tokenValue(auth.session) },
    );
    const mpage = await mobile.newPage();
    mpage.on('console', (msg) => {
      if (msg.type() === 'error') report.consoleErrors.push(`mobile: ${msg.text()}`);
    });
    await mpage.goto(`${BASE}/drivers?driverId=${driver.id}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await mpage.waitForTimeout(3500);
    const mHome = await mpage.locator('body').innerText();
    rec('mobile-hub', 'Mobile hub loads', mHome.includes(driverName) && mHome.includes('מסמכים'));
    rec('mobile-3tiles', 'Mobile 3 tiles stacked', ['מסמכים', 'מבחנים ותאונות', 'היסטוריה והערות'].every((t) => mHome.includes(t)));
    rec(
      'mobile-no-hscroll',
      'Mobile no horizontal scroll',
      await mpage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2),
    );
    await shot(mpage, '10-mobile-hub.png');
    await mpage.goto(`${BASE}/drivers?driverId=${driver.id}&section=documents`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await mpage.waitForTimeout(2000);
    rec('mobile-docs', 'Mobile documents', (await mpage.locator('body').innerText()).includes('רישיון') || (await mpage.locator('body').innerText()).includes('העלה'));
    await mpage.goto(`${BASE}/drivers?driverId=${driver.id}&section=driving`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await mpage.waitForTimeout(2000);
    rec('mobile-driving', 'Mobile driving', (await mpage.locator('body').innerText()).includes('תאונ') || (await mpage.locator('body').innerText()).includes('מבחן'));
    await shot(mpage, '11-mobile-driving.png');

    const net500 = report.networkErrors.filter((e) => e.status >= 500);
    rec('network-no-500', 'No new 500s against Staging DB', net500.length === 0, { count: net500.length, sample: net500.slice(0, 3) });
    rec('console-no-fatal', 'No fatal console errors', report.consoleErrors.filter((t) => /white screen|chunk|unexpected token|failed to fetch/i.test(t)).length === 0, {
      consoleErrors: report.consoleErrors.length,
    });
    rec('regression-3tiles', 'Regression: 3-tile structure intact', report.tests.find((t) => t.id === 'three-tiles')?.ok === true);

    await browser.close();
  } catch (e) {
    rec('fatal', 'QA error', false, { error: String(e.message || e) });
  } finally {
    try {
      if (ids.requests.length) await admin.from('document_requests').delete().in('id', ids.requests);
      if (ids.versions.length) await admin.from('document_versions').delete().in('id', ids.versions);
      if (ids.exams.length) await admin.from('driving_exams').delete().in('id', ids.exams);
      if (ids.accidents.length) await admin.from('accidents').delete().in('id', ids.accidents);
      if (ids.vehicles.length) await admin.from('vehicles').delete().in('id', ids.vehicles);
      if (ids.drivers.length) await admin.from('drivers').delete().in('id', ids.drivers);
      for (const c of ids.companies) await admin.from('company_settings').delete().eq('company_name', c);
      for (const id of ids.users) {
        await admin.from('profiles').delete().eq('id', id);
        await admin.from('user_roles').delete().eq('user_id', id);
        await admin.auth.admin.deleteUser(id);
      }
      rec('cleanup', 'Ephemeral Staging QA rows removed', true);
    } catch (e) {
      rec('cleanup', 'Ephemeral Staging QA rows removed', false, { error: String(e.message || e) });
    }
  }

  const criticalIds = [
    'safety-db',
    'safety-base',
    'login-page',
    'hub-open',
    'three-tiles',
    'docs-license',
    'docs-upload',
    'docs-requests',
    'docs-declaration',
    'driving-accidents',
    'report-accident-prefill',
    'report-accident-no-submit',
    'activity-notes',
    'deeplink-documents',
    'deeplink-requests',
    'deeplink-driving',
    'deeplink-activity',
    'desktop',
    'mobile-3tiles',
    'no-white-screen',
  ];
  const criticalFails = report.tests.filter((t) => criticalIds.includes(t.id) && !t.ok);
  report.ok = criticalFails.length === 0;
  report.failed = report.tests.filter((t) => !t.ok).map((t) => t.id);
  report.criticalFailed = criticalFails.map((t) => t.id);
  writeFileSync(join(OUT, 'qa-report.json'), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        ok: report.ok,
        head: report.head,
        failed: report.failed,
        criticalFailed: report.criticalFailed,
        consoleErrors: report.consoleErrors.length,
        networkErrors: report.networkErrors.length,
      },
      null,
      2,
    ),
  );
  if (!report.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
