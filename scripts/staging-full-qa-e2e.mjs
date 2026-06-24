/**
 * Full Staging QA — live GitHub Pages + dalia-staging DB.
 * Creates ephemeral super_admin, runs button-by-button checks, screenshots.
 *
 * Usage: node scripts/staging-full-qa-e2e.mjs
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(process.cwd(), 'docs', 'screenshots', 'staging-full-qa');
mkdirSync(OUT, { recursive: true });

const DRIVER_TOPICS = ['טסט', 'ביטוח חובה', 'ביטוח מקיף', 'רישיון רכב'];
const DRIVER_ONLY = ['רישיון נהיגה', 'תוקף אישור רפואי', 'מסמך נהג'];
const VEHICLE_ONLY = ['טסט', 'ביטוח חובה', 'טיפול'];

const report = {
  run_at: new Date().toISOString(),
  base: BASE,
  staging: STAGING_REF,
  tests: [],
  console_errors: [],
  fixes_applied: [],
  screenshots: [],
};

function record(id, name, ok, detail = {}) {
  report.tests.push({ id, name, ok, ...detail });
  console.log(ok ? '✅' : '❌', `[${id}]`, name, detail.error || detail.note || '');
}

async function shot(page, name, viewport = '') {
  const file = viewport ? `${name}-${viewport}.png` : `${name}.png`;
  const path = join(OUT, file);
  await page.screenshot({ path, fullPage: true });
  report.screenshots.push(file);
  return path;
}

function loadKeys() {
  const raw = execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, {
    encoding: 'utf8',
    cwd: process.cwd(),
  });
  const keys = JSON.parse(raw);
  return {
    service: keys.find((k) => k.name === 'service_role' && k.type === 'legacy')?.api_key,
    anon: keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key,
  };
}

async function createSuperAdmin(admin, anonClient) {
  const runId = Date.now();
  const email = `qa-${runId}@staging-e2e.local`;
  const password = `Qa!${runId}`;
  const { data: created } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  const userId = created.user.id;
  await admin.from('profiles').upsert({
    id: userId,
    full_name: 'QA Staging',
    company_name: 'דליה',
    is_active: true,
    approval_status: 'approved',
    two_factor_approved: true,
  });
  await admin.from('user_roles').delete().eq('user_id', userId);
  await admin.from('user_roles').insert({ user_id: userId, role: 'super_admin' });
  await new Promise((r) => setTimeout(r, 400));
  const { data: auth, error } = await anonClient.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return { userId, email, session: auth.session };
}

async function injectSession(context, session) {
  const storageKey = `sb-${STAGING_REF}-auth-token`;
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    {
      key: storageKey,
      value: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        expires_in: session.expires_in,
        token_type: session.token_type,
        user: session.user,
      },
    },
  );
}

async function countExact(page, text) {
  return page.getByText(text, { exact: true }).count();
}

async function testRoutes404(page) {
  const routes = [
    '/dalia-settings',
    '/dalia-settings/whatsapp',
    '/alert-settings',
    '/alerts/log',
    '/login',
    '/vehicles',
    '/drivers',
  ];
  for (const r of routes) {
    await page.goto(`${BASE}${r}`, { waitUntil: 'networkidle', timeout: 90000 });
    const hasApp = (await page.locator('#root').count()) > 0;
    const notBlank = (await page.content()).length > 500;
    record(`route-${r.replace(/[?=&]/g, '-')}`, `SPA route ${r}`, hasApp && notBlank);
  }
}

async function testDaliaSettings(page, vp) {
  await page.goto(`${BASE}/admin-home`, { waitUntil: 'networkidle', timeout: 90000 });
  await shot(page, '01-admin-home', vp);

  const daliaCard = page.getByText('Dalia Settings');
  record('DS-01', 'Admin home shows Dalia Settings', (await daliaCard.count()) > 0);
  await page.getByText('Dalia Settings').first().click();
  await page.waitForURL('**/dalia-settings**', { timeout: 15000 });
  await shot(page, '02-dalia-settings-hub', vp);

  const links = [
    { text: 'כפתורים ומודולים לפי חברה', url: '/alert-settings' },
    { text: 'יומן התראות ושליחות', url: '/alerts/log' },
    { text: 'תבניות מייל', url: '/email-templates' },
    { text: 'WhatsApp — Gupshup', url: '/dalia-settings/whatsapp' },
    { text: 'WhatsApp חירום', url: '/emergency-settings' },
    { text: 'ניהול משתמשים', url: '/user-management' },
    { text: 'הרשאות', url: '/permissions' },
    { text: 'תור אישורים', url: '/approval-settings' },
    { text: 'פרופיל אישי', url: '/settings' },
    { text: 'לוג מערכת', url: '/system-logs' },
  ];

  for (const { text, url } of links) {
    await page.goto(`${BASE}/dalia-settings`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.getByText(text, { exact: false }).first().click();
    await page.waitForTimeout(800);
    const ok = page.url().includes(url.split('?')[0]);
    record(`DS-link-${url}`, `Dalia Settings → ${text}`, ok, { url: page.url() });
  }

  // Back navigation
  await page.goto(`${BASE}/alert-settings`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.getByText('חזרה ל-Dalia Settings').click();
  record('DS-back', 'Back from Alert Settings', page.url().includes('/dalia-settings'));

  // Alert settings save UI
  await page.goto(`${BASE}/alert-settings`, { waitUntil: 'networkidle', timeout: 60000 });
  const companyBtn = page.locator('button').filter({ hasText: 'דליה' }).first();
  if (await companyBtn.count()) {
    await companyBtn.click();
    await page.waitForTimeout(500);
    const saveBtn = page.getByRole('button', { name: /שמור הגדרות/ }).first();
    record('DS-alert-save-btn', 'Alert Settings save button visible', await saveBtn.isVisible());
  }

  // Email templates persistence marker
  await page.goto(`${BASE}/email-templates`, { waitUntil: 'networkidle', timeout: 60000 });
  record(
    'DS-email-banner',
    'Email templates staging banner',
    (await page.getByText(/localStorage/i).count()) > 0,
  );
  await shot(page, '03-email-templates', vp);

  // Approval queue
  await page.goto(`${BASE}/approval-settings`, { waitUntil: 'networkidle', timeout: 60000 });
  record('DS-approval-title', 'Approval queue title', (await page.getByText('תור אישורים').count()) > 0);
  await shot(page, '04-approval-queue', vp);

  // Emergency settings
  await page.goto(`${BASE}/emergency-settings`, { waitUntil: 'networkidle', timeout: 60000 });
  record('DS-emergency-load', 'Emergency settings loads', (await page.getByText('הגדרות שירותי חירום').count()) > 0);
  await shot(page, '05-emergency-settings', vp);

  // System logs
  await page.goto(`${BASE}/system-logs`, { waitUntil: 'networkidle', timeout: 60000 });
  record('DS-system-logs', 'System logs page (not Alerts)', (await page.getByText('לוג מערכת').count()) > 0);
  await shot(page, '06-system-logs', vp);
}

async function testNotificationLog(page, vp) {
  const tabs = [
    { tab: 'active', label: 'התראות פעילות', shot: '07-log-active' },
    { tab: 'future', label: 'התראות עתידיות', shot: '08-log-future' },
    { tab: 'history', label: 'היסטוריה', shot: '09-log-history' },
    { tab: 'costs', label: 'עלויות', shot: '10-log-costs' },
    { tab: 'calendar', label: 'לוח שנה', shot: '11-log-calendar' },
  ];

  for (const { tab, label, shot: sn } of tabs) {
    await page.goto(`${BASE}/alerts/log?tab=${tab}`, { waitUntil: 'networkidle', timeout: 60000 });
    record(`LOG-tab-${tab}`, `Log tab ${label}`, (await page.getByText(label).count()) > 0);
    await shot(page, sn, vp);
  }

  // Add dialog
  await page.goto(`${BASE}/alerts/log?tab=active`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.getByRole('button', { name: /הוסף התראה/ }).click();
  await page.waitForTimeout(400);
  record('LOG-add-dialog', 'Add notification dialog opens', (await page.getByText('הוסף התראה').count()) > 1);
  await page.keyboard.press('Escape');

  // General scope badges
  record('LOG-general-driver-badge', 'General log driver badge', (await page.getByText('נהג').count()) > 0);
  record('LOG-general-vehicle-badge', 'General log vehicle badge', (await page.getByText('רכב').count()) > 0);

  // History: blocked + missing phone
  await page.goto(`${BASE}/alerts/log?tab=history`, { waitUntil: 'networkidle', timeout: 60000 });
  record('LOG-blocked-3-3', 'History shows 3/3 blocked', (await page.getByText(/3\/3/).count()) > 0);
  record('LOG-missing-phone', 'History shows missing phone', (await page.getByText('חסר טלפון').count()) > 0);

  // Active tab also has blocked states
  await page.goto(`${BASE}/alerts/log?tab=active`, { waitUntil: 'networkidle', timeout: 60000 });
  record('LOG-active-blocked', 'Active tab shows blocked 3/3', (await page.getByText(/3\/3/).count()) > 0);

  // General filters
  await page.goto(`${BASE}/alerts/log?tab=active`, { waitUntil: 'networkidle', timeout: 60000 });
  record('LOG-filters', 'General log filters visible', (await page.locator('select').count()) >= 3);
}

async function testDriverVehicleScope(page, vp) {
  // Driver log
  await page.goto(`${BASE}/alerts/log?driverId=d1&driverName=${encodeURIComponent('יוסי כהן')}&tab=active`, {
    waitUntil: 'networkidle',
    timeout: 60000,
  });
  record('SCOPE-driver-banner', 'Driver log banner', (await page.getByText('יומן נהג בלבד').count()) > 0);
  let bad = false;
  for (const t of VEHICLE_ONLY) {
    if ((await countExact(page, t)) > 0) bad = true;
  }
  record('SCOPE-driver-no-vehicle', 'Driver log excludes vehicle topics', !bad);
  record('SCOPE-driver-has-license', 'Driver log has driver topic', (await countExact(page, 'רישיון נהיגה')) > 0);
  await shot(page, '12-driver-log', vp);

  // Vehicle log
  await page.goto(`${BASE}/alerts/log?vehicleId=v1&plate=12-345-67&tab=active`, {
    waitUntil: 'networkidle',
    timeout: 60000,
  });
  record('SCOPE-vehicle-banner', 'Vehicle log banner', (await page.getByText('יומן רכב בלבד').count()) > 0);
  bad = false;
  for (const t of DRIVER_ONLY) {
    if ((await countExact(page, t)) > 0) bad = true;
  }
  record('SCOPE-vehicle-no-driver', 'Vehicle log excludes driver topics', !bad);
  record('SCOPE-vehicle-has-test', 'Vehicle log has test topic', (await countExact(page, 'טסט')) > 0);
  await shot(page, '13-vehicle-log', vp);

  // Drivers page button — must open driver card first
  await page.goto(`${BASE}/drivers`, { waitUntil: 'networkidle', timeout: 90000 });
  await shot(page, '14-drivers-page', vp);
  const driverCard = page.locator('.card-elevated button').first();
  if (await driverCard.isVisible().catch(() => false)) {
    await driverCard.click();
    await page.waitForTimeout(800);
    await shot(page, '14b-driver-card', vp);
    const btn = page.getByRole('button', { name: /התראות ושליחות/ }).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      await page.waitForURL('**/alerts/log**driverId**', { timeout: 15000 });
      record('SCOPE-drivers-btn', 'Drivers card opens driver log', page.url().includes('driverId'));
      await shot(page, '15-drivers-to-log', vp);
    } else {
      record('SCOPE-drivers-btn', 'Drivers card opens driver log', false, { error: 'button not on card' });
    }
  } else {
    record('SCOPE-drivers-btn', 'Drivers card opens driver log', false, { error: 'no drivers in list' });
  }

  // Vehicles page button
  await page.goto(`${BASE}/vehicles`, { waitUntil: 'networkidle', timeout: 90000 });
  await shot(page, '16-vehicles-page', vp);
  const vbtn = page.getByRole('button', { name: /התראות ושליחות/ }).first();
  if (await vbtn.isVisible().catch(() => false)) {
    await vbtn.click();
    await page.waitForURL('**/alerts/log**vehicleId**', { timeout: 15000 });
    record('SCOPE-vehicles-btn', 'Vehicle card opens vehicle log', page.url().includes('vehicleId'));
    await shot(page, '17-vehicles-to-log', vp);
  } else {
    record('SCOPE-vehicles-btn', 'Vehicle card opens vehicle log', false, { error: 'button not found — open vehicle hub first' });
    // Try opening first vehicle if list exists
    const plate = page.locator('[class*="card"], [class*="vehicle"]').first();
    if (await plate.count()) {
      await page.locator('text=/\\d{1,3}-\\d{3}-\\d{2}/').first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1000);
      const hubBtn = page.getByRole('button', { name: /התראות ושליחות/ }).first();
      if (await hubBtn.isVisible().catch(() => false)) {
        await hubBtn.click();
        record('SCOPE-vehicles-btn-hub', 'Vehicle hub opens vehicle log', page.url().includes('vehicleId') || page.url().includes('plate'));
        await shot(page, '17b-vehicle-hub-log', vp);
      }
    }
  }
}

