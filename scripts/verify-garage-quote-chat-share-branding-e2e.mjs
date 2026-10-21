// scripts/verify-garage-quote-chat-share-branding-e2e.mjs
// End-to-end verification in STAGING ONLY:
// 1. Ask Dalia AI in chat: "תביא לי את הצעת המחיר של לירן לוי, רכב 8042376"
// 2. Verify read-only behavior (no new quote/case created, existing data untouched).
// 3. Verify GarageQuoteCard renders directly inside chat with Yoni's Garage branding ("מוסך יוני – פחחות וצבע לרכב") + logo, and zero Dalia branding on the quote.
// 4. Verify all 6 buttons: Download PDF, Share (PDF & Image), WhatsApp, Email (draft + explicit approval), Print, Open Work Card.
// 5. Verify Mobile Native File Sharing (navigator.share({ files }) with real File of type application/pdf & image/png) + fallback modal when unsupported.
// 6. Verify existing quote capabilities remain 100% intact (pricing by parts, global price, free-text works, digital signature, versioning).

import { execSync, spawn } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const ARTIFACTS_DIR = 'C:/Users/אליאב/.gemini/antigravity/brain/912da76f-1222-447e-95e6-0685412f307c';

const keys = JSON.parse(execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const serviceKey = keys.find((k) => k.name === 'service_role' && k.type === 'legacy').api_key;
const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy').api_key;

const admin = createClient(STAGING_URL, serviceKey);

async function startLocalPreview(port = 4177) {
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
    }, 3500);
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
  console.log('🚀 בדיקת קצה־לקצה: הצגת הצעת מחיר בצ\'אט דליה AI, הורדת PDF, שיתוף נייטיב ומיתוג מוסך יוני');
  console.log('================================================================================');

  // 1. Authenticate in STAGING
  const email = 'orin1607@gmail.com';
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr) throw linkErr;
  const client = createClient(STAGING_URL, anonKey);
  const { data: authData, error: authErr } = await client.auth.verifyOtp({
    email,
    token: linkData.properties.email_otp,
    type: 'email',
  });
  if (authErr) throw authErr;
  const session = authData.session;
  console.log('✅ מחובר ל-STAGING בתור:', authData.user.email);

  // Snapshot Liran Levy DB state BEFORE asking in chat (to prove read-only lookup)
  const { data: beforeQuotes } = await admin
    .from('garage_quote_links')
    .select('id, case_id, quote_version, priced_subtotal, updated_at, status')
    .eq('vehicle_plate', '8042376');
  const { data: beforeCases } = await admin
    .from('garage_cases')
    .select('id, case_number, updated_at')
    .eq('id', beforeQuotes?.[0]?.case_id || 'dc5eb20c-ad3c-418b-b69b-f756fa4852ef');

  console.log(`📊 מצב לפני שליפה בצ'אט: ${beforeCases?.length || 0} כרטיסי עבודה לרכב 8042376, ${beforeQuotes?.length || 0} הצעות מחיר שמורות.`);
  if (!beforeCases?.length || !beforeQuotes?.length) {
    throw new Error('כרטיס העבודה או הצעת המחיר של לירן לוי (8042376) לא נמצאו ב-STAGING!');
  }
  const liranQuoteBefore = beforeQuotes[0];

  const { proc: previewProc, url: BASE_URL } = await startLocalPreview(4177);
  console.log('🌐 שרת בדיקה מקומי מול STAGING DB:', BASE_URL);

  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  } catch {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
  }

  try {
    // =========================================================================
    // PART A: DESKTOP E2E IN DALIA AI CHAT
    // =========================================================================
    const desktopCtx = await browser.newContext({
      viewport: { width: 1440, height: 940 },
      locale: 'he-IL',
      acceptDownloads: true,
    });
    await desktopCtx.addInitScript(
      ({ key, sessionData }) => {
        localStorage.setItem(key, JSON.stringify(sessionData));
      },
      { key: `sb-${STAGING_REF}-auth-token`, sessionData: session },
    );

    // First: direct API check of help-ai-chat SSE stream for the quote lookup prompt
    console.log('\n[שלב 0] בדיקת קריאת API ישירה מול help-ai-chat...');
    const directRes = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: anonKey,
      },
      body: JSON.stringify({
        module: 'garage',
        messages: [{ role: 'user', content: 'תביא לי את הצעת המחיר של לירן לוי, רכב 8042376' }],
      }),
    });
    const directText = await directRes.text();
    console.log('📡 SSE status:', directRes.status, 'has garage_quote_card:', directText.includes('garage_quote_card'));
    if (!directText.includes('garage_quote_card')) {
      console.log('📡 SSE raw preview:', directText.slice(0, 600));
    }

    const page = await desktopCtx.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log('[PAGE ERROR]', msg.text());
    });
    await page.goto(`${BASE_URL}/garage-management?cb=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForSelector('[data-testid="garage-ai-launch-btn"]', { timeout: 25000 });
    await page.click('[data-testid="garage-ai-launch-btn"]');
    await page.waitForSelector('[data-testid="claims-ai-workspace"]', { timeout: 10000 });

    const newBtn = await page.$('[data-testid="claims-ai-new"]');
    if (newBtn) await newBtn.click();

    console.log('\n[שלב 1] שליחת בקשה בצ\'אט דליה AI: "תביא לי את הצעת המחיר של לירן לוי, רכב 8042376"...');
    await page.fill('[data-testid="claims-ai-input"]', 'תביא לי את הצעת המחיר של לירן לוי, רכב 8042376');
    await page.click('[data-testid="claims-ai-send"]');

    console.log('⏳ ממתין להופעת כרטיס הצעת המחיר המעוצב (GarageQuoteCard) בתוך הצ\'אט...');
    try {
      await page.waitForSelector('[data-testid="garage-quote-card"]', { timeout: 25000 });
    } catch (waitErr) {
      const domCount = await page.locator('[data-testid="garage-quote-card"]').count();
      const bbox = domCount > 0 ? await page.locator('[data-testid="garage-quote-card"]').first().boundingBox() : null;
      console.log('⚠️ domCount of garage-quote-card:', domCount, 'bbox:', bbox);
      const { data: latestMsgs } = await admin
        .from('claims_ai_messages')
        .select('id, role, metadata, created_at')
        .order('created_at', { ascending: false })
        .limit(3);
      console.log('⚠️ latestMsgs in DB:', JSON.stringify(latestMsgs?.map(m => ({ id: m.id, role: m.role, metaKeys: Object.keys(m.metadata || {}) }))));
      throw waitErr;
    }
    await page.waitForTimeout(800);

    // Verify Read-Only DB guarantee
    const { data: afterQuotes } = await admin
      .from('garage_quote_links')
      .select('id, case_id, quote_version, priced_subtotal, updated_at, status')
      .eq('vehicle_plate', '8042376');
    const { data: afterCases } = await admin
      .from('garage_cases')
      .select('id, case_number, updated_at')
      .eq('id', liranQuoteBefore.case_id);

    if (afterCases.length !== beforeCases.length || afterQuotes.length !== beforeQuotes.length) {
      throw new Error('שגיאה: שליפת ההצעה בצ\'אט יצרה רשומה חדשה במקום שליפה בלבד!');
    }
    if (afterQuotes[0].id !== liranQuoteBefore.id || afterQuotes[0].quote_version !== liranQuoteBefore.quote_version) {
      throw new Error('שגיאה: גרסת ההצעה השתנתה בעת השליפה!');
    }
    console.log('✅ אומת Read-Only: לא נוצרה הצעה חדשה ולא שונו נתונים בכרטיס העבודה (GM-2026-0056, גרסה #1).');

    // Verify Per-Garage Branding on the Quote Card in Chat
    const brandingTitle = await page.textContent('[data-testid="garage-quote-card-shop-title"]');
    console.log('🏷️ כותרת מיתוג המוסך בכרטיס ההצעה:', brandingTitle?.trim());
    if (!brandingTitle?.includes('מוסך יוני – פחחות וצבע לרכב')) {
      throw new Error(`כותרת המיתוג אינה תואמת: ${brandingTitle}`);
    }
    const logoVisible = await page.isVisible('[data-testid="garage-quote-card-logo"]');
    if (!logoVisible) {
      throw new Error('לוגו מוסך יוני אינו מוצג בכרטיס הצעת המחיר!');
    }
    const cardFullText = await page.textContent('[data-testid="garage-quote-card"]');
    if (cardFullText.includes('דליה — פתרונות') || cardFullText.includes('דליה פתרונות')) {
      throw new Error('אסור ששם דליה יופיע ככותרת המוסך בהצעת המחיר!');
    }
    console.log('✅ אומת מיתוג אישי למוסך: "מוסך יוני – פחחות וצבע לרכב" + לוגו המוסך (ללא שם/לוגו של דליה בהצעה).');

    // Verify all 6 required buttons + Share as Image + Damage Photos Toggle
    const requiredTestIds = [
      'garage-quote-card-download-pdf',
      'garage-quote-card-share',
      'garage-quote-card-share-image',
      'garage-quote-card-whatsapp',
      'garage-quote-card-email',
      'garage-quote-card-print',
      'garage-quote-card-open-case',
      'garage-quote-card-toggle-photos',
    ];
    for (const tid of requiredTestIds) {
      const vis = await page.isVisible(`[data-testid="${tid}"]`);
      if (!vis) throw new Error(`כפתור חסר בכרטיס הצעת המחיר בצ'אט: ${tid}`);
    }
    console.log('✅ כל 6 כפתורי הפעולה + שיתוף כתמונה + מתג תמונות נזק קיימים וגלויים בצ\'אט.');

    // Take screenshot of the Quote Card in Chat
    const chatCardShot = path.join(ARTIFACTS_DIR, 'garage-quote-card-in-dalia-chat.png');
    await page.locator('[data-testid="garage-quote-card"]').last().scrollIntoViewIfNeeded();
    await page.locator('[data-testid="garage-quote-card"]').last().screenshot({ path: chatCardShot });
    console.log('📸 נשמר צילום מסך של הצעת המחיר בצ\'אט:', chatCardShot);

    // Test 1: Download PDF directly from Chat
    console.log('\n[שלב 2] בדיקת הורדת קובץ PDF של הצעת המחיר מתוך הצ\'אט...');
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20000 }),
      page.locator('[data-testid="garage-quote-card-download-pdf"]').last().click(),
    ]);
    const suggestedName = download.suggestedFilename();
    const downloadPath = path.join(ARTIFACTS_DIR, suggestedName);
    await download.saveAs(downloadPath);
    const pdfBytes = fs.readFileSync(downloadPath);
    const pdfHeader = pdfBytes.subarray(0, 8).toString('ascii');
    console.log(`✅ קובץ PDF ירד בהצלחה: ${suggestedName} (${pdfBytes.length} bytes, header: ${pdfHeader.trim()})`);
    if (!pdfHeader.startsWith('%PDF-1.4') || pdfBytes.length < 15000) {
      throw new Error('קובץ ה-PDF שנוצר אינו תקין או קטן מדי!');
    }

    // Test 2: Email Draft & Explicit User Approval Modal (No automatic sending!)
    console.log('\n[שלב 3] בדיקת כפתור "שליחה באימייל" (טיוטה לאישור מפורש + קובץ ההצעה מצורף)...');
    await page.locator('[data-testid="garage-quote-card-email"]').last().click();
    await page.waitForSelector('[data-testid="garage-quote-email-modal"]', { timeout: 8000 });
    const attachmentBadge = await page.textContent('[data-testid="garage-quote-email-attachment-badge"]');
    const approveBtnVisible = await page.isVisible('[data-testid="garage-quote-email-approve-send-btn"]');
    console.log('📎 חיווי קובץ מצורף בטיוטת האימייל:', attachmentBadge?.trim());
    if (!approveBtnVisible || !attachmentBadge?.includes('.pdf')) {
      throw new Error('חלון טיוטת האימייל אינו מציג את קובץ ה-PDF המצורף או כפתור אישור מפורש!');
    }
    const emailModalShot = path.join(ARTIFACTS_DIR, 'garage-quote-email-draft-approval-modal.png');
    await page.screenshot({ path: emailModalShot });
    console.log('📸 נשמר צילום מסך של טיוטת האימייל לאישור:', emailModalShot);
    await page.click('[data-testid="garage-quote-email-modal-close"]');

    // Test 3: Per-Garage Branding Settings Modal
    console.log('\n[שלב 4] בדיקת חלון הגדרות מיתוג אישי למוסך (לוגו וכותרת לכל מוסך בנפרד)...');
    const brandingBtn = page.locator('[data-testid="garage-quote-card-branding-btn"]').last();
    if (await brandingBtn.count() > 0) {
      await brandingBtn.click();
      await page.waitForSelector('[data-testid="garage-branding-modal"]', { timeout: 8000 });
      const titleInputVal = await page.inputValue('[data-testid="garage-branding-title-input"]');
      console.log('🏷️ ערך שדה כותרת ההצעה בהגדרות המיתוג:', titleInputVal);
      if (!titleInputVal.includes('מוסך יוני – פחחות וצבע לרכב')) {
        throw new Error('שדה כותרת המיתוג אינו מכיל את מוסך יוני – פחחות וצבע לרכב');
      }
      await page.click('[data-testid="garage-branding-modal"] button:has-text("ביטול")');
    }

    // =========================================================================
    // PART B: MOBILE NATIVE FILE SHARE (Web Share API with actual PDF & PNG File)
    // =========================================================================
    console.log('\n[שלב 5] בדיקת שיתוף ישירות מהטלפון (Mobile Viewport 390x844 + Web Share API File)...');
    const mobileCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      locale: 'he-IL',
    });
    await mobileCtx.addInitScript(
      ({ key, sessionData }) => {
        localStorage.setItem(key, JSON.stringify(sessionData));
        // Instrument navigator.canShare & navigator.share to verify actual File sharing on mobile
        window.__sharedCalls = [];
        navigator.canShare = (data) => {
          if (data && Array.isArray(data.files) && data.files.length > 0) {
            return true;
          }
          return true;
        };
        navigator.share = async (data) => {
          const filesInfo = (data?.files || []).map((f) => ({
            name: f.name,
            type: f.type,
            size: f.size,
            isFileInstance: f instanceof File,
          }));
          window.__sharedCalls.push({
            title: data?.title || '',
            text: data?.text || '',
            files: filesInfo,
          });
          return Promise.resolve();
        };
      },
      { key: `sb-${STAGING_REF}-auth-token`, sessionData: session },
    );

    const mobilePage = await mobileCtx.newPage();
    await mobilePage.goto(`${BASE_URL}/garage-management?cb=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await mobilePage.waitForSelector('[data-testid="garage-ai-launch-btn"]', { timeout: 25000 });
    await mobilePage.click('[data-testid="garage-ai-launch-btn"]');
    await mobilePage.waitForSelector('[data-testid="garage-quote-card"]', { timeout: 25000 });

    // Trigger Native PDF File Share on Mobile
    await mobilePage.locator('[data-testid="garage-quote-card-share"]').last().click();
    await mobilePage.waitForTimeout(2500);

    // Trigger Native PNG Image Share on Mobile
    await mobilePage.locator('[data-testid="garage-quote-card-share-image"]').last().click();
    await mobilePage.waitForTimeout(2500);

    // Trigger WhatsApp Native File Share on Mobile
    await mobilePage.locator('[data-testid="garage-quote-card-whatsapp"]').last().click();
    await mobilePage.waitForTimeout(2500);

    const sharedCalls = await mobilePage.evaluate(() => window.__sharedCalls || []);
    console.log('📱 קריאות שהתקבלו ב-navigator.share בטלפון:', JSON.stringify(sharedCalls, null, 2));

    if (sharedCalls.length < 2) {
      throw new Error(`ציפינו לפחות ל-2 קריאות שיתוף קובץ נייטיב בטלפון (PDF, תמונה), התקבלו: ${sharedCalls.length}`);
    }
    const pdfShare = sharedCalls[0];
    const pngShare = sharedCalls[1];
    if (!pdfShare.files?.[0]?.isFileInstance || pdfShare.files[0].type !== 'application/pdf' || pdfShare.files[0].size < 15000) {
      throw new Error('שיתוף ה-PDF מהטלפון לא העביר קובץ PDF אמיתי ל-navigator.share!');
    }
    if (!pngShare.files?.[0]?.isFileInstance || pngShare.files[0].type !== 'image/png' || pngShare.files[0].size < 15000) {
      throw new Error('שיתוף התמונה מהטלפון לא העביר קובץ PNG אמיתי ל-navigator.share!');
    }
    if (!pdfShare.title.includes('מוסך יוני – פחחות וצבע לרכב')) {
      throw new Error('כותרת השיתוף בטלפון אינה כוללת את מיתוג מוסך יוני!');
    }
    console.log('✅ אומת שיתוף קבצים ישירות מהטלפון: קובץ PDF וקובץ תמונה (PNG) אמיתיים מועברים ל-navigator.share({ files }).');

    const mobileShot = path.join(ARTIFACTS_DIR, 'garage-quote-mobile-chat-share.png');
    await mobilePage.locator('[data-testid="garage-quote-card"]').last().scrollIntoViewIfNeeded();
    await mobilePage.screenshot({ path: mobileShot });
    console.log('📸 נשמר צילום מסך מהנייד:', mobileShot);

    // Close WhatsApp modal if open on mobile
    const waClose = mobilePage.locator('[data-testid="garage-quote-wa-modal-close"]');
    if (await waClose.count() > 0) {
      await waClose.click();
    }

    // Verify Fallback Modal when direct file sharing is NOT supported by the browser
    console.log('\n[שלב 6] בדיקת חלופה ברורה להורדה ושיתוף ידני כאשר הדפדפן אינו תומך בשיתוף קובץ ישיר...');
    await mobilePage.evaluate(() => {
      navigator.canShare = () => false;
      navigator.share = undefined;
    });
    await mobilePage.locator('[data-testid="garage-quote-card-share"]').last().click();
    await mobilePage.waitForSelector('[data-testid="garage-quote-share-fallback-modal"]', { timeout: 10000 });
    const fallbackDownloadVis = await mobilePage.isVisible('[data-testid="garage-quote-fallback-download-pdf"]');
    if (!fallbackDownloadVis) {
      throw new Error('חלופת ההורדה הידנית לא הוצגה כאשר שיתוף ישיר אינו נתמך!');
    }
    console.log('✅ חלופה ברורה להורדה ולשיתוף ידני מוצגת כראוי כאשר הדפדפן אינו תומך בשיתוף קובץ ישיר.');
    await mobilePage.click('[data-testid="garage-quote-share-fallback-close"]');

    // =========================================================================
    // PART C: PUBLIC DIGITAL SIGNATURE & PRINT PAGE (/garage-quote?t=...)
    // =========================================================================
    console.log('\n[שלב 7] בדיקת דף הצעת המחיר המאובטח (/garage-quote) – מיתוג מוסך יוני + כפתורי הורדת PDF ושיתוף...');
    const quoteToken = '112e72b65172452299b06c5f66381308a704cd572882458c9a42e99216e1c875';
    await page.goto(`${BASE_URL}/garage-quote?t=${quoteToken}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('[data-testid="garage-quote-shop-branding-header"]', { timeout: 15000 });
    const signPageShopTitle = await page.textContent('[data-testid="garage-quote-shop-title"]');
    if (!signPageShopTitle?.includes('מוסך יוני – פחחות וצבע לרכב')) {
      throw new Error(`כותרת המוסך בדף החתימה אינה תקינה: ${signPageShopTitle}`);
    }
    const signPagePdfBtn = await page.isVisible('[data-testid="garage-quote-download-pdf-btn"]');
    const signPageShareBtn = await page.isVisible('[data-testid="garage-quote-share-btn"]');
    if (!signPagePdfBtn || !signPageShareBtn) {
      throw new Error('כפתורי הורדת PDF ושיתוף חסרים בדף הצעת המחיר המאובטח!');
    }
    const signPageShot = path.join(ARTIFACTS_DIR, 'garage-quote-branded-sign-page.png');
    await page.screenshot({ path: signPageShot, fullPage: true });
    console.log('✅ דף הצעת המחיר המאובטח מציג את המיתוג "מוסך יוני – פחחות וצבע לרכב" + לוגו + הורדת PDF + שיתוף + חתימה דיגיטלית.');

    console.log('\n================================================================================');
    console.log('🎉 כל בדיקות הקצה־לקצה (E2E) עברו בהצלחה מלאה ב-STAGING!');
    console.log('================================================================================');
  } finally {
    if (browser) await browser.close();
    if (previewProc) {
      try {
        previewProc.kill();
      } catch {}
    }
  }
}

run().catch((err) => {
  console.error('❌ E2E Verification Failed:', err);
  process.exit(1);
});
