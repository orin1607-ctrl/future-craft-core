// scripts/test-mobile-voice-all-9.mjs
// Mobile Android Chrome Verification for all 9 Dalia AI Voice Buttons

import { chromium, devices } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const keys = JSON.parse(execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy').api_key;
const serviceKey = keys.find((k) => k.name === 'service_role' && k.type === 'legacy').api_key;

const admin = createClient(STAGING_URL, serviceKey);
const anonClient = createClient(STAGING_URL, anonKey);

const SHOTS_DIR = path.resolve('backups/qa-shots-mobile-voice-20261023');
if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });

async function verifyAll9MobileButtons() {
  console.log('================================================================');
  console.log('📱 MOBILE ANDROID CHROME VERIFICATION: ALL 9 DALIA AI BUTTONS');
  console.log('================================================================\n');

  // 1. Auth Setup
  const email = 'qa-worker-browser@staging.oren.local';
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const { data: auth, error: aErr } = await anonClient.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  });
  if (aErr || !auth.session) throw new Error('Auth failed: ' + JSON.stringify(aErr));
  console.log('✅ Authenticated as test user:', email);

  // 2. Launch Chromium with Chrome channel and Pixel 7 Android emulation
  const pixel7 = devices['Pixel 7'];
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--no-sandbox',
    ],
  });

  const ctx = await browser.newContext({
    ...pixel7,
    permissions: ['microphone'],
  });

  const storageKey = `sb-${STAGING_REF}-auth-token`;
  await ctx.addInitScript(({ key, session }) => {
    window.localStorage.setItem(key, JSON.stringify(session));
  }, { key: storageKey, session: auth.session });

  const page = await ctx.newPage();

  // Track all speech calls and recognition starts
  await page.addInitScript(() => {
    window.__spokenUtterances = [];
    window.__recognitionInstances = [];

    // Track native or mock SpeechSynthesis
    if (window.speechSynthesis) {
      window.speechSynthesis.speak = function(utter) {
        window.__spokenUtterances.push({
          text: utter.text,
          lang: utter.lang,
          voice: utter.voice ? utter.voice.name : null,
          time: Date.now(),
        });
        setTimeout(() => {
          if (utter.onend) utter.onend(new Event('end'));
        }, 100);
      };
    }

    // Mock SpeechRecognition for test environment
    class MockRec extends EventTarget {
      constructor() {
        super();
        this.lang = 'he-IL';
        this.continuous = true;
        this.interimResults = true;
        window.__recognitionInstances.push(this);
      }
      start() { this.running = true; }
      stop() { this.running = false; if (this.onend) this.onend(new Event('end')); }
      abort() { this.stop(); }
    }
    window.SpeechRecognition = MockRec;
    window.webkitSpeechRecognition = MockRec;
  });

  const buttons = [
    { id: 'garage-action-new-customer', name: 'לקוח חדש', expectedSnippet: 'שם הלקוח' },
    { id: 'garage-action-existing-customer', name: 'לקוח קיים', expectedSnippet: 'מי הלקוח שאתה מחפש' },
    { id: 'garage-action-intake', name: 'קבלת רכב לעבודה', expectedSnippet: 'איזה רכב נכנס למוסך' },
    { id: 'garage-action-quote', name: 'הצעת מחיר', expectedSnippet: 'הצעת מחיר' },
    { id: 'garage-action-invoices-credits', name: 'חשבוניות וזיכויים', expectedSnippet: 'חשבונית' },
    { id: 'garage-action-general-expenses', name: 'ספקים וחשבוניות כלליות', expectedSnippet: 'ספק' },
    { id: 'garage-action-find-case', name: 'איתור תיק עבודה', expectedSnippet: 'איזה תיק אתה מחפש' },
    { id: 'garage-action-close-case', name: 'סגירת תיק עבודה', expectedSnippet: 'לסגור' },
    { id: 'garage-action-resume', name: 'המשך פעולה אחרונה', expectedSnippet: 'נמשיך' },
  ];

  const results = [];

  try {
    console.log('[NAV] Navigating to http://localhost:4179/garage-management on Mobile Pixel 7...');
    await page.goto('http://localhost:4179/garage-management', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SHOTS_DIR, '01-mobile-garage-main.png') });

    // Open Dalia drawer once
    const fab = page.locator('[data-testid="garage-ai-launch-btn"]');
    await fab.waitFor({ state: 'visible', timeout: 10000 });
    await fab.click();
    await page.waitForTimeout(1000);

    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i];
      console.log(`\n------------------------------------------------------------`);
      console.log(`[TEST ${i + 1}/9] Button: "${b.name}" (${b.id})`);
      console.log(`------------------------------------------------------------`);

      // Ensure 9 buttons welcome hub is visible
      const btnLoc = page.locator(`[data-testid="${b.id}"]`);
      let isVisible = await btnLoc.isVisible().catch(() => false);
      if (!isVisible) {
        // Return to main menu
        const menuBtn = page.locator('[data-testid="dalia-main-menu-btn"]').first();
        if (await menuBtn.isVisible().catch(() => false)) {
          await menuBtn.click();
          await page.waitForTimeout(600);
        } else {
          const navAi = page.locator('[data-testid="dalia-nav-ai"]').first();
          if (await navAi.isVisible().catch(() => false)) {
            await navAi.click();
            await page.waitForTimeout(600);
          }
        }
      }

      await btnLoc.waitFor({ state: 'visible', timeout: 8000 });

      // Clear spoken records before click
      await page.evaluate(() => { window.__spokenUtterances = []; });

      // Click the button
      await btnLoc.click();
      await page.waitForTimeout(600);

      // Verify speech was triggered
      const spoken = await page.evaluate(() => window.__spokenUtterances);
      console.log(`  🔊 Spoken utterances count: ${spoken.length}`);
      if (spoken.length === 0) {
        throw new Error(`Button "${b.name}" did NOT trigger SpeechSynthesis.speak()!`);
      }

      const lastSpoken = spoken[spoken.length - 1];
      console.log(`  🗣️ Last spoken text: "${lastSpoken.text}"`);
      console.log(`  🌐 Lang: ${lastSpoken.lang}`);

      const matched = lastSpoken.text.includes(b.expectedSnippet);
      console.log(`  ✓ Text matches expected snippet ("${b.expectedSnippet}"): ${matched}`);
      if (!matched) {
        throw new Error(`Spoken text did not contain "${b.expectedSnippet}". Got: "${lastSpoken.text}"`);
      }

      // Verify voice bar is active and transitions to listening
      const voiceBar = page.locator('[data-testid="claims-ai-voice-mode-bar"]');
      await voiceBar.waitFor({ state: 'visible', timeout: 5000 });
      const barClass = await voiceBar.getAttribute('class');
      console.log(`  🎙️ Voice bar state: ${barClass}`);

      await page.screenshot({ path: path.join(SHOTS_DIR, `0${i + 2}-mobile-btn-${i + 1}-${b.id}.png`) });

      results.push({
        button: b.name,
        id: b.id,
        status: 'PASS',
        spokenText: lastSpoken.text,
        lang: lastSpoken.lang,
      });

      // Stop / pause before next test
      const stopBtn = page.locator('[data-testid="claims-ai-voice-stop-btn"]');
      if (await stopBtn.isVisible().catch(() => false)) {
        await stopBtn.click();
        await page.waitForTimeout(300);
      }
    }

    // -------------------------------------------------------------------------
    // TEST 10: Page Reload (F5) on Mobile and Voice Continuity
    // -------------------------------------------------------------------------
    console.log(`\n------------------------------------------------------------`);
    console.log(`[TEST 10] Testing Page Reload (F5) on Mobile...`);
    console.log(`------------------------------------------------------------`);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const fabAfterReload = page.locator('[data-testid="garage-ai-launch-btn"]');
    await fabAfterReload.waitFor({ state: 'visible', timeout: 10000 });
    await fabAfterReload.click();
    await page.waitForTimeout(1000);

    // Verify button 9 (resume) can be clicked and speaks
    await page.evaluate(() => { window.__spokenUtterances = []; });
    const resumeBtn = page.locator('[data-testid="garage-action-resume"]');
    await resumeBtn.waitFor({ state: 'visible', timeout: 5000 });
    await resumeBtn.click();
    await page.waitForTimeout(600);

    const spokenAfterReload = await page.evaluate(() => window.__spokenUtterances);
    console.log(`  🔊 Spoken after reload count: ${spokenAfterReload.length}`);
    if (spokenAfterReload.length === 0) {
      throw new Error('Speech synthesis failed to speak after page reload!');
    }
    console.log(`  🗣️ Spoken after reload text: "${spokenAfterReload[0].text}"`);
    results.push({
      button: 'המשך פעולה לאחר ריענון F5',
      id: 'reload_resume',
      status: 'PASS',
      spokenText: spokenAfterReload[0].text,
      lang: spokenAfterReload[0].lang,
    });

    console.log('\n================================================================');
    console.log('🎉 ALL 9 BUTTONS + RELOAD VERIFIED SUCCESSFULLY ON MOBILE CHROME!');
    console.log('================================================================');

    const reportPath = path.resolve('backups/mobile-all-9-voice-report.json');
    fs.writeFileSync(reportPath, JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2), 'utf8');
    console.log('Saved report to:', reportPath);

  } catch (err) {
    console.error('❌ Mobile Verification Error:', err);
    await page.screenshot({ path: path.join(SHOTS_DIR, 'error-mobile-test.png') }).catch(() => {});
    throw err;
  } finally {
    await browser.close();
  }
}

verifyAll9MobileButtons().catch(e => {
  console.error(e);
  process.exit(1);
});