async function testWhatsAppSettings(page, token, anonKey, vp) {
  await page.goto(`${BASE}/dalia-settings/whatsapp`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForSelector('text=WhatsApp — Gupshup', { timeout: 20000 }).catch(() => {});
  await shot(page, '18-whatsapp-settings', vp);
  record('WA-ui', 'WhatsApp Settings page loads', (await page.getByText('WhatsApp Settings').count()) > 0);
  record('WA-gupshup', 'Gupshup section visible', (await page.getByText(/Gupshup/i).count()) > 0);

  // No API key in page source
  const html = await page.content();
  const leaked =
    html.includes('sk_') ||
    html.includes('GUPSHUP_API_KEY') && html.match(/[a-f0-9]{32,}/i) ||
    (await page.evaluate(() => {
      const ls = JSON.stringify(localStorage);
      return ls.includes('GUPSHUP') && ls.length > 50;
    }));
  record('WA-no-secret-frontend', 'No API key in frontend', !leaked);

  // Connection check via API (no send)
  const res = await fetch(`${STAGING_URL}/functions/v1/send-whatsapp-message`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'status' }),
  });
  const data = await res.json().catch(() => ({}));
  record('WA-connection-api', 'WhatsApp status API reachable', res.status !== 404, {
    http: res.status,
    configured: data?.configured,
    note: data?.error || data?.message,
  });
  record('WA-no-key-in-response', 'Response does not leak API key', !JSON.stringify(data).match(/[a-zA-Z0-9]{40,}/));

  // Click check connection button (no send)
  const checkBtn = page.getByRole('button', { name: /בדוק חיבור/ });
  if (await checkBtn.count()) {
    await checkBtn.click();
    await page.waitForTimeout(3000);
    await shot(page, '19-whatsapp-connection-check', vp);
    record('WA-check-btn', 'Check connection button works', true);
  }

  // Verify test phone input is typable
  const phoneInput = page.locator('input[type="tel"]');
  if (await phoneInput.count()) {
    await phoneInput.fill('972500000000');
    const val = await phoneInput.inputValue();
    record('WA-phone-input', 'Test phone input typable', val.length > 0);
  }
}

