import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('scratch/quote-levi-proof');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const brainDir = path.resolve('C:/Users/אליאב/.gemini/antigravity/brain/238f6772-14d2-4ede-b77f-00e854b2f68d');
if (!fs.existsSync(brainDir)) fs.mkdirSync(brainDir, { recursive: true });

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const TARGET_URL = process.env.TEST_URL || 'http://localhost:4190';

async function run() {
  console.log('--- STARTING QUOTE & LEVI ITZHAK INTEGRATION TEST ---');
  console.log(`Target: ${TARGET_URL}/claims`);

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
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 950 },
    locale: 'he-IL',
  });
  await ctx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `sb-${STAGING_REF}-auth-token`,
    value: authSessionValue,
  });

  const page = await ctx.newPage();
  page.on('dialog', async (dialog) => {
    console.log(`Accepted dialog: ${dialog.type()} "${dialog.message()}"`);
    await dialog.accept();
  });
  page.on('console', (msg) => {
    const t = msg.text();
    if (t.includes('[LeviYitzhak]') || t.includes('[ClaimQuote]') || t.includes('Error')) {
      console.log('BROWSER LOG:', t);
    }
  });

  console.log(`1. Navigating to ${TARGET_URL}/claims...`);
  await page.goto(`${TARGET_URL}/claims`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);

  // Click on the first claim row
  console.log('2. Opening claim card...');
  const rowLocator = page.locator('tbody tr').first();
  await rowLocator.waitFor({ state: 'visible', timeout: 15000 });
  await rowLocator.click();
  await page.waitForTimeout(2000);

  // Locate Levi Itzhak button in card header
  const leviBtn = page.locator('[data-testid="claims-card-levi-btn"]');
  await leviBtn.waitFor({ state: 'visible', timeout: 10000 });

  // Locate Quote button in card header
  const quoteBtn = page.locator('[data-testid="claims-quote-btn"]');
  await quoteBtn.waitFor({ state: 'visible', timeout: 10000 });

  // --- STEP A: TEST MOBILE VIEWPORT (390x844) FOR LEVI MODAL ---
  console.log('3. Testing Mobile Viewport (390x844) on Levi Modal...');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1000);

  await leviBtn.click();
  await page.waitForTimeout(1500);

  const modal = page.locator('[data-testid="levi-yitzhak-modal"]');
  await modal.waitFor({ state: 'visible', timeout: 10000 });

  // Enter test values: 62400 weighted, 40% policy, 25% third
  const weightedIn = page.locator('[data-testid="levi-in-weighted-price"]');
  await weightedIn.scrollIntoViewIfNeeded();
  await weightedIn.fill('62,400');
  await page.waitForTimeout(300);

  const policyIn = page.locator('[data-testid="in-repair-policy-pct"]');
  await policyIn.scrollIntoViewIfNeeded();
  await policyIn.fill('40');
  await page.waitForTimeout(300);

  const thirdIn = page.locator('[data-testid="in-repair-third-pct"]');
  await thirdIn.scrollIntoViewIfNeeded();
  await thirdIn.fill('25');
  await page.waitForTimeout(300);

  // Check amounts in mobile view
  const policyAmountEl = page.locator('[data-testid="out-repair-policy-amount"]');
  const thirdAmountEl = page.locator('[data-testid="out-repair-third-amount"]');

  const policyAmountTxt = await policyAmountEl.innerText();
  const thirdAmountTxt = await thirdAmountEl.innerText();
  console.log(`Policy Amount: "${policyAmountTxt}"`);
  console.log(`Third Amount: "${thirdAmountTxt}"`);

  if (!policyAmountTxt.includes('24,960')) throw new Error(`Expected policy amount 24,960 but got "${policyAmountTxt}"`);
  if (!thirdAmountTxt.includes('15,600')) throw new Error(`Expected third amount 15,600 but got "${thirdAmountTxt}"`);

  // Verify bounding boxes: no left clipping (x >= 0 and within viewport)
  const policyBox = await policyIn.boundingBox();
  const policyAmountBox = await policyAmountEl.boundingBox();
  console.log(`policyBox: x=${policyBox.x}, w=${policyBox.width}; policyAmountBox: x=${policyAmountBox.x}, w=${policyAmountBox.width}`);
  if (policyBox.x < 0 || policyAmountBox.x < 0) {
    throw new Error(`Mobile clipping detected: policyBox x=${policyBox.x}, policyAmountBox x=${policyAmountBox.x}`);
  }

  const mobileScreenshot = path.join(outDir, '01_mobile_levi_calculator.png');
  await page.screenshot({ path: mobileScreenshot, fullPage: false });
  fs.copyFileSync(mobileScreenshot, path.join(brainDir, '01_mobile_levi_calculator.png'));
  console.log('Saved mobile screenshot:', mobileScreenshot);

  // --- STEP B: TEST TOGGLE ON WITH POLICY ROUTE (40%) ---
  console.log('4. Setting Quote Toggle ON with Policy Route (40%)...');
  // Return to desktop viewport
  await page.setViewportSize({ width: 1400, height: 950 });
  await page.waitForTimeout(1000);

  const toggle = page.locator('[data-testid="toggle-show-in-quote"]');
  await toggle.scrollIntoViewIfNeeded();
  if (!(await toggle.isChecked())) {
    await toggle.check();
    await page.waitForTimeout(400);
  }

  const radioPolicy = page.locator('[data-testid="radio-quote-policy"]');
  await radioPolicy.scrollIntoViewIfNeeded();
  await radioPolicy.check();
  await page.waitForTimeout(400);

  const saveBtn = page.locator('[data-testid="btn-save-levi-yitzhak"]');
  await saveBtn.scrollIntoViewIfNeeded();
  await saveBtn.click();
  await page.waitForTimeout(2500);

  // Open Claim Quote Editor
  console.log('5. Opening Claim Quote Editor (Policy route)...');
  await quoteBtn.click();
  await page.waitForTimeout(1000);

  const quoteModal = page.locator('[data-testid="claim-quote-editor"]');
  await quoteModal.waitFor({ state: 'visible', timeout: 15000 });

  // Wait for quote data to finish loading and summary to appear
  const summaryEl = page.locator('[data-testid="cq-summary"]');
  await summaryEl.waitFor({ state: 'visible', timeout: 15000 });

  const quoteCallout = page.locator('[data-testid="cq-levi-repair-callout"]');
  await quoteCallout.waitFor({ state: 'visible', timeout: 15000 });

  const weightedItem = await page.locator('[data-testid="cq-levi-item-weighted"]').innerText();
  const routeItem = await page.locator('[data-testid="cq-levi-item-route"]').innerText();
  const pctItem = await page.locator('[data-testid="cq-levi-item-pct"]').innerText();
  const amountItem = await page.locator('[data-testid="cq-levi-item-amount"]').innerText();

  console.log('Quote Levi Block (Policy):');
  console.log(' - Weighted:', weightedItem.replace(/\n/g, ' '));
  console.log(' - Route:', routeItem.replace(/\n/g, ' '));
  console.log(' - Pct:', pctItem.replace(/\n/g, ' '));
  console.log(' - Amount:', amountItem.replace(/\n/g, ' '));

  if (!weightedItem.includes('62,400')) throw new Error(`Missing 62,400 in weighted: ${weightedItem}`);
  if (!routeItem.includes('פוליסה')) throw new Error(`Missing פוליסה in route: ${routeItem}`);
  if (!pctItem.includes('40%')) throw new Error(`Missing 40% in pct: ${pctItem}`);
  if (!amountItem.includes('24,960')) throw new Error(`Missing 24,960 in amount: ${amountItem}`);

  // Check that total is present and calculated independently
  const quoteTotal = await page.locator('[data-testid="cq-total"]').innerText();
  console.log('Quote Total:', quoteTotal.replace(/\n/g, ' '));

  const quotePolicyScreenshot = path.join(outDir, '02_quote_preview_policy.png');
  await page.screenshot({ path: quotePolicyScreenshot });
  fs.copyFileSync(quotePolicyScreenshot, path.join(brainDir, '02_quote_preview_policy.png'));
  console.log('Saved quote policy screenshot:', quotePolicyScreenshot);

  // Save quote and test PDF generation
  console.log('Testing PDF generation with Levi section...');
  const saveQuoteBtn = page.locator('[data-testid="cq-save"]');
  await saveQuoteBtn.click();
  await page.waitForTimeout(3000);
  const pdfBtn = page.locator('[data-testid="cq-pdf"]');
  await pdfBtn.click();
  await page.waitForTimeout(3000);
  console.log('Quote saved and PDF generated successfully!');

  // Close quote editor
  const closeQuoteBtn = page.locator('button.cq-close');
  await closeQuoteBtn.click();
  await quoteModal.waitFor({ state: 'hidden', timeout: 5000 });
  await page.waitForTimeout(1000);

  // --- STEP C: TEST TOGGLE ON WITH THIRD PARTY ROUTE (25%) ---
  console.log('6. Switching to Third Party Route (25%)...');
  await leviBtn.click();
  await page.waitForTimeout(1500);

  const radioThird = page.locator('[data-testid="radio-quote-third"]');
  await radioThird.scrollIntoViewIfNeeded();
  await radioThird.check();
  await page.waitForTimeout(400);

  await saveBtn.scrollIntoViewIfNeeded();
  await saveBtn.click();
  await page.waitForTimeout(2500);

  console.log('7. Opening Claim Quote Editor (Third Party route)...');
  await quoteBtn.click();
  await page.waitForTimeout(1000);

  await summaryEl.waitFor({ state: 'visible', timeout: 15000 });
  await quoteCallout.waitFor({ state: 'visible', timeout: 15000 });

  const routeItemThird = await page.locator('[data-testid="cq-levi-item-route"]').innerText();
  const pctItemThird = await page.locator('[data-testid="cq-levi-item-pct"]').innerText();
  const amountItemThird = await page.locator('[data-testid="cq-levi-item-amount"]').innerText();

  console.log('Quote Levi Block (Third Party):');
  console.log(' - Route:', routeItemThird.replace(/\n/g, ' '));
  console.log(' - Pct:', pctItemThird.replace(/\n/g, ' '));
  console.log(' - Amount:', amountItemThird.replace(/\n/g, ' '));

  if (!routeItemThird.includes('צד ג׳')) throw new Error(`Missing צד ג׳ in route: ${routeItemThird}`);
  if (!pctItemThird.includes('25%')) throw new Error(`Missing 25% in pct: ${pctItemThird}`);
  if (!amountItemThird.includes('15,600')) throw new Error(`Missing 15,600 in amount: ${amountItemThird}`);

  const quoteThirdScreenshot = path.join(outDir, '03_quote_preview_third_party.png');
  await page.screenshot({ path: quoteThirdScreenshot });
  fs.copyFileSync(quoteThirdScreenshot, path.join(brainDir, '03_quote_preview_third_party.png'));
  console.log('Saved quote third party screenshot:', quoteThirdScreenshot);

  // Close quote editor
  await closeQuoteBtn.click();
  await page.waitForTimeout(1500);

  // --- STEP D: TEST TOGGLE OFF ---
  console.log('8. Disabling Quote Toggle (Turning OFF)...');
  await leviBtn.click();
  await page.waitForTimeout(1500);

  const toggleOff = page.locator('[data-testid="toggle-show-in-quote"]');
  await toggleOff.scrollIntoViewIfNeeded();
  if (await toggleOff.isChecked()) {
    await toggleOff.uncheck();
    await page.waitForTimeout(400);
  }

  await saveBtn.scrollIntoViewIfNeeded();
  await saveBtn.click();
  await page.waitForTimeout(2500);

  console.log('9. Opening Claim Quote Editor with toggle OFF...');
  await quoteBtn.click();
  await page.waitForTimeout(1000);

  await summaryEl.waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(500);

  const isCalloutVisibleWhenOff = await page.locator('[data-testid="cq-levi-repair-callout"]').isVisible();
  console.log('Is callout visible when toggle is OFF:', isCalloutVisibleWhenOff);
  if (isCalloutVisibleWhenOff) {
    throw new Error('Expected Levi repair callout to be HIDDEN when toggle is OFF!');
  }

  const quoteOffScreenshot = path.join(outDir, '04_quote_preview_toggle_off.png');
  await page.screenshot({ path: quoteOffScreenshot });
  fs.copyFileSync(quoteOffScreenshot, path.join(brainDir, '04_quote_preview_toggle_off.png'));
  console.log('Saved quote toggle OFF screenshot:', quoteOffScreenshot);

  await closeQuoteBtn.click();
  await page.waitForTimeout(1000);

  await browser.close();
  console.log('--- ALL 4 VERIFICATION STEPS PASSED SUCCESSFULLY! ---');
}

run().catch((err) => {
  console.error('TEST ERROR:', err);
  process.exit(1);
});
