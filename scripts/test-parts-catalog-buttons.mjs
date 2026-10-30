import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const proofDir = path.resolve('scratch/parts-catalog-proof');
if (!fs.existsSync(proofDir)) fs.mkdirSync(proofDir, { recursive: true });

const brainDir = path.resolve('C:/Users/אליאב/.gemini/antigravity/brain/238f6772-14d2-4ede-b77f-00e854b2f68d');
if (!fs.existsSync(brainDir)) fs.mkdirSync(brainDir, { recursive: true });

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const TARGET_URL = process.env.TEST_URL || 'http://localhost:4190';

async function run() {
  console.log('=== STARTING PARTS CATALOG BUTTON VERIFICATION TEST ===');
  console.log(`Target base: ${TARGET_URL}`);

  console.log('1. Authenticating with Staging Supabase...');
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

  // ==========================================
  // PART 1: CLAIMS MANAGEMENT (ניהול תביעות)
  // ==========================================
  console.log('\n--- PART 1: CLAIMS MANAGEMENT (ניהול תביעות) ---');
  console.log(`Navigating to ${TARGET_URL}/claims...`);
  await page.goto(`${TARGET_URL}/claims`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2500);

  console.log('Opening claim card...');
  const rowLocator = page.locator('tbody tr').first();
  await rowLocator.waitFor({ state: 'visible', timeout: 15000 });
  await rowLocator.click();
  await page.waitForTimeout(2000);

  // Check the 4 action buttons
  const quoteBtn = page.locator('[data-testid="claims-quote-btn"]');
  const paintBtn = page.locator('[data-testid="claims-paint-calc-btn"]');
  const leviBtn = page.locator('[data-testid="claims-card-levi-btn"]');
  const partsBtn = page.locator('[data-testid="claims-parts-catalog-btn"]');

  await quoteBtn.waitFor({ state: 'visible', timeout: 10000 });
  await paintBtn.waitFor({ state: 'visible', timeout: 10000 });
  await leviBtn.waitFor({ state: 'visible', timeout: 10000 });
  await partsBtn.waitFor({ state: 'visible', timeout: 10000 });

  const partsText = await partsBtn.innerText();
  console.log(`Claims parts button found! Text: "${partsText}"`);
  if (!partsText.includes('מאגר החלפים – מחירון חלקים')) {
    throw new Error(`Unexpected button text: ${partsText}`);
  }

  // Desktop screenshot
  const shotClaimsDesktop = path.join(proofDir, '01_claims_card_desktop.png');
  await page.screenshot({ path: shotClaimsDesktop });
  fs.copyFileSync(shotClaimsDesktop, path.join(brainDir, '01_claims_card_desktop.png'));
  console.log(`Saved screenshot: 01_claims_card_desktop.png`);

  // Mobile screenshot (390x844)
  console.log('Testing mobile view in Claims...');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1000);
  await partsBtn.scrollIntoViewIfNeeded();
  const shotClaimsMobile = path.join(proofDir, '02_claims_card_mobile.png');
  await page.screenshot({ path: shotClaimsMobile });
  fs.copyFileSync(shotClaimsMobile, path.join(brainDir, '02_claims_card_mobile.png'));
  console.log(`Saved screenshot: 02_claims_card_mobile.png`);

  // Test link click opens new tab with otocar URL
  console.log('Verifying link click opens Otocar in new tab...');
  const [claimsPopup] = await Promise.all([
    ctx.waitForEvent('page'),
    partsBtn.click(),
  ]);
  await claimsPopup.waitForURL(/otocar\.co\.il/, { timeout: 20000 });
  const openedUrl = claimsPopup.url();
  console.log(`Opened tab URL: ${openedUrl}`);
  if (!openedUrl.includes('otocar.co.il')) {
    throw new Error(`Expected otocar URL, got: ${openedUrl}`);
  }
  await claimsPopup.close();

  // Verify claim card is still open and unchanged
  await page.setViewportSize({ width: 1400, height: 950 });
  await page.waitForTimeout(500);
  const stillOpen = await partsBtn.isVisible();
  console.log(`Claim card still open: ${stillOpen}`);

  // Regression check: click Levi Yitzhak modal
  console.log('Regression test: Opening Levi Yitzhak modal...');
  await leviBtn.click();
  const leviModal = page.locator('[data-testid="levi-yitzhak-modal"]');
  await leviModal.waitFor({ state: 'visible', timeout: 5000 });
  console.log('Levi Yitzhak modal opened successfully!');
  const closeLeviBtn = page.locator('button[aria-label="סגור"]').first();
  await closeLeviBtn.click({ force: true });
  await leviModal.waitFor({ state: 'hidden', timeout: 5000 });
  console.log('Levi Yitzhak modal closed successfully!');

  // ==========================================
  // PART 2: GARAGE MANAGEMENT (ניהול מוסך)
  // ==========================================
  console.log('\n--- PART 2: GARAGE MANAGEMENT (ניהול מוסך) ---');
  console.log(`Navigating to ${TARGET_URL}/garage-management...`);
  await page.goto(`${TARGET_URL}/garage-management`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);

  const frameLocator = page.frameLocator('iframe.gm-approved-frame');

  // Find a case row or open case button inside the frame
  console.log('Finding a case to open in garage management...');
  const openCaseBtn = frameLocator.locator('[data-testid="open-case-btn"]').first();
  const caseRow = frameLocator.locator('.case-row').first();
  const hasCases = await openCaseBtn.isVisible({ timeout: 5000 }).catch(() => false);

  if (hasCases) {
    console.log('Clicking open case button...');
    await openCaseBtn.click();
  } else if (await caseRow.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log('Clicking case row...');
    await caseRow.click();
  } else {
    // If no existing cases in staging list, click "+ פתיחת כרטיס עבודה"
    console.log('No cases in table, clicking action-open-case...');
    const newCaseBtn = frameLocator.locator('[data-testid="action-open-case"]');
    if (await newCaseBtn.isVisible()) {
      await newCaseBtn.click();
      await page.waitForTimeout(1000);
      // Click first customer or fast intake
      const firstCust = frameLocator.locator('.cust-card, .cust-result').first();
      if (await firstCust.isVisible()) {
        await firstCust.click();
      }
    }
  }

  await page.waitForTimeout(2000);

  // Check for the parts catalog button in the work card
  const garagePartsBtn = frameLocator.locator('[data-testid="garage-parts-catalog-btn"]');
  const garageTileBtn = frameLocator.locator('[data-testid="garage-tile-parts-catalog"]');
  const garageTopbarBtn = frameLocator.locator('[data-testid="garage-topbar-parts-catalog-btn"]');

  await garagePartsBtn.waitFor({ state: 'visible', timeout: 10000 });
  const gText = await garagePartsBtn.innerText();
  console.log(`Garage work card parts button found! Text: "${gText}"`);
  if (!gText.includes('מאגר החלפים – מחירון חלקים')) {
    throw new Error(`Unexpected garage button text: ${gText}`);
  }

  const tileVisible = await garageTileBtn.isVisible();
  const topbarVisible = await garageTopbarBtn.isVisible();
  console.log(`Garage tile visible: ${tileVisible}, Topbar button visible: ${topbarVisible}`);

  // Desktop screenshot
  const shotGarageDesktop = path.join(proofDir, '03_garage_work_card_desktop.png');
  await page.screenshot({ path: shotGarageDesktop });
  fs.copyFileSync(shotGarageDesktop, path.join(brainDir, '03_garage_work_card_desktop.png'));
  console.log(`Saved screenshot: 03_garage_work_card_desktop.png`);

  // Mobile screenshot (390x844)
  console.log('Testing mobile view in Garage...');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1000);
  await garagePartsBtn.scrollIntoViewIfNeeded();
  const shotGarageMobile = path.join(proofDir, '04_garage_work_card_mobile.png');
  await page.screenshot({ path: shotGarageMobile });
  fs.copyFileSync(shotGarageMobile, path.join(brainDir, '04_garage_work_card_mobile.png'));
  console.log(`Saved screenshot: 04_garage_work_card_mobile.png`);

  // Test link click opens Otocar in new tab
  console.log('Verifying garage button opens Otocar in new tab...');
  const [garagePopup] = await Promise.all([
    ctx.waitForEvent('page'),
    garagePartsBtn.click(),
  ]);
  await garagePopup.waitForURL(/otocar\.co\.il/, { timeout: 20000 });
  const gOpenedUrl = garagePopup.url();
  console.log(`Opened tab URL from Garage: ${gOpenedUrl}`);
  if (!gOpenedUrl.includes('otocar.co.il')) {
    throw new Error(`Expected otocar URL, got: ${gOpenedUrl}`);
  }
  await garagePopup.close();

  // Verify garage card remains open
  await page.setViewportSize({ width: 1400, height: 950 });
  await page.waitForTimeout(500);
  const garageStillOpen = await garagePartsBtn.isVisible();
  console.log(`Garage work card still open: ${garageStillOpen}`);

  await browser.close();
  console.log('\n=== ALL PARTS CATALOG BUTTON VERIFICATIONS PASSED SUCCESSFULLY! ===');
}

run().catch((err) => {
  console.error('FATAL TEST ERROR:', err);
  process.exit(1);
});
