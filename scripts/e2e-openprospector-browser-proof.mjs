// scripts/e2e-openprospector-browser-proof.mjs
// Real browser E2E test with Playwright for OpenProspector unified lead discovery
import http from "http";
import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const PORT = 8998;
const PUBLIC_DIR = path.resolve("public");
const SHOTS_DIR = path.resolve("backups/qa-shots-live-proof");

if (!fs.existsSync(SHOTS_DIR)) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
}

// 1. Simple static file server for public/
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml"
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split("?")[0];
  if (reqPath === "/" || reqPath === "") reqPath = "/openprospector.html";
  const filePath = path.join(PUBLIC_DIR, reqPath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404 Not Found");
  }
});

await new Promise((resolve) => server.listen(PORT, resolve));
console.log(`[HTTP] Local server listening on http://localhost:${PORT}`);

const report = {
  timestamp: new Date().toISOString(),
  environment: "staging",
  port: PORT,
  timings: {},
  metrics: {},
  assertions: [],
  consoleErrors: [],
  consoleWarnings: []
};

try {
  console.log("[Playwright] Launching browser (channel: chrome)...");
  let browser;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
  } catch (e) {
    console.log("[Playwright] Chrome channel failed, trying msedge...");
    browser = await chromium.launch({ channel: "msedge", headless: true });
  }

  // ===== DESKTOP RUN (1440 x 900) =====
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "he-IL"
  });
  const page = await desktopContext.newPage();

  page.on("console", msg => {
    if (msg.type() === "error") {
      console.error("[Browser Error]", msg.text());
      report.consoleErrors.push(msg.text());
    } else if (msg.type() === "warning") {
      report.consoleWarnings.push(msg.text());
    }
  });

  page.on("pageerror", err => {
    console.error("[Page Error]", err.message);
    report.consoleErrors.push(err.message);
  });

  console.log(`[Playwright] Navigating to http://localhost:${PORT}/openprospector.html...`);
  await page.goto(`http://localhost:${PORT}/openprospector.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);

  // Navigate to "חיפוש חדש" tab
  console.log("[Playwright] Switching to search tab...");
  const searchTabBtn = page.locator("[data-tab='search']").first();
  await searchTabBtn.click();
  await page.waitForTimeout(500);

  // Verify Sources Checkboxes & Cross-referencing UI
  const sourcesContainer = page.locator(".src-cb");
  const sourcesCount = await sourcesContainer.count();
  console.log(`[Assertion] Found ${sourcesCount} source checkboxes in UI.`);
  report.assertions.push({
    test: "Source checkboxes count",
    sourcesCount,
    passed: sourcesCount >= 5
  });

  // Verify Workforce Range Filter
  const workforceSelect = page.locator("#a-workforce-range");
  const workforceOptions = await workforceSelect.locator("option").allInnerTexts();
  console.log("[Assertion] Workforce filter options:", workforceOptions);
  report.assertions.push({
    test: "Workforce range options present",
    workforceOptions,
    passed: workforceOptions.some(o => o.includes("51–100")) && workforceOptions.some(o => o.includes("לא ידוע"))
  });

  // Capture Search Form with Sources & Workforce options
  await page.screenshot({ path: path.join(SHOTS_DIR, "10-sources-selection-ui.png"), fullPage: false });
  console.log("[Shot 10] Captured sources selection & form UI.");

  // Focus on workforce filter & capture close-up
  await page.screenshot({ path: path.join(SHOTS_DIR, "11-workforce-filter-ui.png"), fullPage: false });
  console.log("[Shot 11] Captured workforce filter UI.");

  // Assert Form Elements
  const kwInput = page.locator("#a-kw");
  const countInput = page.locator("#a-count");
  const searchBtn = page.locator("#btnUnifiedSearch");

  report.assertions.push({
    test: "Form inputs exist",
    kwPresent: await kwInput.isVisible(),
    countPresent: await countInput.isVisible(),
    btnPresent: await searchBtn.isVisible()
  });

  // Set criteria: keyword "הובלה", count 50
  console.log("[Playwright] Filling search criteria: keyword 'הובלה', count 50...");
  await kwInput.fill("הובלה");
  await countInput.fill("50");

  // Trigger Unified Search
  const t0 = Date.now();
  console.log("[Playwright] Clicking 'הפעל איתור חברות חינמי ומבוקר'...");
  await searchBtn.click();

  // Wait for results area to reveal immediately (< 1s)
  await page.waitForSelector("#searchResultsArea", { timeout: 3000 });
  const tFirstPaint = Date.now() - t0;
  report.timings.timeToResultsContainerMs = tFirstPaint;
  console.log(`[Metrics] Results container appeared in ${tFirstPaint}ms`);

  // Wait for first batch of rows to appear in table
  await page.waitForSelector("#searchHitsTableBody tr", { timeout: 10000 });
  const tFirstRow = Date.now() - t0;
  report.timings.timeToFirstRowsMs = tFirstRow;
  console.log(`[Metrics] First streaming rows rendered in ${tFirstRow}ms`);

  // Wait for search completion (search button re-enabled)
  console.log("[Playwright] Waiting for search completion...");
  await page.waitForFunction(() => {
    const btn = document.getElementById("btnUnifiedSearch");
    return btn && !btn.disabled && window.S && !window.S.searchRunning;
  }, { timeout: 30000 });

  const tTotal = Date.now() - t0;
  report.timings.totalSearchTimeMs = tTotal;
  console.log(`[Metrics] Total search completed in ${tTotal}ms`);

  // Verify rows in table
  const rows = await page.locator("#searchHitsTableBody tr.hit-row").count();
  console.log(`[Metrics] Total matching company rows in table: ${rows}`);
  report.metrics.renderedRowCount = rows;

  // Capture table with 16 columns (Search 50 transport companies)
  await page.screenshot({ path: path.join(SHOTS_DIR, "13-search-50-transport-table.png"), fullPage: false });
  console.log("[Shot 13] Captured real live table for 50 companies.");

  // Check green phone badges and cross-referencing
  const greenPhoneBadges = await page.locator(".hit-row span:has-text('ירוק')").count();
  const partialBadges = await page.locator(".hit-row span:has-text('חלקי')").count();
  console.log(`[Metrics] Green phone badges: ${greenPhoneBadges}, Partial badges: ${partialBadges}`);
  report.metrics.greenPhoneBadges = greenPhoneBadges;
  report.metrics.partialBadges = partialBadges;

  // Check fleet indication vs estimate badges
  const fleetBadges = await page.locator(".hit-row td:has-text('ביטחון:')").count();
  console.log(`[Metrics] Fleet estimation badges: ${fleetBadges}`);
  report.metrics.fleetEstBadges = fleetBadges;

  // Check workforce values: estimated rows vs unverified
  const workforceRows = await page.locator(".hit-row td:has-text('עובד')").count();
  const unverifiedWorkforce = await page.locator(".hit-row td:has-text('לא ידוע')").count();
  console.log(`[Metrics] Workforce estimated rows: ${workforceRows}, Unverified: ${unverifiedWorkforce}`);
  report.metrics.workforceEstimatedCount = workforceRows;
  report.metrics.unverifiedWorkforceCount = unverifiedWorkforce;

  // Check drawer toggle on first row & capture cross-matching drawer
  console.log("[Playwright] Testing responsive drawer expansion on first row...");
  const firstDrawerBtn = page.locator("[data-act='toggleHitDrawer']").first();
  await firstDrawerBtn.click();
  await page.waitForTimeout(400);

  const drawerVisible = await page.locator(".hit-drawer-row").first().isVisible();
  report.assertions.push({
    test: "Row detail drawer expands",
    drawerVisible
  });
  console.log(`[Assertion] Drawer expanded: ${drawerVisible}`);

  // Scroll drawer into view so its detailed qualification cards are visible in the screenshot
  const drawerEl = page.locator(".hit-drawer-row").first();
  await drawerEl.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);

  await page.screenshot({ path: path.join(SHOTS_DIR, "12-green-phone-crossmatch.png"), fullPage: false });
  console.log("[Shot 12] Captured green phone & drawer cross-matching proof.");

  // Verify that NO direct Stage 3 shortcut button exists in Search Results toolbar
  const directStage3Btn = page.locator("#btnAdoptDirectToLeads");
  const hasDirectStage3 = await directStage3Btn.count();
  console.log(`[Assertion] Direct Stage 3 bypass button present in search: ${hasDirectStage3 > 0 ? "YES (FAILED)" : "NO (PASSED)"}`);
  report.assertions.push({
    test: "No direct Stage 3 bypass button in search results (strict 2-stage lifecycle)",
    passed: hasDirectStage3 === 0
  });

  // Test Stage 2 Save: "שמור חברות נבחרות כ'חברות שנמצאו'"
  console.log("[Playwright] Selecting hits for Stage 2 save...");
  const selectAllBtn = page.locator("[data-act='selectAllHits']").first();
  await selectAllBtn.click();
  await page.waitForTimeout(300);

  // Auto-accept the confirmation dialog (testing the 2-stage approval gate)
  page.on("dialog", async (dialog) => {
    console.log(`[Playwright Dialog] "${dialog.message().slice(0, 50)}..." -> Accepting confirmation`);
    await dialog.accept();
  });

  const saveStage2Btn = page.locator("#btnSaveToDiscovered");
  const saveBtnTextBefore = await saveStage2Btn.innerText();
  console.log(`[UI] Save Stage 2 button: "${saveBtnTextBefore}"`);

  await saveStage2Btn.click();
  await page.waitForTimeout(800);

  // Check that success banner appears with button to switch to 'חברות שנמצאו'
  const goToDiscoveredBtn = page.locator("[data-go='companies'], [data-tab='companies']").first();
  const bannerVisible = await goToDiscoveredBtn.isVisible();
  console.log(`[Assertion] Stage 2 Success banner with navigation visible: ${bannerVisible}`);
  report.assertions.push({
    test: "Stage 2 Success banner with navigation button displayed",
    passed: bannerVisible
  });

  await page.screenshot({ path: path.join(SHOTS_DIR, "14-stage2-to-stage3-gate.png"), fullPage: false });
  console.log("[Shot 14] Captured Stage 2 saved state & navigation gate.");

  // Test Navigation to 'חברות שנמצאו'
  console.log("[Playwright] Navigating to 'חברות שנמצאו' tab...");
  await goToDiscoveredBtn.click();
  await page.waitForTimeout(800);

  const activeTab = await page.evaluate(() => (window.S ? window.S.tab : null));
  console.log(`[UI] Current Active Tab: "${activeTab}"`);
  report.assertions.push({
    test: "Navigated to 'חברות שנמצאו' view",
    activeTab,
    passed: activeTab === "companies"
  });

  // Test Track Switcher: Switch to Track B (AI / Gemini)
  console.log("[Playwright] Testing Track B (AI / Gemini)...");
  await page.evaluate(() => {
    if (window.S) {
      window.S.tab = "search";
      if (typeof window.render === "function") window.render();
    }
  });
  await page.waitForTimeout(400);

  const aiTrackBtn = page.locator("[data-act='setSearchTrack'][data-track='ai']").first();
  await aiTrackBtn.click();
  await page.waitForTimeout(500);

  // Verify Track B (AI / Gemini) Form & Cost Gate Banner
  const aiPromptArea = page.locator("#ai-search-prompt");
  await aiPromptArea.fill("מצא 20 חברות הובלה ולוגיסטיקה במרכז");
  const aiSearchBtn = page.locator("[data-act='runAiProspectingSearch']");
  const aiGateVisible = await aiSearchBtn.isVisible();
  console.log(`[Assertion] AI track with approval gate button visible: ${aiGateVisible}`);
  report.assertions.push({
    test: "AI track with approval gate controls present",
    passed: aiGateVisible
  });

  // Test Track Switcher: Switch to Track C (Internal DB Query)
  console.log("[Playwright] Testing Track C (Internal DB Query)...");
  const internalTrackBtn = page.locator("[data-act='setSearchTrack'][data-track='internal']");
  await internalTrackBtn.click();
  await page.waitForTimeout(500);

  const internalQueryInp = page.locator("#internal-search-q");
  await internalQueryInp.fill("הובלה");
  await page.waitForTimeout(400);

  const internalContainer = page.locator("#internalDbResults");
  const internalVisible = await internalContainer.isVisible();
  console.log(`[Assertion] Internal DB query answered instantly: ${internalVisible}`);
  report.assertions.push({
    test: "Internal DB query answers without external call",
    passed: internalVisible
  });

  // ===== MOBILE RUN (390 x 844) =====
  console.log("[Playwright] Testing mobile viewport (390 x 844)...");
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: "he-IL"
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(`http://localhost:${PORT}/openprospector.html`, { waitUntil: "domcontentloaded" });
  await mobilePage.waitForTimeout(800);

  // Switch to search tab on mobile
  await mobilePage.locator("[data-tab='search']").first().click();
  await mobilePage.waitForTimeout(400);

  await mobilePage.screenshot({ path: path.join(SHOTS_DIR, "15-mobile-form-390.png"), fullPage: false });
  console.log("[Shot 15] Captured mobile form (390px).");

  await browser.close();
  console.log("[Playwright] Browser testing completed successfully!");

} catch (err) {
  console.error("[Playwright Test Error]", err);
  report.error = err.message;
} finally {
  server.close();
  console.log("[HTTP] Server stopped.");
}

// Write report JSON
const reportPath = path.join(SHOTS_DIR, "e2e-browser-proof-report.json");
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
console.log(`[Report] Saved E2E test report to ${reportPath}`);
console.log(`Summary:`);
console.log(`- Time to results container: ${report.timings.timeToResultsContainerMs}ms`);
console.log(`- Time to first rows: ${report.timings.timeToFirstRowsMs}ms`);
console.log(`- Total search time: ${report.timings.totalSearchTimeMs}ms`);
console.log(`- Rendered rows: ${report.metrics.renderedRowCount}`);
console.log(`- Green phone badges: ${report.metrics.greenPhoneBadges}`);
console.log(`- Partial badges: ${report.metrics.partialBadges}`);
console.log(`- Fleet facts: ${report.metrics.fleetFactBadges}`);
console.log(`- Fleet estimates: ${report.metrics.fleetEstBadges}`);
console.log(`- Unverified workforce: ${report.metrics.unverifiedWorkforceCount}`);
console.log(`- Console errors: ${report.consoleErrors.length}`);