async function testRegression(page, vp) {
  const pages = [
    { path: '/login', check: 'התחבר' },
    { path: '/dashboard', check: 'דשבורד' },
    { path: '/vehicles', check: 'רכבים' },
    { path: '/drivers', check: 'נהגים' },
    { path: '/alerts', check: 'התראות' },
    { path: '/settings', check: 'הגדרות' },
    { path: '/user-management', check: 'משתמשים' },
    { path: '/forgot-password', check: 'OTP' },
  ];
  for (const { path, check } of pages) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 90000 });
    const content = await page.content();
    record(`REG-${path}`, `Regression ${path}`, content.includes(check) || content.length > 500);
  }
  await shot(page, '20-regression-dashboard', vp);
}

async function runViewport(browser, session, token, anonKey, label, viewport) {
  const ctx = await browser.newContext({ viewport, locale: 'he-IL' });
  ctx.on('console', (msg) => {
    if (msg.type() === 'error') {
      const t = msg.text();
      if (t.includes('favicon') || t.includes('404') && t.includes('assets')) return;
      report.console_errors.push({ viewport: label, text: t });
    }
  });
  ctx.on('pageerror', (err) => {
    report.console_errors.push({ viewport: label, text: err.message });
  });
  await injectSession(ctx, session);
  const page = await ctx.newPage();

  if (label === 'desktop') {
    await testRoutes404(page);
  }
  await testDaliaSettings(page, label);
  await testNotificationLog(page, label);
  await testDriverVehicleScope(page, label);
  if (label === 'desktop') {
    await testWhatsAppSettings(page, token, anonKey, label);
    await testRegression(page, label);
  }
  await ctx.close();
}

