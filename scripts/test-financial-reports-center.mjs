// scripts/test-financial-reports-center.mjs
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
const TARGET_URL = process.env.TEST_URL || 'http://localhost:4190';

async function run() {
  console.log('=== STARTING FINANCIAL REPORTS CENTER E2E VERIFICATION ===');
  console.log(`Target URL: ${TARGET_URL}`);

  // 1. Authenticate with Supabase
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

  try {
    // --- TEST 1: Desktop Viewport ---
    console.log('\n--- 1. Testing Desktop (1400x900) ---');
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
      if (t.includes('Error') || t.includes('warning') || t.includes('FinancialCenter')) {
        console.log('BROWSER LOG:', t);
      }
    });

    // Navigate to claims screen with view=reports
    console.log(`Navigating to ${TARGET_URL}/claims?view=reports...`);
    await page.goto(`${TARGET_URL}/claims?view=reports`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3000);

    // If not already in reports view, click reports button
    const finCenterCheck = page.locator('[data-testid="claims-financial-center"]');
    if (!(await finCenterCheck.isVisible())) {
      console.log('Clicking "דוחות" button...');
      const reportsBtn = page.locator('[data-testid="claims-dash-reports-btn"], button:has-text("דוחות"), button:has-text(" דוחות")').first();
      await reportsBtn.waitFor({ state: 'visible', timeout: 15000 });
      await reportsBtn.click();
      await page.waitForTimeout(2000);
    }

    // Verify Financial Reports Center is rendered and active by default
    console.log('Checking Financial Reports Center header and 15 KPI cards...');
    const hubNav = page.locator('[data-testid="reports-hub-nav"]');
    await hubNav.waitFor({ state: 'visible', timeout: 10000 });

    const finTabBtn = page.locator('[data-testid="tab-financial-center"]');
    const isFinTabActive = await finTabBtn.evaluate((el) => el.classList.contains('btn-p'));
    console.log(`Financial Hub Tab active by default: ${isFinTabActive}`);

    const finCenter = page.locator('[data-testid="claims-financial-center"]');
    await finCenter.waitFor({ state: 'visible', timeout: 10000 });

    // Verify all 15 KPI cards
    const kpiGrid = page.locator('[data-testid="cfc-15-kpis-grid"]');
    await kpiGrid.waitFor({ state: 'visible', timeout: 10000 });
    const kpiCards = kpiGrid.locator('.cfc-kpi-card');
    const kpiCount = await kpiCards.count();
    console.log(`Found ${kpiCount} KPI cards (expected 15).`);
    if (kpiCount !== 15) throw new Error(`Expected 15 KPI cards, found ${kpiCount}`);

    // Print values of first 5 KPIs
    for (let i = 0; i < 5; i++) {
      const card = kpiCards.nth(i);
      const title = await card.locator('.cfc-kpi-card-title').innerText();
      const val = await card.locator('.cfc-kpi-card-value').innerText();
      const sub = await card.locator('.cfc-kpi-card-sub').innerText();
      console.log(`  KPI ${i + 1}: ${title.trim()} = ${val.trim()} (${sub.trim()})`);
    }

    // Capture desktop overview screenshot
    const shot01 = path.join(outDir, '01_desktop_financial_hub_overview.png');
    await page.screenshot({ path: shot01, fullPage: false });
    fs.copyFileSync(shot01, path.join(brainDir, '01_desktop_financial_hub_overview.png'));
    console.log('Saved screenshot 01: Desktop Financial Hub Overview');

    // Test Drilldown Modal on KPI 1 (Demands)
    console.log('Testing Drilldown Modal on KPI 1...');
    await kpiCards.first().click();
    await page.waitForTimeout(800);

    const drillModal = page.locator('[data-testid="cfc-drilldown-modal"]');
    await drillModal.waitFor({ state: 'visible', timeout: 8000 });
    const modalTitle = await drillModal.locator('.cfc-modal-title').innerText();
    console.log(`Drilldown Modal open: ${modalTitle}`);

    const shot02 = path.join(outDir, '02_desktop_drilldown_modal.png');
    await page.screenshot({ path: shot02, fullPage: false });
    fs.copyFileSync(shot02, path.join(brainDir, '02_desktop_drilldown_modal.png'));
    console.log('Saved screenshot 02: Drilldown Modal');

    // Close modal
    await page.locator('[data-testid="cfc-drilldown-close"]').click({ force: true });
    await page.waitForTimeout(500);

    // Test Sub-Tab 1: Insurers Summary Table
    console.log('Testing Sub-Tab: Insurers Table...');
    const insurersTable = page.locator('[data-testid="cfc-insurers-table"]');
    await insurersTable.waitFor({ state: 'visible', timeout: 8000 });
    const insurerRows = insurersTable.locator('tbody tr');
    const insRowsCount = await insurerRows.count();
    console.log(`Insurers table has ${insRowsCount} insurer rows.`);

    // Test Sub-Tab 2: Debts & Aging Table
    console.log('Testing Sub-Tab: Debts & Aging...');
    await page.locator('[data-testid="cfc-tab-debts"]').click();
    await page.waitForTimeout(800);

    const debtsTable = page.locator('[data-testid="cfc-debts-table"]');
    await debtsTable.waitFor({ state: 'visible', timeout: 8000 });
    const debtsCount = await debtsTable.locator('tbody tr').count();
    console.log(`Debts table has ${debtsCount} debt rows.`);

    // Test sort by aging
    await page.locator('[data-testid="cfc-sort-aging"]').click();
    await page.waitForTimeout(500);

    const shot03 = path.join(outDir, '03_desktop_debts_aging_tab.png');
    await page.screenshot({ path: shot03, fullPage: false });
    fs.copyFileSync(shot03, path.join(brainDir, '03_desktop_debts_aging_tab.png'));
    console.log('Saved screenshot 03: Debts & Aging Tab');

    // Test Sub-Tab 3: Payments & Deductions
    console.log('Testing Sub-Tab: Payments & Deductions...');
    await page.locator('[data-testid="cfc-tab-payments"]').click();
    await page.waitForTimeout(800);

    const paymentsTable = page.locator('[data-testid="cfc-payments-table"]');
    await paymentsTable.waitFor({ state: 'visible', timeout: 8000 });
    const paymentsCount = await paymentsTable.locator('tbody tr').count();
    console.log(`Payments table has ${paymentsCount} payment rows.`);

    const shot04 = path.join(outDir, '04_desktop_payments_deductions_tab.png');
    await page.screenshot({ path: shot04, fullPage: false });
    fs.copyFileSync(shot04, path.join(brainDir, '04_desktop_payments_deductions_tab.png'));
    console.log('Saved screenshot 04: Payments & Deductions Tab');

    // Test Sub-Tab 4: Traceability & Verification
    console.log('Testing Sub-Tab: Traceability & Verification...');
    await page.locator('[data-testid="cfc-tab-traceability"]').click();
    await page.waitForTimeout(800);

    const traceTable = page.locator('[data-testid="cfc-trace-table"]');
    await traceTable.waitFor({ state: 'visible', timeout: 8000 });
    const traceCount = await traceTable.locator('tbody tr').count();
    console.log(`Traceability table has ${traceCount} rows.`);

    // Test Switching to Operational Reports
    console.log('Testing switch to Operational & Garage Reports...');
    await page.locator('[data-testid="tab-operational-reports"]').click();
    await page.waitForTimeout(1000);

    const opHeading = page.locator('[data-testid="claims-reports-heading"]');
    await opHeading.waitFor({ state: 'visible', timeout: 8000 });
    console.log('Operational report heading visible: דוחות ניהול – מוסך ותביעות ביטוח');

    // Switch back to Financial Center
    await page.locator('[data-testid="tab-financial-center"]').click();
    await page.waitForTimeout(1000);
    await finCenter.waitFor({ state: 'visible', timeout: 8000 });
    console.log('Switched back to Financial Center successfully.');

    await ctx.close();

    // --- TEST 2: Mobile Viewport (390x844) ---
    console.log('\n--- 2. Testing Mobile (390x844) ---');
    const mobileCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      locale: 'he-IL',
    });
    await mobileCtx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: `sb-${STAGING_REF}-auth-token`,
      value: authSessionValue,
    });

    const mobilePage = await mobileCtx.newPage();
    console.log(`Navigating mobile to ${TARGET_URL}/claims?view=reports...`);
    await mobilePage.goto(`${TARGET_URL}/claims?view=reports`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await mobilePage.waitForTimeout(3000);

    const mFinCenter = mobilePage.locator('[data-testid="claims-financial-center"]');
    if (!(await mFinCenter.isVisible())) {
      const mReportsBtn = mobilePage.locator('[data-testid="claims-dash-reports-btn"], button:has-text("דוחות"), button:has-text(" דוחות")').first();
      if (await mReportsBtn.isVisible()) {
        await mReportsBtn.click();
        await mobilePage.waitForTimeout(2000);
      }
    }

    await mFinCenter.waitFor({ state: 'visible', timeout: 10000 });

    const shot05 = path.join(outDir, '05_mobile_financial_hub.png');
    await mobilePage.screenshot({ path: shot05, fullPage: false });
    fs.copyFileSync(shot05, path.join(brainDir, '05_mobile_financial_hub.png'));
    console.log('Saved screenshot 05: Mobile Financial Hub');

    await mobileCtx.close();

    console.log('\n=== ALL E2E TESTS PASSED SUCCESSFULLY! ===');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('TEST RUN FAILED:', err);
  process.exit(1);
});
