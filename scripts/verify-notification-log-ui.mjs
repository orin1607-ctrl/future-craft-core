/**
 * E2E verification — notification log UI (driver / vehicle / general scopes).
 * Usage: node scripts/verify-notification-log-ui.mjs [port]
 * Env: TEST_EMAIL, TEST_PASSWORD (staging super_admin) — loaded from .env.local
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const PORT = process.argv[2] || process.env.PREVIEW_PORT || '4173';
const BASE = `http://localhost:${PORT}/future-craft-core`;
const OUT = join(process.cwd(), 'test-results');
mkdirSync(OUT, { recursive: true });

const DRIVER_TOPICS = [
  'רישיון נהיגה',
  'חידוש רישיון נהיגה',
  'תוקף אישור רפואי',
  'מסמך נהג',
  'תזכיר לנהג',
];
const VEHICLE_TOPICS = ['טסט', 'ביטוח חובה', 'ביטוח מקיף', 'טיפול', 'רישיון רכב'];

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
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
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
  viewports: {},
  consoleErrors: [],
  checks: [],
  passed: true,
};

function check(name, ok, detail = '') {
  report.checks.push({ name, ok, detail });
  if (!ok) report.passed = false;
  console.log(ok ? '✓' : '✗', name, detail ? `— ${detail}` : '');
}

async function injectSession(context, session) {
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: storageKey, value: session },
  );
}

async function assertNoVehicleTopicsInDriver(page) {
  for (const t of VEHICLE_TOPICS) {
    const count = await page.getByText(t, { exact: true }).count();
    if (count > 0) return { ok: false, topic: t };
  }
  return { ok: true };
}

async function assertNoDriverTopicsInVehicle(page) {
  for (const t of DRIVER_TOPICS) {
    const count = await page.getByText(t, { exact: true }).count();
    if (count > 0) return { ok: false, topic: t };
  }
  return { ok: true };
}

async function runViewport(browser, session, label, viewport) {
  const ctx = await browser.newContext({ viewport });
  ctx.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (text.includes('favicon') || text.includes('404')) return;
      report.consoleErrors.push({ viewport: label, text });
    }
  });
  ctx.on('pageerror', (err) => {
    report.consoleErrors.push({ viewport: label, text: err.message });
  });

  await injectSession(ctx, session);
  const page = await ctx.newPage();
  report.viewports[label] = { width: viewport.width, height: viewport.height };

  // General log
  await page.goto(`${BASE}/alerts/log?tab=active`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForSelector('text=התראות ושליחות', { timeout: 30000 });
  check(`${label}: general log loads`, await page.getByText('יומן כללי').isVisible());
  check(`${label}: general shows vehicle topic`, (await page.getByText('טסט', { exact: true }).count()) > 0);
  check(`${label}: general shows driver topic`, (await page.getByText('רישיון נהיגה', { exact: true }).count()) > 0);
  check(`${label}: general scope badge`, (await page.getByText('נהג').count()) > 0 && (await page.getByText('רכב').count()) > 0);

  // Driver log
  await page.goto(`${BASE}/alerts/log?driverId=d1&driverName=${encodeURIComponent('יוסי כהן')}&tab=active`, {
    waitUntil: 'networkidle',
    timeout: 90000,
  });
  await page.waitForSelector('text=יומן נהג בלבד', { timeout: 30000 });
  const driverSep = await assertNoVehicleTopicsInDriver(page);
  check(`${label}: driver log excludes vehicle topics`, driverSep.ok, driverSep.topic || '');
  check(`${label}: driver log has driver topic`, (await page.getByText('רישיון נהיגה', { exact: true }).count()) > 0);

  // Vehicle log
  await page.goto(`${BASE}/alerts/log?vehicleId=v1&plate=12-345-67&tab=active`, {
    waitUntil: 'networkidle',
    timeout: 90000,
  });
  await page.waitForSelector('text=יומן רכב בלבד', { timeout: 30000 });
  const vehicleSep = await assertNoDriverTopicsInVehicle(page);
  check(`${label}: vehicle log excludes driver topics`, vehicleSep.ok, vehicleSep.topic || '');
  check(`${label}: vehicle log has vehicle topic`, (await page.getByText('טסט', { exact: true }).count()) > 0);

  // Tabs: costs + calendar
  await page.goto(`${BASE}/alerts/log?tab=costs`, { waitUntil: 'networkidle', timeout: 90000 });
  check(`${label}: costs tab`, await page.getByText('סיכום עלויות WhatsApp').isVisible().catch(() => false) || (await page.getByText('עלויות').count()) > 0);

  await page.goto(`${BASE}/alerts/log?tab=calendar`, { waitUntil: 'networkidle', timeout: 90000 });
  check(`${label}: calendar tab`, (await page.locator('.rdp').count()) > 0 || (await page.getByText('לוח שנה').count()) > 0);

  // Add dialog + blocked / missing phone states in history
  await page.goto(`${BASE}/alerts/log?driverId=d1&driverName=${encodeURIComponent('יוסי כהן')}&tab=history`, {
    waitUntil: 'networkidle',
    timeout: 90000,
  });
  check(`${label}: history blocked 3/3`, (await page.getByText(/3\/3/).count()) > 0);
  check(`${label}: history missing phone`, (await page.getByText('חסר טלפון').count()) > 0);

  // Navigation from alerts page
  await page.goto(`${BASE}/alerts`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.getByRole('tab', { name: /התראות ושליחות/ }).click();
  await page.waitForURL('**/alerts/log**', { timeout: 15000 });
  check(`${label}: alerts tab navigates to log`, page.url().includes('/alerts/log'));

  // Drivers page button
  await page.goto(`${BASE}/drivers`, { waitUntil: 'networkidle', timeout: 90000 });
  const driverBtn = page.getByRole('button', { name: /התראות ושליחות/ }).first();
  if (await driverBtn.isVisible().catch(() => false)) {
    await driverBtn.click();
    await page.waitForURL('**/alerts/log**driverId**', { timeout: 15000 });
    check(`${label}: drivers card opens driver log`, page.url().includes('driverId'));
  } else {
    check(`${label}: drivers card opens driver log`, false, 'button not found');
  }

  await ctx.close();
}

async function main() {
  if (!testEmail || !testPassword) {
    console.error('Missing TEST_EMAIL / TEST_PASSWORD');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });
  if (error || !data.session) throw new Error(error?.message || 'sign-in failed');

  const session = {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    expires_in: data.session.expires_in,
    token_type: data.session.token_type,
    user: data.session.user,
  };

  const browser = await chromium.launch({ headless: true });

  await runViewport(browser, session, 'desktop', { width: 1280, height: 900 });
  await runViewport(browser, session, 'tablet', { width: 768, height: 1024 });
  await runViewport(browser, session, 'mobile', { width: 390, height: 844 });

  await browser.close();

  const uniqueConsole = [...new Set(report.consoleErrors.map((e) => e.text))];
  check('no critical console errors', uniqueConsole.length === 0, uniqueConsole.slice(0, 3).join(' | '));

  writeFileSync(join(OUT, 'notification-log-ui-verify.json'), JSON.stringify(report, null, 2));
  console.log('\nReport:', join(OUT, 'notification-log-ui-verify.json'));
  process.exit(report.passed ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
