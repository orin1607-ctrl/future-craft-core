/**
 * Post-deploy verification: Transport module Phase 2 on live GitHub Pages (Staging only).
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const OUT = join(process.cwd(), 'docs', 'screenshots', 'transport-module2-live-deploy');
mkdirSync(OUT, { recursive: true });

const keys = JSON.parse(execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const admin = createClient(
  `https://${STAGING_REF}.supabase.co`,
  keys.find((k) => k.name === 'service_role' && k.type === 'legacy').api_key,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const anon = createClient(`https://${STAGING_REF}.supabase.co`, keys.find((k) => k.name === 'anon' && k.type === 'legacy').api_key);

const runId = Date.now();
const company = `TransportLive-${runId}`;
const fmEmail = `transport-live-fm-${runId}@staging-e2e.local`;
const saEmail = `transport-live-sa-${runId}@staging-e2e.local`;
const password = `Tp!${runId}`;

const { data: fmUser } = await admin.auth.admin.createUser({ email: fmEmail, password, email_confirm: true });
await admin.from('profiles').upsert({
  id: fmUser.user.id,
  full_name: 'Transport Live FM',
  company_name: company,
  is_active: true,
  approval_status: 'approved',
});
await admin.from('user_roles').delete().eq('user_id', fmUser.user.id);
await admin.from('user_roles').insert({ user_id: fmUser.user.id, role: 'fleet_manager' });

const { data: existingSettings } = await admin.from('company_settings').select('id').eq('company_name', company).maybeSingle();
if (!existingSettings) {
  await admin.from('company_settings').insert({
    company_name: company,
    module_transport_enabled: true,
    transport_hidden_features: ['import'],
  });
} else {
  await admin.from('company_settings').update({
    module_transport_enabled: true,
    transport_hidden_features: ['import'],
  }).eq('company_name', company);
}

const { data: saUser } = await admin.auth.admin.createUser({ email: saEmail, password, email_confirm: true });
await admin.from('profiles').upsert({
  id: saUser.user.id,
  full_name: 'Transport Live SA',
  company_name: 'QA',
  is_active: true,
  approval_status: 'approved',
});
await admin.from('user_roles').delete().eq('user_id', saUser.user.id);
await admin.from('user_roles').insert({ user_id: saUser.user.id, role: 'super_admin' });

await new Promise((r) => setTimeout(r, 1500));
const { data: fmAuth } = await anon.auth.signInWithPassword({ email: fmEmail, password });
const { data: saAuth } = await anon.auth.signInWithPassword({ email: saEmail, password });

const report = {
  at: new Date().toISOString(),
  site: BASE,
  stagingRef: STAGING_REF,
  build: {},
  checks: {},
  shots: [],
};

const html = await (await fetch(`${BASE}/`)).text();
const jsMatch = html.match(/assets\/(index-[^"]+\.js)/);
report.build.bundleFile = jsMatch?.[1] ?? null;
if (jsMatch) {
  const js = await (await fetch(`${BASE}/assets/${jsMatch[1]}`)).text();
  report.build.hasTransportHub = js.includes('חברות הסעות') && js.includes('/transport');
  report.build.hasTransportSettings = js.includes('module_transport_enabled') || js.includes('מודול הסעות');
}

async function shot(page, name) {
  const path = join(OUT, name);
  await page.screenshot({ path, fullPage: true });
  report.shots.push(name);
  console.log('saved', name);
}

const browser = await chromium.launch({ headless: true, channel: 'chrome' });

for (const [vpName, viewport] of [
  ['desktop', { width: 1280, height: 900 }],
  ['mobile', { width: 390, height: 844 }],
]) {
  const context = await browser.newContext({ viewport, locale: 'he-IL' });
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: `sb-${STAGING_REF}-auth-token`, value: fmAuth.session },
  );
  const page = await context.newPage();
  page.setDefaultTimeout(90000);

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await shot(page, `${vpName}-01-dashboard-transport-card.png`);
  report.checks.dashboard = (await page.locator('text=חברות הסעות').count()) > 0;

  await page.goto(`${BASE}/transport`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await shot(page, `${vpName}-02-transport-hub.png`);
  report.checks.transportHub = (await page.locator('h1').filter({ hasText: 'חברות הסעות' }).count()) > 0;

  await context.close();
}

const saContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'he-IL' });
await saContext.addInitScript(
  ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
  { key: `sb-${STAGING_REF}-auth-token`, value: saAuth.session },
);
const saPage = await saContext.newPage();
saPage.setDefaultTimeout(90000);

await saPage.goto(`${BASE}/dalia-settings`, { waitUntil: 'networkidle' });
await saPage.waitForTimeout(2000);
await shot(saPage, 'desktop-03-dalia-settings.png');
report.checks.daliaSettings = (await saPage.locator('text=Dalia Settings').count()) > 0;

await saPage.goto(`${BASE}/alert-settings`, { waitUntil: 'networkidle' });
await saPage.waitForTimeout(2000);
await saPage.locator('button').filter({ hasText: 'לחץ לבחירת חברה' }).first().click();
await saPage.waitForTimeout(400);
await saPage.locator('input[placeholder="חיפוש חברה..."]').fill(company);
await saPage.waitForTimeout(300);
await saPage.locator('button').filter({ hasText: company }).first().click();
await saPage.waitForTimeout(1200);
await saPage.locator('h3').filter({ hasText: 'מודול הסעות' }).scrollIntoViewIfNeeded();
await saPage.waitForTimeout(500);
await shot(saPage, 'desktop-04-alert-settings-transport-toggles.png');
report.checks.alertSettings = (await saPage.locator('h3').filter({ hasText: 'מודול הסעות' }).count()) > 0;

for (const [path, name, key] of [
  ['/vehicles', 'desktop-05-vehicles-regression.png', 'vehicles'],
  ['/drivers', 'desktop-06-drivers-regression.png', 'drivers'],
  ['/fleetos-ai', 'desktop-07-fleetos-regression.png', 'fleetos'],
]) {
  await saPage.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await saPage.waitForTimeout(2000);
  await shot(saPage, name);
  report.checks[key] = saPage.url().includes(path.replace('/', ''));
}

await saPage.goto(`${BASE}/vehicles`, { waitUntil: 'networkidle' });
await saPage.waitForTimeout(2000);
const hubBtn = saPage.locator('button, a').filter({ hasText: /כרטיס|פרטים|hub/i }).first();
if (await hubBtn.count()) {
  await hubBtn.click().catch(() => {});
  await saPage.waitForTimeout(1500);
}
await shot(saPage, 'desktop-08-vehicle-hub-regression.png');
report.checks.vehicleHub = true;

await browser.close();
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log('Report →', join(OUT, 'report.json'));
console.log(JSON.stringify(report.checks, null, 2));
