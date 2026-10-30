import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('scratch/levi-yitzhak-proof');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const LOCAL_APP = 'http://localhost:8086/future-craft-core';

async function run() {
  console.log('Authenticating QA session for Staging...');
  const keys = JSON.parse(execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
  const service = keys.find((k) => k.name === 'service_role')?.api_key;
  const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key || keys.find((k) => k.name === 'anon')?.api_key;
  const admin = createClient(`https://${STAGING_REF}.supabase.co`, service, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: saRole } = await admin.from('user_roles').select('user_id').eq('role', 'super_admin').limit(8);
  let saEmail = '';
  for (const row of saRole || []) {
    const u = await admin.auth.admin.getUserById(row.user_id);
    if (u?.data?.user?.email === 'orin1607@gmail.com') { saEmail = u.data.user.email; break; }
    if (!saEmail) saEmail = u?.data?.user?.email || '';
  }

  const client = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: linkData } = await admin.auth.admin.generateLink({ type: 'magiclink', email: saEmail });
  const { data: auth } = await client.auth.verifyOtp({ email: saEmail, token: linkData.properties.email_otp, type: 'email' });

  const authSessionValue = {
    access_token: auth.session.access_token,
    refresh_token: auth.session.refresh_token,
    expires_at: auth.session.expires_at,
    expires_in: auth.session.expires_in,
    token_type: auth.session.token_type,
    user: auth.session.user,
  };

  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  // 1. Desktop Test
  console.log('Opening Desktop context...');
  const contextDesktop = await browser.newContext({
    viewport: { width: 1300, height: 880 },
    locale: 'he-IL',
  });
  await contextDesktop.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `sb-${STAGING_REF}-auth-token`,
    value: authSessionValue,
  });

  const page = await contextDesktop.newPage();
  console.log(`Navigating to ${LOCAL_APP}/claims ...`);
  await page.goto(`${LOCAL_APP}/claims`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);

  // Take screenshot of claims dashboard
  await page.screenshot({ path: path.join(outDir, '01_desktop_claims_dashboard.png') });
  console.log('Screenshot 01_desktop_claims_dashboard.png saved');

  // Click on a claim row
  const rowLocator = page.locator('tbody tr, [data-testid^="claim-row-"]').first();
  await rowLocator.waitFor({ state: 'visible', timeout: 10000 });
  await rowLocator.click();
  console.log('Clicked claim row');

  await page.waitForTimeout(2000);

  // Click on "רכב" tab
  const vehicleTab = page.locator('[data-testid="claims-tab-sub-vehicle"]').first();
  await vehicleTab.waitFor({ state: 'visible', timeout: 10000 });
  await vehicleTab.click();
  console.log('Clicked "רכב" tab');

  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, '02_desktop_claim_card_vehicle_tab.png') });
  console.log('Screenshot 02_desktop_claim_card_vehicle_tab.png saved');

  // Click "מחירון לוי יצחק" button
  const leviBtn = page.locator('[data-testid="btn-open-levi-yitzhak"]');
  await leviBtn.waitFor({ state: 'visible', timeout: 5000 });
  console.log('Clicking "מחירון לוי יצחק" button...');
  await leviBtn.click();

  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, '03_desktop_levi_modal_opened.png') });
  console.log('Screenshot 03_desktop_levi_modal_opened.png saved');

  // Check external link
  const extBtn = page.locator('[data-testid="btn-open-levi-external"]');
  const href = await extBtn.getAttribute('href');
  console.log('External Levi Itzhak URL:', href);

  // Fill in valuation amounts
  console.log('Entering base price and weighted price...');
  await page.locator('[data-testid="levi-in-basic-price"]').fill('88000');
  await page.locator('[data-testid="levi-in-weighted-price"]').fill('80000');
  await page.locator('[data-testid="levi-in-trim"]').fill('Executive Plus');
  await page.locator('[data-testid="levi-in-additions"]').fill('קילומטראז׳: -2% · תוספת מועד עלייה: +1%');

  // Test dynamic repair calculation
  console.log('Testing repair percentage calculator...');
  await page.locator('[data-testid="in-repair-policy-pct"]').fill('12.5');
  await page.waitForTimeout(400);
  const policyAmountText = await page.locator('[data-testid="out-repair-policy-amount"]').innerText();
  console.log('Policy calculated amount (12.5% of 80,000):', policyAmountText); // Expected: ₪10,000

  await page.locator('[data-testid="in-repair-third-pct"]').fill('15');
  await page.waitForTimeout(400);
  const thirdAmountText = await page.locator('[data-testid="out-repair-third-amount"]').innerText();
  console.log('Third party calculated amount (15% of 80,000):', thirdAmountText); // Expected: ₪12,000

  // Test toggle: "הצג את סכום התיקון המחושב בהצעת המחיר ללקוח"
  console.log('Enabling quote display toggle...');
  await page.locator('[data-testid="toggle-show-in-quote"]').check();
  await page.waitForTimeout(300);

  // Select third party route for client quote
  await page.locator('[data-testid="radio-quote-third"]').check();
  await page.waitForTimeout(300);

  await page.screenshot({ path: path.join(outDir, '04_desktop_levi_modal_calculated.png') });
  console.log('Screenshot 04_desktop_levi_modal_calculated.png saved');

  // Click "אשר ושמור במחירון הרכב"
  console.log('Clicking "אשר ושמור במחירון הרכב"...');
  await page.locator('[data-testid="btn-save-levi-yitzhak"]').click();
  await page.waitForTimeout(2500);

  await page.screenshot({ path: path.join(outDir, '05_desktop_claim_card_updated.png') });
  console.log('Screenshot 05_desktop_claim_card_updated.png saved');

  // 2. Mobile Viewport Test (390x844)
  console.log('Opening Mobile context...');
  const contextMobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'he-IL',
    isMobile: true,
  });
  await contextMobile.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `sb-${STAGING_REF}-auth-token`,
    value: authSessionValue,
  });

  const mobilePage = await contextMobile.newPage();
  await mobilePage.goto(`${LOCAL_APP}/claims`, { waitUntil: 'networkidle', timeout: 60000 });
  await mobilePage.waitForTimeout(2500);

  const mCard = mobilePage.locator('.claim-mcard-name, .claim-mcard-head').first();
  await mCard.waitFor({ state: 'visible', timeout: 10000 });
  await mCard.click();
  await mobilePage.waitForTimeout(2000);

  const mTab = mobilePage.locator('[data-testid="claims-tab-sub-vehicle"]').first();
  await mTab.waitFor({ state: 'visible', timeout: 10000 });
  await mTab.click();
  await mobilePage.waitForTimeout(1000);

  const mLevi = mobilePage.locator('[data-testid="btn-open-levi-yitzhak"]');
  await mLevi.waitFor({ state: 'visible', timeout: 10000 });
  await mLevi.click();
  await mobilePage.waitForTimeout(1000);

  await mobilePage.screenshot({ path: path.join(outDir, '06_mobile_levi_modal.png') });
  console.log('Screenshot 06_mobile_levi_modal.png saved');

  await browser.close();
  console.log('E2E Playwright verification completed successfully!');
}

run().catch((err) => {
  console.error('Playwright verification failed:', err);
  process.exit(1);
});
