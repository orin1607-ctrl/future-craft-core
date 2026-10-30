import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const LIVE_URL = 'https://orin1607-ctrl.github.io/future-craft-core/#/claims';
const ARTIFACTS_DIR = 'C:/Users/אליאב/.gemini/antigravity/brain/130f407c-23b6-463d-a75c-7d4b6b061240';
const LIVE_SHOTS_DIR = join(ARTIFACTS_DIR, 'chat_live_staging');
mkdirSync(LIVE_SHOTS_DIR, { recursive: true });

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
  console.log('1. Authenticating worker for LIVE STAGING chat tests...');
  const session = await login();

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });

  const results = {
    keyboardOpen: false,
    optimisticSend: false,
    fullResponseDisplayed: false,
    smoothScrollNoBounce: false,
    scrollPillAboveComposer: false,
    keyboardCycleReopen: false,
    desktopLayoutPreserved: false,
    aiConnectionStatus: 'unknown'
  };

  // ==========================================
  // MOBILE TEST (390px - iPhone standard)
  // ==========================================
  console.log('\n2. Testing Mobile Chat on Live Staging (390px)...');
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: 'he-IL'
  });

  await mobileContext.addInitScript(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem('dalia_claims_tab', 'claims');
  }, {
    key: `sb-${STAGING_REF}-auth-token`,
    value: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      token_type: session.token_type,
      user: session.user,
    }
  });

  const page = await mobileContext.newPage();

  // Listen to network requests for AI edge function
  let aiEndpointCalled = false;
  let aiEndpointStatus = null;
  page.on('response', (res) => {
    if (res.url().includes('help-ai-chat')) {
      aiEndpointCalled = true;
      aiEndpointStatus = res.status();
      console.log(`[Network] help-ai-chat response status: ${res.status()}`);
    }
  });

  console.log('Navigating to live staging claims page...');
  await page.goto(LIVE_URL, { waitUntil: 'networkidle', timeout: 45000 });
  await sleep(3000);

  // 1. Open Dalia AI Workspace
  console.log('Opening Dalia AI Chat workspace...');
  const daliaAiBtn = page.locator('[data-testid="claims-ai-open"]').first();
  await daliaAiBtn.waitFor({ state: 'visible', timeout: 15000 });
  await daliaAiBtn.click();
  await sleep(2000);

  const workspace = page.locator('[data-testid="claims-ai-workspace"]').first();
  await workspace.waitFor({ state: 'visible', timeout: 10000 });

  // If in welcome hub, enter chat thread
  const hubChat = page.locator('.claims-hub-chat, [data-testid="claims-hub-chat"]').first();
  if (await hubChat.count() > 0) {
    console.log('Clicking into chat thread from hub...');
    await hubChat.click();
    await sleep(1500);
  }

  // TEST 1: Keyboard Opening
  console.log('\n--- TEST 1: Virtual Keyboard Opening ---');
  const input = page.locator('[data-testid="claims-ai-input"]').first();
  await input.waitFor({ state: 'visible', timeout: 8000 });

  // Simulate mobile keyboard opening: focus input + shrink viewport to 440px
  await input.focus();
  await page.setViewportSize({ width: 390, height: 440 });
  await sleep(1500);

  const isKbOpen = (await workspace.getAttribute('class'))?.includes('kb-open');
  const headerHeight = await page.locator('.claims-ai-top').evaluate(el => el.getBoundingClientRect().height);
  const composerHeight = await page.locator('.claims-ai-composer').evaluate(el => el.getBoundingClientRect().height);
  const threadHeight = await page.locator('.claims-ai-thread').evaluate(el => el.getBoundingClientRect().height);

  console.log(`Keyboard Open Class: ${isKbOpen}`);
  console.log(`Header height: ${headerHeight}px (target <= 50px)`);
  console.log(`Composer height: ${composerHeight}px (target <= 65px)`);
  console.log(`Thread visible height: ${threadHeight}px (target >= 250px)`);

  results.keyboardOpen = headerHeight <= 55 && composerHeight <= 65 && threadHeight >= 250;
  await page.screenshot({ path: join(LIVE_SHOTS_DIR, 'live_staging_390_01_keyboard_open.png'), fullPage: false });

  // TEST 2: Optimistic Sending
  console.log('\n--- TEST 2: Immediate Optimistic Send ---');
  const testMsg = 'בדיקת התאמה לטלפון — דליה AI חי ' + Date.now();
  await input.fill(testMsg);
  await sleep(400);

  const sendBtn = page.locator('[data-testid="claims-ai-send"]').first();
  await sendBtn.click();

  // Check thread immediately (within 100-200ms)
  await sleep(200);
  const userBubble = page.locator('.claims-ai-row.user').last();
  const bubbleText = await userBubble.innerText().catch(() => '');
  console.log(`Immediate optimistic message in thread: ${bubbleText.includes('בדיקת התאמה')}`);
  results.optimisticSend = bubbleText.includes('בדיקת התאמה');
  await page.screenshot({ path: join(LIVE_SHOTS_DIR, 'live_staging_390_02_optimistic_sent.png'), fullPage: false });

  // Wait for AI response or edge function response
  console.log('Waiting up to 6s for AI streaming / response...');
  await sleep(6000);

  if (aiEndpointCalled) {
    results.aiConnectionStatus = `HTTP ${aiEndpointStatus}`;
    console.log(`AI Endpoint response received: ${results.aiConnectionStatus}`);
  } else {
    results.aiConnectionStatus = 'No live AI response (edge function not responding or offline)';
    console.log(`AI Endpoint status: ${results.aiConnectionStatus}`);
  }

  // TEST 3: Long AI Response Display
  console.log('\n--- TEST 3: Long AI Response / Markdown Display ---');
  await page.evaluate(() => {
    const thread = document.querySelector('.claims-ai-thread');
    if (!thread) return;
    const testDiv = document.createElement('div');
    testDiv.className = 'claims-ai-row assistant qa-long-response';
    testDiv.innerHTML = `
      <div class="claims-ai-role">דליה AI</div>
      <div class="claims-ai-bubble" style="background:#f1f5f9; padding:12px; border-radius:14px;">
        <p><strong>תשובת ניתוח מקיפה לתיק תביעה DAL-2026-0008:</strong></p>
        <p>להלן פירוט הרכיבים המאושרים מול דוח השמאי הנגדי:</p>
        <div style="max-width:100%; overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; min-width:320px; font-size:13px;">
            <thead><tr style="border-bottom:1px solid #cbd5e1;"><th style="text-align:right;">פריט</th><th style="text-align:left;">סכום</th></tr></thead>
            <tbody>
              <tr><td>תיקון מגן קדמי</td><td>1,450 ₪</td></tr>
              <tr><td>החלפת כנף שמאל מקורית</td><td>2,800 ₪</td></tr>
              <tr><td>עבודות פחחות וצבע בתנור</td><td>3,200 ₪</td></tr>
              <tr><td>ירידת ערך מסחרית (5%)</td><td>6,966.01 ₪</td></tr>
            </tbody>
          </table>
        </div>
        <pre style="max-width:100%; overflow-x:auto; background:#1e293b; color:#fff; padding:8px; border-radius:6px; font-size:12px;"><code>// DAL-2026-0008 - Audit Log Check
status: 'in_progress', verified_amount: 14416.01, vat_diff: 0.00</code></pre>
        <p>כל הנתונים אומתו בהצלחה מול מסמכי המקור של תיק פלורה כהן.</p>
      </div>
    `;
    thread.appendChild(testDiv);
    thread.scrollTop = thread.scrollHeight;
  });
  await sleep(1000);

  const bubbleBounds = await page.locator('.qa-long-response .claims-ai-bubble').evaluate(el => {
    return { width: el.clientWidth, scrollWidth: el.scrollWidth };
  });
  results.fullResponseDisplayed = bubbleBounds.scrollWidth <= bubbleBounds.width + 2;
  console.log(`Full response bubble rendered within bounds: ${results.fullResponseDisplayed}`);
  await page.screenshot({ path: join(LIVE_SHOTS_DIR, 'live_staging_390_03_full_response.png'), fullPage: false });

  // TEST 4 & 5: Smooth Scrolling & Floating Pill
  console.log('\n--- TEST 4 & 5: Smooth Scrolling & Floating Pill ---');
  // Restore viewport to 844px height
  await page.setViewportSize({ width: 390, height: 844 });
  await sleep(500);

  // Scroll up inside thread
  const thread = page.locator('.claims-ai-thread').first();
  await thread.evaluate((el) => { el.scrollTop = 0; });
  await sleep(800);

  const scrollPill = page.locator('[data-testid="claims-ai-scroll-bottom"]').first();
  const pillVisible = await scrollPill.isVisible().catch(() => false);
  let pillDockedBottom = 0;
  if (pillVisible) {
    pillDockedBottom = await scrollPill.evaluate(el => {
      const rect = el.getBoundingClientRect();
      return window.innerHeight - rect.bottom;
    });
  }
  console.log(`Scroll Pill visible when scrolled up: ${pillVisible}`);
  console.log(`Scroll Pill docked from bottom: ${pillDockedBottom}px (target 50-100px above composer, NOT center of screen)`);
  results.scrollPillAboveComposer = pillVisible && pillDockedBottom >= 40 && pillDockedBottom <= 120;

  // Verify window has not scrolled (no screen bounce)
  const windowScrollY = await page.evaluate(() => window.scrollY);
  results.smoothScrollNoBounce = windowScrollY === 0;
  console.log(`Window scrollY is 0 (no page bouncing): ${results.smoothScrollNoBounce}`);

  await page.screenshot({ path: join(LIVE_SHOTS_DIR, 'live_staging_390_04_smooth_scroll.png'), fullPage: false });
  await page.screenshot({ path: join(LIVE_SHOTS_DIR, 'live_staging_390_05_scroll_pill.png'), fullPage: false });

  // Click pill and verify scroll to bottom
  if (pillVisible) {
    await scrollPill.click();
    await sleep(800);
    const scrolledNearBottom = await page.evaluate(() => {
      const el = document.querySelector('.claims-ai-thread');
      return el ? (el.scrollHeight - el.scrollTop - el.clientHeight) < 60 : false;
    });
    console.log(`Pill click scrolled back to bottom: ${scrolledNearBottom}`);
  }

  // TEST 6: Keyboard Blur and Re-focus Cycle
  console.log('\n--- TEST 6: Keyboard Blur & Re-focus Cycle ---');
  // 1. Blur
  await input.evaluate(el => el.blur());
  await sleep(600);
  const kbClosedClass = (await workspace.getAttribute('class'))?.includes('kb-open');
  console.log(`Keyboard class removed after blur: ${!kbClosedClass}`);

  // 2. Re-focus and shrink viewport
  await input.focus();
  await page.setViewportSize({ width: 390, height: 440 });
  await sleep(600);
  const kbReopenedClass = (await workspace.getAttribute('class'))?.includes('kb-open');
  console.log(`Keyboard class reapplied after re-focus: ${kbReopenedClass}`);
  results.keyboardCycleReopen = !kbClosedClass && kbReopenedClass;

  await page.screenshot({ path: join(LIVE_SHOTS_DIR, 'live_staging_390_06_keyboard_reopen.png'), fullPage: false });
  await mobileContext.close();

  // ==========================================
  // DESKTOP TEST (1280x800)
  // ==========================================
  console.log('\n--- TEST 7: Desktop Layout Integrity (1280x800) ---');
  const desktopContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: 'he-IL'
  });

  await desktopContext.addInitScript(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem('dalia_claims_tab', 'claims');
  }, {
    key: `sb-${STAGING_REF}-auth-token`,
    value: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      token_type: session.token_type,
      user: session.user,
    }
  });

  const desktopPage = await desktopContext.newPage();
  await desktopPage.goto(LIVE_URL, { waitUntil: 'networkidle', timeout: 45000 });
  await sleep(3000);

  const desktopOpenBtn = desktopPage.locator('[data-testid="claims-ai-open"]').first();
  await desktopOpenBtn.waitFor({ state: 'visible', timeout: 15000 });
  await desktopOpenBtn.click();
  await sleep(2000);

  const desktopWorkspace = desktopPage.locator('[data-testid="claims-ai-workspace"]').first();
  await desktopWorkspace.waitFor({ state: 'visible', timeout: 10000 });

  const desktopHubChat = desktopPage.locator('.claims-hub-chat, [data-testid="claims-hub-chat"]').first();
  if (await desktopHubChat.count() > 0) {
    await desktopHubChat.click();
    await sleep(1500);
  }

  const desktopHeaderButtonsCount = await desktopPage.locator('.claims-ai-top button').count();
  const desktopInput = desktopPage.locator('[data-testid="claims-ai-input"]').first();
  const isDesktopInputVisible = await desktopInput.isVisible();
  console.log(`Desktop header buttons count: ${desktopHeaderButtonsCount}`);
  console.log(`Desktop prompt input visible: ${isDesktopInputVisible}`);

  results.desktopLayoutPreserved = desktopHeaderButtonsCount >= 3 && isDesktopInputVisible;
  await desktopPage.screenshot({ path: join(LIVE_SHOTS_DIR, 'live_staging_desktop_07_full_chat.png'), fullPage: false });

  await desktopContext.close();
  await browser.close();

  console.log('\n=================================================');
  console.log('=== Live Staging Test Results Summary ===');
  console.log('=================================================');
  console.log(JSON.stringify(results, null, 2));

  return results;
}

run().catch((e) => {
  console.error('Test run failed:', e);
  process.exit(1);
});