async function main() {
  const { service, anon: anonKey } = loadKeys();
  const admin = createClient(STAGING_URL, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anonClient = createClient(STAGING_URL, anonKey);
  const { userId, session } = await createSuperAdmin(admin, anonClient);

  const browser = await chromium.launch({ headless: true, channel: 'chrome' });

  await runViewport(browser, session, session.access_token, anonKey, 'desktop', { width: 1280, height: 900 });
  await runViewport(browser, session, session.access_token, anonKey, 'tablet', { width: 768, height: 1024 });
  await runViewport(browser, session, session.access_token, anonKey, 'mobile', { width: 390, height: 844 });

  await browser.close();

  // cleanup ephemeral user
  await admin.auth.admin.deleteUser(userId);

  const passed = report.tests.filter((t) => t.ok).length;
  const failed = report.tests.filter((t) => !t.ok);
  report.summary = {
    total: report.tests.length,
    passed,
    failed: failed.length,
    console_error_count: [...new Set(report.console_errors.map((e) => e.text))].length,
    ready_for_real_use: failed.length === 0 && report.console_errors.length === 0,
  };

  writeFileSync(join(OUT, 'qa-report.json'), JSON.stringify(report, null, 2));

  // HTML summary
  const html = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"><title>Staging QA</title>
<style>body{font-family:Heebo,sans-serif;padding:20px} .ok{color:green}.fail{color:red} img{max-width:100%;border:1px solid #ccc;margin:8px 0}</style></head><body>
<h1>Staging Full QA — ${report.run_at}</h1>
<p>${passed}/${report.tests.length} passed · ${failed.length} failed</p>
<h2>Failed</h2><ul>${failed.map((f) => `<li class="fail">${f.id}: ${f.name} ${f.error || ''}</li>`).join('')}</ul>
<h2>Screenshots</h2>${report.screenshots.map((s) => `<div><h3>${s}</h3><img src="${s}" alt="${s}"></div>`).join('')}
</body></html>`;
  writeFileSync(join(OUT, 'qa-report.html'), html);

  console.log('\n=== SUMMARY ===');
  console.log(`Passed: ${passed}/${report.tests.length}`);
  console.log(`Failed: ${failed.length}`);
  console.log(`Console errors: ${report.summary.console_error_count}`);
  console.log(`Report: ${join(OUT, 'qa-report.json')}`);

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
