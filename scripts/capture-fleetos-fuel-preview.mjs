/**
 * Capture FleetOS Fuel module preview screenshots (local preview server).
 * NO deploy — for user approval only.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';

const PREVIEW = process.env.PREVIEW_URL || 'http://127.0.0.1:4173/future-craft-core';
const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const OUT = join(process.cwd(), 'docs', 'screenshots', 'fleetos-module2-fuel-preview');
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
      env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

const keys = JSON.parse(execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const service = keys.find((k) => k.name === 'service_role' && k.type === 'legacy').api_key;
const anon = keys.find((k) => k.name === 'anon' && k.type === 'legacy').api_key;
const admin = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { autoRefreshToken: false, persistSession: false } });
const anonClient = createClient(`https://${STAGING_REF}.supabase.co`, anon);

const runId = Date.now();
const email = `fuel-prev-${runId}@staging-e2e.local`;
const password = `Gp!${runId}`;
const { data: created } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
const uid = created.user.id;
await admin.from('profiles').upsert({ id: uid, full_name: 'Fuel Preview', company_name: 'QA', is_active: true, approval_status: 'approved' });
await admin.from('user_roles').delete().eq('user_id', uid);
await admin.from('user_roles').insert({ user_id: uid, role: 'super_admin' });
await new Promise((r) => setTimeout(r, 1200));
const { data: auth } = await anonClient.auth.signInWithPassword({ email, password });

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, name), fullPage: true });
  console.log('saved', name);
}

async function openSheet(page, label) {
  const btn = page.locator('button').filter({ hasText: label }).first();
  await btn.scrollIntoViewIfNeeded();
  await btn.click({ force: true });
  await page.waitForTimeout(800);
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

  await page.goto(`${PREVIEW}/fleetos-ai?tab=fuel`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await shot(page, `${vpName}-01-fuel-main.png`);

  const sheets = [
    ['יומן תדלוקים', `${vpName}-02-fuel-log.png`, false],
    ['יומן טעינות', `${vpName}-03-charge-log.png`, true],
    ['חריגות', `${vpName}-04-anomalies.png`, true],
    ['חיסכון ותחנות', `${vpName}-05-savings.png`, true],
    ['דוחות', `${vpName}-06-reports.png`, true],
    ['הוסף תדלוק', `${vpName}-07-add-fuel.png`, true],
    ['הוסף טעינה', `${vpName}-08-add-charge.png`, true],
  ];

  for (const [label, file, closeFirst] of sheets) {
    if (closeFirst) {
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(300);
    }
    await openSheet(page, label);
    await shot(page, file);
    if (label === 'יומן תדלוקים') {
      const row = page.locator('button').filter({ hasText: /₪/ }).first();
      if (await row.count()) {
        await row.click();
        await page.waitForTimeout(500);
        await shot(page, `${vpName}-02b-fuel-detail.png`);
      }
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }

  await context.close();
}

await admin.auth.admin.deleteUser(uid);
await browser.close();
console.log('DONE', OUT);
