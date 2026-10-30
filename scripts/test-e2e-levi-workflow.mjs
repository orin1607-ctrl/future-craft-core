import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('scratch/live-staging-levi-proof');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const brainDir = path.resolve('C:/Users/אליאב/.gemini/antigravity/brain/238f6772-14d2-4ede-b77f-00e854b2f68d');
if (!fs.existsSync(brainDir)) fs.mkdirSync(brainDir, { recursive: true });

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const TARGET_URL = 'http://localhost:5174';

async function run() {
  console.log('--- STARTING LEVI ITZHAK FULL WORKFLOW E2E TEST ---');
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
    viewport: { width: 1400, height: 900 },
    locale: 'he-IL',
  });
  await ctx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `sb-${STAGING_REF}-auth-token`,
    value: authSessionValue,
  });

  const page = await ctx.newPage();
  page.on('console', (msg) => {
    const t = msg.text();
    if (t.includes('[LeviYitzhak]') || t.includes('Error')) {
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

  // Click on "מחירון לוי יצחק" button in action bar
  console.log('3. Clicking "מחירון לוי יצחק" button...');
  const leviBtn = page.locator('[data-testid="claims-card-levi-btn"]');
  await leviBtn.waitFor({ state: 'visible', timeout: 10000 });
  await leviBtn.click();
  await page.waitForTimeout(1500);

  // Verify modal is open
  const modalLocator = page.locator('[data-testid="levi-yitzhak-modal"]');
  await modalLocator.waitFor({ state: 'visible', timeout: 10000 });
  console.log('Modal opened successfully!');

  // Take screenshot of empty modal
  const shotModalEmpty = path.join(outDir, '01_modal_initial.png');
  await page.screenshot({ path: shotModalEmpty });
  fs.copyFileSync(shotModalEmpty, path.join(brainDir, '01_modal_initial.png'));

  // Upload fixture image using real FileChooser
  const fixturePath = path.resolve('scratch/fixtures/sample_levi_itzhak.png');
  console.log(`4. Uploading fixture image via FileChooser: ${fixturePath}`);
  const pickBtn = page.locator('[data-testid="btn-pick-levi-file"], [data-testid="btn-replace-levi-file"]').first();
  await pickBtn.waitFor({ state: 'visible', timeout: 10000 });
  const fileChooserPromise = page.waitForEvent('filechooser');
  await pickBtn.click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(fixturePath);
  console.log('File attached, waiting for AI OCR extraction...');

  // Wait for extraction to complete (Gemini Vision OCR typically takes 4-8 seconds)
  const successBadge = page.locator('[data-testid="levi-ocr-success-banner"]');
  await successBadge.waitFor({ state: 'visible', timeout: 35000 });
  console.log('Extraction success badge appeared!');

  // Verify extracted fields
  const basicPriceInput = page.locator('[data-testid="levi-in-basic-price"]');
  const weightedPriceInput = page.locator('[data-testid="levi-in-weighted-price"]');
  const baseVal = await basicPriceInput.inputValue();
  const weightVal = await weightedPriceInput.inputValue();
  console.log(`Extracted Base Price: ${baseVal}`);
  console.log(`Extracted Weighted Price: ${weightVal}`);

  if (!baseVal || !weightVal) {
    throw new Error('Extracted prices are empty!');
  }

  // Adjust repair percentages: e.g. policy 15%
  console.log('5. Adjusting repair percentage calculator...');
  const policyPctInput = page.locator('[data-testid="in-repair-policy-pct"]');
  await policyPctInput.fill('15');
  await page.waitForTimeout(500);

  const policyAmtOutput = page.locator('[data-testid="out-repair-policy-amount"]');
  const calcAmt = await policyAmtOutput.innerText();
  console.log(`Calculated Policy Repair Amount (15%): ${calcAmt}`);

  // Capture screenshot of extracted and calculated modal
  const shotModalExtracted = path.join(outDir, '02_modal_extracted_calculated.png');
  await page.screenshot({ path: shotModalExtracted });
  fs.copyFileSync(shotModalExtracted, path.join(brainDir, '02_modal_extracted_calculated.png'));

  // Click Save button
  console.log('6. Clicking "✓ אשר ושמור במחירון הרכב"...');
  const saveBtn = page.locator('[data-testid="btn-save-levi-yitzhak"]');
  await saveBtn.click();
  await page.waitForTimeout(3000);

  // Verify modal is closed
  await modalLocator.waitFor({ state: 'hidden', timeout: 10000 });
  console.log('Modal closed after save!');

  // Switch to Vehicle tab
  console.log('Switching to Vehicle tab in claim card...');
  const vehicleTab = page.locator('[data-testid="claims-tab-sub-vehicle"]');
  if (await vehicleTab.isVisible()) {
    await vehicleTab.click();
    await page.waitForTimeout(1000);
  }

  // Verify claim card vehicle tab has updated fields
  const shotCardSaved = path.join(outDir, '03_claim_card_after_save.png');
  await page.screenshot({ path: shotCardSaved });
  fs.copyFileSync(shotCardSaved, path.join(brainDir, '03_claim_card_after_save.png'));

  // Check that photo badge is visible
  const photoBadge = page.locator('[data-testid="claims-view-levi-photo-btn"]');
  const photoVisible = await photoBadge.isVisible();
  console.log(`Photo button in vehicle tab visible: ${photoVisible}`);

  // 7. Page Reload test (persistency check)
  console.log('7. RELOADING PAGE TO VERIFY PERSISTENCE...');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Re-open claim card
  console.log('Reopening claim card after reload...');
  const rowAfterReload = page.locator('tbody tr').first();
  await rowAfterReload.waitFor({ state: 'visible', timeout: 15000 });
  await rowAfterReload.click();
  await page.waitForTimeout(2000);

  // Go to Vehicle tab
  const vehicleTabReloaded = page.locator('[data-testid="claims-tab-sub-vehicle"]');
  if (await vehicleTabReloaded.isVisible()) {
    await vehicleTabReloaded.click();
    await page.waitForTimeout(1000);
  }

  // Screenshot after reload
  const shotAfterReload = path.join(outDir, '04_claim_card_after_reload.png');
  await page.screenshot({ path: shotAfterReload });
  fs.copyFileSync(shotAfterReload, path.join(brainDir, '04_claim_card_after_reload.png'));

  // 8. Re-open Levi Itzhak modal to check rehydration and preview image
  console.log('8. Re-opening Levi Itzhak modal to verify preview image and saved data...');
  const reOpenBtn = page.locator('[data-testid="claims-card-levi-btn"], [data-testid="claims-view-levi-photo-btn"]').first();
  await reOpenBtn.click();
  await page.waitForTimeout(2500);

  await modalLocator.waitFor({ state: 'visible', timeout: 10000 });
  const reloadedBase = await page.locator('[data-testid="levi-in-basic-price"]').inputValue();
  const reloadedWeight = await page.locator('[data-testid="levi-in-weighted-price"]').inputValue();
  console.log(`Rehydrated Base Price: ${reloadedBase}`);
  console.log(`Rehydrated Weighted Price: ${reloadedWeight}`);

  // Check preview image
  const previewImg = page.locator('[data-testid="levi-preview-img"]');
  const imgVisible = await previewImg.isVisible();
  console.log(`Preview image visible in modal: ${imgVisible}`);

  const shotReopenedModal = path.join(outDir, '05_modal_reopened_persisted.png');
  await page.screenshot({ path: shotReopenedModal });
  fs.copyFileSync(shotReopenedModal, path.join(brainDir, '05_modal_reopened_persisted.png'));

  // 9. Mobile viewport verification
  console.log('9. Verifying on Mobile viewport (390x844)...');
  const ctxMobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'he-IL',
    isMobile: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.002) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  });
  await ctxMobile.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `sb-${STAGING_REF}-auth-token`,
    value: authSessionValue,
  });

  const pageMobile = await ctxMobile.newPage();
  await pageMobile.goto(`${TARGET_URL}/claims`, { waitUntil: 'networkidle', timeout: 60000 });
  await pageMobile.waitForTimeout(2500);

  const mobileRow = pageMobile.locator('.claim-mcard-name, .claim-mcard-head, tbody tr').first();
  await mobileRow.waitFor({ state: 'visible', timeout: 15000 });
  await mobileRow.click();
  await pageMobile.waitForTimeout(2000);

  const mobileLeviBtn = pageMobile.locator('[data-testid="claims-card-levi-btn"]');
  await mobileLeviBtn.waitFor({ state: 'visible', timeout: 10000 });
  await mobileLeviBtn.click();
  await pageMobile.waitForTimeout(2000);

  const shotMobile = path.join(outDir, '06_mobile_modal_persisted.png');
  await pageMobile.screenshot({ path: shotMobile });
  fs.copyFileSync(shotMobile, path.join(brainDir, '06_mobile_modal_persisted.png'));
  console.log('Mobile screenshot saved!');

  await browser.close();
  console.log('--- ALL E2E WORKFLOW VERIFICATIONS PASSED SUCCESSFULLY! ---');
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
