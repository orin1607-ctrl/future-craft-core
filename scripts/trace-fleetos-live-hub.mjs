/**
 * REAL path only: /dashboard → /fleetos-ai → select vehicle → /vehicles?vehicleId=&view=hub
 * Requires: npm run dev + TEST_EMAIL + TEST_PASSWORD in .env.local
 *
 * Usage: node scripts/trace-fleetos-live-hub.mjs [port]
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const PORT = process.argv[2] || process.env.DEV_PORT || '8080';
const BASE = `http://localhost:${PORT}`;
const OUT = join(process.cwd(), 'docs', 'screenshots', 'fleetos-module1');
const BAD = /הרכב לא נמצא/;

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

async function injectSession(context, session) {
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: storageKey, value: session },
  );
}

async function getToasts(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-sonner-toast], [data-sonner-toaster] li, [data-sonner-toast]')]
      .map((n) => n.textContent?.trim() || '')
      .filter(Boolean),
  );
}

async function main() {
  if (!testEmail || !testPassword) {
    console.error('BLOCKED: Set TEST_EMAIL + TEST_PASSWORD in .env.local for live path trace');
    process.exit(2);
  }
  if (!supabaseUrl || !supabaseKey) {
    console.error('BLOCKED: Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY');
    process.exit(2);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });
  if (authErr || !auth.session) {
    console.error('Auth failed:', authErr?.message);
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'he-IL' });
  await injectSession(context, auth.session);
  const page = await context.newPage();
  page.setDefaultTimeout(90000);

  const consoleLogs = [];
  page.on('console', (msg) => {
    const t = msg.text();
    if (t.includes('[FleetOS→Hub]') || t.includes('[Vehicles hub-open]')) {
      consoleLogs.push(t);
    }
  });

  const report = { at: new Date().toISOString(), base: BASE, path: 'live', cases: [], allOk: false };

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  await page.getByRole('link', { name: /מיקום צי חכם/i }).click();
  await page.waitForURL(/fleetos-ai/, { timeout: 30000 });
  await page.waitForTimeout(1500);

  const hubButtons = page.locator('button[data-vehicle-id][data-vehicle-plate]');
  const count = Math.min(await hubButtons.count(), 5);
  if (count === 0) {
    console.error('No vehicles on FleetOS screen');
    await browser.close();
    process.exit(1);
  }

  for (let i = 0; i < count; i++) {
    await page.goto(`${BASE}/fleetos-ai`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const btn = hubButtons.nth(i);
    const vehicleId = await btn.getAttribute('data-vehicle-id');
    const plate = await btn.getAttribute('data-vehicle-plate');
    const label = `live-${i + 1}`;

    const listBtn = page.getByRole('button', { name: /הצג רשימת רכבים/i });
    if (await listBtn.count()) await listBtn.click();

    if (plate) {
      const row = page.getByRole('button').filter({ hasText: plate }).first();
      if (await row.count()) await row.click();
      await page.waitForTimeout(400);
    }

    await btn.click();
    await page.waitForURL(/\/vehicles\?.*vehicleId=/, { timeout: 30000 });
    await page.waitForTimeout(1500);

    const toasts = await getToasts(page);
    const badToast = toasts.some((t) => BAD.test(t));
    const body = await page.locator('body').innerText();
    const hubShowsPlate = plate ? body.includes(plate) : true;

    const trace = {
      label,
      vehicleId,
      plate,
      finalUrl: page.url(),
      toasts,
      badToast,
      hubShowsPlate,
      ok: !badToast && hubShowsPlate && page.url().includes('vehicleId='),
    };
    report.cases.push(trace);
    await page.screenshot({ path: join(OUT, `live-trace-hub-${label}.png`), fullPage: true });
    console.log(JSON.stringify(trace));
  }

  report.consoleTrace = consoleLogs;
  report.allOk = report.cases.every((c) => c.ok);
  writeFileSync(join(OUT, 'fleetos-live-trace-report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  process.exit(report.allOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
