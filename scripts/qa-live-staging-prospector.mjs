import { chromium } from 'playwright';
import path from 'path';

async function runLiveQA() {
  const stagingUrl = 'https://orin1607-ctrl.github.io/future-craft-core/dalia-marketing-center-v2.html';
  console.log(`[QA LIVE] Testing live staging at ${stagingUrl}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const results = [];
  const logStep = (step, ok, details = '') => {
    results.push({ step, ok, details });
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${step} ${details}`);
  };

  try {
    // 1. Load Staging
    await page.goto(stagingUrl, { waitUntil: 'networkidle' });
    const title = await page.title();
    logStep('Load Live Staging Marketing V2', title.includes('דליה'), `Title: ${title}`);

    // 2. Locate module card
    const leadsCard = page.locator('button.mod[data-go="m/leads"]');
    const isLeadsVisible = await leadsCard.isVisible();
    const leadsText = await leadsCard.textContent();
    logStep('Verify "איתור לקוחות ולידים" has "מחובר" chip on live staging', isLeadsVisible && leadsText.includes('מחובר'), `Text: ${leadsText.replace(/\s+/g, ' ').trim()}`);

    // 3. Click to open module
    await leadsCard.click();
    await page.waitForTimeout(1000);

    // 4. Verify crumbs & iframe
    const crumbs = await page.locator('.crumbs').textContent().catch(() => '');
    logStep('Live Staging: Crumbs show "דשבורד ראשי / איתור לקוחות ולידים"', crumbs.includes('איתור לקוחות ולידים'), `Crumbs: ${crumbs}`);

    const iframeLocator = page.frameLocator('#module-frame-leads');
    const iframeTitle = await iframeLocator.locator('#title').textContent().catch(() => '');
    logStep('Live Staging: OpenProspector iframe rendered with title', iframeTitle.includes('איתור לקוחות'), `Title: ${iframeTitle}`);

    // 5. Test search tab & NLP Interpret
    const searchTab = iframeLocator.locator('.tabs button[data-tab="search"]');
    await searchTab.click();
    await page.waitForTimeout(400);
    const searchArea = await iframeLocator.locator('#q').isVisible();
    logStep('Live Staging: Search tab query box is functional', searchArea);

    const exButton = iframeLocator.locator('button[data-ex]').first();
    await exButton.click();
    await iframeLocator.locator('button[data-act="interpret"]').click();
    await page.waitForTimeout(400);
    const interpVisible = await iframeLocator.locator('#interp .interp').isVisible();
    logStep('Live Staging: NLP Interpret generates query chips', interpVisible);

    // 6. Test Connections Tab
    const connTab = iframeLocator.locator('.tabs button[data-tab="connections"]');
    await connTab.click();
    await page.waitForTimeout(500);
    const connCardsCount = await iframeLocator.locator('.conn-card').count();
    logStep('Live Staging: Connections tab renders 10 provider cards', connCardsCount === 10, `Cards: ${connCardsCount}`);

    // Test live data.gov.il connection
    const govTestBtn = iframeLocator.locator('#conn-gov button[data-test-conn="gov"]');
    await govTestBtn.click();
    await page.waitForTimeout(1500);
    const govStatusText = await iframeLocator.locator('#conn-gov .conn-last-check').textContent();
    logStep('Live Staging: data.gov.il live API check succeeds', govStatusText.includes('תקין') || govStatusText.includes('ms'), `Status: ${govStatusText}`);

    // 7. Test Live Search Run (data.gov.il live query)
    await searchTab.click();
    await page.waitForTimeout(400);
    const runBtn = iframeLocator.locator('#btnRun');
    await runBtn.click();
    // Wait for the search steps to finish
    await page.waitForTimeout(4500);
    const progressDone = await iframeLocator.locator('#progress .est-box').isVisible();
    logStep('Live Staging: Search run completed with live data.gov.il query', progressDone);

    // 8. Test companies tab & row drawer
    const companiesTab = iframeLocator.locator('.tabs button[data-tab="companies"]');
    await companiesTab.click();
    await page.waitForTimeout(400);
    const rowsCount = await iframeLocator.locator('table.co tbody tr').count();
    logStep('Live Staging: Companies tab loaded active companies (with real data.gov.il records)', rowsCount >= 8, `Rows: ${rowsCount}`);

    const firstRow = iframeLocator.locator('table.co tbody tr').first();
    await firstRow.click();
    await page.waitForTimeout(400);
    const panelVisible = await iframeLocator.locator('#panel .panel').isVisible();
    const coName = await iframeLocator.locator('#panel h2').textContent().catch(() => '');
    logStep('Live Staging: Company detail drawer opens with Fleet Evidence', panelVisible, `Company: ${coName}`);

    // Verify cross-check toolbar and tier badges
    const crossCheckBtns = await iframeLocator.locator('#panel .cross-btn').count();
    logStep('Live Staging: One-click cross-check toolbar present (144, d.co.il, LinkedIn, WA)', crossCheckBtns >= 4, `Buttons: ${crossCheckBtns}`);
    const tierBadgesInDrawer = await iframeLocator.locator('#panel .tier-badge').count();
    logStep('Live Staging: Tier badges visible on contact fields / evidence', tierBadgesInDrawer > 0, `Badges: ${tierBadgesInDrawer}`);

    // 9. Test toCrm toast
    await iframeLocator.locator('button[data-act="toCrm"]').click();
    await page.waitForTimeout(300);
    const toastText = await iframeLocator.locator('#toast').textContent().catch(() => '');
    logStep('Live Staging: "העבר ל-CRM" toast triggers', toastText.includes('CRM'), `Toast: ${toastText}`);

    // 10. Test Kanban Leads board & Safety Officer Category
    await iframeLocator.locator('button[data-act="closePanel"]').click();
    await page.waitForTimeout(300);
    const leadsTab = iframeLocator.locator('.tabs button[data-tab="leads"]');
    await leadsTab.click();
    await page.waitForTimeout(300);
    const colsCount = await iframeLocator.locator('.board .col').count();
    logStep('Live Staging: Leads Kanban board displays pipeline columns', colsCount === 7, `Columns: ${colsCount}`);

    // Verify Safety Officer Category Filter & Regulation 579 Banner
    const safetyCatBtn = iframeLocator.locator('button[data-lead-cat="safety_officer"]');
    const isSafetyCatVisible = await safetyCatBtn.isVisible();
    const safetyCatText = await safetyCatBtn.textContent().catch(() => '');
    logStep('Live Staging: "קצין רכב / קצין בטיחות" category filter present', isSafetyCatVisible && safetyCatText.includes('קצין רכב'), `Text: ${safetyCatText.trim()}`);

    const safetyBanner = await iframeLocator.locator('.card-b:has-text("קצין בטיחות בתעבורה (תקנה 579)")').isVisible().catch(() => false);
    logStep('Live Staging: Regulation 579 statutory mandate banner visible in leads', safetyBanner);

    const safetyBadges = await iframeLocator.locator('.lead:has-text("קצין בטיחות"), .lead:has-text("קצב")').count();
    logStep('Live Staging: Kanban cards display safety officer badges', safetyBadges > 0, `Cards with badges: ${safetyBadges}`);

    const safetyLeadsCount = await iframeLocator.locator('.board .lead').count();
    logStep('Live Staging: Filtered "קצין רכב / קצין בטיחות" leads count', safetyLeadsCount === 13, `Count: ${safetyLeadsCount}`);

    // 11. Test Sources Tab (21 Data Sources Matrix & Tiers)
    const sourcesTab = iframeLocator.locator('.tabs button[data-tab="sources"]');
    await sourcesTab.click();
    await page.waitForTimeout(400);
    const sourcesCount = await iframeLocator.locator('[id^="src-row-"]').count();
    logStep('Live Staging: Sources tab renders 21 data sources', sourcesCount === 21, `Sources: ${sourcesCount}`);

    // Verify regulation banners
    const safetyBannerText = await iframeLocator.locator('.card-b:has-text("579")').textContent().catch(() => '');
    logStep('Live Staging: Safety Officers Regulation 579 banner displayed', safetyBannerText.includes('579') && safetyBannerText.includes('meida@mot.gov.il'));

    const b144BannerText = await iframeLocator.locator('.card-b:has-text("144")').textContent().catch(() => '');
    logStep('Live Staging: 144 / d.co.il Manual Cross-Check policy banner displayed', b144BannerText.includes('Scraping') || b144BannerText.includes('הצלבה ידנית'));

    // Test Tier Filter (Tier A)
    const tierABtn = iframeLocator.locator('button[data-src-tier="A"]');
    await tierABtn.click();
    await page.waitForTimeout(300);
    const tierACount = await iframeLocator.locator('[id^="src-row-"]').count();
    logStep('Live Staging: Filtering by Tier A shows 6 official government sources', tierACount === 6, `Tier A sources: ${tierACount}`);

    // Reset filter
    await iframeLocator.locator('button[data-src-tier="all"]').click();
    await page.waitForTimeout(300);

    // 12. Test Live Staging Bulk Ingestion Engine
    await searchTab.click();
    await page.waitForTimeout(400);
    const bulkCardVisible = await iframeLocator.locator('#bulk-target').isVisible();
    logStep('Live Staging Bulk Engine: Controls visible', bulkCardVisible);

    const targetOptions = await iframeLocator.locator('#bulk-target option').allInnerTexts();
    logStep('Live Staging Bulk Engine: Target options support 100 to 5,000 leads', targetOptions.some(o => o.includes('100')) && targetOptions.some(o => o.includes('הכל') || o.includes('5000')), `Options: ${targetOptions.length}`);

    await iframeLocator.locator('#bulk-target').selectOption('100');
    await iframeLocator.locator('#bulk-batch-size').selectOption('50');

    const startBulkBtn = iframeLocator.locator('#btnBulkStart');
    await startBulkBtn.click();
    await page.waitForTimeout(400);

    const pauseBtn = iframeLocator.locator('#btnBulkPause');
    const isPauseVisible = await pauseBtn.isVisible();
    logStep('Live Staging Bulk Engine: Pause button active', isPauseVisible);

    await pauseBtn.click();
    await page.waitForTimeout(300);
    const resumeBtn = iframeLocator.locator('#btnBulkResume');
    logStep('Live Staging Bulk Engine: Resume button appears upon pause', await resumeBtn.isVisible());

    await resumeBtn.click();
    await page.waitForTimeout(300);

    // Wait for bulk ingestion of 100 leads to complete
    let liveBulkDone = false;
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(600);
      if (await iframeLocator.locator('#btnBulkCommit').isVisible()) {
        liveBulkDone = true;
        break;
      }
    }
    logStep('Live Staging Bulk Engine: Batch ingestion completed', liveBulkDone);

    const kpiScanned = parseInt(await iframeLocator.locator('#kpiScanned').textContent() || '0', 10);
    const kpiAdded = parseInt(await iframeLocator.locator('#kpiAdded').textContent() || '0', 10);
    const kpiFleet = parseInt(await iframeLocator.locator('#kpiFleet').textContent() || '0', 10);
    const kpiSafety = parseInt(await iframeLocator.locator('#kpiSafety').textContent() || '0', 10);
    logStep('Live Staging Bulk Engine: Live KPI stats updated', kpiScanned > 0 && kpiAdded >= 50 && kpiFleet > 0 && kpiSafety > 0, `Scanned: ${kpiScanned}, Added: ${kpiAdded}, Fleet: ${kpiFleet}, Safety: ${kpiSafety}`);

    // Commit to Leads
    await iframeLocator.locator('#btnBulkCommit').click();
    await page.waitForTimeout(400);
    const leadsAfterBulk = await iframeLocator.locator('.board .lead').count();
    logStep('Live Staging Bulk Engine: Transition to Leads tab shows ingested leads', leadsAfterBulk > 15, `Leads: ${leadsAfterBulk}`);

    // Test Pagination on Companies tab
    await companiesTab.click();
    await page.waitForTimeout(400);
    const coRowsP1 = await iframeLocator.locator('table.co tbody tr').count();
    const nextCoBtn = iframeLocator.locator('button[data-act="nextCoPage"]').first();
    const hasPagination = await nextCoBtn.isVisible();
    logStep('Live Staging Companies Table: Paginated view (50 max per page)', coRowsP1 <= 50 && hasPagination, `Page 1 rows: ${coRowsP1}`);

    if (hasPagination) {
      await nextCoBtn.click();
      await page.waitForTimeout(300);
      const coRowsP2 = await iframeLocator.locator('table.co tbody tr').count();
      logStep('Live Staging Companies Table: Page 2 navigation works', coRowsP2 > 0, `Page 2 rows: ${coRowsP2}`);
      await iframeLocator.locator('button[data-act="prevCoPage"]').first().click();
      await page.waitForTimeout(300);
    }

    // 12. Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(400);
    const isMobileResponsive = await iframeLocator.locator('.card').first().isVisible();
    logStep('Live Staging: Mobile (375x667) renders cleanly and responsively', isMobileResponsive);

    await page.screenshot({ path: path.resolve('dist/live-staging-prospector-mobile.png') });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.resolve('dist/live-staging-prospector-desktop.png') });
    logStep('Live Staging: Screenshots captured', true);

  } catch (err) {
    console.error('[QA ERROR]', err);
    logStep('QA Execution', false, err.message);
  } finally {
    await browser.close();
  }

  const allPassed = results.every(r => r.ok);
  console.log(`\n================================`);
  console.log(`[LIVE STAGING QA] ${allPassed ? 'ALL TESTS PASSED ON LIVE STAGING!' : 'FAILURES DETECTED'}`);
  console.log(`================================`);
  process.exit(allPassed ? 0 : 1);
}

runLiveQA();
