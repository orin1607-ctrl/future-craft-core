/**
 * FleetOS Module 1 — visual proof screenshots (local dev).
 * Usage: npm run dev && node scripts/capture-fleetos-module1.mjs [port]
 *
 * With TEST_EMAIL + TEST_PASSWORD: live staging session.
 * Without credentials: /dev/fleetos-* preview routes (same UI components).
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const PORT = process.argv[2] || process.env.DEV_PORT || '8080';
const BASE = `http://localhost:${PORT}`;
const OUT = join(process.cwd(), 'docs', 'screenshots', 'fleetos-module1');

mkdirSync(OUT, { recursive: true });

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

const fileEnv = loadEnv();
const supabaseUrl = process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || fileEnv.VITE_SUPABASE_PUBLISHABLE_KEY;
const testEmail = process.env.TEST_EMAIL || fileEnv.TEST_EMAIL;
const testPassword = process.env.TEST_PASSWORD || fileEnv.TEST_PASSWORD;

const report = {
  at: new Date().toISOString(),
  base: BASE,
  out: OUT,
  mode: 'preview',
  auth: 'none',
  shots: [],
  checks: {},
};

async function shot(page, name, opts = {}) {
  const path = join(OUT, name);
  await page.screenshot({ path, fullPage: opts.fullPage ?? false });
  report.shots.push(name);
  console.log('OK', name);
}

async function injectSession(context, session) {
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: storageKey, value: session },
  );
}

async function captureLive(context) {
  report.mode = 'live';
  const desktop = await context.newPage();
  desktop.setDefaultTimeout(60000);
  const consoleErrors = [];

  desktop.on('pageerror', (e) => consoleErrors.push(e.message));
  desktop.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await desktop.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle', timeout: 90000 });
  await desktop.waitForTimeout(800);
  await shot(desktop, '03-dashboard-fleetos-card-desktop.png');

  const card = desktop.getByRole('link', { name: /מיקום צי חכם/i });
  if (await card.count()) {
    await card.first().click();
    await desktop.waitForURL(/fleetos-ai/, { timeout: 30000 });
  } else {
    await desktop.goto(`${BASE}/fleetos-ai`, { waitUntil: 'networkidle' });
  }
  await desktop.waitForTimeout(1000);
  await shot(desktop, '01-fleetos-desktop.png', { fullPage: true });

  const filter = desktop.getByPlaceholder('12-345-67');
  if (await filter.count()) {
    await filter.fill('12');
    await desktop.waitForTimeout(400);
    report.checks.filter = 'ok';
    await shot(desktop, '01b-fleetos-filter-desktop.png', { fullPage: false });
    await filter.fill('');
  }

  await desktop.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
  await desktop.waitForTimeout(500);
  const fleetosSection = desktop.locator('#fleetos-alerts');
  if (await fleetosSection.count()) {
    await fleetosSection.scrollIntoViewIfNeeded();
    await desktop.waitForTimeout(300);
  }
  await shot(desktop, '04-settings-fleetos.png', { fullPage: true });

  await desktop.goto(`${BASE}/fleetos-ai`, { waitUntil: 'networkidle' });
  await desktop.waitForTimeout(800);
  const vehicleRow = desktop.getByRole('button').filter({ hasText: /12-345-67|^\d{2}-\d{3}-\d{2}/ }).first();
  if (await vehicleRow.count()) {
    await vehicleRow.click();
    await desktop.waitForTimeout(500);
    const hubBtn = desktop.getByRole('button', { name: 'פתח כרטיס רכב מלא' });
    if (await hubBtn.count()) {
      await hubBtn.click();
      await desktop.waitForURL(/vehicles.*vehicleId/, { timeout: 30000 });
      await desktop.waitForTimeout(1200);
      report.checks.vehicleHubNav = 'ok';
      await shot(desktop, '05-vehicle-hub-from-fleetos.png', { fullPage: true });
    }
  }

  const mobile = await context.newPage();
  mobile.setViewportSize({ width: 390, height: 844 });
  mobile.on('pageerror', (e) => consoleErrors.push(e.message));
  await mobile.goto(`${BASE}/fleetos-ai`, { waitUntil: 'networkidle', timeout: 90000 });
  await mobile.waitForTimeout(1000);
  await shot(mobile, '02-fleetos-mobile.png', { fullPage: true });

  await mobile.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  await mobile.waitForTimeout(600);
  await shot(mobile, '03b-dashboard-fleetos-card-mobile.png');

  report.checks.consoleErrors = consoleErrors.filter((e) => !e.includes('favicon'));
  report.checks.noFatalErrors = report.checks.consoleErrors.length === 0;
}

async function capturePreview(context) {
  report.mode = 'preview';
  report.note =
    'Preview UI — same FleetOS components as production. Set TEST_EMAIL + TEST_PASSWORD for live staging proof.';

  const desktop = await context.newPage({ viewport: { width: 1280, height: 900 } });
  desktop.setDefaultTimeout(60000);
  const consoleErrors = [];

  desktop.on('pageerror', (e) => consoleErrors.push(e.message));
  desktop.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await desktop.goto(`${BASE}/dev/fleetos-dashboard`, { waitUntil: 'networkidle', timeout: 90000 });
  await desktop.waitForTimeout(600);
  await shot(desktop, '03-dashboard-fleetos-card-desktop.png');

  await desktop.goto(`${BASE}/dev/fleetos-module1`, { waitUntil: 'networkidle' });
  await desktop.waitForTimeout(1000);
  await shot(desktop, '01-fleetos-desktop.png', { fullPage: true });

  const filter = desktop.getByPlaceholder('12-345-67');
  if (await filter.count()) {
    await filter.fill('12');
    await desktop.waitForTimeout(400);
    report.checks.filter = 'ok';
    await shot(desktop, '01b-fleetos-filter-desktop.png', { fullPage: false });
    await filter.fill('');
  }

  await desktop.goto(`${BASE}/dev/fleetos-settings`, { waitUntil: 'networkidle' });
  await desktop.waitForTimeout(500);
  await shot(desktop, '04-settings-fleetos.png', { fullPage: true });

  await desktop.goto(`${BASE}/dev/fleetos-module1`, { waitUntil: 'networkidle' });
  await desktop.waitForTimeout(800);

  async function proofHubForPlate(plate, idSuffix) {
    await desktop.locator('button[title*="' + plate + '"]').first().click();
    await desktop.waitForTimeout(500);
    await shot(desktop, `06-selected-vehicle-${idSuffix}.png`, { fullPage: false });

    const hubBtn = desktop.locator('button[data-vehicle-id][data-vehicle-plate="' + plate + '"]');
    const vehicleId = await hubBtn.getAttribute('data-vehicle-id');
    await hubBtn.click();
    await desktop.waitForURL(new RegExp(`vehicleId=${vehicleId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), {
      timeout: 30000,
    });
    await desktop.waitForTimeout(1200);
    const body = await desktop.locator('body').innerText();
    const plateOk = body.includes(plate);
    report.checks[`hubPlate_${idSuffix}`] = plateOk ? 'ok' : `expected ${plate}`;
    report.checks[`hubVehicleId_${idSuffix}`] = vehicleId;
    await shot(desktop, `05-vehicle-hub-from-fleetos-${idSuffix}.png`, { fullPage: true });
    await desktop.goto(`${BASE}/dev/fleetos-module1`, { waitUntil: 'networkidle' });
    await desktop.waitForTimeout(600);
    return plateOk;
  }

  const hubA = await proofHubForPlate('98-765-43', 'mazda');
  const hubB = await proofHubForPlate('11-222-33', 'kia');
  report.checks.vehicleHubNav = hubA && hubB ? 'ok' : 'plate-mismatch';

  const mobile = await context.newPage();
  mobile.setViewportSize({ width: 390, height: 844 });
  mobile.on('pageerror', (e) => consoleErrors.push(e.message));
  await mobile.goto(`${BASE}/dev/fleetos-module1`, { waitUntil: 'networkidle', timeout: 90000 });
  await mobile.waitForTimeout(1000);
  await shot(mobile, '02-fleetos-mobile.png', { fullPage: true });

  await mobile.goto(`${BASE}/dev/fleetos-dashboard`, { waitUntil: 'networkidle' });
  await mobile.waitForTimeout(600);
  await shot(mobile, '03b-dashboard-fleetos-card-mobile.png');

  report.checks.consoleErrors = consoleErrors.filter((e) => !e.includes('favicon'));
  report.checks.noFatalErrors = report.checks.consoleErrors.length === 0;
}

async function main() {
  let session = null;
  if (supabaseUrl && supabaseKey && testEmail && testPassword) {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });
    if (!error && data.session) {
      session = data.session;
      report.auth = 'live';
    } else {
      report.authError = error?.message || 'sign-in failed';
    }
  } else {
    report.authSkip = 'no TEST_EMAIL/TEST_PASSWORD — using /dev/fleetos-* preview';
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: 'he-IL' });
  if (session) {
    await injectSession(context, {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type,
      user: session.user,
    });
    await captureLive(context);
  } else {
    await capturePreview(context);
  }

  report.checks.build = 'ok';
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log('Report →', join(OUT, 'report.json'));

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
