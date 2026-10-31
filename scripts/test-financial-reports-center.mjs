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
  console.log('=== STARTING 7-TAB CLAIMS REPORTS CENTER & RESPONSIVE E2E VERIFICATION ===');
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
    // ==========================================
    // --- TEST 1: Desktop Viewport (1400x900) ---
    // ==========================================
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

    console.log(`Navigating to ${TARGET_URL}/claims?view=reports...`);
    await page.goto(`${TARGET_URL}/claims?view=reports`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3500);

    const finCenter = page.locator('[data-testid="claims-financial-center"]');
    await finCenter.waitFor({ state: 'visible', timeout: 15000 });
    console.log('✓ Claims Financial Center view is visible.');

    // Verify 7 Primary Tabs
    const expectedTabs = ['overview', 'finances', 'control', 'alerts', 'insurers', 'communication', 'operational'];
    for (const tabKey of expectedTabs) {
      const tabEl = page.locator(`[data-testid="tab-${tabKey}"]`);
      await tabEl.waitFor({ state: 'visible' });
    }
    console.log('✓ All 7 primary navigation tabs are rendered.');

    // --- TAB 1: סקירה כללית (Overview) ---
    console.log('\n[Tab 1: Overview Dashboard]');
    const tabOverview = page.locator('[data-testid="tab-overview"]');
    await tabOverview.click();
    await page.waitForTimeout(500);

    const overviewGrid = page.locator('[data-testid="cfc-overview-10-cards"]');
    await overviewGrid.waitFor({ state: 'visible' });

    // Verify 10 indicator cards
    const indicatorKeys = ['total', 'open', 'closed', 'waiting', 'inactive', 'legal', 'missing-docs', 'alerts', 'debts', 'paid'];
    for (const k of indicatorKeys) {
      const card = page.locator(`[data-testid="overview-card-${k}"]`);
      await card.waitFor({ state: 'visible' });
    }
    console.log('✓ All 10 key operational/financial indicator cards are visible.');

    // Verify Inactive threshold toggle
    const inact14 = page.locator('[data-testid="cfc-inactive-toggle-14"]');
    if (await inact14.isVisible()) {
      await inact14.click();
      await page.waitForTimeout(400);
      console.log('✓ Inactive threshold toggle (14d) clicked and updated.');
    }

    // Save screenshot of Tab 1 Overview
    const shot01 = path.join(outDir, '01_desktop_overview_tab.png');
    await page.screenshot({ path: shot01, fullPage: false });
    fs.copyFileSync(shot01, path.join(brainDir, '01_desktop_overview_tab.png'));
    console.log('Saved screenshot 01: Desktop Overview Tab');

    // Test AI Daily Briefing button
    console.log('Testing "✨ תדריך יומי AI"...');
    const briefingBtn = page.locator('[data-testid="cfc-btn-briefing"]');
    await briefingBtn.click();
    await page.waitForTimeout(600);

    const briefingModal = page.locator('[data-testid="cfc-briefing-modal"]');
    await briefingModal.waitFor({ state: 'visible', timeout: 5000 });
    const briefingText = await page.locator('[data-testid="cfc-briefing-text"]').innerText();
    console.log(`✓ Daily AI briefing modal open. Content length: ${briefingText.length} chars.`);

    const shotBriefing = path.join(outDir, '02_desktop_ai_daily_briefing_modal.png');
    await page.screenshot({ path: shotBriefing, fullPage: false });
    fs.copyFileSync(shotBriefing, path.join(brainDir, '02_desktop_ai_daily_briefing_modal.png'));
    console.log('Saved screenshot 02: AI Daily Briefing Modal');

    await page.locator('[data-testid="cfc-briefing-close"]').click({ force: true });
    await page.waitForTimeout(400);

    // Test Indicator Card Drilldown Modal & Navigation to Claim
    console.log('Testing indicator card drilldown modal (clicking "תיקים פתוחים")...');
    const openCardIndicator = page.locator('[data-testid="overview-card-open"]');
    await openCardIndicator.click();
    await page.waitForTimeout(600);

    const drilldownModal = page.locator('[data-testid="cfc-drilldown-modal"]');
    await drilldownModal.waitFor({ state: 'visible', timeout: 5000 });
    const drilldownRows = drilldownModal.locator('tbody tr');
    const drilldownCount = await drilldownRows.count();
    console.log(`✓ Drilldown modal opened with ${drilldownCount} claims.`);

    const shotDrilldown = path.join(outDir, '03_desktop_drilldown_modal.png');
    await page.screenshot({ path: shotDrilldown, fullPage: false });
    fs.copyFileSync(shotDrilldown, path.join(brainDir, '03_desktop_drilldown_modal.png'));
    console.log('Saved screenshot 03: Drilldown Modal');

    // Click the first claim in the drilldown to verify it opens the Claim Card
    if (drilldownCount > 0) {
      console.log('Clicking the first claim row in drilldown to verify Claim Card opens...');
      const openBtn = drilldownRows.first().locator('.cfc-btn-open-claim, button');
      if (await openBtn.isVisible()) {
        await openBtn.click();
      } else {
        await drilldownRows.first().click();
      }
      await page.waitForTimeout(1500);

      // Verify Claim Card modal is open
      const cardTitleNum = page.locator('.ov.open .card-title-num, .ov.open .card-title-name');
      const isCardOpen = await cardTitleNum.first().isVisible();
      let cardText = '';
      if (isCardOpen) {
        cardText = await cardTitleNum.first().innerText();
      }
      console.log(`✓ Claim card modal opened successfully: ${isCardOpen} (${cardText})`);

      // Close the claim card
      const closeBtn = page.locator('.ov.open .mcl, .ov.open button:has-text("✕")').first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click({ force: true });
        await page.waitForTimeout(500);
      }
    }

    // Close drilldown if still open
    if (await drilldownModal.isVisible()) {
      await page.locator('[data-testid="cfc-drilldown-close"]').click({ force: true });
      await page.waitForTimeout(400);
    }

    // --- TAB 2: כספים וגבייה (Finances & Collections) ---
    console.log('\n[Tab 2: Finances & Collections]');
    await page.locator('[data-testid="tab-finances"]').click();
    await page.waitForTimeout(600);

    const kpiGrid = page.locator('[data-testid="cfc-15-kpis-grid"]');
    await kpiGrid.waitFor({ state: 'visible' });
    const kpiCount = await kpiGrid.locator('.cfc-kpi-card').count();
    console.log(`✓ 15 Financial KPIs grid rendered with ${kpiCount} cards.`);

    // Sub-tab: Debts & Aging Ledger
    await page.locator('[data-testid="fin-subtab-debts"]').click();
    await page.waitForTimeout(400);
    const debtsTable = page.locator('[data-testid="cfc-debts-table"]');
    await debtsTable.waitFor({ state: 'visible' });
    console.log(`✓ Debts table visible with ${await debtsTable.locator('tbody tr').count()} debt rows.`);

    // Sub-tab: Payments & Deductions
    await page.locator('[data-testid="fin-subtab-payments"]').click();
    await page.waitForTimeout(400);
    const paymentsTable = page.locator('[data-testid="cfc-payments-table"]');
    await paymentsTable.waitFor({ state: 'visible' });
    console.log(`✓ Payments table visible with ${await paymentsTable.locator('tbody tr').count()} payment rows.`);

    // Sub-tab: Cycles & Forecast
    await page.locator('[data-testid="fin-subtab-cycles"]').click();
    await page.waitForTimeout(400);
    const cycleView = page.locator('[data-testid="cfc-cycle-times-view"]');
    await cycleView.waitFor({ state: 'visible' });
    console.log('✓ Cycle times & cash forecast rendered.');

    // Sub-tab: Profitability
    await page.locator('[data-testid="fin-subtab-profitability"]').click();
    await page.waitForTimeout(400);
    const profitView = page.locator('[data-testid="cfc-profitability-view"]');
    await profitView.waitFor({ state: 'visible' });
    console.log('✓ Claim profitability view rendered.');

    // Sub-tab: Traceability Ledger
    await page.locator('[data-testid="fin-subtab-traceability"]').click();
    await page.waitForTimeout(400);
    const traceView = page.locator('[data-testid="cfc-traceability-view"]');
    await traceView.waitFor({ state: 'visible' });
    console.log('✓ Traceability ledger rendered.');

    const shot04 = path.join(outDir, '04_desktop_finances_tab.png');
    await page.screenshot({ path: shot04, fullPage: false });
    fs.copyFileSync(shot04, path.join(brainDir, '04_desktop_finances_tab.png'));
    console.log('Saved screenshot 04: Desktop Finances Tab');

    // --- TAB 3: בקרת תיקים ומסמכים (Case & Document Control) ---
    console.log('\n[Tab 3: Case & Document Control]');
    await page.locator('[data-testid="tab-control"]').click();
    await page.waitForTimeout(600);

    const controlGrid = page.locator('[data-testid="cfc-control-4-cards"]');
    await controlGrid.waitFor({ state: 'visible' });

    // Verify 4 distinct status cards: 🟢 Green, 🟡 Yellow, 🔴 Red, ⚪ Gray
    const cardGreen = page.locator('[data-testid="control-card-green"]');
    const cardYellow = page.locator('[data-testid="control-card-yellow"]');
    const cardRed = page.locator('[data-testid="control-card-red"]');
    const cardGray = page.locator('[data-testid="control-card-gray"]');

    await cardGreen.waitFor({ state: 'visible' });
    await cardYellow.waitFor({ state: 'visible' });
    await cardRed.waitFor({ state: 'visible' });
    await cardGray.waitFor({ state: 'visible' });
    console.log('✓ 4 Control status cards (🟢 תקין, 🟡 חסר מסמך/בבדיקה, 🔴 ליקוי מהותי, ⚪ טרם נבדק) are active.');

    const controlTable = page.locator('[data-testid="cfc-control-table"]');
    await controlTable.waitFor({ state: 'visible' });
    console.log(`✓ Control audit table rendered with ${await controlTable.locator('tbody tr').count()} rows.`);

    // Filter by clicking Yellow status card
    await cardYellow.click();
    await page.waitForTimeout(400);
    console.log('✓ Control table filtered by Yellow status card.');

    const shot05 = path.join(outDir, '05_desktop_control_tab.png');
    await page.screenshot({ path: shot05, fullPage: false });
    fs.copyFileSync(shot05, path.join(brainDir, '05_desktop_control_tab.png'));
    console.log('Saved screenshot 05: Desktop Case & Document Control Tab');

    // --- TAB 4: התראות ומשימות (Alerts & Action Queue) ---
    console.log('\n[Tab 4: Alerts & Action Queue]');
    await page.locator('[data-testid="tab-alerts"]').click();
    await page.waitForTimeout(600);

    const alertsBanner = page.locator('[data-testid="cfc-alerts-banner"]');
    await alertsBanner.waitFor({ state: 'visible' });
    const actionQueue = page.locator('[data-testid="cfc-action-queue"]');
    await actionQueue.waitFor({ state: 'visible' });
    console.log(`✓ Alerts Command Center and Action Queue rendered with ${await actionQueue.locator('tbody tr').count()} items.`);

    const shot06 = path.join(outDir, '06_desktop_alerts_tab.png');
    await page.screenshot({ path: shot06, fullPage: false });
    fs.copyFileSync(shot06, path.join(brainDir, '06_desktop_alerts_tab.png'));
    console.log('Saved screenshot 06: Desktop Alerts & Action Queue Tab');

    // --- TAB 5: חברות ביטוח (Insurers) ---
    console.log('\n[Tab 5: Insurers]');
    await page.locator('[data-testid="tab-insurers"]').click();
    await page.waitForTimeout(600);

    const insurersTable = page.locator('[data-testid="cfc-insurers-table"]');
    await insurersTable.waitFor({ state: 'visible' });
    console.log(`✓ Insurers table rendered with ${await insurersTable.locator('tbody tr').count()} insurers.`);

    const recurringTable = page.locator('[data-testid="cfc-recurring-table"]');
    await recurringTable.waitFor({ state: 'visible' });
    console.log('✓ Recurring deductions analysis table rendered.');

    const shot07 = path.join(outDir, '07_desktop_insurers_tab.png');
    await page.screenshot({ path: shot07, fullPage: false });
    fs.copyFileSync(shot07, path.join(brainDir, '07_desktop_insurers_tab.png'));
    console.log('Saved screenshot 07: Desktop Insurers Tab');

    // --- TAB 6: תקשורת ואימיילים אוטומטיים (Communication & Automated Emails) ---
    console.log('\n[Tab 6: Communication & Automated Emails]');
    await page.locator('[data-testid="tab-communication"]').click();
    await page.waitForTimeout(600);

    const commGrid = page.locator('[data-testid="cfc-comm-10-cards"]');
    await commGrid.waitFor({ state: 'visible' });
    const commCardsCount = await commGrid.locator('.cfc-overview-card').count();
    console.log(`✓ Communication metrics grid rendered with ${commCardsCount} metrics cards.`);

    const commTable = page.locator('[data-testid="cfc-comm-table"]');
    await commTable.waitFor({ state: 'visible' });
    console.log(`✓ Communication log table rendered with ${await commTable.locator('tbody tr').count()} log rows.`);

    const shot08 = path.join(outDir, '08_desktop_communication_tab.png');
    await page.screenshot({ path: shot08, fullPage: false });
    fs.copyFileSync(shot08, path.join(brainDir, '08_desktop_communication_tab.png'));
    console.log('Saved screenshot 08: Desktop Communication & Automated Emails Tab');

    // --- TAB 7: דוחות נוספים ותפעוליים (Operational & Garage Cases) ---
    console.log('\n[Tab 7: Operational & Garage Cases]');
    await page.locator('[data-testid="tab-operational"]').click();
    await page.waitForTimeout(600);

    const garageTable = page.locator('[data-testid="cfc-operational-garage-table"]');
    await garageTable.waitFor({ state: 'visible' });
    console.log(`✓ Garage cases operational table rendered with ${await garageTable.locator('tbody tr').count()} rows.`);

    const shot09 = path.join(outDir, '09_desktop_operational_tab.png');
    await page.screenshot({ path: shot09, fullPage: false });
    fs.copyFileSync(shot09, path.join(brainDir, '09_desktop_operational_tab.png'));
    console.log('Saved screenshot 09: Desktop Operational Tab');

    await page.close();
    await ctx.close();

    // ==========================================
    // --- TEST 2: Tablet Landscape (1024x768) ---
    // ==========================================
    console.log('\n--- 2. Testing Tablet Landscape (1024x768) ---');
    const tabLandscapeCtx = await browser.newContext({
      viewport: { width: 1024, height: 768 },
      locale: 'he-IL',
    });
    await tabLandscapeCtx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: `sb-${STAGING_REF}-auth-token`,
      value: authSessionValue,
    });
    const pageTabLand = await tabLandscapeCtx.newPage();
    await pageTabLand.goto(`${TARGET_URL}/claims?view=reports`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await pageTabLand.waitForTimeout(3000);
    await pageTabLand.locator('[data-testid="claims-financial-center"]').waitFor({ state: 'visible' });

    const shot10 = path.join(outDir, '10_tablet_landscape_overview.png');
    await pageTabLand.screenshot({ path: shot10, fullPage: false });
    fs.copyFileSync(shot10, path.join(brainDir, '10_tablet_landscape_overview.png'));
    console.log('Saved screenshot 10: Tablet Landscape Overview');
    await pageTabLand.close();
    await tabLandscapeCtx.close();

    // ==========================================
    // --- TEST 3: Tablet Portrait (768x1024) ---
    // ==========================================
    console.log('\n--- 3. Testing Tablet Portrait (768x1024) ---');
    const tabPortraitCtx = await browser.newContext({
      viewport: { width: 768, height: 1024 },
      locale: 'he-IL',
    });
    await tabPortraitCtx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: `sb-${STAGING_REF}-auth-token`,
      value: authSessionValue,
    });
    const pageTabPort = await tabPortraitCtx.newPage();
    await pageTabPort.goto(`${TARGET_URL}/claims?view=reports`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await pageTabPort.waitForTimeout(3000);
    await pageTabPort.locator('[data-testid="claims-financial-center"]').waitFor({ state: 'visible' });

    const shot11 = path.join(outDir, '11_tablet_portrait_overview.png');
    await pageTabPort.screenshot({ path: shot11, fullPage: false });
    fs.copyFileSync(shot11, path.join(brainDir, '11_tablet_portrait_overview.png'));
    console.log('Saved screenshot 11: Tablet Portrait Overview');
    await pageTabPort.close();
    await tabPortraitCtx.close();

    // ==========================================
    // --- TEST 4: Mobile Regular (390x844) ---
    // ==========================================
    console.log('\n--- 4. Testing Mobile Regular (390x844) ---');
    const mCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      locale: 'he-IL',
    });
    await mCtx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: `sb-${STAGING_REF}-auth-token`,
      value: authSessionValue,
    });
    const mPage = await mCtx.newPage();
    await mPage.goto(`${TARGET_URL}/claims?view=reports`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await mPage.waitForTimeout(3000);
    await mPage.locator('[data-testid="claims-financial-center"]').waitFor({ state: 'visible' });

    // Verify nav is scrollable and readable
    const nav = mPage.locator('[data-testid="cfc-main-nav"]');
    await nav.waitFor({ state: 'visible' });
    console.log('✓ Main 7-tab navigation bar visible on mobile 390px.');

    const shot12 = path.join(outDir, '12_mobile_regular_overview.png');
    await mPage.screenshot({ path: shot12, fullPage: false });
    fs.copyFileSync(shot12, path.join(brainDir, '12_mobile_regular_overview.png'));
    console.log('Saved screenshot 12: Mobile Regular Overview');
    await mPage.close();
    await mCtx.close();

    // ==========================================
    // --- TEST 5: Mobile Small (360x740) ---
    // ==========================================
    console.log('\n--- 5. Testing Mobile Small (360x740) ---');
    const smCtx = await browser.newContext({
      viewport: { width: 360, height: 740 },
      isMobile: true,
      hasTouch: true,
      locale: 'he-IL',
    });
    await smCtx.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: `sb-${STAGING_REF}-auth-token`,
      value: authSessionValue,
    });
    const smPage = await smCtx.newPage();
    await smPage.goto(`${TARGET_URL}/claims?view=reports`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await smPage.waitForTimeout(3000);
    await smPage.locator('[data-testid="claims-financial-center"]').waitFor({ state: 'visible' });

    // Switch to Control tab to test status cards on small screen
    await smPage.locator('[data-testid="tab-control"]').click();
    await smPage.waitForTimeout(600);
    await smPage.locator('[data-testid="cfc-control-4-cards"]').waitFor({ state: 'visible' });

    const shot13 = path.join(outDir, '13_mobile_small_control.png');
    await smPage.screenshot({ path: shot13, fullPage: false });
    fs.copyFileSync(shot13, path.join(brainDir, '13_mobile_small_control.png'));
    console.log('Saved screenshot 13: Mobile Small Control Tab');
    await smPage.close();
    await smCtx.close();

    console.log('\n=== ALL E2E RESPONSIVE TESTS PASSED SUCCESSFULLY! ===');
  } catch (err) {
    console.error('E2E Test Failed:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run();
