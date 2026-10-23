// scripts/verify-dalia-voice-workflows.mjs
// Comprehensive Browser & DB Verification for Dalia AI Hands-Free Voice Workflows

import { chromium } from 'playwright';
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

const SHOTS_DIR = path.resolve('backups/qa-shots-dalia-voice-20261023');
if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });

async function verifyVoiceWorkflows() {
  console.log('================================================================');
  console.log('🎤 VERIFYING DALIA AI INTERACTIVE TWO-WAY VOICE WORKFLOWS');
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

  // 2. Launch Chromium with permissions
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--enable-speech-dispatcher',
      '--no-sandbox',
    ],
  });

  const ctx = await browser.newContext({
    permissions: ['microphone'],
    viewport: { width: 1440, height: 900 },
  });

  const storageKey = `sb-${STAGING_REF}-auth-token`;
  await ctx.addInitScript(({ key, session }) => {
    window.localStorage.setItem(key, JSON.stringify(session));
  }, { key: storageKey, session: auth.session });

  const page = await ctx.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  // Mock SpeechRecognition and SpeechSynthesis in headless environment so test runs reliably
  await page.addInitScript(() => {
    // Mock SpeechRecognition and SpeechSynthesis on prototypes for reliable headless execution
    class MockSpeechRecognition extends EventTarget {
      constructor() {
        super();
        this.lang = 'he-IL';
        this.continuous = true;
        this.interimResults = true;
        this.onresult = null;
        this.onerror = null;
        this.onend = null;
        window.__mockRecognition = this;
      }
      start() {
        this._running = true;
      }
      stop() {
        this._running = false;
        if (this.onend) this.onend(new Event('end'));
      }
      abort() {
        this.stop();
      }
    }
    window.SpeechRecognition = MockSpeechRecognition;
    window.webkitSpeechRecognition = MockSpeechRecognition;

    if (window.SpeechSynthesis && window.SpeechSynthesis.prototype) {
      window.SpeechSynthesis.prototype.getVoices = function() {
        return [
          { name: 'Microsoft Asaf - Hebrew (Israel)', lang: 'he-IL', default: true, voiceURI: 'asaf' },
          { name: 'Google Hebrew', lang: 'he-IL', default: false, voiceURI: 'google-he' },
        ];
      };
      window.SpeechSynthesis.prototype.speak = function(utter) {
        window.__lastUtterance = utter;
        setTimeout(() => {
          if (utter && utter.onend) {
            utter.onend(new Event('end'));
          }
        }, 120);
      };
    }
  });

  async function simulateSpeech(text) {
    // Wait until Dalia finished speaking and is actively listening (listening or waiting_confirm)
    await page.locator('.claims-ai-voice-mode-bar:not(.phase-speaking)').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(150);
    await page.evaluate((t) => {
      const rec = window.__mockRecognition;
      if (rec && rec.onresult) {
        const resItem = [{ transcript: t }];
        resItem.isFinal = true;
        rec.onresult({ results: [resItem], resultIndex: 0 });
      }
    }, text);
    await page.waitForTimeout(2500); // Wait for 1300ms silence timer + state advance
  }

  const report = {
    timestamp: new Date().toISOString(),
    tests: [],
  };

  try {
    // Navigate to Garage Management
    console.log('[NAV] Navigating to http://localhost:4179/garage-management...');
    await page.goto('http://localhost:4179/garage-management', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SHOTS_DIR, '01-garage-main.png'), fullPage: true });

    // Open Dalia AI Drawer
    console.log('[STEP 1] Launching Dalia AI drawer...');
    const launchBtn = page.locator('[data-testid="garage-ai-launch-btn"]');
    await launchBtn.waitFor({ state: 'visible', timeout: 15000 });
    await launchBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SHOTS_DIR, '02-dalia-opened.png') });

    // Verify all 9 action buttons exist
    const buttons = [
      { id: 'garage-action-new-customer', name: 'לקוח חדש' },
      { id: 'garage-action-existing-customer', name: 'לקוח קיים' },
      { id: 'garage-action-intake', name: 'קבלת רכב לעבודה' },
      { id: 'garage-action-quote', name: 'הצעת מחיר' },
      { id: 'garage-action-invoices-credits', name: 'חשבוניות וזיכויים' },
      { id: 'garage-action-general-expenses', name: 'ספקים וחשבוניות כלליות' },
      { id: 'garage-action-find-case', name: 'איתור תיק עבודה' },
      { id: 'garage-action-close-case', name: 'סגירת תיק עבודה' },
      { id: 'garage-action-resume', name: 'המשך פעולה אחרונה' },
    ];

    console.log('[STEP 2] Verifying 9 dashboard action buttons...');
    for (const b of buttons) {
      const loc = page.locator(`[data-testid="${b.id}"]`);
      const exists = await loc.count();
      if (exists === 0) throw new Error(`Button ${b.id} not found!`);
      console.log(`  ✓ Button: ${b.name} (${b.id}) is present`);
    }

    report.tests.push({ name: 'all_9_buttons_present', status: 'PASS' });

    // ---------------------------------------------------------------------------
    // TEST 1: Click "לקוח חדש" -> Auto-Start Voice Workflow Hands-Free
    // ---------------------------------------------------------------------------
    console.log('\n[STEP 3] Testing Button 1: "לקוח חדש" Auto Voice Start...');
    const newCustBtn = page.locator('[data-testid="garage-action-new-customer"]');
    await newCustBtn.click();
    await page.waitForTimeout(1000);

    // Verify Voice Mode Bar is active
    const voiceBar = page.locator('[data-testid="claims-ai-voice-mode-bar"]');
    await voiceBar.waitFor({ state: 'visible', timeout: 5000 });
    console.log('  ✓ Voice Mode Bar is active');

    // Verify Stop Button is present
    const stopBtn = page.locator('[data-testid="claims-ai-voice-stop-btn"]');
    const hasStop = await stopBtn.count();
    console.log(`  ✓ Red Stop Button present: ${hasStop > 0}`);

    // Verify Dalia spoke opening question
    const firstMsg = page.locator('.claims-ai-row.assistant .claims-ai-bubble').last();
    const firstText = await firstMsg.textContent();
    console.log(`  ✓ Opening Question spoken by Dalia: "${firstText.trim()}"`);
    if (!firstText.includes('שם הלקוח')) {
      throw new Error('Expected opening question about customer name, got: ' + firstText);
    }
    await page.screenshot({ path: path.join(SHOTS_DIR, '03-new-customer-voice-started.png') });
    report.tests.push({ name: 'new_customer_auto_voice_start', status: 'PASS', prompt: firstText.trim() });

    // ---------------------------------------------------------------------------
    // TEST 2: Voice Input & Step Progression (Hands-Free)
    // ---------------------------------------------------------------------------
    console.log('VOICE BAR CLASS:', await page.locator('[data-testid="claims-ai-voice-mode-bar"]').getAttribute('class'));
    console.log('VOICE BAR TEXT:', await page.locator('[data-testid="claims-ai-voice-mode-bar"]').textContent());
    console.log('\n[STEP 4] Simulating user voice response: "ישראל ישראלי QA-TEST-20261023"...');
    // Simulate user answering customer name via speech
    await simulateSpeech('ישראל ישראלי QA-TEST-20261023');

    // Verify next question was asked automatically: phone number
    const secondMsg = page.locator('.claims-ai-row.assistant .claims-ai-bubble').last();
    const secondText = await secondMsg.textContent();
    console.log(`  ✓ Dalia automatically advanced to next question: "${secondText.trim()}"`);
    if (!secondText.includes('טלפון')) {
      throw new Error('Expected question about customer phone, got: ' + secondText);
    }
    await page.screenshot({ path: path.join(SHOTS_DIR, '04-voice-advanced-to-phone.png') });
    report.tests.push({ name: 'voice_hands_free_step_progression', status: 'PASS', prompt: secondText.trim() });

    // ---------------------------------------------------------------------------
    // TEST 3: Stop / Pause Voice & Conversational Memory ("דליה תמשיכי")
    // ---------------------------------------------------------------------------
    console.log('\n[STEP 5] Testing Stop button & conversational memory persistence...');
    await stopBtn.click();
    await page.waitForTimeout(1000);

    // Verify state in localStorage
    const savedState = await page.evaluate(() => {
      return localStorage.getItem('dalia_voice_workflow_state');
    });
    console.log('  ✓ Saved workflow state in localStorage:', savedState ? 'YES' : 'NO');
    const parsedState = JSON.parse(savedState || '{}');
    if (!parsedState.customerName || !parsedState.customerName.includes('ישראל ישראלי')) {
      throw new Error('State did not preserve customerName: ' + savedState);
    }
    console.log(`  ✓ Preserved customerName in state: "${parsedState.customerName}" at stepIndex: ${parsedState.stepIndex}`);
    await page.screenshot({ path: path.join(SHOTS_DIR, '05-voice-stopped-state-preserved.png') });

    // Test Reload (F5) and resume via "המשך פעולה אחרונה"
    console.log('\n[STEP 6] Testing Reload (F5) and Resume ("המשך פעולה אחרונה")...');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Re-open Dalia AI
    const launchBtn2 = page.locator('[data-testid="garage-ai-launch-btn"]');
    await launchBtn2.waitFor({ state: 'visible', timeout: 15000 });
    await launchBtn2.click();
    await page.waitForTimeout(1000);

    // Click "המשך פעולה אחרונה"
    const resumeBtn = page.locator('[data-testid="garage-action-resume"]');
    await resumeBtn.waitFor({ state: 'visible', timeout: 5000 });
    await resumeBtn.click();
    await page.waitForTimeout(1500);

    const resumedMsg = page.locator('.claims-ai-row.assistant .claims-ai-bubble').last();
    const resumedText = await resumedMsg.textContent();
    console.log(`  ✓ Dalia resumed from saved memory: "${resumedText.trim()}"`);
    if (!resumedText.includes('ישראל ישראלי') || !resumedText.includes('טלפון')) {
      throw new Error('Resume message did not mention customer name and phone step: ' + resumedText);
    }
    await page.screenshot({ path: path.join(SHOTS_DIR, '06-resumed-from-memory.png') });
    report.tests.push({ name: 'conversational_memory_resume_after_reload', status: 'PASS', prompt: resumedText.trim() });

    // ---------------------------------------------------------------------------
    // TEST 4: Direct Database Execution of Voice Workflow
    // ---------------------------------------------------------------------------
    console.log('\n[STEP 7] Completing remaining steps to test database creation...');
    // Provide phone
    await simulateSpeech('050-9876543');

    // Private/business
    await simulateSpeech('פרטי');

    // Vehicle plate
    await simulateSpeech('99-888-77');

    // Vehicle model
    await simulateSpeech('טויוטה קורולה');

    // Is in garage now
    await simulateSpeech('כן במוסך');

    // Complaint
    await simulateSpeech('רעש מהבלמים ובדיקת חורף QA-TEST-20261023');

    // Summary confirmation prompt
    const summaryMsg = page.locator('.claims-ai-row.assistant .claims-ai-bubble').last();
    const summaryText = await summaryMsg.textContent();
    console.log(`  ✓ Dalia read summary recap aloud: "${summaryText.trim()}"`);
    if (!summaryText.includes('סיימנו לאסוף') || !summaryText.includes('9988877')) {
      throw new Error('Summary prompt did not include collected details: ' + summaryText);
    }
    await page.screenshot({ path: path.join(SHOTS_DIR, '07-summary-recap-aloud.png') });

    // Say "כן תשמרי"
    console.log('  -> Simulating user voice approval: "כן תשמרי"');
    await simulateSpeech('כן תשמרי');

    // Verify executed confirmation message
    const doneMsg = page.locator('.claims-ai-row.assistant .claims-ai-bubble').last();
    const doneText = await doneMsg.textContent();
    console.log(`  ✓ Dalia confirmed creation in DB: "${doneText.trim()}"`);
    await page.screenshot({ path: path.join(SHOTS_DIR, '08-case-created-in-db.png') });

    // Verify record in Supabase database
    const { data: dbCase } = await admin
      .from('garage_cases')
      .select('*')
      .eq('vehicle_plate_snapshot', '9988877')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!dbCase) throw new Error('Case was not found in Supabase garage_cases table!');
    console.log(`  ✓ Database Verification: Case ${dbCase.case_number} exists in garage_cases (ID: ${dbCase.id})`);
    report.tests.push({
      name: 'voice_workflow_db_execution',
      status: 'PASS',
      case_number: dbCase.case_number,
      case_id: dbCase.id,
      customer: dbCase.customer_name_snapshot,
      plate: dbCase.vehicle_plate_snapshot,
    });

    console.log('\n================================================================');
    console.log('🎉 ALL DALIA VOICE WORKFLOW TESTS COMPLETED SUCCESSFULLY!');
    console.log('================================================================');

    const reportFile = path.resolve('backups/dalia-voice-workflows-report.json');
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf8');
    console.log('Saved detailed report to:', reportFile);

  } catch (err) {
    console.error('❌ Verification Error:', err);
    await page.screenshot({ path: path.join(SHOTS_DIR, 'error-verification.png'), fullPage: true }).catch(() => {});
    throw err;
  } finally {
    await browser.close();
  }
}

verifyVoiceWorkflows().catch((err) => {
  console.error(err);
  process.exit(1);
});
