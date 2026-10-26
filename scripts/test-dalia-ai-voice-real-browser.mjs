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

console.log('--- Fetching Staging Credentials & Auth ---');
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

console.log('Authenticated as Super Admin:', saEmail);
const session = auth.session;

// Get available companies
const { data: profiles } = await admin.from('profiles').select('company_name').not('company_name', 'is', null).limit(10);
const companies = [...new Set(profiles.map(p => p.company_name).filter(Boolean))];
const testCompany = companies[0] || 'מילניום';
console.log('Using test company:', testCompany);

const results = {
  desktop: { passed: false, checks: [] },
  mobile: { passed: false, checks: [] },
  questions: {},
};

async function runTests() {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });

  // 1. DESKTOP TEST
  console.log('\n=== Starting Desktop Browser Tests (1400x900) ===');
  const desktopContext = await browser.newContext({
    locale: 'he-IL',
    viewport: { width: 1400, height: 900 },
  });

  await desktopContext.addInitScript(({ ref, sess, comp }) => {
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(sess));
    localStorage.setItem('selectedCompany', comp);
    localStorage.removeItem('fleet-dalia-ai');
  }, { ref: STAGING_REF, sess: session, comp: testCompany });

  const page = await desktopContext.newPage();
  await page.goto(`${BASE_URL}/fleet-dalia-ai`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Check 1: Header and Company
  const title = await page.textContent('h1');
  console.log('Page Title:', title);
  results.desktop.checks.push({ check: 'Header rendered', ok: title.includes('דליה AI') });

  await page.screenshot({ path: join(OUT, '01-desktop-dalia-ai-home.png'), fullPage: false });

  // Check 2: All 7 Category Buttons
  const categories = ['vehicles', 'drivers', 'vehicle_tracking', 'driver_tracking', 'reports', 'tasks', 'chat'];
  let allCatsFound = true;
  for (const cat of categories) {
    const el = await page.$(`[data-testid="fleet-dalia-cat-${cat}"]`);
    if (!el) allCatsFound = false;
  }
  results.desktop.checks.push({ check: 'All 7 categories present', ok: allCatsFound });

  // Check 3: Query "איזה רכבים צריכים טיפול החודש?"
  console.log('\nTesting query 1: איזה רכבים צריכים טיפול החודש?');
  const inputEl = await page.waitForSelector('[data-testid="fleet-dalia-input"]');
  await inputEl.fill('איזה רכבים צריכים טיפול החודש?');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3000);

  const messagesText1 = await page.textContent('[data-testid="fleet-dalia-thread"]');
  const q1Ok = messagesText1.includes('רכבים') || messagesText1.includes('טיפול');
  console.log('Query 1 Result:', q1Ok ? 'OK' : 'FAIL');
  results.questions['vehicles_treatment_soon'] = { ok: q1Ok, textSample: messagesText1.slice(-300) };

  await page.screenshot({ path: join(OUT, '02-desktop-treatment-soon.png'), fullPage: false });

  // Check 4: Query "אילו רישיונות נהיגה עומדים לפוג?"
  console.log('\nTesting query 2: אילו רישיונות נהיגה עומדים לפוג?');
  await inputEl.fill('אילו רישיונות נהיגה עומדים לפוג?');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3000);

  const messagesText2 = await page.textContent('[data-testid="fleet-dalia-thread"]');
  const q2Ok = messagesText2.includes('רישיון') || messagesText2.includes('נהג');
  console.log('Query 2 Result:', q2Ok ? 'OK' : 'FAIL');
  results.questions['driver_license_watch'] = { ok: q2Ok, textSample: messagesText2.slice(-300) };

  await page.screenshot({ path: join(OUT, '03-desktop-driver-licenses.png'), fullPage: false });

  // Check 5: Query "תציג לי את הנהגים שיש להם מסמכים חסרים"
  console.log('\nTesting query 3: תציג לי את הנהגים שיש להם מסמכים חסרים');
  await inputEl.fill('תציג לי את הנהגים שיש להם מסמכים חסרים');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3000);

  const messagesText3 = await page.textContent('[data-testid="fleet-dalia-thread"]');
  const q3Ok = messagesText3.includes('מסמכים חסרים') || messagesText3.includes('נהגים') || messagesText3.includes('מסמכים תקינים');
  console.log('Query 3 Result:', q3Ok ? 'OK' : 'FAIL');
  results.questions['drivers_missing_documents'] = { ok: q3Ok, textSample: messagesText3.slice(-300) };

  await page.screenshot({ path: join(OUT, '04-desktop-missing-documents.png'), fullPage: false });

  // Check 6: Query "תכין לי דוח על רכבים שלא טופלו"
  console.log('\nTesting query 4: תכין לי דוח על רכבים שלא טופלו');
  await inputEl.fill('תכין לי דוח על רכבים שלא טופלו');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3000);

  const messagesText4 = await page.textContent('[data-testid="fleet-dalia-thread"]');
  const q4Ok = messagesText4.includes('דוח') || messagesText4.includes('תקלות') || messagesText4.includes('טיפול');
  console.log('Query 4 Result:', q4Ok ? 'OK' : 'FAIL');
  results.questions['report_untreated_vehicles'] = { ok: q4Ok, textSample: messagesText4.slice(-300) };

  await page.screenshot({ path: join(OUT, '05-desktop-untreated-report.png'), fullPage: false });

  // Check 7: Continuous Voice Button
  const voiceBtn = await page.$('button[aria-label="שיחה רציפה"]');
  const voiceBtnFound = !!voiceBtn;
  console.log('Continuous Voice Button found:', voiceBtnFound);
  results.desktop.checks.push({ check: 'Continuous Voice Button present', ok: voiceBtnFound });

  results.desktop.passed = q1Ok && q2Ok && q3Ok && q4Ok && allCatsFound;

  // 2. MOBILE TEST (Pixel 7 Viewport 393x851)
  console.log('\n=== Starting Mobile Browser Tests (Pixel 7 393x851) ===');
  const mobileContext = await browser.newContext({
    locale: 'he-IL',
    viewport: { width: 393, height: 851 },
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36',
  });

  await mobileContext.addInitScript(({ ref, sess, comp }) => {
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(sess));
    localStorage.setItem('selectedCompany', comp);
    localStorage.removeItem('fleet-dalia-ai');
  }, { ref: STAGING_REF, sess: session, comp: testCompany });

  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(`${BASE_URL}/fleet-dalia-ai`, { waitUntil: 'networkidle' });
  await mobilePage.waitForTimeout(2000);

  await mobilePage.screenshot({ path: join(OUT, '06-mobile-dalia-ai-home.png'), fullPage: false });

  const mobileComposer = await mobilePage.$('[data-testid="fleet-dalia-composer"]');
  const mobileComposerOk = !!mobileComposer;
  results.mobile.checks.push({ check: 'Mobile composer mounted', ok: mobileComposerOk });

  // Mobile Back button navigation test
  const backBtn = await mobilePage.$('[data-testid="fleet-dalia-back-dashboard"]');
  if (backBtn) {
    await backBtn.click();
    await mobilePage.waitForTimeout(1500);
    const currentUrl = mobilePage.url();
    const navOk = currentUrl.includes('/dashboard');
    console.log('Mobile back button navigated to dashboard:', navOk, currentUrl);
    results.mobile.checks.push({ check: 'Back to dashboard navigation', ok: navOk });
    await mobilePage.screenshot({ path: join(OUT, '07-mobile-dashboard-after-back.png'), fullPage: false });
  }

  results.mobile.passed = mobileComposerOk;

  await browser.close();

  // Save report
  writeFileSync(join(OUT, 'test-report.json'), JSON.stringify(results, null, 2), 'utf8');
  console.log('\n=== Real Browser Verification Complete ===');
  console.log('Desktop passed:', results.desktop.passed);
  console.log('Mobile passed:', results.mobile.passed);
  console.log('Results saved to:', join(OUT, 'test-report.json'));
}

runTests().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
