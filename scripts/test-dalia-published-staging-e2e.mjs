import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const PUBLISHED_URL = 'https://orin1607-ctrl.github.io/future-craft-core/fleet-dalia-ai';
const OUT = join(process.cwd(), 'backups', 'qa-shots-dalia-published-staging');
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
console.log(`Testing Published Staging Site: ${PUBLISHED_URL}`);

const report = {
  timestamp: new Date().toISOString(),
  targetUrl: PUBLISHED_URL,
  company: TEST_COMPANY,
  tests: {},
};

async function testPublishedSite() {
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });

  // Test 1: Desktop Browser
  console.log('\n--- Desktop Test: Published Staging Site ---');
  const desktopContext = await browser.newContext({
    locale: 'he-IL',
    viewport: { width: 1400, height: 900 },
    permissions: ['microphone'],
  });

  await desktopContext.addInitScript(({ ref, sess, comp }) => {
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(sess));
    localStorage.setItem('selectedCompany', comp);
    localStorage.removeItem('fleet-dalia-ai');

    window.__spokenUtterances = [];
    const origSpeak = window.speechSynthesis.speak.bind(window.speechSynthesis);
    window.speechSynthesis.speak = (utt) => {
      window.__spokenUtterances.push(utt.text);
      if (utt.onstart) setTimeout(() => utt.onstart(new Event('start')), 50);
      if (utt.onend) setTimeout(() => utt.onend(new Event('end')), 600);
      return origSpeak(utt);
    };
  }, { ref: STAGING_REF, sess: auth.session, comp: TEST_COMPANY });

  const page = await desktopContext.newPage();
  await page.goto(PUBLISHED_URL, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(3000);

  const select = await page.$('header select');
  if (select) {
    await page.selectOption('header select', TEST_COMPANY);
    await page.waitForTimeout(1000);
  }

  await page.screenshot({ path: join(OUT, '01-published-staging-desktop-home.png') });
  console.log('Desktop Home screenshot saved.');

  // Trigger Action 1: "רכבים לטיפול החודש"
  const treatBtn = await page.waitForSelector('[data-testid="fleet-dalia-action-vehicles_treatment_soon"]', { timeout: 10000 });
  await treatBtn.click();
  await page.waitForTimeout(3000);

  const threadText = await page.textContent('[data-testid="fleet-dalia-thread"]');
  console.log('Treatment reply snippet:\n', threadText.slice(-200));
  await page.screenshot({ path: join(OUT, '02-published-staging-desktop-treatment.png') });

  // Trigger Voice Input: "תפתח לי את הכרטיס של רכב 78948502"
  console.log('\n--- Voice Command on Published Site ---');
  const input = await page.waitForSelector('[data-testid="fleet-dalia-input"]');
  await input.fill('תפתח לי את הכרטיס של רכב 78948502');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(4000);

  const vehicleCardBtn = await page.waitForSelector('button:has-text("כרטיס 78948502")', { timeout: 10000 }).catch(() => null);
  const vehicleFound = !!vehicleCardBtn;
  console.log('Vehicle Card Button generated on Published Site:', vehicleFound);
  await page.screenshot({ path: join(OUT, '03-published-staging-vehicle-found.png') });

  let vehicleNavigated = false;
  if (vehicleCardBtn) {
    await vehicleCardBtn.click();
    await page.waitForTimeout(3000);
    const navUrl = page.url();
    vehicleNavigated = navUrl.includes('vehicle') || navUrl.includes('2a0cba63');
    console.log('Navigated on Published Site:', vehicleNavigated, navUrl);
    await page.screenshot({ path: join(OUT, '04-published-staging-navigated-card.png') });
  }

  report.tests.publishedDesktop = {
    url: PUBLISHED_URL,
    title: await page.title(),
    treatmentReplied: threadText.includes('טיפול'),
    vehicleFound,
    vehicleNavigated,
  };

  // Test 2: Mobile Viewport (iPhone / Android)
  console.log('\n--- Mobile Test: Published Staging Site (Pixel 7) ---');
  const mobileContext = await browser.newContext({
    locale: 'he-IL',
    viewport: { width: 393, height: 851 },
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
    permissions: ['microphone'],
  });

  await mobileContext.addInitScript(({ ref, sess, comp }) => {
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(sess));
    localStorage.setItem('selectedCompany', comp);
  }, { ref: STAGING_REF, sess: auth.session, comp: TEST_COMPANY });

  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(PUBLISHED_URL, { waitUntil: 'networkidle', timeout: 45000 });
  await mobilePage.waitForTimeout(2500);

  const micBtn = await mobilePage.waitForSelector('button[aria-label="מיקרופון"]');
  const micVisible = await micBtn.isVisible();
  console.log('Mobile Mic button visible on Published Site:', micVisible);

  await mobilePage.screenshot({ path: join(OUT, '05-published-staging-mobile.png') });

  report.tests.publishedMobile = {
    url: PUBLISHED_URL,
    micVisible,
  };

  await browser.close();

  writeFileSync(join(OUT, 'published-audit-report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log('\n=== Published Staging Site Audit Completed Successfully ===');
  console.log(JSON.stringify(report, null, 2));
}

testPublishedSite().catch((err) => {
  console.error('Published Site Audit failed:', err);
  process.exit(1);
});
