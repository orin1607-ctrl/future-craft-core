/**
 * Staging-only Leaflet map browser QA. Targets local Vite + Staging Supabase.
 * Never Production / Hostinger / public TCP / ERM device.
 *
 * BASE=http://localhost:8080 node scripts/fleetos-map-leaflet-e2e.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const BASE = process.env.BASE || 'http://localhost:8080';
const OUT = join(process.cwd(), 'docs/audit-reports/fleetos-map-leaflet-2026-08-30');
mkdirSync(OUT, { recursive: true });
if (STAGING_REF === PROD_REF) throw new Error('refused: production');

const seed = JSON.parse(readFileSync(join(OUT, 'seed.json'), 'utf8'));
const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'service_role')?.api_key;
const anon = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key;
const admin = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { autoRefreshToken: false, persistSession: false } });

const report = {
  at: new Date().toISOString(),
  stagingRef: STAGING_REF,
  productionTouched: false,
  hostingerTouched: false,
  publicPort: false,
  ermConnected: false,
  base: BASE,
  checks: [],
  ok: false,
};

function check(id, ok, detail) {
  report.checks.push({ id, ok: Boolean(ok), detail: detail ?? null });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id}${detail ? ` — ${JSON.stringify(detail).slice(0, 280)}` : ''}`);
}

async function sessionFor(email) {
  const client = createClient(`https://${STAGING_REF}.supabase.co`, anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr) throw linkErr;
  const { data: auth, error: verifyErr } = await client.auth.verifyOtp({
    email,
    token: linkData.properties.email_otp,
    type: 'email',
  });
  if (verifyErr || !auth.session) throw verifyErr || new Error(`verify ${email}`);
  const s = auth.session;
  return {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    expires_at: s.expires_at,
    expires_in: s.expires_in,
    token_type: s.token_type,
    user: s.user,
  };
}

async function openAuthed(browser, email, viewport = { width: 1400, height: 1100 }) {
  const session = await sessionFor(email);
  const ctx = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem', viewport });
  await ctx.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: `sb-${STAGING_REF}-auth-token`, value: session },
  );
  const page = await ctx.newPage();
  return { ctx, page };
}

async function gotoFleet(page) {
  await page.goto(`${BASE}/fleetos-ai`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.getByRole('heading', { name: /מיקום צי חכם/ }).waitFor({ timeout: 40000 });
}

async function waitLoaded(page) {
  await page.getByText('רכבים פעילים').waitFor({ timeout: 30000 });
  await page.waitForFunction(
    () => {
      const t = document.body.innerText;
      return /מתוך \d+/.test(t) && !t.includes('טוען…');
    },
    { timeout: 40000 },
  );
  await page.waitForTimeout(800);
}

async function filterPlate(page, plate) {
  await page.locator('input[placeholder="12-345-67"]').fill(plate);
  await page.getByRole('button', { name: 'חפש' }).click();
  await page.waitForTimeout(800);
}

let browser;
try {
  const bizBefore = await Promise.all(['faults', 'accidents', 'expenses'].map(async (t) => {
    const { count, error } = await admin.from(t).select('id', { count: 'exact', head: true });
    if (error) throw error;
    return [t, count];
  }));
  report.businessBefore = Object.fromEntries(bizBefore);

  browser = await chromium.launch({ headless: true, channel: 'chrome' });

  const { ctx: ctxA, page } = await openAuthed(browser, seed.emails.companyA);
  await gotoFleet(page);
  await waitLoaded(page);
  await page.screenshot({ path: join(OUT, '01-fleet-status.png') });

  const chrome = await page.locator('h1').filter({ hasText: 'מיקום צי חכם' }).count();
  check('design-chrome', chrome > 0);
  check('kpi-labels', await page.getByText('רכבים פעילים').count() > 0);
  check('nav-status', await page.getByRole('button', { name: 'מצב צי' }).count() > 0);

  await page.locator('.leaflet-container').waitFor({ timeout: 20000 });
  await page.waitForTimeout(2500);
  const osmTiles = await page.locator('img.leaflet-tile[src*="tile.openstreetmap.org"]').count();
  check('streets-map', osmTiles > 0, { osmTiles });
  const osmAttr = await page.locator('.leaflet-control-attribution').innerText();
  check('attribution-osm', /OpenStreetMap/i.test(osmAttr), osmAttr);

  await page.getByRole('button', { name: 'לוויין' }).click();
  await page.waitForTimeout(2500);
  const esriTiles = await page.locator('img.leaflet-tile[src*="arcgisonline.com"]').count();
  check('satellite-map', esriTiles > 0, { esriTiles });
  const esriAttr = await page.locator('.leaflet-control-attribution').innerText();
  check('attribution-esri', /Esri/i.test(esriAttr), esriAttr);
  await page.screenshot({ path: join(OUT, '02-satellite.png') });

  await page.getByRole('button', { name: 'רחובות' }).click();
  await page.waitForTimeout(1500);

  const mapCountText = await page.getByText('רכבים על המפה').innerText();
  check('two-vehicles-on-map', /2 רכבים על המפה/.test(mapCountText), mapCountText);
  const markers = await page.locator('.fleetos-gps-marker').count();
  check('gps-markers', markers >= 2, { markers });

  const bodyA = await page.innerText('body');
  check('rls-no-company-b-plate', !bodyA.includes(seed.liveB.plate), { hidden: seed.liveB.plate });
  check('no-beeri-in-test', !/בארי/.test(bodyA));

  await filterPlate(page, seed.liveA.plate);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(OUT, '03-live-marker.png') });
  const liveCard = await page.locator('body').innerText();
  check('marker-gps-live', liveCard.includes(seed.liveA.plate) && liveCard.includes('Live'));
  check('last-seen-live', /Last Seen/.test(liveCard));
  const trail = await page.locator('.leaflet-overlay-pane path, .leaflet-overlay-pane polyline').count();
  check('trail', trail >= 1, { trail });

  await page.getByRole('button', { name: 'נקה סינון' }).click();
  await page.waitForTimeout(400);
  await filterPlate(page, seed.staleA.plate);
  await page.waitForTimeout(800);
  const staleText = await page.locator('body').innerText();
  check('gps-stale', /GPS ישן/.test(staleText) && !new RegExp(`${seed.staleA.plate}[\\s\\S]{0,80}· Live`).test(staleText));
  check('last-seen-stale', /Last Seen/.test(staleText));
  await page.screenshot({ path: join(OUT, '04-stale.png') });

  await page.getByRole('button', { name: 'נקה סינון' }).click();
  await page.waitForTimeout(400);
  await filterPlate(page, seed.noneA.plate);
  await page.waitForTimeout(800);
  const noneText = await page.locator('body').innerText();
  check('gps-missing', /אין מיקום GPS זמין|לא מוצג מיקום מדומה/.test(noneText));
  check('missing-not-live', !/· Live/.test(noneText) && noneText.includes(seed.noneA.plate));
  const markersNone = await page.locator('.fleetos-gps-marker').count();
  check('missing-no-fake-marker', markersNone === 0, { markersNone });
  await page.screenshot({ path: join(OUT, '05-no-gps.png') });

  const unitUi = `QA-MAP-UI-${Date.now()}`;
  const imeiUi = `35611999${String(Date.now()).slice(-7)}`.slice(0, 15);
  await page.locator('input[placeholder="0004D2 / IMEI"]').fill(unitUi);
  await page.locator('input[placeholder="15 ספרות (אופציונלי)"]').fill(imeiUi);
  await page.getByRole('button', { name: 'שיוך לרכב' }).click();
  await page.getByText('המכשיר שויך לרכב').waitFor({ timeout: 15000 });
  await page.getByText(/משויך:/).waitFor({ timeout: 15000 });
  const afterAssign = await page.locator('body').innerText();
  check('imei-ui-assign', /משויך:/.test(afterAssign), { unitUi });
  const { data: assignedRow } = await admin.from('gps_devices').select('unit_id, vehicle_id, enabled').eq('unit_id', unitUi).eq('enabled', true).maybeSingle();
  check('imei-ui-db', assignedRow?.vehicle_id === seed.noneA.id, assignedRow);
  await page.screenshot({ path: join(OUT, '06-imei-assign.png') });

  await page.getByRole('button', { name: 'ניתוק' }).click();
  await page.getByText('המכשיר נותק').waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  const { data: afterOff } = await admin.from('gps_devices').select('enabled').eq('unit_id', unitUi).maybeSingle();
  check('imei-ui-unassign', afterOff?.enabled === false, afterOff);

  await page.getByRole('button', { name: 'דלק וטעינה' }).click();
  await page.waitForTimeout(1500);
  const fuelText = await page.locator('body').innerText();
  check('fuel-tab-intact', /דלק/.test(fuelText));
  await page.screenshot({ path: join(OUT, '07-fuel.png') });
  await page.getByRole('button', { name: 'מצב צי' }).click();
  await page.waitForTimeout(800);

  await page.getByRole('button', { name: 'נקה סינון' }).click().catch(() => {});
  await filterPlate(page, seed.liveA.plate);
  await page.getByRole('button', { name: 'פתח כרטיס רכב מלא' }).click();
  await page.waitForURL(/view=hub/, { timeout: 20000 });
  await page.waitForTimeout(1500);
  const hub = await page.locator('body').innerText();
  check('hub-faults', /תקלות|ליקויים/.test(hub));
  check('hub-accidents', /תאונ/.test(hub));
  check('hub-expenses', /הוצאות|דלק/.test(hub) || /expenses/i.test(hub) || /הוצא/.test(hub));
  await page.screenshot({ path: join(OUT, '08-vehicle-hub.png') });
  await ctxA.close();

  const { ctx: ctxB, page: pageB } = await openAuthed(browser, seed.emails.companyB);
  await gotoFleet(pageB);
  await waitLoaded(pageB);
  const bodyB = await pageB.innerText('body');
  check('two-companies-b-sees-own', bodyB.includes(seed.liveB.plate), { plate: seed.liveB.plate });
  check('rls-browser-no-leak', !bodyB.includes(seed.liveA.plate) && !bodyB.includes(seed.staleA.plate), {
    liveA: seed.liveA.plate,
    staleA: seed.staleA.plate,
  });
  await pageB.screenshot({ path: join(OUT, '09-company-b.png') });
  await ctxB.close();

  const { ctx: ctxM, page: pageM } = await openAuthed(browser, seed.emails.companyA, { width: 390, height: 844 });
  await gotoFleet(pageM);
  await waitLoaded(pageM);
  await pageM.locator('.leaflet-container').waitFor({ timeout: 20000 });
  await pageM.waitForTimeout(1200);
  await pageM.screenshot({ path: join(OUT, '10-mobile.png') });
  const mobileMap = await pageM.locator('.leaflet-container').count();
  check('responsive-basic', mobileMap > 0 && (await pageM.getByRole('button', { name: 'רחובות' }).count()) > 0);
  await ctxM.close();

  const bizAfter = await Promise.all(['faults', 'accidents', 'expenses'].map(async (t) => {
    const { count, error } = await admin.from(t).select('id', { count: 'exact', head: true });
    if (error) throw error;
    return [t, count];
  }));
  report.businessAfter = Object.fromEntries(bizAfter);
  check(
    'business-tables-unchanged',
    report.businessBefore.faults === report.businessAfter.faults
      && report.businessBefore.accidents === report.businessAfter.accidents
      && report.businessBefore.expenses === report.businessAfter.expenses,
    { before: report.businessBefore, after: report.businessAfter },
  );
  check('no-mock-as-live', report.checks.filter((c) => ['missing-not-live', 'missing-no-fake-marker', 'gps-stale'].includes(c.id)).every((c) => c.ok));
} catch (err) {
  check('e2e-exception', false, String(err?.stack || err));
} finally {
  await browser?.close();
}

report.ok = report.checks.length > 0 && report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'qa-result.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, fail: report.checks.filter((c) => !c.ok).map((c) => c.id) }, null, 2));
if (!report.ok) process.exit(1);
