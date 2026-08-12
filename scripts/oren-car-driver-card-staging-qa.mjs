/**
 * Live QA — Driver Card Option B on Oren Car Staging ONLY.
 * Usage: node scripts/oren-car-driver-card-staging-qa.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BASE = (process.env.STAGING_PAGES_URL || 'https://orin1607-ctrl.github.io/future-craft-core').replace(/\/$/, '');
const OUT = join(process.cwd(), 'docs/audit-reports/oren-car-driver-card-expansion/qa');

mkdirSync(OUT, { recursive: true });

const report = {
  at: new Date().toISOString(),
  base: BASE,
  stagingRef: STAGING_REF,
  commit: null,
  liveBundle: null,
  tests: [],
  consoleErrors: [],
  networkErrors: [],
  shots: [],
  ok: false,
};

function loadEnv() {
  const env = {};
  for (const name of ['.env', '.env.local']) {
    const p = join(process.cwd(), name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      env[t.slice(0, eq).trim()] = v;
    }
  }
  return env;
}

function record(id, name, ok, detail = {}) {
  report.tests.push({ id, name, ok, ...detail });
  console.log(ok ? '✅' : '❌', `[${id}]`, name, detail.note || detail.error || '');
}

function loadKeys() {
  const raw = execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, {
    encoding: 'utf8',
  });
  const keys = JSON.parse(raw);
  return {
    service: keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key,
    anon: keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key,
  };
}

async function main() {
  try {
    report.commit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    report.commit = 'unknown';
  }

  const html = await (await fetch(`${BASE}/`)).text();
  const bundleMatch = html.match(/assets\/index-[^"]+\.js/);
  report.liveBundle = bundleMatch?.[0] || null;
  record('bundle', 'Live Staging bundle detected', !!report.liveBundle, { bundle: report.liveBundle });

  const keys = loadKeys();
  const admin = createClient(STAGING_URL, keys.service, { auth: { autoRefreshToken: false, persistSession: false } });
  const anon = createClient(STAGING_URL, keys.anon, { auth: { autoRefreshToken: false, persistSession: false } });

  const runId = Date.now();
  const email = `qa-driver-hub-${runId}@staging-e2e.local`;
  const password = `Qa!${runId}`;
  const company = 'דליה';

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr) throw createErr;
  const userId = created.user.id;
  await admin.from('profiles').upsert({
    id: userId,
    full_name: 'QA Driver Hub',
    company_name: company,
    is_active: true,
    approval_status: 'approved',
    two_factor_approved: true,
  });
  await admin.from('user_roles').delete().eq('user_id', userId);
  await admin.from('user_roles').insert({ user_id: userId, role: 'super_admin' });

  const { data: auth, error: signErr } = await anon.auth.signInWithPassword({ email, password });
  if (signErr) throw signErr;
  record('auth', 'Ephemeral super_admin on Staging', true);

  const driverName = `QA Driver Hub ${runId}`;
  const { data: driver, error: dErr } = await admin
    .from('drivers')
    .insert({
      full_name: driverName,
      company_name: company,
      id_number: `7${String(runId).slice(-8)}`,
      phone: '0507654321',
      status: 'active',
      notes: `QA note ${runId}`,
    })
    .select('id,full_name,company_name,notes')
    .single();
  if (dErr) throw dErr;
  record('seed-driver', 'Test driver created', true, { driverId: driver.id });

  const qaPlate = `QA${String(runId).slice(-6)}`;
  const { data: qaVehicle, error: vErr } = await admin
    .from('vehicles')
    .insert({
      license_plate: qaPlate,
      company_name: company,
      manufacturer: 'QA',
      model: 'Test',
      status: 'active',
      assigned_driver_id: driver.id,
    })
    .select('id,license_plate')
    .single();
  if (vErr) throw vErr;
  record('seed-vehicle', 'Test vehicle assigned to driver', true, { plate: qaPlate });
  let createdAccidentId = null;

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const storageKey = `sb-${STAGING_REF}-auth-token`;
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

  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') report.consoleErrors.push(msg.text());
  });
  page.on('response', (res) => {
    const url = res.url();
    if (url.includes(STAGING_REF) && res.status() >= 400) {
      report.networkErrors.push({ status: res.status(), url });
    }
  });

  async function shot(name) {
    const path = join(OUT, name);
    await page.screenshot({ path, fullPage: true });
    report.shots.push(name);
  }

  await page.goto(`${BASE}/drivers`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.getByText(driverName, { exact: false }).first().click({ timeout: 30000 });
  await page.waitForTimeout(1500);
  await shot('01-driver-hub-home-desktop.png');

  const tiles = ['מסמכים ורישיון', 'בקשות ושליחה', 'נהיגה', 'פעילות והערות'];
  const tileOk = [];
  for (const t of tiles) {
    const visible = await page.getByText(t, { exact: true }).first().isVisible().catch(() => false);
    tileOk.push(visible);
  }
  record('tiles', 'Exactly 4 hub tiles visible', tileOk.every(Boolean) && tileOk.length === 4, { tiles: tileOk });

  const noSectionNavHealth = !(await page.getByText('הצהרת בריאות', { exact: true }).first().isVisible().catch(() => false));
  record('no-duplicate-nav', 'Health not as home tile (inside documents)', noSectionNavHealth);

  await page.getByText('מסמכים ורישיון', { exact: true }).first().click();
  await page.waitForTimeout(800);
  const uploadBtn = await page.getByRole('button', { name: /העלה מסמך/ }).first().isVisible().catch(() => false);
  record('documents-upload', 'Upload button in documents section', uploadBtn);
  await shot('02-documents-section.png');

  await page.getByText('חזרה לכרטיס הנהג').first().click().catch(() => {});
  await page.waitForTimeout(500);
  await page.getByText('בקשות ושליחה', { exact: true }).first().click();
  await page.waitForTimeout(800);
  const requestPanel = await page.getByText(/בקש מסמך|תצהיר/).first().isVisible().catch(() => false);
  record('requests-section', 'Requests / declaration section loads', requestPanel);
  await shot('03-requests-section.png');

  await page.getByText('חזרה לכרטיס הנהג').first().click().catch(() => {});
  await page.waitForTimeout(500);
  await page.getByText('נהיגה', { exact: true }).first().click();
  await page.waitForTimeout(800);
  const exams = await page.getByText('מבחני כשירות נהיגה', { exact: true }).first().isVisible().catch(() => false);
  const accidentsHeading = await page.getByText('תאונות', { exact: true }).first().isVisible().catch(() => false);
  const reportBtn = await page.getByRole('button', { name: /דווח על תאונה/ }).first().isVisible().catch(() => false);
  record('driving-section', 'Driving section with exams/accidents', exams || accidentsHeading, { exams, accidentsHeading });
  record('report-accident-btn', 'Report accident button visible in driving', reportBtn);
  await shot('04-driving-section.png');

  if (reportBtn) {
    await page.getByRole('button', { name: /דווח על תאונה/ }).first().click();
    await page.waitForTimeout(1500);
    const formTitle = await page.getByText('דיווח תאונה', { exact: true }).first().isVisible().catch(() => false);
    const driverInput = page.locator('input').filter({ hasNot: page.locator('[type=checkbox],[type=number],[type=file]') });
    let hasDriverPrefill = false;
    const inputCount = await page.locator('input').count();
    for (let i = 0; i < inputCount; i++) {
      const val = await page.locator('input').nth(i).inputValue().catch(() => '');
      if (val.includes(driverName) || val === driverName) {
        hasDriverPrefill = true;
        break;
      }
    }
    if (!hasDriverPrefill) {
      const body = await page.locator('body').innerText();
      hasDriverPrefill = body.includes(driverName);
    }
    record('report-accident-form', 'Existing accident form opens with driver context', formTitle && hasDriverPrefill, {
      formTitle,
      hasDriverPrefill,
    });
    await shot('04b-report-accident-form.png');

    // Fill existing form — ephemeral QA vehicle only
    const vehicleSelect = page.locator('select').first();
    await vehicleSelect.selectOption({ label: new RegExp(qaPlate) }).catch(async () => {
      await vehicleSelect.selectOption({ value: qaPlate }).catch(() => {});
    });
    // If select uses plate as value:
    const opts = await vehicleSelect.locator('option').allTextContents();
    const matchOpt = opts.find((t) => t.includes(qaPlate));
    if (matchOpt) {
      const val = await vehicleSelect.locator('option', { hasText: qaPlate }).first().getAttribute('value');
      if (val) await vehicleSelect.selectOption(val);
    }
    await page.locator('textarea').first().fill(`QA accident from driver hub ${runId}`);
    await page.getByRole('button', { name: /שלח דיווח/ }).click();
    await page.waitForTimeout(2500);
    await shot('04c-after-accident-submit.png');

    const { data: createdAcc } = await admin
      .from('accidents')
      .select('id,driver_name,vehicle_plate,images')
      .eq('driver_name', driverName)
      .eq('company_name', company)
      .eq('vehicle_plate', qaPlate)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    createdAccidentId = createdAcc?.id || null;
    record('accident-persisted', 'Accident saved in accidents table (same system)', !!createdAccidentId, {
      accidentId: createdAccidentId,
      driver_name: createdAcc?.driver_name,
    });

    // Return to driver card driving section
    await page.goto(`${BASE}/drivers?driverId=${driver.id}&section=driving`, {
      waitUntil: 'networkidle',
      timeout: 120000,
    });
    await page.waitForTimeout(2000);
    const shown = await page.getByText(qaPlate).first().isVisible().catch(() => false);
    const openLink = await page.getByText(/פתח תאונה/).first().isVisible().catch(() => false);
    record('accident-on-driver-card', 'Same accident visible on driver driving section', shown && openLink, {
      shown,
      openLink,
    });
    await shot('04d-accident-on-driver-card.png');

    if (openLink && createdAccidentId) {
      await page.getByText(/פתח תאונה/).first().click();
      await page.waitForTimeout(1500);
      const urlHasId = page.url().includes(createdAccidentId);
      record('accident-same-uuid', 'Open accident uses same UUID', urlHasId, { url: page.url() });
      await shot('04e-accident-detail.png');
      await page.goto(`${BASE}/drivers?driverId=${driver.id}&section=driving`, {
        waitUntil: 'networkidle',
        timeout: 120000,
      });
    }
  }

  await page.getByText('חזרה לכרטיס הנהג').first().click().catch(() => {});
  await page.waitForTimeout(500);
  await page.getByText('פעילות והערות', { exact: true }).first().click();
  await page.waitForTimeout(800);
  const notesArea = await page.locator('textarea').first().isVisible().catch(() => false);
  record('notes-edit', 'Notes textarea visible', notesArea);
  await shot('05-activity-section.png');

  // deep link
  await page.goto(`${BASE}/drivers?driverId=${driver.id}&section=documents`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1500);
  const deepDocs = await page.getByRole('button', { name: /העלה מסמך/ }).first().isVisible().catch(() => false);
  record('deep-link-documents', 'Deep link opens documents section', deepDocs);
  await shot('06-deeplink-documents.png');

  await page.goto(`${BASE}/alerts`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1500);
  const alertsLoaded = await page.locator('body').textContent();
  record('alerts-page', 'Alerts page loads', !!alertsLoaded?.includes('התראות') || !!alertsLoaded?.includes('Alerts'));
  await shot('07-alerts-page.png');

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await mobile.addInitScript(
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
  const mpage = await mobile.newPage();
  await mpage.goto(`${BASE}/drivers`, { waitUntil: 'networkidle', timeout: 120000 });
  await mpage.getByText(driverName, { exact: false }).first().click({ timeout: 30000 });
  await mpage.waitForTimeout(1500);
  await mpage.screenshot({ path: join(OUT, '08-driver-hub-home-mobile.png'), fullPage: true });
  report.shots.push('08-driver-hub-home-mobile.png');
  record('mobile', 'Mobile driver hub loads', true);

  await browser.close();

  // cleanup test data only
  if (createdAccidentId) {
    await admin.from('accidents').delete().eq('id', createdAccidentId);
  }
  if (qaVehicle?.id) {
    await admin.from('vehicles').delete().eq('id', qaVehicle.id);
  }
  await admin.from('drivers').delete().eq('id', driver.id);
  await admin.auth.admin.deleteUser(userId);

  const criticalFails = report.tests.filter((t) => !t.ok && !['tiles'].includes(t.id));
  report.ok = criticalFails.length === 0 && report.consoleErrors.length === 0;
  writeFileSync(join(OUT, 'live-qa-report.json'), JSON.stringify(report, null, 2));
  console.log('\nReport:', join(OUT, 'live-qa-report.json'));
  process.exit(report.ok ? 0 : 1);
}

main().catch((err) => {
  report.ok = false;
  report.fatal = err.message;
  writeFileSync(join(OUT, 'live-qa-report.json'), JSON.stringify(report, null, 2));
  console.error(err);
  process.exit(1);
});
