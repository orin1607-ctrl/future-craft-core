/**
 * Capture Transport module Phase 2 preview (Settings + Hub + Dashboard).
 * NO deploy — local preview only.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';

const PREVIEW = process.env.PREVIEW_URL || 'http://127.0.0.1:4173';
const SKIP_PREVIEW_SPAWN = process.env.SKIP_PREVIEW_SPAWN === '1';
const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const OUT = join(process.cwd(), 'docs', 'screenshots', 'transport-module2-preview');
mkdirSync(OUT, { recursive: true });

const keys = JSON.parse(execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role' && k.type === 'legacy').api_key;
const anon = keys.find((k) => k.name === 'anon' && k.type === 'legacy').api_key;
const admin = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { autoRefreshToken: false, persistSession: false } });
const anonClient = createClient(`https://${STAGING_REF}.supabase.co`, anon);

const runId = Date.now();
const email = `transport-prev-${runId}@staging-e2e.local`;
const password = `Tp!${runId}`;
const company = `TransportPreview-${runId}`;

const { data: created } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
const uid = created.user.id;
await admin.from('profiles').upsert({ id: uid, full_name: 'Transport Preview', company_name: company, is_active: true, approval_status: 'approved' });
await admin.from('user_roles').delete().eq('user_id', uid);
await admin.from('user_roles').insert({ user_id: uid, role: 'fleet_manager' });

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

await new Promise((r) => setTimeout(r, 1200));
const { data: auth } = await anonClient.auth.signInWithPassword({ email, password });

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, name), fullPage: true });
  console.log('saved', name);
}

let previewProc = null;
if (!SKIP_PREVIEW_SPAWN) {
  previewProc = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', '4173'], {
    cwd: process.cwd(),
    shell: true,
    stdio: 'ignore',
    detached: true,
  });
  await new Promise((r) => setTimeout(r, 2500));
}

const browser = await chromium.launch({ headless: true, channel: 'chrome' });

for (const [vpName, viewport] of [
  ['desktop', { width: 1280, height: 900 }],
  ['mobile', { width: 390, height: 844 }],
]) {
  const context = await browser.newContext({ viewport, locale: 'he-IL' });
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: `sb-${STAGING_REF}-auth-token`, value: auth.session },
  );
  const page = await context.newPage();
  page.setDefaultTimeout(60000);

  await page.goto(`${PREVIEW}/dashboard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await shot(page, `${vpName}-01-dashboard-transport-card.png`);

  await page.goto(`${PREVIEW}/transport`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await shot(page, `${vpName}-02-transport-hub.png`);

  await page.goto(`${PREVIEW}/transport/import`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await shot(page, `${vpName}-03-transport-import-placeholder.png`);

  await context.close();
}

// Super admin settings view
const saEmail = `transport-sa-${runId}@staging-e2e.local`;
const { data: saCreated } = await admin.auth.admin.createUser({ email: saEmail, password, email_confirm: true });
await admin.from('profiles').upsert({ id: saCreated.user.id, full_name: 'Transport SA', company_name: 'QA', is_active: true, approval_status: 'approved' });
await admin.from('user_roles').delete().eq('user_id', saCreated.user.id);
await admin.from('user_roles').insert({ user_id: saCreated.user.id, role: 'super_admin' });
await new Promise((r) => setTimeout(r, 800));
const { data: saAuth } = await anonClient.auth.signInWithPassword({ email: saEmail, password });

const saContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'he-IL' });
await saContext.addInitScript(
  ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
  { key: `sb-${STAGING_REF}-auth-token`, value: saAuth.session },
);
const saPage = await saContext.newPage();
await saPage.goto(`${PREVIEW}/dalia-settings`, { waitUntil: 'networkidle' });
await saPage.waitForTimeout(1200);
await shot(saPage, 'desktop-04-dalia-settings.png');

await saPage.goto(`${PREVIEW}/alert-settings`, { waitUntil: 'networkidle' });
await saPage.waitForTimeout(1200);
await saPage.locator('button').filter({ hasText: 'לחץ לבחירת חברה' }).first().click();
await saPage.waitForTimeout(400);
await saPage.locator('input[placeholder="חיפוש חברה..."]').fill(company);
await saPage.waitForTimeout(300);
await saPage.locator('button').filter({ hasText: company }).first().click();
await saPage.waitForTimeout(1200);
await saPage.locator('h3').filter({ hasText: 'מודול הסעות' }).scrollIntoViewIfNeeded();
await saPage.waitForTimeout(500);
await shot(saPage, 'desktop-05-alert-settings-transport-toggles.png');

// Regression smoke — existing modules unchanged
for (const [path, name] of [
  ['/vehicles', 'desktop-06-vehicles-regression.png'],
  ['/drivers', 'desktop-07-drivers-regression.png'],
  ['/fleetos-ai', 'desktop-08-fleetos-regression.png'],
]) {
  await saPage.goto(`${PREVIEW}${path}`, { waitUntil: 'networkidle' });
  await saPage.waitForTimeout(1500);
  await shot(saPage, name);
}

await browser.close();
if (previewProc) {
  try { process.kill(-previewProc.pid); } catch { previewProc.kill(); }
}

console.log('Preview screenshots →', OUT);
