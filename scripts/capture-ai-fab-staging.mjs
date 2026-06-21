/**
 * Capture marketing AI FAB on staging — only inside /ai-marketing
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
const testEmail = process.env.TEST_EMAIL || fileEnv.TEST_EMAIL;
const testPassword = process.env.TEST_PASSWORD || fileEnv.TEST_PASSWORD;

async function injectSession(context, session) {
  const storageKey = `sb-${STAGING_REF}-auth-token`;
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
    email = `mkt-ai-${runId}@staging-e2e.local`;
    password = `Mkt!${runId}`;
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw new Error(`createUser: ${error.message}`);
    ephemeralUid = created.user.id;
    await admin.from('profiles').upsert({
      id: ephemeralUid,
      full_name: 'Marketing AI QA',
      company_name: 'QA',
      is_active: true,
      approval_status: 'approved',
    });
    await admin.from('user_roles').delete().eq('user_id', ephemeralUid);
    await admin.from('user_roles').insert({ user_id: ephemeralUid, role: 'super_admin' });
    await new Promise((r) => setTimeout(r, 800));
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`Login failed: ${error?.message}`);

  const browser = await chromium.launch();
  const report = { fabOnDashboard: false, fabOnMarketing: false, noGlobalFab: true };

  // Mobile — marketing module
  const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await injectSession(mobileCtx, data.session);
  const mobilePage = await mobileCtx.newPage();

  await mobilePage.goto(`${BASE}dashboard`, { waitUntil: 'networkidle', timeout: 60000 });
  await mobilePage.waitForTimeout(1500);
  report.fabOnDashboard = (await mobilePage.locator('.dalia-ai-fab, .coco-ai-fab').count()) > 0;
  report.noGlobalFab = !report.fabOnDashboard;

  await mobilePage.goto(`${BASE}ai-marketing`, { waitUntil: 'networkidle', timeout: 60000 });
  await mobilePage.waitForTimeout(2500);
  const iframe = mobilePage.frameLocator('iframe[title*="ניהול שיווק"]');
  const fab = iframe.locator('#cocoAiFab');
  await fab.waitFor({ state: 'visible', timeout: 20000 });
  report.fabOnMarketing = true;
  await mobilePage.screenshot({ path: join(OUT, '01-mobile-marketing-fab.png') });
  console.log('📷 01-mobile-marketing-fab.png');

  await fab.click({ force: true });
  await mobilePage.waitForTimeout(800);
  await mobilePage.screenshot({ path: join(OUT, '02-mobile-chat-open.png') });
  console.log('📷 02-mobile-chat-open.png');

  const chip = iframe.locator('.coco-ai-chip', { hasText: 'מה הכי דחוף' }).first();
  if (await chip.count()) {
    await chip.click({ force: true });
    await mobilePage.waitForTimeout(15000);
    await mobilePage.screenshot({ path: join(OUT, '03-mobile-ai-response.png') });
    console.log('📷 03-mobile-ai-response.png');
  }

  // Desktop
  const desktopCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await injectSession(desktopCtx, data.session);
  const desktopPage = await desktopCtx.newPage();
  await desktopPage.goto(`${BASE}ai-marketing`, { waitUntil: 'networkidle', timeout: 60000 });
  await desktopPage.waitForTimeout(2500);
  const dFrame = desktopPage.frameLocator('iframe[title*="ניהול שיווק"]');
  await dFrame.locator('#cocoAiFab').waitFor({ state: 'visible', timeout: 20000 });
  await desktopPage.screenshot({ path: join(OUT, '04-desktop-marketing-fab.png') });
  console.log('📷 04-desktop-marketing-fab.png');

  await dFrame.locator('#cocoAiFab').click({ force: true });
  await desktopPage.waitForTimeout(600);
  await desktopPage.screenshot({ path: join(OUT, '05-desktop-chat-open.png') });
  console.log('📷 05-desktop-chat-open.png');

  await browser.close();
  if (ephemeralUid) await admin.auth.admin.deleteUser(ephemeralUid);

  console.log('\nReport:', report);
  if (!report.noGlobalFab || !report.fabOnMarketing) process.exit(1);
  console.log('Done:', OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
