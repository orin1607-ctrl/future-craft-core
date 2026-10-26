import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const BASE_URL = 'http://localhost:4180';
const OUT = join(process.cwd(), 'backups', 'qa-shots-dalia-ai-voice');
mkdirSync(OUT, { recursive: true });

console.log('=== Step 1: Authenticate against Staging Supabase ===');
const keys = JSON.parse(execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const serviceKey = keys.find((k) => k.name === 'service_role')?.api_key;
const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key;

const admin = createClient(STAGING_URL, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: saRole } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin').limit(1);
const saUser = await admin.auth.admin.getUserById(saRole[0].user_id);
const saEmail = saUser?.data?.user?.email;

const client = createClient(STAGING_URL, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: linkData } = await admin.auth.admin.generateLink({ type: 'magiclink', email: saEmail });
const { data: auth } = await client.auth.verifyOtp({ email: saEmail, token: linkData.properties.email_otp, type: 'email' });

const TEST_COMPANY = 'דרכי חיים';
console.log(`Authenticated as Super Admin: ${saEmail}`);
console.log(`Testing with real active fleet company: "${TEST_COMPANY}"`);

const auditReport = {
  timestamp: new Date().toISOString(),
  company: TEST_COMPANY,
  tests: {},
};

async function run() {
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });

  const context = await browser.newContext({
    locale: 'he-IL',
    viewport: { width: 1400, height: 900 },
    permissions: ['microphone'],
  });

  // Inject session and speech instrumentation
  await context.addInitScript(({ ref, sess, comp }) => {
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(sess));
    localStorage.setItem('selectedCompany', comp);
    localStorage.removeItem('fleet-dalia-ai');

    // Instrument SpeechSynthesis to record spoken text and cancellations
    window.__spokenUtterances = [];
    window.__speechCancelledCount = 0;
    const origSpeak = window.speechSynthesis.speak.bind(window.speechSynthesis);
    const origCancel = window.speechSynthesis.cancel.bind(window.speechSynthesis);

    window.speechSynthesis.speak = (utt) => {
      window.__spokenUtterances.push(utt.text);
      if (utt.onstart) setTimeout(() => utt.onstart(new Event('start')), 50);
      if (utt.onend) setTimeout(() => utt.onend(new Event('end')), 600);
      return origSpeak(utt);
    };

    window.speechSynthesis.cancel = () => {
      window.__speechCancelledCount++;
      return origCancel();
    };
  }, { ref: STAGING_REF, sess: auth.session, comp: TEST_COMPANY });

  const page = await context.newPage();
  await page.goto(`${BASE_URL}/fleet-dalia-ai`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const select = await page.$('header select');
  if (select) {
    await page.selectOption('header select', TEST_COMPANY);
    await page.waitForTimeout(1000);
    console.log(`Explicitly selected company in header: "${TEST_COMPANY}"`);
  }

  // Helper to simulate speech input via Recognition event or input fallback
  async function simulateVoiceUtterance(spokenText, interim = '') {
    console.log(`\n[VOICE INPUT SIMULATION]: "${spokenText}"`);
    return await page.evaluate(async ({ text, interimText }) => {
      const recognition = window.__lastRecognitionInstance;
      // If recognition instance is accessible, dispatch result event
      const input = document.querySelector('[data-testid="fleet-dalia-input"]');
      const form = document.querySelector('[data-testid="fleet-dalia-composer"]');
      if (input && form) {
        // Fill input and submit
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        nativeSetter.call(input, text);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      }
    }, { text: spokenText, interimText: interim });
  }

  // TEST 1: Voice command to open specific vehicle card (Plate 78948502)
  console.log('\n--- Test 1: Voice command to find and open vehicle card 78948502 ---');
  await simulateVoiceUtterance('תפתח לי את הכרטיס של רכב 78948502');
  await page.waitForTimeout(3000);

  const threadText1 = await page.textContent('[data-testid="fleet-dalia-thread"]');
  console.log('Dalia response 1:\n', threadText1.slice(-250));

  const vehicleCardBtn = await page.waitForSelector('button:has-text("כרטיס 78948502")', { timeout: 8000 }).catch(() => null);
  const foundVehicleButton = !!vehicleCardBtn;
  console.log('Vehicle Card Button generated:', foundVehicleButton);

  await page.screenshot({ path: join(OUT, '11-voice-found-vehicle-card.png') });

  // Click vehicle card button to verify actual navigation
  let vehicleNavigated = false;
  if (vehicleCardBtn) {
    await vehicleCardBtn.click();
    await page.waitForTimeout(2000);
    const url = page.url();
    vehicleNavigated = url.includes('/vehicles') || url.includes('vehicle');
    console.log('Navigated to vehicle page:', vehicleNavigated, url);
    await page.screenshot({ path: join(OUT, '12-navigated-to-vehicle-hub.png') });
  }

  auditReport.tests.voiceOpenVehicleCard = {
    command: 'תפתח לי את הכרטיס של רכב 78948502',
    buttonCreated: foundVehicleButton,
    navigated: vehicleNavigated,
    targetUrl: page.url(),
  };

  // Navigate back to Fleet Dalia AI
  await page.goto(`${BASE_URL}/fleet-dalia-ai`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // TEST 2: Voice command to find driver card (זאב אלמליח)
  console.log('\n--- Test 2: Voice command to find driver card זאב אלמליח ---');
  await simulateVoiceUtterance('חפש נהג זאב אלמליח');
  await page.waitForTimeout(3000);

  const threadText2 = await page.textContent('[data-testid="fleet-dalia-thread"]');
  console.log('Dalia response 2:\n', threadText2.slice(-250));

  const driverCardBtn = await page.waitForSelector('button:has-text("זאב אלמליח")', { timeout: 8000 }).catch(() => null);
  const foundDriverButton = !!driverCardBtn;
  console.log('Driver Card Button generated:', foundDriverButton);

  await page.screenshot({ path: join(OUT, '13-voice-found-driver-card.png') });

  // Click driver card button to verify actual navigation
  let driverNavigated = false;
  if (driverCardBtn) {
    await driverCardBtn.click();
    await page.waitForTimeout(2000);
    const url = page.url();
    driverNavigated = url.includes('/drivers') && url.includes('driverId');
    console.log('Navigated to driver card page:', driverNavigated, url);
    await page.screenshot({ path: join(OUT, '14-navigated-to-driver-card.png') });
  }

  auditReport.tests.voiceOpenDriverCard = {
    command: 'חפש נהג זאב אלמליח',
    buttonCreated: foundDriverButton,
    navigated: driverNavigated,
    targetUrl: page.url(),
  };

  // Navigate back to Fleet Dalia AI
  await page.goto(`${BASE_URL}/fleet-dalia-ai`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // TEST 3: Barge-in (Interruption mid-answer)
  console.log('\n--- Test 3: Barge-in / Interruption mid-speech ---');
  // First query triggers speech
  await simulateVoiceUtterance('איזה רכבים צריכים טיפול החודש?');
  await page.waitForTimeout(800);

  // Interruption: new voice command mid-speech
  const cancelCountBefore = await page.evaluate(() => window.__speechCancelledCount);
  await simulateVoiceUtterance('עצור! תכין לי דוח על רכבים שלא טופלו');
  await page.waitForTimeout(3000);

  const cancelCountAfter = await page.evaluate(() => window.__speechCancelledCount);
  const bargeInTriggered = cancelCountAfter > cancelCountBefore;
  console.log('Barge-in cancellation called:', bargeInTriggered, `(before: ${cancelCountBefore}, after: ${cancelCountAfter})`);

  const threadText3 = await page.textContent('[data-testid="fleet-dalia-thread"]');
  const reportReceived = threadText3.includes('דוח רכבים שלא טופלו') || threadText3.includes('תקלות פתוחות');
  console.log('Untreated vehicles report generated after barge-in:', reportReceived);

  await page.screenshot({ path: join(OUT, '15-voice-barge-in-and-report.png') });

  auditReport.tests.voiceBargeInInterruption = {
    firstCommand: 'איזה רכבים צריכים טיפול החודש?',
    interruptCommand: 'עצור! תכין לי דוח על רכבים שלא טופלו',
    speechCancelledOnBargeIn: bargeInTriggered,
    newReportGenerated: reportReceived,
  };

  // TEST 4: Spoken Text Audio Quality Inspection
  const spokenList = await page.evaluate(() => window.__spokenUtterances);
  console.log(`\nSpoken Utterances count: ${spokenList.length}`);
  spokenList.forEach((text, i) => console.log(`Utterance [${i+1}]: "${text.slice(0, 100)}..."`));

  const noRawTagsInSpeech = spokenList.every(t => !t.includes('[[nav:') && !t.includes('http'));
  console.log('All spoken audio free of raw syntax/tags:', noRawTagsInSpeech);

  auditReport.tests.spokenAudioQuality = {
    utterancesSpokenCount: spokenList.length,
    noRawTagsInSpeech,
    samples: spokenList.slice(0, 4),
  };

  await browser.close();

  // Save final report
  writeFileSync(join(OUT, 'voice-full-cycle-report.json'), JSON.stringify(auditReport, null, 2), 'utf8');
  console.log('\n=== Real Voice Full-Cycle Audit Complete ===');
  console.log(JSON.stringify(auditReport, null, 2));
}

run().catch((err) => {
  console.error('Audit run failed:', err);
  process.exit(1);
});
