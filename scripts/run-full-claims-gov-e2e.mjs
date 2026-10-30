import { chromium } from 'playwright';
import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('scratch/claims-gov-lookup-proof');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const QA_USER = 'qa.claims.worker.1788292403067@futurecraft.staging';
const BASE_URL = 'http://localhost:8085';

async function getAuthSession() {
  console.log('Retrieving staging auth session for', QA_USER, '...');
  const keys = JSON.parse(
    execSync(`npx --yes supabase projects api-keys --project-ref ${STAGING_REF} -o json`, {
      encoding: 'utf8',
    }),
  );
  const serviceKey = keys.find((k) => k.name === 'service_role').api_key;
  const anonKey =
    keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key ||
    keys.find((k) => k.name === 'anon')?.api_key;

  const admin = createClient(`https://${STAGING_REF}.supabase.co`, serviceKey, {
    auth: { persistSession: false },
  });
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: QA_USER,
  });
  if (linkErr) throw linkErr;

  const client = createClient(`https://${STAGING_REF}.supabase.co`, anonKey, {
    auth: { persistSession: false },
  });
  const { data: auth, error: authErr } = await client.auth.verifyOtp({
    email: QA_USER,
    token: link.properties.email_otp,
    type: 'email',
  });
  if (authErr) throw authErr;

  return auth.session;
}

async function run() {
  const session = await getAuthSession();
  console.log('Session obtained successfully!');

  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  // ================= 1. DESKTOP TEST =================
  console.log('\n--- 1. DESKTOP TEST (1280x800) ---');
  const contextDesktop = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: 'he-IL',
  });
  const page = await contextDesktop.newPage();

  // Set domain localStorage session
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    (s) => localStorage.setItem('sb-usfeoerkpcafxxlyuldl-auth-token', JSON.stringify(s)),
    session,
  );

  // Navigate to claims
  await page.goto(`${BASE_URL}/claims`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Take screenshot of claims screen
  await page.screenshot({ path: path.join(outDir, '01_desktop_claims_dashboard.png') });
  console.log('Saved 01_desktop_claims_dashboard.png');

  // Click on "＋ תיק חדש" button
  console.log('Clicking [data-testid="claims-open-new"]...');
  const openCaseBtn = page.locator('[data-testid="claims-open-new"]');
  await openCaseBtn.waitFor({ state: 'visible', timeout: 10000 });
  await openCaseBtn.click();
  await page.waitForTimeout(1000);

  // Check modal
  const modal = page.locator('[data-testid="claims-new-modal"]');
  await modal.waitFor({ state: 'visible', timeout: 5000 });
  console.log('Modal opened!');

  // Save screenshot of empty modal
  await page.screenshot({ path: path.join(outDir, '02_desktop_modal_empty.png') });
  console.log('Saved 02_desktop_modal_empty.png');

  // Locate the license plate input
  const plateInput = page.locator('#in_plate');
  await plateInput.waitFor({ state: 'visible' });

  // Type real plate number: 51603703 (ג'ילי GEOMETRY C 2023)
  console.log('Entering plate 51603703 into #in_plate...');
  await plateInput.fill('51603703');

  // Click on "שלוף ממשרד התחבורה" button
  const lookupBtn = page.locator('[data-testid="btn-gov-lookup"]');
  await lookupBtn.click();
  console.log('Clicked "שלוף ממשרד התחבורה"');

  // Wait for auto-population
  console.log('Waiting for fields to populate...');
  await page.waitForFunction(() => {
    const make = document.querySelector('#in_make')?.value;
    const model = document.querySelector('#in_model')?.value;
    return !!(make && model);
  }, { timeout: 15000 });

  const makeVal = await page.locator('#in_make').inputValue();
  const modelVal = await page.locator('#in_model').inputValue();
  const yearVal = await page.locator('#in_year').inputValue();
  const finishVal = await page.locator('#in_ramat_gimur').inputValue();
  const roadVal = await page.locator('#in_road_date').inputValue();
  const baalutVal = await page.locator('#in_baalut').inputValue();

  console.log('\n--- AUTO-FETCH RESULTS (DESKTOP) ---');
  console.log('תוצר (Make):', makeVal);
  console.log('דגם (Model):', modelVal);
  console.log('שנת ייצור (Year):', yearVal);
  console.log('רמת גימור (Finish):', finishVal);
  console.log('עלייה לכביש (Road date):', roadVal);
  console.log('סוג בעלות (Ownership):', baalutVal);

  if (!makeVal || !modelVal || !yearVal) {
    throw new Error('Vehicle fields were not properly populated!');
  }

  // Save screenshot of auto-filled modal
  await page.screenshot({ path: path.join(outDir, '03_desktop_modal_autofilled.png') });
  console.log('Saved 03_desktop_modal_autofilled.png');
  await contextDesktop.close();

  // ================= 2. MOBILE TEST (390x844) =================
  console.log('\n--- 2. MOBILE RESPONSIVE TEST (390x844) ---');
  const contextMobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: 'he-IL',
  });
  const pageMobile = await contextMobile.newPage();

  await pageMobile.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await pageMobile.evaluate(
    (s) => localStorage.setItem('sb-usfeoerkpcafxxlyuldl-auth-token', JSON.stringify(s)),
    session,
  );

  await pageMobile.goto(`${BASE_URL}/claims`, { waitUntil: 'networkidle' });
  await pageMobile.waitForTimeout(2000);

  // Click on open claim on mobile
  const openCaseMobile = pageMobile.locator('[data-testid="claims-open-new"]');
  await openCaseMobile.waitFor({ state: 'visible', timeout: 10000 });
  await openCaseMobile.click();
  await pageMobile.waitForTimeout(1000);

  const plateInputMobile = pageMobile.locator('#in_plate');
  await plateInputMobile.waitFor({ state: 'visible' });
  await plateInputMobile.fill('51603703');

  const lookupBtnMobile = pageMobile.locator('[data-testid="btn-gov-lookup"]');
  await lookupBtnMobile.click();

  await pageMobile.waitForFunction(() => {
    const make = document.querySelector('#in_make')?.value;
    return !!make;
  }, { timeout: 15000 });

  const makeValMobile = await pageMobile.locator('#in_make').inputValue();
  const modelValMobile = await pageMobile.locator('#in_model').inputValue();
  const finishValMobile = await pageMobile.locator('#in_ramat_gimur').inputValue();
  console.log('Mobile Auto-fill Make:', makeValMobile, '| Model:', modelValMobile, '| Finish:', finishValMobile);

  await pageMobile.screenshot({ path: path.join(outDir, '04_mobile_modal_autofilled.png') });
  console.log('Saved 04_mobile_modal_autofilled.png');

  await contextMobile.close();
  await browser.close();

  console.log('\nALL E2E VERIFICATIONS PASSED 100% SUCCESSFULLY!');
}

run().catch((err) => {
  console.error('E2E Execution Error:', err);
  process.exit(1);
});
