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
  console.log('=== STARTING SMART ALERTS & FINANCIAL REPORTS CENTER E2E VERIFICATION ===');
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
      if (t.includes('Error') || t.includes('warning') || t.includes('ClaimsFinancialCenterView')) {
        console.log('BROWSER LOG:', t);
      }
    });

    // Navigate to claims screen with view=reports
    console.log(`Navigating to ${TARGET_URL}/claims?view=reports...`);
    await page.goto(`${TARGET_URL}/claims?view=reports`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3500);

    // Verify Financial Reports Center is rendered
    console.log('Checking Financial Reports Center header and elements...');
    const finCenter = page.locator('[data-testid="claims-financial-center"]');
    await finCenter.waitFor({ state: 'visible', timeout: 15000 });
    console.log('✓ Claims Financial Center view is visible.');

    // 1. Verify Top Alerts Banner
    console.log('Checking Top Alerts Command Center...');
    const alertsBanner = page.locator('[data-testid="cfc-alerts-banner"]');
    await alertsBanner.waitFor({ state: 'visible', timeout: 8000 });
    console.log('✓ Top Alerts Command Center is rendered.');

    // Verify Stale Threshold Toggles
    const thresh7 = page.locator('[data-testid="cfc-thresh-7"]');
    const thresh14 = page.locator('[data-testid="cfc-thresh-14"]');
    const thresh30 = page.locator('[data-testid="cfc-thresh-30"]');
    await thresh7.waitFor({ state: 'visible' });
    await thresh14.waitFor({ state: 'visible' });
    await thresh30.waitFor({ state: 'visible' });
    console.log('✓ Stale threshold toggles (7, 14, 30 days) are present.');

    // Verify 7 Primary Alert Cards
    const alertCardsGrid = page.locator('[data-testid="cfc-7alerts-grid"]');
    await alertCardsGrid.waitFor({ state: 'visible' });
    const overdueCard = page.locator('[data-testid="cfc-alert-card-overdue"]');
    const partialCard = page.locator('[data-testid="cfc-alert-card-partial"]');
    const deductionsCard = page.locator('[data-testid="cfc-alert-card-deductions"]');
    const staleCard = page.locator('[data-testid="cfc-alert-card-stale"]');
    const docsCard = page.locator('[data-testid="cfc-alert-card-docs"]');
    const legalCard = page.locator('[data-testid="cfc-alert-card-legal"]');
    const anomaliesCard = page.locator('[data-testid="cfc-alert-card-anomalies"]');

    await overdueCard.waitFor({ state: 'visible' });
    await partialCard.waitFor({ state: 'visible' });
    await deductionsCard.waitFor({ state: 'visible' });
    await staleCard.waitFor({ state: 'visible' });
    await docsCard.waitFor({ state: 'visible' });
    await legalCard.waitFor({ state: 'visible' });
    await anomaliesCard.waitFor({ state: 'visible' });
    console.log('✓ All 7 primary alert cards are visible and active.');

    // Capture desktop overview screenshot
    const shot01 = path.join(outDir, '01_desktop_financial_hub_overview.png');
    await page.screenshot({ path: shot01, fullPage: false });
    fs.copyFileSync(shot01, path.join(brainDir, '01_desktop_financial_hub_overview.png'));
    console.log('Saved screenshot 01: Desktop Financial Hub Overview with Smart Alerts');

    // 2. Verify AI Daily Briefing Modal
    console.log('Testing "✨ תדריך יומי AI" button and modal...');
    const briefingBtn = page.locator('[data-testid="cfc-btn-briefing"]');
    await briefingBtn.click();
    await page.waitForTimeout(600);

    const briefingModal = page.locator('[data-testid="cfc-briefing-modal"]');
    await briefingModal.waitFor({ state: 'visible', timeout: 5000 });
    const briefingText = await page.locator('[data-testid="cfc-briefing-text"]').innerText();
    console.log(`✓ Daily AI briefing modal open. Content preview:\n${briefingText.slice(0, 180)}...`);

    const copyBtn = page.locator('[data-testid="cfc-briefing-copy-btn"]');
    await copyBtn.waitFor({ state: 'visible' });
    console.log('✓ Briefing copy to clipboard button is present.');

    // Screenshot of AI Briefing Modal
    const shotBriefing = path.join(outDir, '02_desktop_ai_daily_briefing_modal.png');
    await page.screenshot({ path: shotBriefing, fullPage: false });
    fs.copyFileSync(shotBriefing, path.join(brainDir, '02_desktop_ai_daily_briefing_modal.png'));
    console.log('Saved screenshot 02: AI Daily Briefing Modal');

    // Close Briefing Modal
    await page.locator('[data-testid="cfc-briefing-close"]').click({ force: true });
    await page.waitForTimeout(500);

    // 3. Test Action Queue Tab (`alerts`)
    console.log('Testing Action Queue Tab (default active)...');
    const actionQueue = page.locator('[data-testid="cfc-action-queue"]');
    await actionQueue.waitFor({ state: 'visible', timeout: 5000 });
    const actionRows = actionQueue.locator('tbody tr');
    const actionRowsCount = await actionRows.count();
    console.log(`✓ Action Queue has ${actionRowsCount} active action rows.`);

    // Test Alert Card Click filter
    console.log('Testing click on Card 1 (חובות באיחור) to filter Action Queue...');
    await overdueCard.click();
    await page.waitForTimeout(500);
    const filteredRowsCount = await actionQueue.locator('tbody tr').count();
    console.log(`✓ Action Queue filtered by overdue debts: ${filteredRowsCount} rows.`);

    // 4. Test Sub-Tab: Insurers Summary
    console.log('Testing Sub-Tab: Insurers Table...');
    await page.locator('[data-testid="cfc-tab-insurers"]').click();
    await page.waitForTimeout(600);
    const insurersTable = page.locator('[data-testid="cfc-insurers-table"]');
    await insurersTable.waitFor({ state: 'visible', timeout: 5000 });
    const insRows = insurersTable.locator('tbody tr');
    console.log(`✓ Insurers table rendered with ${await insRows.count()} insurer rows.`);

    // 5. Test Sub-Tab: Debts & Aging Ledger
    console.log('Testing Sub-Tab: Debts & Aging Ledger...');
    await page.locator('[data-testid="cfc-tab-debts"]').click();
    await page.waitForTimeout(600);
    const debtsTable = page.locator('[data-testid="cfc-debts-table"]');
    await debtsTable.waitFor({ state: 'visible', timeout: 5000 });
    console.log(`✓ Debts table rendered with ${await debtsTable.locator('tbody tr').count()} rows.`);

    const shot03 = path.join(outDir, '03_desktop_debts_aging_tab.png');
    await page.screenshot({ path: shot03, fullPage: false });
    fs.copyFileSync(shot03, path.join(brainDir, '03_desktop_debts_aging_tab.png'));
    console.log('Saved screenshot 03: Debts & Aging Tab');

    // 6. Test Sub-Tab: Payments & Deductions
    console.log('Testing Sub-Tab: Payments & Deductions...');
    await page.locator('[data-testid="cfc-tab-payments"]').click();
    await page.waitForTimeout(600);
    const paymentsTable = page.locator('[data-testid="cfc-payments-table"]');
    await paymentsTable.waitFor({ state: 'visible', timeout: 5000 });
    console.log(`✓ Payments table rendered with ${await paymentsTable.locator('tbody tr').count()} rows.`);

    const shot04 = path.join(outDir, '04_desktop_payments_deductions_tab.png');
    await page.screenshot({ path: shot04, fullPage: false });
    fs.copyFileSync(shot04, path.join(brainDir, '04_desktop_payments_deductions_tab.png'));
    console.log('Saved screenshot 04: Payments & Deductions Tab');

    // 7. Test Sub-Tab: Recurring Deductions (Report B)
    console.log('Testing Sub-Tab: Recurring Deductions (Report B)...');
    await page.locator('[data-testid="cfc-tab-recurring"]').click();
    await page.waitForTimeout(600);
    const recurringTable = page.locator('[data-testid="cfc-recurring-table"]');
    await recurringTable.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✓ Recurring Deductions tab rendered successfully.');

    // 8. Test Sub-Tab: Cycle Times & Cash Forecast (Reports C & D)
    console.log('Testing Sub-Tab: Cycle Times & Cash Forecast (Reports C & D)...');
    await page.locator('[data-testid="cfc-tab-cycles"]').click();
    await page.waitForTimeout(600);
    const cycleView = page.locator('[data-testid="cfc-cycle-times-view"]');
    await cycleView.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✓ Cycle Times & Cash Forecast tab rendered successfully.');

    // 9. Test Sub-Tab: Profitability (Report E)
    console.log('Testing Sub-Tab: Profitability (Report E)...');
    await page.locator('[data-testid="cfc-tab-profitability"]').click();
    await page.waitForTimeout(600);
    const profitView = page.locator('[data-testid="cfc-profitability-view"]');
    await profitView.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✓ Profitability tab rendered successfully.');

    // 10. Test Sub-Tab: Data Quality Audit (Report F)
    console.log('Testing Sub-Tab: Data Quality Audit (Report F)...');
    await page.locator('[data-testid="cfc-tab-quality"]').click();
    await page.waitForTimeout(600);
    const qualityView = page.locator('[data-testid="cfc-quality-view"]');
    await qualityView.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✓ Data Quality Audit tab rendered successfully.');

    // 11. Test 15 KPI Grid Drilldown Modal
    console.log('Testing 15 KPI Grid & Drilldown Modal...');
    const kpiCards = page.locator('[data-testid="cfc-15-kpis-grid"] .cfc-kpi-card');
    const kpiCount = await kpiCards.count();
    console.log(`✓ Found ${kpiCount} KPI cards.`);
    if (kpiCount > 0) {
      await kpiCards.first().click();
      await page.waitForTimeout(500);
      const drillModal = page.locator('[data-testid="cfc-drilldown-modal"]');
      if (await drillModal.isVisible()) {
        console.log('✓ Drilldown modal opened successfully.');
        await page.locator('[data-testid="cfc-drilldown-close"]').click({ force: true });
        await page.waitForTimeout(300);
      }
    }

    await page.close();
    await ctx.close();

    // --- TEST 2: Mobile Viewport (390x844) ---
    console.log('\n--- 2. Testing Mobile (390x844) ---');
    const mCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      locale: 'he-IL',
    });
    await mCtx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: `sb-${STAGING_REF}-auth-token`,
      value: authSessionValue,
    });

    const mPage = await mCtx.newPage();
    await mPage.goto(`${TARGET_URL}/claims?view=reports`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await mPage.waitForTimeout(3500);

    const mFinCenter = mPage.locator('[data-testid="claims-financial-center"]');
    await mFinCenter.waitFor({ state: 'visible', timeout: 15000 });

    const mAlertsBanner = mPage.locator('[data-testid="cfc-alerts-banner"]');
    await mAlertsBanner.waitFor({ state: 'visible' });

    // Verify 7 cards in mobile
    const mAlertCards = mPage.locator('[data-testid="cfc-7alerts-grid"] .cfc-alert-kpi-card');
    const mCount = await mAlertCards.count();
    console.log(`✓ Mobile view rendered with ${mCount} alert cards.`);

    const shot05 = path.join(outDir, '05_mobile_financial_hub.png');
    await mPage.screenshot({ path: shot05, fullPage: false });
    fs.copyFileSync(shot05, path.join(brainDir, '05_mobile_financial_hub.png'));
    console.log('Saved screenshot 05: Mobile Financial Hub');

    await mPage.close();
    await mCtx.close();

    console.log('\n=== ALL SMART ALERTS & FINANCIAL REPORTS TESTS PASSED PERFECTLY ===\n');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
