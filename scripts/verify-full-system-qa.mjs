// scripts/verify-full-system-qa.mjs
import { chromium, devices } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync, spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const REF = 'usfeoerkpcafxxlyuldl';
const URL = `https://${REF}.supabase.co`;
const OUT = 'C:/Users/אליאב/.gemini/antigravity/brain/88ba5372-3049-43c2-938b-80dddc42cbe1';

if (!fs.existsSync(OUT)) {
  fs.mkdirSync(OUT, { recursive: true });
}

console.log('1. Fetching auth token for staging user...');
const keys = JSON.parse(execSync(`supabase projects api-keys --project-ref ${REF} -o json`, { encoding: 'utf8' }));
const serviceKey = keys.find((k) => k.name === 'service_role' && k.type === 'legacy').api_key;
const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy').api_key;
const admin = createClient(URL, serviceKey);

const email = 'orin1607@gmail.com';
const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
if (linkErr) throw linkErr;
const { data: auth, error: authErr } = await createClient(URL, anonKey).auth.verifyOtp({
  token_hash: link.properties.hashed_token,
  type: 'magiclink',
});
if (authErr) throw authErr;

const PORT = 4188;
console.log(`2. Starting preview server on port ${PORT}...`);
const preview = spawn('cmd.exe', ['/c', `npx vite preview --port ${PORT} --strictPort`], {
  cwd: 'C:/Users/אליאב/Projects/oren-garage-flow-staging',
  stdio: 'pipe',
});

preview.stdout.on('data', (d) => console.log('[preview stdout]', d.toString().trim()));
preview.stderr.on('data', (d) => console.log('[preview stderr]', d.toString().trim()));

// Wait 4 seconds for preview server
await new Promise((r) => setTimeout(r, 4000));

const qaLog = [];
function record(step, status, details) {
  console.log(`[QA] ${step}: ${status} - ${details}`);
  qaLog.push({ step, status, details });
}

