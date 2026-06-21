/**
 * Capture AI FAB on staging — button + open chat panel
 * Usage: node scripts/capture-ai-fab-staging.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;

const BASE = (process.argv[2] || 'https://orin1607-ctrl.github.io/future-craft-core/').replace(/\/?$/, '/');
const OUT = join(process.cwd(), 'docs', 'screenshots', 'ai-fab-staging');
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

async function injectSession(context, session) {
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: storageKey, value: session },
  );
}

async function main() {
  let email = testEmail;
  let password = testPassword;
  let ephemeralUid = null;

  const keys = JSON.parse(
    execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }),
  );
  const anon = keys.find((k) => k.name === 'anon' && k.type === 'legacy').api_key;
  const service = keys.find((k) => k.name === 'service_role' && k.type === 'legacy').api_key;
  const admin = createClient(STAGING_URL, service, { auth: { autoRefreshToken: false, persistSession: false } });
  const supabase = createClient(STAGING_URL, anon);

  if (!email || !password) {
    const runId = Date.now();
    email = `ai-fab-${runId}@staging-e2e.local`;
    password = `Fab!${runId}`;
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw new Error(`createUser: ${error.message}`);
    ephemeralUid = created.user.id;
    await admin.from('profiles').upsert({
      id: ephemeralUid,
      full_name: 'AI FAB QA',
      company_name: 'QA',
      is_active: true,
      approval_status: 'approved',
    });
    await admin.from('user_roles').delete().eq('user_id', ephemeralUid);
    await admin.from('user_roles').insert({ user_id: ephemeralUid, role: 'super_admin' });
    await new Promise((r) => setTimeout(r, 800));
    console.log('Auth: ephemeral super_admin', email);
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    console.error('Login failed:', error?.message);
    process.exit(1);
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await injectSession(context, data.session);
  const page = await context.newPage();

  await page.goto(`${BASE}dashboard`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);

  const fab = page.locator('.dalia-ai-fab');
  await fab.waitFor({ state: 'visible', timeout: 15000 });
  await page.screenshot({ path: join(OUT, '01-mobile-fab-visible.png') });
  console.log('📷 01-mobile-fab-visible.png');

  await fab.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUT, '02-mobile-chat-open.png') });
  console.log('📷 02-mobile-chat-open.png');

  await page.locator('.dalia-ai-fab').first().click();
  const chip = page.locator('button', { hasText: 'מה הכי דחוף' }).first();
  if (await chip.count()) {
    await chip.click();
    await page.waitForTimeout(12000);
    await page.screenshot({ path: join(OUT, '03-mobile-ai-response.png') });
    console.log('📷 03-mobile-ai-response.png');
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE}dashboard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT, '04-desktop-fab-visible.png') });
  console.log('📷 04-desktop-fab-visible.png');

  await page.locator('.dalia-ai-fab').click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, '05-desktop-chat-open.png') });
  console.log('📷 05-desktop-chat-open.png');

  await browser.close();

  if (ephemeralUid) {
    await admin.auth.admin.deleteUser(ephemeralUid);
    console.log('Cleaned up ephemeral user');
  }

  console.log('\nDone:', OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
