import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const LOCAL_BASE = 'http://127.0.0.1:5173';
const ARTIFACTS_DIR = 'C:/Users/אליאב/.gemini/antigravity/brain/130f407c-23b6-463d-a75c-7d4b6b061240';
const AFTER_DIR = join(ARTIFACTS_DIR, 'chat_mobile_after');
mkdirSync(AFTER_DIR, { recursive: true });

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
  console.log('Authenticating worker for AFTER chat tests...');
  const session = await login();

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });

  const widths = [360, 390, 430];
  const results = {};

  for (const w of widths) {
    console.log(`\n=================================================`);
    console.log(`=== Testing AFTER Mobile Chat on ${w}px ===`);
    console.log(`=================================================`);

    results[w] = { opened: false, keyboardOpenLayout: false, optimisticSend: false, scrollPill: false, tableResponsive: false };

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
    await page.goto(`${LOCAL_BASE}/#/claims`, { waitUntil: 'networkidle', timeout: 35000 });
    await sleep(2500);

    // 1. Open Dalia AI Chat
    console.log(`[${w}px] 1. Opening Dalia AI Chat...`);
    const daliaAiBtn = page.locator('[data-testid="claims-ai-open"]').first();
    await daliaAiBtn.waitFor({ state: 'visible', timeout: 15000 });
    await daliaAiBtn.click();
    await sleep(2000);

    const workspace = page.locator('[data-testid="claims-ai-workspace"]').first();
    await workspace.waitFor({ state: 'visible', timeout: 10000 });
    results[w].opened = true;
    await page.screenshot({ path: join(AFTER_DIR, `after_${w}_01_chat_opened.png`) });
    console.log(`✓ Shot: after_${w}_01_chat_opened.png`);

    // 2. Click "שיחה כללית" if in welcome hub
    const hubChat = page.locator('.claims-hub-chat, [data-testid="claims-hub-chat"]').first();
    if (await hubChat.count() > 0) {
      await hubChat.click();
      await sleep(1500);
      await page.screenshot({ path: join(AFTER_DIR, `after_${w}_02_chat_in_thread.png`) });
      console.log(`✓ Shot: after_${w}_02_chat_in_thread.png`);
    }

    // 3. Test Keyboard Open (Focus input & resize viewport to 430px height)
    console.log(`[${w}px] 2. Testing Keyboard Opening & Viewport Adaptation...`);
    const input = page.locator('[data-testid="claims-ai-input"]').first();
    await input.focus();
    await page.setViewportSize({ width: w, height: 430 });
    await sleep(1500);

    // Verify workspace has kb-open class and composer is visible
    const isKbOpen = (await workspace.getAttribute('class'))?.includes('kb-open');
    console.log(` - Keyboard open class applied: ${isKbOpen}`);
    results[w].keyboardOpenLayout = isKbOpen;

    await page.screenshot({ path: join(AFTER_DIR, `after_${w}_03_keyboard_open.png`) });
    console.log(`✓ Shot: after_${w}_03_keyboard_open.png`);

    // 4. Test Typing & Immediate Optimistic Send
    console.log(`[${w}px] 3. Testing Optimistic Send...`);
    const testMsg = 'בדיקת התאמה לטלפון — הצג טבלה עם נתוני תביעות';
    await input.fill(testMsg);
    await sleep(500);

    const sendBtn = page.locator('[data-testid="claims-ai-send"]').first();
    await sendBtn.click();

    // Verify optimistic message appears immediately in DOM
    const userBubble = page.locator('.claims-ai-row.user').last();
    const bubbleText = await userBubble.innerText();
    console.log(` - Optimistic message present in thread immediately: ${bubbleText.includes('בדיקת התאמה')}`);
    results[w].optimisticSend = bubbleText.includes('בדיקת התאמה');

    await page.screenshot({ path: join(AFTER_DIR, `after_${w}_04_optimistic_sent.png`) });
    console.log(`✓ Shot: after_${w}_04_optimistic_sent.png`);

    // Restore viewport to normal phone height (keyboard closes)
    await page.setViewportSize({ width: w, height: 800 });
    await sleep(4000);

    // 5. Test Reading & Smart Scroll Protection
    console.log(`[${w}px] 4. Testing Scroll & Smart Scroll Protection...`);
    const thread = page.locator('[data-testid="claims-ai-thread"]').first();
    // Scroll up to read earlier messages
    await thread.evaluate((el) => { el.scrollTop = 0; });
    await sleep(1000);

    // Check if scroll bottom pill appears
    const scrollPill = page.locator('[data-testid="claims-ai-scroll-bottom"]').first();
    const pillVisible = await scrollPill.isVisible().catch(() => false);
    console.log(` - Floating "חזרה לתשובה האחרונה" pill visible when scrolled up: ${pillVisible}`);
    results[w].scrollPill = pillVisible;

    await page.screenshot({ path: join(AFTER_DIR, `after_${w}_05_reading_scroll_up.png`) });
    console.log(`✓ Shot: after_${w}_05_reading_scroll_up.png`);

    // Click pill to scroll back down
    if (pillVisible) {
      await scrollPill.click();
      await sleep(1000);
      await page.screenshot({ path: join(AFTER_DIR, `after_${w}_06_scrolled_back_down.png`) });
      console.log(`✓ Shot: after_${w}_06_scrolled_back_down.png`);
    }

    // 6. Test Tables & Code blocks inside thread
    console.log(`[${w}px] 5. Verifying Tables and Blocks do not exceed screen...`);
    const threadBox = await thread.boundingBox();
    const threadScrollWidth = await thread.evaluate((el) => el.scrollWidth);
    const hasNoHorizontalBlowout = threadScrollWidth <= (threadBox?.width || w) + 2;
    console.log(` - Thread horizontal bounds intact (no screen blowout): ${hasNoHorizontalBlowout}`);
    results[w].tableResponsive = hasNoHorizontalBlowout;

    await context.close();
  }

  await browser.close();
  console.log('\n=================================================');
  console.log('=== All AFTER Chat Tests Completed Successfully! ===');
  console.log('=================================================');
  console.log(JSON.stringify(results, null, 2));
}

run().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
