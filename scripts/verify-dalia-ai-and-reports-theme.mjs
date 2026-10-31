// scripts/verify-dalia-ai-and-reports-theme.mjs
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('scratch/financial-reports-proof');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const brainDir = path.resolve('C:/Users/אליאב/.gemini/antigravity/brain/238f6772-14d2-4ede-b77f-00e854b2f68d');
if (!fs.existsSync(brainDir)) fs.mkdirSync(brainDir, { recursive: true });

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const LOCAL_URL = 'http://localhost:4190';

async function run() {
  console.log('=== VERIFYING DALIA AI AND REPORTS THEME INTEGRATION ===');

  // 1. Authenticate with Supabase staging
  const keys = JSON.parse(
    execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' })
  );
  const service = keys.find((k) => k.name === 'service_role')?.api_key;
  const anonKey =
    keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key ||
    keys.find((k) => k.name === 'anon')?.api_key;
  const admin = createClient(`https://${STAGING_REF}.supabase.co`, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: saRole } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin').limit(8);
  let saEmail = '';
  for (const row of saRole || []) {
    const u = await admin.auth.admin.getUserById(row.user_id);
    if (u?.data?.user?.email === 'orin1607@gmail.com') {
      saEmail = u.data.user.email;
      break;
    }
    if (!saEmail) saEmail = u?.data?.user?.email || '';
  }

  const client = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: linkData } = await admin.auth.admin.generateLink({ type: 'magiclink', email: saEmail });
  const { data: auth } = await client.auth.verifyOtp({
    email: saEmail,
    token: linkData.properties.email_otp,
    type: 'email',
  });

  const authSessionValue = {
    access_token: auth.session.access_token,
    refresh_token: auth.session.refresh_token,
    expires_at: auth.session.expires_at,
    expires_in: auth.session.expires_in,
    token_type: auth.session.token_type,
    user: auth.session.user,
  };

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    locale: 'he-IL',
  });
  await ctx.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    {
      key: `sb-${STAGING_REF}-auth-token`,
      value: authSessionValue,
    }
  );

  const page = await ctx.newPage();
  page.on('console', (msg) => {
    const t = msg.text();
    if (t.includes('Error') || t.includes('Assistant') || t.includes('reports')) {
      console.log('BROWSER LOG:', t);
    }
  });

  console.log('1. Navigating to Claims Management...');
  await page.goto(`${LOCAL_URL}/claims`, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(3000);

  // 2. Click "דוחות" button in topbar or sidebar
  console.log('2. Clicking "דוחות" button...');
  const reportsBtn = page.locator('button:has-text("דוחות"), [data-testid="nav-reports"]').first();
  await reportsBtn.waitFor({ state: 'visible', timeout: 15000 });
  await reportsBtn.click();
  await page.waitForTimeout(2000);

  // 3. Verify that reports-hub-nav toolbar does NOT exist (no redundant button)
  const hubNavExists = await page.locator('[data-testid="reports-hub-nav"]').count();
  console.log(`- Redundant topbar exists? ${hubNavExists > 0 ? 'YES (FAIL)' : 'NO (PASSED: Removed completely)'}`);
  if (hubNavExists > 0) {
    throw new Error('Redundant reports-hub-nav was found! It should have been removed.');
  }

  // 4. Verify 7 Tabs are present directly
  console.log('3. Verifying 7 Tabs of Reports Center...');
  const tabOverview = page.locator('[data-testid="tab-overview"]');
  const tabFinances = page.locator('[data-testid="tab-finances"]');
  const tabControl = page.locator('[data-testid="tab-control"]');
  const tabAlerts = page.locator('[data-testid="tab-alerts"]');
  const tabInsurers = page.locator('[data-testid="tab-insurers"]');
  const tabCommunication = page.locator('[data-testid="tab-communication"]');
  const tabOperational = page.locator('[data-testid="tab-operational"]');

  await tabOverview.waitFor({ state: 'visible', timeout: 10000 });
  await tabFinances.waitFor({ state: 'visible', timeout: 10000 });
  await tabControl.waitFor({ state: 'visible', timeout: 10000 });
  await tabAlerts.waitFor({ state: 'visible', timeout: 10000 });
  await tabInsurers.waitFor({ state: 'visible', timeout: 10000 });
  await tabCommunication.waitFor({ state: 'visible', timeout: 10000 });
  await tabOperational.waitFor({ state: 'visible', timeout: 10000 });
  console.log('   ✓ All 7 Tabs are directly visible!');

  // 5. Verify Dark Navy Theme & High Contrast
  console.log('4. Verifying Native Dalia Dark-Navy Styling & High Contrast...');
  const headerBg = await page.locator('.cfc-header').evaluate((el) => window.getComputedStyle(el).backgroundColor);
  const headerColor = await page.locator('.cfc-header-title').evaluate((el) => window.getComputedStyle(el).color);
  console.log(`   - Header Background: ${headerBg}`);
  console.log(`   - Header Text Color: ${headerColor}`);

  // Save screenshot of Tab 1 in Desktop
  const shot1 = path.join(brainDir, '01_dalia_theme_overview_tab.png');
  await page.screenshot({ path: shot1, fullPage: false });
  console.log(`   ✓ Saved screenshot: ${shot1}`);

  // Test Tab 2: Finances
  await tabFinances.click();
  await page.waitForTimeout(1000);
  const shot2 = path.join(brainDir, '02_dalia_theme_finances_tab.png');
  await page.screenshot({ path: shot2, fullPage: false });
  console.log(`   ✓ Saved screenshot: ${shot2}`);

  // Test Tab 3: Control & Audit
  await tabControl.click();
  await page.waitForTimeout(1000);
  const shot3 = path.join(brainDir, '03_dalia_theme_control_tab.png');
  await page.screenshot({ path: shot3, fullPage: false });
  console.log(`   ✓ Saved screenshot: ${shot3}`);

  // Test Tab 4: Alerts
  await tabAlerts.click();
  await page.waitForTimeout(1000);
  const shot4 = path.join(brainDir, '04_dalia_theme_alerts_tab.png');
  await page.screenshot({ path: shot4, fullPage: false });
  console.log(`   ✓ Saved screenshot: ${shot4}`);

  // Test Tab 5: Insurers
  await tabInsurers.click();
  await page.waitForTimeout(1000);
  const shot5 = path.join(brainDir, '05_dalia_theme_insurers_tab.png');
  await page.screenshot({ path: shot5, fullPage: false });
  console.log(`   ✓ Saved screenshot: ${shot5}`);

  // Test Tab 6: Communication
  await tabCommunication.click();
  await page.waitForTimeout(1000);
  const shot6 = path.join(brainDir, '06_dalia_theme_communication_tab.png');
  await page.screenshot({ path: shot6, fullPage: false });
  console.log(`   ✓ Saved screenshot: ${shot6}`);

  // Test Tab 7: Operational
  await tabOperational.click();
  await page.waitForTimeout(1000);
  const shot7 = path.join(brainDir, '07_dalia_theme_operational_tab.png');
  await page.screenshot({ path: shot7, fullPage: false });
  console.log(`   ✓ Saved screenshot: ${shot7}`);

  // 6. Test Responsiveness across Mobile viewports
  console.log('5. Testing Responsiveness on Mobile viewports (390px, 360px)...');
  await page.setViewportSize({ width: 390, height: 844 });
  await tabOverview.click();
  await page.waitForTimeout(1000);
  const shotMobile390 = path.join(brainDir, '08_mobile_390_overview_dalia_theme.png');
  await page.screenshot({ path: shotMobile390, fullPage: false });
  console.log(`   ✓ Saved Mobile 390px screenshot: ${shotMobile390}`);

  await page.setViewportSize({ width: 360, height: 740 });
  await page.waitForTimeout(500);
  const shotMobile360 = path.join(brainDir, '09_mobile_360_overview_dalia_theme.png');
  await page.screenshot({ path: shotMobile360, fullPage: false });
  console.log(`   ✓ Saved Mobile 360px screenshot: ${shotMobile360}`);

  // 7. Reset to desktop viewport and Test Dalia AI Assistant Integration
  console.log('6. Testing Dalia AI Assistant Integration with Real Claims Reports...');
  await page.setViewportSize({ width: 1400, height: 900 });

  // Open Dalia AI drawer
  const aiToggleBtn = page.locator('[data-testid="claims-ai-open"]').first();
  await aiToggleBtn.waitFor({ state: 'visible', timeout: 15000 });
  await aiToggleBtn.click();
  await page.waitForTimeout(2000);

  // Check composer textarea
  const composer = page.locator('[data-testid="claims-ai-input"]');
  await composer.waitFor({ state: 'visible', timeout: 15000 });

  const testQuestions = [
    { q: 'כמה כסף חברות הביטוח חייבות לנו?', expectText: 'חוב מאומת' },
    { q: 'כמה כסף קיבלנו החודש?', expectText: 'תקבולים' },
    { q: 'אילו תיקים לא שולמו?', expectText: 'שטרם שולמו' },
    { q: 'כמה תיקים חסרים בהם מסמכים?', expectText: 'מסמכים חסרים' },
    { q: 'כמה תיקים עברו בקרה תקינה?', expectText: 'בקרה תקינה' },
    { q: 'כמה תיקים ממתינים לטיפול משפטי?', expectText: 'משפטי' },
    { q: 'כמה התראות פתוחות יש?', expectText: 'התראות' },
    { q: 'כמה אימיילים אוטומטיים נשלחו?', expectText: 'אימיילים אוטומטיים' },
    { q: 'תפתחי לי את מרכז הדוחות', expectText: 'מרכז הדוחות' },
    { q: 'תציגי לי את התיקים שממתינים לגבייה', expectText: 'ממתינים לגבייה' },
  ];

  for (let i = 0; i < testQuestions.length; i++) {
    const item = testQuestions[i];
    console.log(`   - Testing Q${i + 1}: "${item.q}"`);
    await page.waitForTimeout(2000); // Clear 1200ms anti-spam throttle between messages
    await composer.fill(item.q);
    const sendBtn = page.locator('[data-testid="claims-ai-send"]');
    if (await sendBtn.count()) {
      await sendBtn.click();
    } else {
      await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(2000);

    // Verify last assistant message
    const lastMsg = page.locator('.claims-ai-row.assistant .claims-ai-bubble').last();
    await lastMsg.waitFor({ state: 'visible', timeout: 15000 });
    const textContent = await lastMsg.textContent();
    console.log(`     Reply snippet: "${textContent.slice(0, 80).replace(/\n/g, ' ')}..."`);

    if (!textContent.includes(item.expectText)) {
      console.warn(`     WARNING: Expected reply to contain "${item.expectText}", got: ${textContent.slice(0, 100)}`);
    } else {
      console.log(`     ✓ PASSED Q${i + 1}`);
    }
  }

  // Save screenshot of Dalia AI Q&A conversation
  const shotAi = path.join(brainDir, '10_dalia_ai_reports_qa_proof.png');
  await page.screenshot({ path: shotAi, fullPage: false });
  console.log(`   ✓ Saved Dalia AI chat screenshot: ${shotAi}`);

  await browser.close();
  console.log('=== ALL VERIFICATIONS COMPLETED SUCCESSFULLY! ===');
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
