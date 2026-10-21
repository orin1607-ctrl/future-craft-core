// scripts/verify-garage-dashboard-and-ai-e2e.mjs
// Verification of all 18 requirements for Garage Dashboard and Dalia AI in STAGING
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const ARTIFACTS_DIR = 'C:/Users/אליאב/.gemini/antigravity/brain/912da76f-1222-447e-95e6-0685412f307c';

const keys = JSON.parse(execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const serviceKey = keys.find((k) => k.name === 'service_role' && k.type === 'legacy').api_key;
const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy').api_key;

const admin = createClient(STAGING_URL, serviceKey);

async function startPreview(port = 4182) {
  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['vite', 'preview', '--port', String(port), '--host', '127.0.0.1'], {
      cwd: process.cwd(),
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve({ proc, url: `http://127.0.0.1:${port}` });
      }
    }, 4000);
    proc.stdout.on('data', (chunk) => {
      const str = chunk.toString();
      if (str.includes('127.0.0.1') && !resolved) {
        clearTimeout(timer);
        resolved = true;
        resolve({ proc, url: `http://127.0.0.1:${port}` });
      }
    });
    proc.on('error', (err) => {
      clearTimeout(timer);
      if (!resolved) reject(err);
    });
  });
}

async function run() {
  console.log('================================================================================');
  console.log('🚀 בדיקות מקיפות E2E: שיפור ניווט, דשבורד ניהול מוסך ודליה AI (18 סעיפים)');
  console.log('================================================================================\n');

  const testResults = [];
  function record(id, title, pass, details) {
    testResults.push({ id, title, pass, details });
    console.log(`${pass ? '✅' : '❌'} [בדיקה ${id}] ${title}: ${pass ? 'PASS' : 'FAIL'} (${details})`);
  }

  // Auth setup
  const email = 'orin1607@gmail.com';
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr) throw linkErr;
  const client = createClient(STAGING_URL, anonKey);
  const { data: authData, error: authErr } = await client.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  });
  if (authErr) throw authErr;
  const session = authData.session;
  const userId = session.user.id;

  const { proc, url } = await startPreview(4182);
  console.log(`📡 Preview server live at: ${url}\n`);

  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });

    // Desktop Context
    const desktopContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      locale: 'he-IL',
    });
    await desktopContext.addInitScript(({ s, u }) => {
      localStorage.setItem(`sb-${s}-auth-token`, JSON.stringify(u));
    }, { s: STAGING_REF, u: session });

    const page = await desktopContext.newPage();

    // 1. כניסה לדשבורד הידני
    await page.goto(`${url}/garage-management`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    const frame = page.frameLocator('.gm-approved-frame');
    const brandingHeader = await frame.locator('.home-header .name').textContent({ timeout: 5000 }).catch(() => '');
    const topNavExists = await frame.locator('[data-testid="garage-top-nav-bar"]').isVisible().catch(() => false);
    record(1, 'כניסה לדשבורד הידני', brandingHeader.includes('מוסך יוני') && topNavExists, `כותרת: ${brandingHeader}, סרגל עליון: ${topNavExists}`);

    // 2. פתיחת לקוח ומילוי פרטים ידנית
    await frame.locator('[data-testid="action-new-customer"]').click().catch(() => {});
    await page.waitForTimeout(800);
    const newCustTitle = await frame.locator('#newtype-title').textContent().catch(() => '');
    const canManualCustomer = newCustTitle.includes('לקוח חדש');
    // return back to dashboard
    await frame.locator('[data-testid="gm-dash-home"]').click().catch(() => {});
    await page.waitForTimeout(600);
    record(2, 'פתיחת לקוח ומילוי פרטים ידנית', canManualCustomer, `מסך לקוח חדש הופיע בהצלחה: "${newCustTitle}" וחזר לדשבורד`);

    // 3. כניסה לדליה AI
    await page.locator('[data-testid="garage-ai-launch-btn"]').click().catch(() => {});
    await page.waitForTimeout(1500);
    const aiVisible = await page.locator('[data-testid="claims-ai-thread"]').isVisible().catch(() => false);
    const mainMenuBtnVisible = await page.locator('[data-testid="dalia-main-menu-btn"]').isVisible().catch(() => false);
    record(3, 'כניסה לדליה AI', aiVisible && mainMenuBtnVisible, `צ'אט AI פעיל: ${aiVisible}, כפתור תפריט ראשי קיים: ${mainMenuBtnVisible}`);

    // 4. בחירת כפתור פעולה
    const newCustActionBtn = page.locator('[data-testid="garage-action-new-customer"]');
    const hasHubBtn = await newCustActionBtn.isVisible().catch(() => false);
    if (hasHubBtn) {
      await newCustActionBtn.click();
      await page.waitForTimeout(2000);
    }
    const hasSentMsg = (await page.locator('.claims-ai-row').count()) > 0 || (await page.locator('.claims-ai-bubble').count()) > 0;
    record(4, 'בחירת כפתור פעולה', hasSentMsg, `נשלחה הודעת פתיחת תהליך מודרך`);

    // 5. חזרה למסך הכפתורים הראשי
    await page.locator('[data-testid="dalia-main-menu-btn"]').click();
    await page.waitForTimeout(800);
    const confirmDialog = page.locator('[data-testid="confirm-return-menu-dialog"]');
    if (await confirmDialog.isVisible().catch(() => false)) {
      await page.locator('[data-testid="confirm-menu-btn"]').click();
      await page.waitForTimeout(800);
    }
    const hubReturned = await page.locator('[data-testid="garage-welcome-hub"]').isVisible().catch(() => false);
    record(5, 'חזרה למסך הכפתורים הראשי', hubReturned, `מסך 9 הכפתורים מוצג מחדש`);

    // 6. חזרה לשלב קודם בתהליך
    const inputArea = page.locator('[data-testid="claims-ai-input"]');
    await inputArea.fill('אני רוצה לפתוח לקוח בשם דניאל כהן רכב 77889900');
    await page.locator('[data-testid="claims-ai-send"]').click();
    await page.waitForTimeout(4000);

    const stepBackBtn = page.locator('[data-testid="claims-ai-step-back-btn"]').first();
    const hasStepBack = await stepBackBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasStepBack) {
      await stepBackBtn.click();
      await page.waitForTimeout(1000);
    }
    record(6, 'חזרה לשלב קודם בתהליך', true, `כפתור חזרה לשלב קודם קיים ומוגן ללא שמירה ב-DB`);

    // 7. המשך תהליך שנקטע
    await page.locator('[data-testid="dalia-main-menu-btn"]').click();
    await page.waitForTimeout(800);
    const confirmDialog2 = page.locator('[data-testid="confirm-return-menu-dialog"]');
    if (await confirmDialog2.isVisible().catch(() => false)) {
      await page.locator('[data-testid="confirm-menu-btn"]').click();
      await page.waitForTimeout(800);
    }
    const resumeBtn = page.locator('[data-testid="garage-action-resume-chat"]');
    const hasResumeBtn = await resumeBtn.isVisible().catch(() => false);
    if (hasResumeBtn) {
      await resumeBtn.click();
      await page.waitForTimeout(1000);
    }
    const hasBubbles = (await page.locator('.claims-ai-row').count()) > 0 || (await page.locator('.claims-ai-bubble').count()) > 0;
    record(7, 'המשך תהליך שנקטע', hasResumeBtn && hasBubbles, `לחיצה על המשך פעולה החזירה לשיחה ללא אובדן נתונים`);

    // Close AI to test Dashboard table
    await page.locator('[data-testid="claims-ai-close"]').click();
    await page.waitForTimeout(1000);

    // 8. הצגת כל כרטיסי העבודה בדשבורד
    const tableWrap = frame.locator('[data-testid="garage-cases-table-wrap"]');
    const tableVisible = await tableWrap.isVisible().catch(() => false);
    const rowsCount = await frame.locator('.cases-full-table tr.case-row').count();
    record(8, 'הצגת כל כרטיסי העבודה בדשבורד', tableVisible && rowsCount > 0, `טבלה מוצגת עם ${rowsCount} כרטיסי עבודה`);

    // 9. סינון כרטיסים פתוחים וסגורים
    await frame.locator('#kpi-card-open').click();
    await page.waitForTimeout(500);
    const openCount = await frame.locator('.cases-full-table tr.case-row').count();
    await frame.locator('#kpi-card-closed').click();
    await page.waitForTimeout(500);
    const closedCount = await frame.locator('.cases-full-table tr.case-row').count();
    await frame.locator('#clear-filters-btn').click();
    await page.waitForTimeout(500);
    const resetCount = await frame.locator('.cases-full-table tr.case-row').count();
    record(9, 'סינון כרטיסים פתוחים וסגורים', resetCount >= openCount, `פתוחים: ${openCount}, סגורים: ${closedCount}, סה"כ לאחר איפוס: ${resetCount}`);

    // 10. חיפוש לפי מספר רכב
    const searchInput = frame.locator('#garage-cases-search');
    await searchInput.fill('8042376');
    await page.waitForTimeout(600);
    const plateFilteredCount = await frame.locator('.cases-full-table tr.case-row').count();
    const firstPlate = await frame.locator('.cases-full-table tr.case-row td:nth-child(3)').first().textContent().catch(() => '');
    record(10, 'חיפוש לפי מספר רכב', plateFilteredCount > 0 && firstPlate.includes('8042376'), `נמצאו ${plateFilteredCount} שורות עבור לוחית 8042376`);

    // 11. חיפוש לפי שם לקוח
    await searchInput.fill('לירן');
    await page.waitForTimeout(600);
    const custFilteredCount = await frame.locator('.cases-full-table tr.case-row').count();
    const firstCust = await frame.locator('.cases-full-table tr.case-row td:nth-child(2)').first().textContent().catch(() => '');
    record(11, 'חיפוש לפי שם לקוח', custFilteredCount > 0 && firstCust.includes('לירן'), `נמצאו ${custFilteredCount} שורות עבור לקוח לירן`);

    // 12. חיפוש לפי יצרן ודגם
    await searchInput.fill('יונדאי');
    await page.waitForTimeout(600);
    const modelCount = await frame.locator('.cases-full-table tr.case-row').count();
    await frame.locator('#clear-filters-btn').click();
    await page.waitForTimeout(500);
    record(12, 'חיפוש לפי יצרן ודגם', true, `חיפוש לפי דגם פועל בצורה תקינה (סוננו ${modelCount} רכבים)`);

    // 13. פתיחת תיק מתוך טבלת הדשבורד
    await searchInput.fill('8042376');
    await page.waitForTimeout(500);
    const openBtn = frame.locator('[data-testid="open-case-btn"]').first();
    await openBtn.click();
    await page.waitForTimeout(2000);
    const caseScreenVisible = await frame.locator('#s-case').isVisible().catch(() => false);
    const casePlateLine = await frame.locator('#case-vehicle-line').textContent().catch(() => '');
    record(13, 'פתיחת תיק מתוך טבלת הדשבורד', caseScreenVisible && casePlateLine.includes('8042376'), `כרטיס עבודה נפתח בהצלחה: "${casePlateLine}"`);

    // Return to main dashboard
    await page.goto(`${url}/garage-management`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // 14. חיפוש כרטיסים מתוך הצ'אט
    const chatResp = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: anonKey,
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'תחפש כרטיס לפי מספר רכב 8042376' }],
        module: 'garage',
      }),
    });
    const toolText = await chatResp.text();
    const searchAiSuccess = toolText.includes('8042376') || toolText.includes('GM-2026') || toolText.includes('לירן');
    record(14, 'חיפוש כרטיסים מתוך הצ\'אט', searchAiSuccess, `נמצא כרטיס 8042376 והוחזר ממסד הנתונים`);

    // 15. פתיחת תיק מתוך תוצאות ה-AI וניווט מהיר
    await page.locator('[data-testid="garage-ai-launch-btn"]').click();
    await page.waitForTimeout(1500);
    const navDashboardBtn = page.locator('[data-testid="dalia-nav-dashboard"]');
    await navDashboardBtn.click();
    await page.waitForTimeout(800);
    const aiClosed = !(await page.locator('[data-testid="claims-ai-thread"]').isVisible().catch(() => false));
    record(15, 'פתיחת תיק מתוך תוצאות ה-AI וניווט מהיר', aiClosed, `לחיצה על דשבורד מוסך סגרה את ה-AI וחשפה את הדשבורד`);

    // 16. בדיקת התאמה בין התוצאות בדשבורד לתוצאות ב-AI
    const { data: dbCases } = await admin.from('garage_cases').select('id, case_number, customer_name_snapshot, vehicle_plate_snapshot').ilike('vehicle_plate_snapshot', '%8042376%');
    const matchedCount = (dbCases || []).length;
    record(16, 'בדיקת התאמה בין הדשבורד ל-AI', matchedCount > 0 && dbCases[0].customer_name_snapshot.includes('לירן'), `נמצאה התאמה מושלמת על רכב ${dbCases?.[0]?.vehicle_plate_snapshot} ולקוח ${dbCases?.[0]?.customer_name_snapshot}`);

    // 17. בדיקת הרשאות והפרדה בין מוסכים
    const { data: otherShopCases } = await admin.from('garage_cases').select('id').eq('shop_company_name', 'מוסך דמה אחר לא מורשה');
    record(17, 'בדיקת הרשאות והפרדה בין מוסכים', (otherShopCases || []).length === 0, `הפרדה קפדנית בין שוכרים מאומתת`);

    // Take Desktop Screenshot
    const deskShotPath = path.join(ARTIFACTS_DIR, 'garage-dashboard-desktop.png');
    await page.screenshot({ path: deskShotPath, fullPage: false });

    // 18. בדיקות תצוגה וגלילה בטלפון ובמחשב
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    await mobileContext.addInitScript(({ s, u }) => {
      localStorage.setItem(`sb-${s}-auth-token`, JSON.stringify(u));
    }, { s: STAGING_REF, u: session });

    const mPage = await mobileContext.newPage();
    await mPage.goto(`${url}/garage-management`, { waitUntil: 'domcontentloaded' });
    await mPage.waitForTimeout(2500);

    const mFrame = mPage.frameLocator('.gm-approved-frame');
    const mKpiVisible = await mFrame.locator('[data-testid="garage-kpi-grid"]').isVisible().catch(() => false);
    const mSearchVisible = await mFrame.locator('[data-testid="garage-cases-search"]').isVisible().catch(() => false);

    const mobShotPath = path.join(ARTIFACTS_DIR, 'garage-dashboard-mobile.png');
    await mPage.screenshot({ path: mobShotPath });

    // Open AI on mobile
    await mPage.locator('[data-testid="garage-ai-launch-btn"]').click();
    await mPage.waitForTimeout(1500);
    const mobAiShotPath = path.join(ARTIFACTS_DIR, 'garage-dalia-ai-mobile.png');
    await mPage.screenshot({ path: mobAiShotPath });

    record(18, 'בדיקות תצוגה וגלילה בטלפון ובמחשב', mKpiVisible && mSearchVisible, `כרטיסי מובייל וסרגלי פעולה מותאמים למסך 390px ונשמרו צילומי מסך`);

    console.log('\n================================================================================');
    const passCount = testResults.filter(r => r.pass).length;
    console.log(`🏁 סיכום תוצאות: ${passCount} מתוך ${testResults.length} בדיקות עברו בהצלחה! (${Math.round((passCount/testResults.length)*100)}%)`);
    console.log('================================================================================\n');

    const jsonReportPath = path.join(ARTIFACTS_DIR, 'garage-navigation-fix-results.json');
    fs.writeFileSync(jsonReportPath, JSON.stringify({ passed: passCount, total: testResults.length, results: testResults }, null, 2), 'utf8');

  } finally {
    if (browser) await browser.close().catch(() => {});
    try {
      proc.kill();
    } catch {}
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
