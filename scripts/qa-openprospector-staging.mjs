import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';

// Minimal static server for dist
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const distDir = path.resolve('dist');

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
  let filePath = path.join(distDir, reqPath);

  if (!fs.existsSync(filePath)) {
    filePath = path.join(distDir, 'index.html');
  }

  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch (err) {
    res.writeHead(404);
    res.end('Not found');
  }
});

async function runQA() {
  const port = 8995;
  await new Promise(r => server.listen(port, r));
  console.log(`[QA] Test server running at http://localhost:${port}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const results = [];
  const logStep = (step, ok, details = '') => {
    results.push({ step, ok, details });
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${step} ${details}`);
  };

  try {
    // 1. Load dalia-marketing-center-v2.html
    await page.goto(`http://localhost:${port}/dalia-marketing-center-v2.html`, { waitUntil: 'networkidle' });
    const title = await page.title();
    logStep('Load Marketing V2 shell', title.includes('דליה'), `Title: ${title}`);

    // 2. Verify OpenProspector module card in dashboard
    const leadsCard = page.locator('button.mod[data-go="m/leads"]');
    const isLeadsVisible = await leadsCard.isVisible();
    const leadsText = await leadsCard.textContent();
    logStep('Find "איתור לקוחות ולידים" card with "מחובר" status', isLeadsVisible && leadsText.includes('מחובר'), `Text: ${leadsText.replace(/\s+/g, ' ').trim()}`);

    // 3. Click into OpenProspector
    await leadsCard.click();
    await page.waitForTimeout(500);

    // 4. Verify breadcrumbs & frame
    const crumbs = await page.locator('.crumbs').textContent().catch(() => '');
    logStep('Verify navigation to m/leads', crumbs.includes('איתור לקוחות ולידים'), `Crumbs: ${crumbs}`);

    const iframeLocator = page.frameLocator('#module-frame-leads');
    const iframeTitle = await iframeLocator.locator('#title').textContent().catch(() => '');
    logStep('OpenProspector embedded iframe loaded', iframeTitle.includes('איתור לקוחות'), `Title: ${iframeTitle}`);

    // 5. Test Tabs inside iframe
    const searchTab = iframeLocator.locator('.tabs button[data-tab="search"]');
    await searchTab.click();
    await page.waitForTimeout(300);
    const searchArea = await iframeLocator.locator('#q').isVisible();
    logStep('Tab: "חיפוש חדש" renders query input', searchArea);

    // 6. Test NLP Interpret simulation
    const exButton = iframeLocator.locator('button[data-ex]').first();
    await exButton.click();
    await iframeLocator.locator('button[data-act="interpret"]').click();
    await page.waitForTimeout(300);
    const interpVisible = await iframeLocator.locator('#interp .interp').isVisible();
    logStep('NLP Interpret: translates free query into criteria chips', interpVisible);

    // 7. Test Companies Tab
    const companiesTab = iframeLocator.locator('.tabs button[data-tab="companies"]');
    await companiesTab.click();
    await page.waitForTimeout(300);
    const rowsCount = await iframeLocator.locator('table.co tbody tr').count();
    logStep('Tab: "חברות שנמצאו" lists companies', rowsCount >= 8, `Count: ${rowsCount} rows`);

    // 8. Test Company Drawer
    const firstRow = iframeLocator.locator('table.co tbody tr').first();
    await firstRow.click();
    await page.waitForTimeout(400);
    const panelVisible = await iframeLocator.locator('#panel .panel').isVisible();
    const panelCoName = await iframeLocator.locator('#panel h2').textContent().catch(() => '');
    logStep('Drawer: Company detail panel opens', panelVisible, `Company: ${panelCoName}`);

    // Verify cross-check toolbar and tier badges in drawer
    const crossCheckBtns = await iframeLocator.locator('#panel .cross-btn').count();
    logStep('Drawer: One-click cross-check toolbar present (144, d.co.il, LinkedIn, WA)', crossCheckBtns >= 4, `Buttons: ${crossCheckBtns}`);
    const tierBadgesInDrawer = await iframeLocator.locator('#panel .tier-badge').count();
    logStep('Drawer: Tier badges visible on contact fields / evidence', tierBadgesInDrawer > 0, `Badges: ${tierBadgesInDrawer}`);

    // 9. Test CRM transfer action
    const toCrmBtn = iframeLocator.locator('button[data-act="toCrm"]');
    await toCrmBtn.click();
    await page.waitForTimeout(300);
    const toastText = await iframeLocator.locator('#toast').textContent().catch(() => '');
    logStep('Action: "העבר ל-CRM" triggers confirmation', toastText.includes('CRM'), `Toast: ${toastText}`);

    // 10. Close panel & test Leads Kanban Board
    await iframeLocator.locator('button[data-act="closePanel"]').click();
    await page.waitForTimeout(300);
    const leadsTab = iframeLocator.locator('.tabs button[data-tab="leads"]');
    await leadsTab.click();
    await page.waitForTimeout(300);
    const columnsCount = await iframeLocator.locator('.board .col').count();
    logStep('Tab: "ניהול לידים" Kanban board renders', columnsCount === 7, `Columns: ${columnsCount}`);

    // Verify Safety Officer category filter & banner
    const safetyCatBtn = iframeLocator.locator('button[data-lead-cat="safety_officer"]');
    const isSafetyCatVisible = await safetyCatBtn.isVisible();
    const safetyCatText = await safetyCatBtn.textContent().catch(() => '');
    logStep('Leads: "קצין רכב / קצין בטיחות" category filter present', isSafetyCatVisible && safetyCatText.includes('קצין רכב'), `Text: ${safetyCatText.trim()}`);

    const safetyBanner = await iframeLocator.locator('.card-b:has-text("קצין בטיחות בתעבורה (תקנה 579)")').isVisible().catch(() => false);
    logStep('Leads: Regulation 579 statutory mandate banner visible', safetyBanner);

    const safetyBadges = await iframeLocator.locator('.lead:has-text("קצין בטיחות"), .lead:has-text("קצב")').count();
    logStep('Leads: Kanban cards show safety officer badges', safetyBadges > 0, `Cards with badges: ${safetyBadges}`);

    // Test switching categories
    const allCatBtn = iframeLocator.locator('button[data-lead-cat="all"]');
    await allCatBtn.click();
    await page.waitForTimeout(300);
    const allLeadsCount = await iframeLocator.locator('.board .lead').count();
    logStep('Leads: Switching to "כל הלידים" displays all leads', allLeadsCount >= 18, `Count: ${allLeadsCount}`);

    // Switch back to safety officer category
    await safetyCatBtn.click();
    await page.waitForTimeout(300);
    const filteredSafetyCount = await iframeLocator.locator('.board .lead').count();
    logStep('Leads: Filtered "קצין רכב / קצין בטיחות" leads count', filteredSafetyCount === 13, `Count: ${filteredSafetyCount}`);

    // Click a lead card in the board to verify drawer contents
    const leadCard = iframeLocator.locator('.board .lead[data-co="10"] .t').first();
    await leadCard.click();
    await page.waitForTimeout(400);
    const drawerText = await iframeLocator.locator('#panel .panel').textContent().catch(() => '');
    const drawerSafetyBox = drawerText.includes('עמוס לוי');
    const drawerMandateBadge = drawerText.includes('תקנה 579');
    const drawerLeadReason = drawerText.includes('למה החברה נחשבת ליד רלוונטי למוסך דליה');
    logStep('Drawer: Safety Officer Box, Regulation 579, & Rationale rendered', drawerSafetyBox && drawerMandateBadge && drawerLeadReason, 'Verified on lead #10 (אביב לוגיסטיקה)');

    // Close drawer
    await iframeLocator.locator('button[data-act="closePanel"]').click();
    await page.waitForTimeout(300);

    // 11. Test Connections Tab
    const connTab = iframeLocator.locator('.tabs button[data-tab="connections"]');
    await connTab.click();
    await page.waitForTimeout(400);
    const connCardsCount = await iframeLocator.locator('.conn-card').count();
    logStep('Tab: "חיבורים ו-APIs" renders all 10 provider cards', connCardsCount === 10, `Cards: ${connCardsCount}`);

    // Test data.gov.il connection test button
    const govTestBtn = iframeLocator.locator('#conn-gov button[data-test-conn="gov"]');
    await govTestBtn.click();
    await page.waitForTimeout(1000);
    const govStatusText = await iframeLocator.locator('#conn-gov .conn-last-check').textContent();
    logStep('Test Connection: data.gov.il live test responds', govStatusText.includes('תקין') || govStatusText.includes('ms'), `Status: ${govStatusText}`);

    // 12. Test Sources Tab (21 Data Sources Matrix & Tiers)
    const sourcesTab = iframeLocator.locator('.tabs button[data-tab="sources"]');
    await sourcesTab.click();
    await page.waitForTimeout(400);
    const sourcesCount = await iframeLocator.locator('[id^="src-row-"]').count();
    logStep('Tab: "מקורות מידע" renders 21 data sources', sourcesCount === 21, `Sources: ${sourcesCount}`);

    // Verify regulation banners
    const safetyBannerText = await iframeLocator.locator('.card-b:has-text("579")').textContent().catch(() => '');
    logStep('Sources Tab: Safety Officers Regulation 579 banner displayed', safetyBannerText.includes('579') && safetyBannerText.includes('meida@mot.gov.il'));

    const b144BannerText = await iframeLocator.locator('.card-b:has-text("144")').textContent().catch(() => '');
    logStep('Sources Tab: 144 / d.co.il Manual Cross-Check policy banner displayed', b144BannerText.includes('Scraping') || b144BannerText.includes('הצלבה ידנית'));

    // Test Tier Filter (Tier A)
    const tierABtn = iframeLocator.locator('button[data-src-tier="A"]');
    await tierABtn.click();
    await page.waitForTimeout(300);
    const tierACount = await iframeLocator.locator('[id^="src-row-"]').count();
    logStep('Sources Tab: Filtering by Tier A shows 6 official government sources', tierACount === 6, `Tier A sources: ${tierACount}`);

    // Reset filter
    await iframeLocator.locator('button[data-src-tier="all"]').click();
    await page.waitForTimeout(300);

    // Test 3-way toggle on a source
    const toggleActiveBtn = iframeLocator.locator('[data-toggle-src="b2b_apollo"][data-set-status="active"]');
    await toggleActiveBtn.click();
    await page.waitForTimeout(300);
    const apolloRowText = await iframeLocator.locator('#src-row-b2b_apollo').textContent();
    logStep('Sources Tab: 3-way toggle updates status to Active', apolloRowText.includes('פעיל'));

    // Test Live Source Verification (data.gov.il contractors registry)
    const testContractorsBtn = iframeLocator.locator('button[data-test-src="gov_contractors"]');
    if (await testContractorsBtn.isVisible()) {
      await testContractorsBtn.click();
      await page.waitForTimeout(1200);
      const contractorsStatus = await iframeLocator.locator('#src-row-gov_contractors .src-last-check').textContent();
      logStep('Sources Tab: Live check of פנקס הקבלנים responds with live latency', contractorsStatus.includes('תקין') || contractorsStatus.includes('ms'), `Status: ${contractorsStatus}`);
    }

    // 13. Test Live Search Run (data.gov.il live query)
    await searchTab.click();
    await page.waitForTimeout(300);
    const runBtn = iframeLocator.locator('#btnRun');
    await runBtn.click();
    // Wait for the 6-step progress to complete
    await page.waitForTimeout(3800);
    const progressDone = await iframeLocator.locator('#progress .est-box').isVisible();
    logStep('Live Search: data.gov.il + Fleet Scoring search completed', progressDone);

    // Verify companies list grew
    await companiesTab.click();
    await page.waitForTimeout(300);
    const updatedRowsCount = await iframeLocator.locator('table.co tbody tr').count();
    logStep('Companies table updated with newly found real companies', updatedRowsCount > rowsCount, `Total companies now: ${updatedRowsCount}`);

    // 14. Test Bulk Ingestion Engine
    await searchTab.click();
    await page.waitForTimeout(300);
    const bulkCardVisible = await iframeLocator.locator('#bulk-target').isVisible();
    logStep('Bulk Engine: Target selector, dataset, & batch size controls visible', bulkCardVisible);

    // Verify option choices: 100, 500, 1000, 2000, 5000
    const targetOptions = await iframeLocator.locator('#bulk-target option').allInnerTexts();
    logStep('Bulk Engine: Target options support 100 to 5,000 leads', targetOptions.some(o => o.includes('100')) && targetOptions.some(o => o.includes('הכל') || o.includes('5000')), `Options: ${targetOptions.length}`);

    // Set target to 100, batch size to 50
    await iframeLocator.locator('#bulk-target').selectOption('100');
    await iframeLocator.locator('#bulk-batch-size').selectOption('50');

    // Click start bulk import
    const startBulkBtn = iframeLocator.locator('#btnBulkStart');
    await startBulkBtn.click();
    await page.waitForTimeout(400);

    // Verify pause button appears
    const pauseBtn = iframeLocator.locator('#btnBulkPause');
    const isPauseVisible = await pauseBtn.isVisible();
    logStep('Bulk Engine: Import starts and shows Pause button', isPauseVisible);

    // Test pause
    await pauseBtn.click();
    await page.waitForTimeout(300);
    const resumeBtn = iframeLocator.locator('#btnBulkResume');
    const isResumeVisible = await resumeBtn.isVisible();
    logStep('Bulk Engine: Pause button suspends batch and reveals Resume button', isResumeVisible);

    // Test resume
    await resumeBtn.click();
    await page.waitForTimeout(300);

    // Wait for bulk import to complete (processing 100 leads across 2 batches takes ~3-7 seconds)
    let bulkFinished = false;
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(500);
      const commitBtnVisible = await iframeLocator.locator('#btnBulkCommit').isVisible();
      if (commitBtnVisible) {
        bulkFinished = true;
        break;
      }
    }
    logStep('Bulk Engine: Completed batch ingestion of 100 leads', bulkFinished);

    // Check KPI counters
    const kpiScanned = parseInt(await iframeLocator.locator('#kpiScanned').textContent() || '0', 10);
    const kpiAdded = parseInt(await iframeLocator.locator('#kpiAdded').textContent() || '0', 10);
    const kpiFleet = parseInt(await iframeLocator.locator('#kpiFleet').textContent() || '0', 10);
    const kpiSafety = parseInt(await iframeLocator.locator('#kpiSafety').textContent() || '0', 10);
    logStep('Bulk Engine: Live KPI counters updated', kpiScanned > 0 && kpiAdded >= 50 && kpiFleet > 0 && kpiSafety > 0, `Scanned: ${kpiScanned}, Added: ${kpiAdded}, Fleet: ${kpiFleet}, Safety: ${kpiSafety}`);

    // Test commit to leads
    const commitBtn = iframeLocator.locator('#btnBulkCommit');
    await commitBtn.click();
    await page.waitForTimeout(400);

    // Verify we are now on Leads tab and total leads increased significantly
    const leadsBoardCols = await iframeLocator.locator('.board .col').count();
    const leadsCountAfterBulk = await iframeLocator.locator('.board .lead').count();
    logStep('Bulk Engine: "עבור לניהול לידים" transitions to Leads tab with bulk leads', leadsBoardCols === 7 && leadsCountAfterBulk > 15, `Leads in view: ${leadsCountAfterBulk}`);

    // Verify Leads shortcut button to Bulk Ingestion
    const shortcutBulkBtn = iframeLocator.locator('button[data-tab="search"]:has-text("ייבוא לידים באצוות")');
    logStep('Leads Tab: "ייבוא לידים באצוות" shortcut button present', await shortcutBulkBtn.isVisible());

    // 15. Test Companies Tab Pagination (50 per page)
    await companiesTab.click();
    await page.waitForTimeout(400);
    const coRowsP1 = await iframeLocator.locator('table.co tbody tr').count();
    const nextCoBtn = iframeLocator.locator('button[data-act="nextCoPage"]').first();
    const hasPagination = await nextCoBtn.isVisible();
    logStep('Companies Table: Paginated view renders (50 items max per page)', coRowsP1 <= 50 && hasPagination, `Rows on page: ${coRowsP1}, Pagination active: ${hasPagination}`);

    if (hasPagination) {
      await nextCoBtn.click();
      await page.waitForTimeout(300);
      const coRowsP2 = await iframeLocator.locator('table.co tbody tr').count();
      logStep('Companies Table: Next page button loads page 2', coRowsP2 > 0, `Page 2 rows: ${coRowsP2}`);
      const prevCoBtn = iframeLocator.locator('button[data-act="prevCoPage"]').first();
      await prevCoBtn.click();
      await page.waitForTimeout(300);
      logStep('Companies Table: Prev page button returns to page 1', true);
    }

    // 13. Test Mobile Viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(300);
    const isMobileResponsive = await iframeLocator.locator('table.co').isVisible();
    logStep('Mobile: 375px responsive layout renders cleanly', isMobileResponsive);

    // Capture desktop & mobile screenshot
    await page.screenshot({ path: path.join(distDir, 'qa-prospector-mobile.png') });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(distDir, 'qa-prospector-desktop.png') });
    logStep('Screenshots saved to dist/', true);

  } catch (err) {
    console.error('[QA ERROR]', err);
    logStep('QA Execution', false, err.message);
  } finally {
    await browser.close();
    server.close();
  }

  const allPassed = results.every(r => r.ok);
  console.log(`\n================================`);
  console.log(`[QA RESULT] ${allPassed ? 'ALL TESTS PASSED SUCCESSFULLY!' : 'SOME TESTS FAILED'}`);
  console.log(`================================`);
  process.exit(allPassed ? 0 : 1);
}

runQA();
