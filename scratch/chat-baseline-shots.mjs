import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = 'https://orin1607-ctrl.github.io/future-craft-core';
const ARTIFACTS_DIR = 'C:/Users/אליאב/.gemini/antigravity/brain/130f407c-23b6-463d-a75c-7d4b6b061240';
const BEFORE_DIR = join(ARTIFACTS_DIR, 'chat_mobile_before');
mkdirSync(BEFORE_DIR, { recursive: true });

const WORKER_EMAIL = 'qa.claims.worker.1788292403067@futurecraft.staging';
const WORKER_PASSWORD = 'QaWorker2026!';

const envFile = readFileSync('.env', 'utf8');
const anonKey = envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();
const userDb = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function login() {
  const { data, error } = await userDb.auth.signInWithPassword({ email: WORKER_EMAIL, password: WORKER_PASSWORD });
  if (error || !data.session) throw error || new Error('Worker login failed');
  return data.session;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  console.log('Authenticating worker for baseline chat capture...');
  const session = await login();

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });

  const widths = [360, 390, 430];

  for (const w of widths) {
    console.log(`\nCapturing BEFORE chat shots on ${w}px...`);

    const context = await browser.newContext({
      viewport: { width: w, height: 800 },
      isMobile: true,
      hasTouch: true,
      locale: 'he-IL'
    });

    await context.addInitScript(({ key, value }) => {
      localStorage.setItem(key, JSON.stringify(value));
    }, {
      key: `sb-${STAGING_REF}-auth-token`,
      value: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        expires_in: session.expires_in,
        token_type: session.token_type,
        user: session.user,
      },
    });

    const page = await context.newPage();
    await page.goto(`${STAGING_URL}/#/claims`, { waitUntil: 'networkidle', timeout: 45000 });
    await sleep(3000);

    // Click "דליה AI" in top nav
    const daliaAiBtn = page.locator('[data-testid="claims-ai-open"]').first();
    await daliaAiBtn.waitFor({ state: 'visible', timeout: 15000 });
    await daliaAiBtn.click();
    await sleep(2000);

    // Shot 1: Dalia AI Chat Welcome / Hub
    await page.screenshot({ path: join(BEFORE_DIR, `before_${w}_01_dalia_ai_open.png`) });
    console.log(`✓ Shot: before_${w}_01_dalia_ai_open.png`);

    // Click on a question or resume to enter conversation mode
    const chatBtn = page.locator('[data-testid="claims-hub-chat"]').first();
    if (await chatBtn.count() > 0) {
      await chatBtn.click();
      await sleep(2000);
      await page.screenshot({ path: join(BEFORE_DIR, `before_${w}_02_chat_thread.png`) });
      console.log(`✓ Shot: before_${w}_02_chat_thread.png`);
    }

    // Focus input to see keyboard space
    const input = page.locator('[data-testid="claims-ai-input"]').first();
    if (await input.count() > 0) {
      await input.focus();
      await sleep(1000);

      // Simulate keyboard open by resizing viewport to height 440px (common phone screen with virtual keyboard open)
      await page.setViewportSize({ width: w, height: 440 });
      await sleep(1500);
      await page.screenshot({ path: join(BEFORE_DIR, `before_${w}_03_keyboard_open.png`) });
      console.log(`✓ Shot: before_${w}_03_keyboard_open.png`);
    }

    await context.close();
  }

  await browser.close();
  console.log('✓ Baseline capture finished!');
}

run().catch(console.error);
