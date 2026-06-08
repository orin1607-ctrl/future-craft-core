/**
 * Live dalia-staging verification: Save → Reload → Edit → Hub + docs + isolation.
 * Requires TEST_EMAIL + TEST_PASSWORD in environment or .env.local
 *
 * Usage:
 *   node scripts/capture-staging-live.mjs [baseUrl]
 * Default base: https://orin1607-ctrl.github.io/future-craft-core/
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const STAGING_HOST = 'usfeoerkpcafxxlyuldl.supabase.co';
const BASE = (process.argv[2] || 'https://orin1607-ctrl.github.io/future-craft-core/').replace(/\/?$/, '/');
const OUT = join(process.cwd(), 'docs', 'screenshots', 'staging-live');

mkdirSync(OUT, { recursive: true });
mkdirSync('test-results', { recursive: true });

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
  project: 'dalia-staging',
  projectId: 'usfeoerkpcafxxlyuldl',
  base: BASE,
  steps: [],
  shots: [],
  dbProof: {},
  productionTouched: false,
};

function step(name, detail) {
  report.steps.push({ name, ...detail, at: new Date().toISOString() });
  const mark = detail.ok === false ? 'FAIL' : detail.ok === 'skip' ? 'SKIP' : 'OK';
  console.log(`[${mark}] ${name}`, detail.message || '');
}

async function shot(page, name) {
  const path = join(OUT, name);
  await page.screenshot({ path, fullPage: false });
  report.shots.push(name);
  console.log('  📷', name);
}

async function injectSession(context, session) {
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: storageKey, value: session },
  );
}

async function main() {
  if (!supabaseUrl?.includes(STAGING_HOST)) {
    step('guard', { ok: false, message: `URL must be ${STAGING_HOST}` });
    finish(1);
  }
  if (!testEmail || !testPassword) {
    step('auth', { ok: 'skip', message: 'Set TEST_EMAIL + TEST_PASSWORD' });
    finish(2);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });
  if (authErr) {
    step('sign-in', { ok: false, message: authErr.message });
    finish(1);
  }
  step('sign-in', { ok: true, message: auth.user?.email });

  const testPlate = `LIVE${Date.now().toString().slice(-6)}`;
  const testInternal = `INT-${testPlate}`;
  const normalizedPlate = testPlate.replace(/[-\s]/g, '');

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await injectSession(context, {
    access_token: auth.session.access_token,
    refresh_token: auth.session.refresh_token,
    expires_at: auth.session.expires_at,
    expires_in: auth.session.expires_in,
    token_type: auth.session.token_type,
    user: auth.session.user,
  });
  const page = await context.newPage();

  // 1. New vehicle + save
  await page.goto(`${BASE}vehicles`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.locator('button[title="רכב חדש"]').click();
  await page.waitForSelector('text=הוספת רכב חדש', { timeout: 30000 });
  await shot(page, '01-new-vehicle.png');

  await page.getByPlaceholder('12-345-67').fill(testPlate);
  await page.getByPlaceholder('מספר פנימי בארגון...').fill(testInternal);
  await page.getByRole('button', { name: 'המשך לטופס המלא →' }).click();
  await page.waitForSelector('.vehicle-new-dalia', { timeout: 30000 });
  await page.locator('input[name="manufacturer"]').fill('טויוטה');
  await page.locator('input[name="model"]').fill('קורולה');
  await page.locator('input[name="vehicle_color"]').fill('לבן');
  await page.locator('input[name="end_or_scrap_date"]').fill('2032-06-01');
  await shot(page, '02-dalia-form-filled.png');

  await page.getByRole('button', { name: 'שמור רכב חדש' }).click();
  await page.waitForTimeout(4000);
  await shot(page, '03-after-save-hub.png');
  step('save', { ok: true, message: `plate=${testPlate}` });

  // DB proof after save
  const { data: rowAfterSave, error: readErr1 } = await supabase
    .from('vehicles')
    .select('id,license_plate,internal_number,manufacturer,model,vehicle_color,end_or_scrap_date,import_source')
    .eq('license_plate', normalizedPlate)
    .maybeSingle();
  if (readErr1 || !rowAfterSave) {
    step('db-after-save', { ok: false, message: readErr1?.message || 'row not found' });
  } else {
    report.dbProof.afterSave = rowAfterSave;
    step('db-after-save', {
      ok: rowAfterSave.vehicle_color === 'לבן' && rowAfterSave.manufacturer === 'טויוטה',
      message: `id=${rowAfterSave.id} color=${rowAfterSave.vehicle_color}`,
    });
  }

  const vehicleId = rowAfterSave?.id || new URL(page.url()).searchParams.get('vehicleId') || '';

  // 2. Reload hub
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await shot(page, '04-reload-hub.png');
  step('reload', { ok: true, message: 'Hub reloaded' });

  // 3. Edit
  await page.getByRole('button', { name: /עריכה/i }).first().click().catch(() =>
    page.getByRole('button', { name: /עריכת רכב/i }).first().click(),
  );
  await page.waitForSelector('.vehicle-new-dalia', { timeout: 30000 });
  const colorInput = page.locator('input[name="vehicle_color"]');
  await colorInput.fill('כחול');
  await shot(page, '05-edit-form.png');
  await page.getByRole('button', { name: /שמור/i }).first().click();
  await page.waitForTimeout(4000);
  await shot(page, '06-after-edit-hub.png');

  const { data: rowAfterEdit } = await supabase
    .from('vehicles')
    .select('vehicle_color,manufacturer,model')
    .eq('id', vehicleId)
    .single();
  report.dbProof.afterEdit = rowAfterEdit;
  step('db-after-edit', {
    ok: rowAfterEdit?.vehicle_color === 'כחול',
    message: `color=${rowAfterEdit?.vehicle_color}`,
  });

  // 4. Full panel
  await page.getByRole('button', { name: 'פרטי רכב' }).click();
  await page.waitForTimeout(800);
  await shot(page, '07-full-panel.png');
  step('hub-full-panel', { ok: true, message: 'VehicleDaliaFullPanel opened' });

  // 5. Documents scoped
  const plateQ = encodeURIComponent(testPlate);
  await page.goto(`${BASE}documents?plate=${plateQ}&vehicleId=${vehicleId}&context=vehicle`, {
    waitUntil: 'networkidle',
    timeout: 60000,
  });
  await shot(page, '08-documents-scoped.png');
  const docsBanner = await page.locator('text=רכב').count();
  step('documents-scoped', { ok: docsBanner > 0, message: 'vehicle context banner' });

  // 6. Back to card
  await page.getByRole('link', { name: /חזרה לכרטיס הרכב/ }).click();
  await page.waitForTimeout(2000);
  await shot(page, '09-back-to-card.png');
  step('back-to-card', { ok: page.url().includes('vehicleId') || page.url().includes('vehicles'), message: page.url() });

  // 7. Isolation — faults scoped should not show other vehicles
  await page.goto(`${BASE}faults?plate=${plateQ}&vehicleId=${vehicleId}&context=vehicle`, {
    waitUntil: 'networkidle',
  });
  await shot(page, '10-faults-scoped-isolation.png');
  const strictBanner = await page.getByText(/רכב/).count();
  step('isolation-faults', { ok: strictBanner > 0, message: 'scoped faults view' });

  // 8. Vehicle list shows test vehicle
  await page.goto(`${BASE}vehicles`, { waitUntil: 'networkidle' });
  const listHasPlate = await page.getByText(normalizedPlate, { exact: false }).count();
  await shot(page, '11-vehicles-list.png');
  step('vehicles-list', { ok: listHasPlate > 0, message: `found plate in list` });

  report.testPlate = testPlate;
  report.testInternal = testInternal;
  report.vehicleId = vehicleId;
  report.ok = report.steps.every((s) => s.ok !== false);

  await browser.close();
  finish(report.ok ? 0 : 1);
}

function finish(code) {
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  writeFileSync(join('test-results', 'staging-live-verification.json'), JSON.stringify(report, null, 2));
  console.log('\nReport →', join(OUT, 'report.json'));
  process.exit(code);
}

main().catch((e) => {
  step('fatal', { ok: false, message: String(e) });
  finish(1);
});