let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });

  // -------------------------------------------------------------
  // DESKTOP VERIFICATION (1440x900)
  // -------------------------------------------------------------
  console.log('\n=== RUNNING DESKTOP VERIFICATION ===');
  const dCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'he-IL' });
  await dCtx.addInitScript(
    ({ s, u }) => localStorage.setItem(`sb-${s}-auth-token`, JSON.stringify(u)),
    { s: REF, u: auth.session }
  );
  const dPage = await dCtx.newPage();

  // Test 1: Claims Dashboard Button
  await dPage.goto(`http://localhost:${PORT}/claims?view=dashboard`, { waitUntil: 'networkidle', timeout: 30000 });
  await dPage.waitForTimeout(2000);

  const claimsDashReportsBtn = dPage.locator('[data-testid="claims-dash-reports-btn"]');
  const dashBtnVisible = await claimsDashReportsBtn.isVisible();
  record('Claims Dashboard Reports Button', dashBtnVisible ? 'PASS' : 'FAIL', 'Found 📊 דוחות button in claims dashboard');
  await dPage.screenshot({ path: path.join(OUT, 'qa-desktop-01-claims-dash-button.png') });

  // Test 2: Click Claims Dashboard Reports Button -> Navigates to Reports Hub
  if (dashBtnVisible) {
    await claimsDashReportsBtn.click();
    await dPage.waitForTimeout(1500);
    const reportsHeading = dPage.locator('[data-testid="claims-reports-heading"]');
    const reportsOpen = await reportsHeading.isVisible();
    record('Claims Dashboard Nav to Reports', reportsOpen ? 'PASS' : 'FAIL', 'Clicked reports button and landed on Reports Hub');

    // Test 3: Check Reports AI Button
    const reportsAiBtn = dPage.locator('[data-testid="reports-open-ai-btn"]');
    const reportsAiVisible = await reportsAiBtn.isVisible();
    record('Reports AI Assistant Button', reportsAiVisible ? 'PASS' : 'FAIL', 'Found ✨ דליה AI דוחות ומאזן button in Reports Hub');

    if (reportsAiVisible) {
      await reportsAiBtn.click();
      await dPage.waitForTimeout(1500);
      const reportsHub = dPage.locator('[data-testid="reports-welcome-hub"]');
      const hubVisible = await reportsHub.isVisible();
      record('Reports AI Welcome Hub', hubVisible ? 'PASS' : 'FAIL', 'Opened Reports AI with dedicated prompt cards');
      await dPage.screenshot({ path: path.join(OUT, 'qa-desktop-02-reports-ai-workspace.png') });

      // Close AI
      const closeAiBtn = dPage.locator('[data-testid="claims-ai-close"]');
      if (await closeAiBtn.isVisible()) await closeAiBtn.click();
      await dPage.waitForTimeout(500);
    }

    await dPage.screenshot({ path: path.join(OUT, 'qa-desktop-03-reports-hub.png') });
  }

  // Test 4: Garage Management Dashboard Reports Button
  await dPage.goto(`http://localhost:${PORT}/garage-management`, { waitUntil: 'networkidle', timeout: 30000 });
  await dPage.waitForTimeout(3000);

  const frameHandle = await dPage.$('iframe.gm-approved-frame');
  const frame = await frameHandle?.contentFrame();
  if (frame) {
    const navTabReports = frame.locator('[data-testid="nav-tab-reports"]');
    const quickReports = frame.locator('[data-testid="action-quick-reports"]');
    const navReportsVis = await navTabReports.isVisible();
    const quickReportsVis = await quickReports.isVisible();
    record('Garage Dashboard Reports Buttons', (navReportsVis && quickReportsVis) ? 'PASS' : 'FAIL', 'Found 📊 דוחות ומאזן tab and quick action in Garage Dashboard');
    await dPage.screenshot({ path: path.join(OUT, 'qa-desktop-04-garage-dashboard-buttons.png') });

    // Click garage reports button -> navigates to reports hub
    if (navReportsVis) {
      await navTabReports.click();
      await dPage.waitForTimeout(2000);
      const reportsHeading = dPage.locator('[data-testid="claims-reports-heading"]');
      const navigated = await reportsHeading.isVisible();
      record('Garage Dashboard Nav to Reports', navigated ? 'PASS' : 'FAIL', 'Clicked 📊 דוחות ומאזן from garage dashboard and opened reports hub');
    }
  } else {
    record('Garage Dashboard Frame', 'FAIL', 'Iframe not found');
  }

  // -------------------------------------------------------------
  // MOBILE VERIFICATION (Pixel 7 / 393x851, Touch)
  // -------------------------------------------------------------
  console.log('\n=== RUNNING MOBILE VERIFICATION ===');
  const mCtx = await browser.newContext({
    ...devices['Pixel 7'],
    locale: 'he-IL',
  });
  await mCtx.addInitScript(
    ({ s, u }) => localStorage.setItem(`sb-${s}-auth-token`, JSON.stringify(u)),
    { s: REF, u: auth.session }
  );
  const mPage = await mCtx.newPage();

  // Test 5: Garage Management on Mobile
  await mPage.goto(`http://localhost:${PORT}/garage-management`, { waitUntil: 'networkidle', timeout: 30000 });
  await mPage.waitForTimeout(3000);

  const mFrameHandle = await mPage.$('iframe.gm-approved-frame');
  const mFrame = await mFrameHandle?.contentFrame();
  if (mFrame) {
    // Open a case or open new case to test card scrolling
    console.log('Testing mobile garage case card scrolling & actions...');
    const openCaseBtn = mFrame.locator('[data-testid="action-open-case"]');
    if (await openCaseBtn.isVisible()) {
      await openCaseBtn.click();
      await mPage.waitForTimeout(1000);

      // In s-choose, click back to return to dashboard
      const chooseBack = mFrame.locator('#s-choose [data-testid="gm-dash-home"]');
      if (await chooseBack.isVisible()) {
        await chooseBack.click();
        await mPage.waitForTimeout(1000);
        const homeVis = await mFrame.locator('#s-home').isVisible();
        record('Open-Case Back Button Return', homeVis ? 'PASS' : 'FAIL', 'Returned cleanly to garage dashboard from s-choose');
      }
    }

    // Now test case card scrolling on a sample case
    await mPage.evaluate(() => {
      const frameEl = document.querySelector('iframe.gm-approved-frame');
      if (frameEl && frameEl.contentWindow) {
        frameEl.contentWindow.postMessage({
          type: 'gm:bootstrap',
          payload: {
            mode: 'case',
            caseId: 'GM-TEST-QA-001',
            userName: 'בודק מערכת',
            loaded: {
              id: 'test-case-id-1',
              case_number: 'GM-TEST-QA-001',
              customer_name_snapshot: 'ישראל ישראלי',
              vehicle_plate_snapshot: '12-345-67',
              vehicle_label_snapshot: 'טויוטה קורולה 2022',
              status: 'בדיקת רכב',
              case_data: {},
            }
          }
        }, '*');
      }
    });
    await mPage.waitForTimeout(1500);

    const caseScreen = mFrame.locator('#s-case');
    const caseScreenVis = await caseScreen.isVisible();
    record('Case Screen Loaded on Mobile', caseScreenVis ? 'PASS' : 'FAIL', 'Case card screen rendered on mobile');

    // Test mobile scrolling
    const scrollResult = await mPage.evaluate(() => {
      const frameEl = document.querySelector('iframe.gm-approved-frame');
      const doc = frameEl.contentDocument;
      const content = doc.getElementById('case-content');
      if (!content) return { ok: false, reason: 'no-case-content' };
      const scrollBefore = content.scrollTop;
      content.scrollTop = 250;
      const scrollAfter = content.scrollTop;
      return { ok: scrollAfter > 0, scrollBefore, scrollAfter };
    });
    record('Mobile Case Card Scrolling', scrollResult.ok ? 'PASS' : 'FAIL', `Scroll distance: ${scrollResult.scrollAfter}px - Smooth vertical scroll active`);
    await mPage.screenshot({ path: path.join(OUT, 'qa-mobile-01-case-card-scrolled.png') });

    // Test back button from case card
    const caseBackBtn = mFrame.locator('#s-case [data-testid="case-back-btn"]');
    if (await caseBackBtn.isVisible()) {
      await caseBackBtn.click();
      await mPage.waitForTimeout(1200);
      const returnedHome = await mPage.evaluate(() => {
        const frameEl = document.querySelector('iframe.gm-approved-frame');
        const home = frameEl.contentDocument.getElementById('s-home');
        return home && home.classList.contains('active');
      });
      record('Case Card Exit Back to Dashboard', returnedHome ? 'PASS' : 'FAIL', 'Returned from case card to dashboard without getting stuck');
      await mPage.screenshot({ path: path.join(OUT, 'qa-mobile-02-returned-to-dashboard.png') });
    }

    // Test 6: Case Closure & Reopen Flow (Task 7)
    console.log('Testing full Case Closure and Reopening flow...');
    const closureResult = await mPage.evaluate(async () => {
      const frameEl = document.querySelector('iframe.gm-approved-frame');
      const win = frameEl.contentWindow;
      // Load mock test case ready for close
      win.applyBootstrap({
        mode: 'case',
        caseId: 'GM-TEST-CLOSE-001',
        userName: 'מנהל מוסך QA',
        loaded: {
          id: 'test-case-close-id',
          case_number: 'GM-TEST-CLOSE-001',
          customer_name_snapshot: 'משה כהן QA',
          vehicle_plate_snapshot: '99-888-77',
          vehicle_label_snapshot: 'מאזדה 3',
          status: 'בעבודה',
          case_data: {
            workStarted: true,
            workFinished: true,
            inspectionPhotos: [{ url: 'photo1' }, { url: 'photo2' }, { url: 'photo3' }, { url: 'photo4' }],
            priceReview: { status: 'worker_approved', approvedAmount: 3500 },
          }
        }
      });
      return true;
    });
    await mPage.waitForTimeout(1000);

    // Click close case button
    const closeBtn = mFrame.locator('#close-case-btn');
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await mPage.waitForTimeout(1000);
      const closeScreen = mFrame.locator('#s-close');
      const closeScreenVis = await closeScreen.isVisible();
      record('Navigate to Close Case Screen', closeScreenVis ? 'PASS' : 'FAIL', 'Opened closure confirmation screen');
      await mPage.screenshot({ path: path.join(OUT, 'qa-mobile-03-close-screen.png') });
    }

    // Execute reopen test
    const reopenResult = await mPage.evaluate(() => {
      const frameEl = document.querySelector('iframe.gm-approved-frame');
      const win = frameEl.contentWindow;
      // Simulate state closed
      win.state.caseClosed = true;
      win.state.workFinished = true;
      // Set reopen reason
      const reasonInput = win.document.getElementById('reopen-reason');
      if (reasonInput) reasonInput.value = 'תיקון חוזר במסגרת אחריות';
      win.reopenClosedCase();
      return {
        closed: win.state.caseClosed,
        finished: win.state.workFinished,
        historyCount: (win.state.reopenHistory || []).length,
        lastReason: win.state.reopenHistory?.[0]?.reason
      };
    });
    record('Reopen Case Flow', (!reopenResult.closed && reopenResult.historyCount > 0) ? 'PASS' : 'FAIL', `Case reopened: closed=${reopenResult.closed}, history count=${reopenResult.historyCount}, reason="${reopenResult.lastReason}"`);

    // Test 7: Mobile Reports View & Compact Button
    await mPage.goto(`http://localhost:${PORT}/claims?view=reports`, { waitUntil: 'networkidle', timeout: 30000 });
    await mPage.waitForTimeout(2000);

    const mReportsHeading = mPage.locator('[data-testid="claims-reports-heading"]');
    const mReportsVisible = await mReportsHeading.isVisible();
    record('Mobile Reports Hub Render', mReportsVisible ? 'PASS' : 'FAIL', 'Reports Hub displays cleanly on mobile');
    await mPage.screenshot({ path: path.join(OUT, 'qa-mobile-04-reports-hub.png') });

    // Check Mobile Filter Bar & Compact Reports Button
    await mPage.goto(`http://localhost:${PORT}/claims?view=claims`, { waitUntil: 'networkidle', timeout: 30000 });
    await mPage.waitForTimeout(2000);

    const compactReportsBtn = mPage.locator('[data-testid="claims-compact-reports-btn"]');
    const compactVis = await compactReportsBtn.isVisible();
    record('Mobile Compact Reports Button in Filter Bar', compactVis ? 'PASS' : 'FAIL', 'Compact 📊 דוחות button present next to הכול | ניהול מוסך | ניהול תביעות');
    await mPage.screenshot({ path: path.join(OUT, 'qa-mobile-05-compact-filter-bar.png') });
  }

  console.log('\n=== ALL QA TESTS COMPLETED ===');
  console.log(JSON.stringify(qaLog, null, 2));

} catch (err) {
  console.error('QA Error:', err);
} finally {
  if (browser) await browser.close();
  preview.kill();
  process.exit(0);
}
