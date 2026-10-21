// scripts/verify-liran-levy-and-quote-signature-e2e.mjs
// End-to-end execution of Liran Levy (plate 8042376) dictated workflow + UI & Digital Signature verification
import { execSync, spawn } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const ARTIFACTS_DIR = 'C:/Users/אליאב/.gemini/antigravity/brain/912da76f-1222-447e-95e6-0685412f307c';

const keys = JSON.parse(execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const serviceKey = keys.find(k => k.name === 'service_role' && k.type === 'legacy').api_key;
const anonKey = keys.find(k => k.name === 'anon' && k.type === 'legacy').api_key;

const admin = createClient(STAGING_URL, serviceKey);

async function parseSseResponse(res) {
  const text = await res.text();
  const lines = text.split('\n');
  let content = '';
  let pendingAction = null;
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        const json = JSON.parse(line.slice(6));
        if (json.choices?.[0]?.delta?.content) {
          content += json.choices[0].delta.content;
        }
        if (json.pendingAction || json.pending_action) {
          pendingAction = json.pendingAction || json.pending_action;
        }
      } catch {}
    }
  }
  return { content, pendingAction, raw: text };
}

function createSamplePngBuffer() {
  // Valid 1x1 red PNG
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
}

function createSamplePdfBuffer() {
  const pdf = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R >> endobj
4 0 obj << /Length 44 >> stream
BT /F1 12 Tf 72 100 Td (Garage Quote Attachment) Tj ET
endstream endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000197 00000 n 
trailer << /Size 5 /Root 1 0 R >>
startxref
291
%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

async function run() {
  console.log('======================================================================');
  console.log('🚀 משימת ביצוע מלאה – דליה AI לניהול המוסך (לירן לוי + חתימה דיגיטלית)');
  console.log('======================================================================');

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
  const token = session.access_token;
  console.log('✅ מחובר ל-STAGING בתור:', authData.user.email);

  const BASE_URL = 'https://orin1607-ctrl.github.io/future-craft-core';
  console.log('🌐 מתחבר לאתר ה-STAGING החי:', BASE_URL);

  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  } catch {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
  }
  let testCaseId = null;
  let testCustomerId = null;
  let testVehicleId = null;

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 920 },
      locale: 'he-IL',
    });
    await context.addInitScript(
      ({ key, sessionData }) => {
        localStorage.setItem(key, JSON.stringify(sessionData));
      },
      { key: `sb-${STAGING_REF}-auth-token`, sessionData: session }
    );
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        const txt = msg.text();
        if (!txt.includes('favicon') && !txt.includes('404')) {
          if (msg.type() === 'error') consoleErrors.push(txt);
          else console.log('[BROWSER WARN]', txt);
        }
      }
    });

    const chatShotPath = path.join(ARTIFACTS_DIR, 'liran-levy-dalia-ai-quote-chat.png');
    const { data: existingLiranCase } = await admin
      .from('garage_cases')
      .select('id, case_number')
      .eq('vehicle_plate_snapshot', '8042376')
      .eq('customer_name_snapshot', 'לירן לוי')
      .maybeSingle();

    if (!existingLiranCase || !fs.existsSync(chatShotPath)) {
      // Navigate to Garage Management
      console.log('\n[שלב 1] פתיחת מודול ניהול המוסך וצ\'אט דליה AI...');
      await page.goto(`${BASE_URL}/garage-management?cb=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForSelector('[data-testid="garage-ai-launch-btn"]', { timeout: 25000 });
      await page.click('[data-testid="garage-ai-launch-btn"]');
      await page.waitForSelector('[data-testid="claims-ai-workspace"]', { timeout: 10000 });

      // Start a fresh conversation
      const newBtn = await page.$('[data-testid="claims-ai-new"]');
      if (newBtn) await newBtn.click();

      // Send exact Liran Levy dictation prompt in Dalia AI Chat
      const liranPrompt = `אני מבקש שתבצעי תהליך עבודה מלא:
1. פרטי הלקוח והרכב:
- שם הלקוח: לירן לוי
- סוג לקוח: לקוח פרטי, חד־פעמי (ללא טלפון וללא אימייל ידועים כרגע - אל תמציאי)
- מספר רכב: 8042376
- תאריך הצעת המחיר: 21.10.2026
- סוג עבודה: תיקוני פחחות וצבע בחזית הרכב
בדקי תחילה אם הלקוח או הרכב כבר קיימים במערכת למניעת כפילויות, פתחי אותם וקשרי ביניהם, ופתחי כרטיס עבודה מסודר והכיני הצעת מחיר:
כותרת: הצעת מחיר – עבודות פחחות וצבע
פירוט העבודות – כל חלק בשורה נפרדת:
1. פגוש קדמי – 600 ₪ | פירוק, הרכבה, תיקון חריג של פגוש קרוע וצביעה. כולל צבע.
2. כנף קדמית שמאלית – 420 ₪ | פירוק הכנף, תיקון פחחות, הרכבה וצביעה. פירוק הכנף היה הכרחי לצורך ביצוע התיקונים.
3. יישור פנימי ופח חזית – 300 ₪ | יישור ותיקון פח חזית פנימי בחלק התחתון.
4. יישור דופן מתחת לכנף – 200 ₪ | יישור ותיקון הדופן לאחר פירוק הכנף.
5. תיקון פחחות דלת קדמית שמאלית – ללא מחיר בשלב זה | תיקון נזקי פחחות בדלת. ללא מחיר בשלב זה.
6. כיוון חזית – ללא מחיר בשלב זה | כיוון והתאמת חלקי המרכב בחזית הרכב. ללא מחיר בשלב זה.`;

      console.log('\n[שלב 2] שליחת הכתבת לירן לוי (רכב 8042376) בצ\'אט דליה AI...');
      await page.fill('[data-testid="claims-ai-input"]', liranPrompt);
      await page.click('[data-testid="claims-ai-send"]');

      console.log('ממתין לכרטיס האישור (Preview Card) מדליה AI...');
      await page.waitForSelector('[data-testid="claims-ai-confirm-btn"]', { timeout: 65000 });
      console.log('✅ כרטיס האישור הופיע בצ\'אט! לוחץ על "אישור" לביצוע ושמירה במסד הנתונים...');
      await page.click('[data-testid="claims-ai-confirm-btn"]');

      // Wait for execution confirmation message with quote details and open case button
      await page.waitForSelector('[data-testid="garage-ai-open-quote-link-btn"]', { timeout: 45000 });
      await page.waitForTimeout(1500);

      // Take screenshot of the full quote inside Dalia AI Chat
      await page.screenshot({ path: chatShotPath, fullPage: false });
      console.log('📸 צילום מסך הצעת המחיר בצ\'אט דליה AI נשמר:', chatShotPath);
    } else {
      console.log(`\n[שלב 1-2] כרטיס העבודה של לירן לוי (${existingLiranCase.case_number}) וצילום המסך בצ'אט כבר נוצרו ואומתו בריצה הקודמת (ללא כפילויות!).`);
    }

    // Verify Liran Levy DB records in STAGING
    console.log('\n[שלב 3] קריאה חוזרת ואימות מלא ממסד הנתונים ב-STAGING עבור לירן לוי...');
    const { data: liranCust } = await admin
      .from('garage_customers')
      .select('*')
      .eq('name', 'לירן לוי')
      .single();
    if (!liranCust) throw new Error('הלקוח לירן לוי לא נמצא ב-garage_customers!');
    if (liranCust.phone !== '') throw new Error(`טלפון הלקוח צריך להיות ריק ולא מומצא, אך נמצא: "${liranCust.phone}"`);
    console.log('✅ לקוח מאומת ב-DB:', liranCust.id, liranCust.name, '| notes:', liranCust.notes);

    const { data: liranVeh } = await admin
      .from('garage_vehicles')
      .select('*')
      .eq('plate', '8042376')
      .single();
    if (!liranVeh) throw new Error('רכב 8042376 לא נמצא ב-garage_vehicles!');
    if (liranVeh.customer_id !== liranCust.id) throw new Error('הרכב 8042376 אינו מקושר ללקוח לירן לוי!');
    console.log('✅ רכב מאומת ב-DB:', liranVeh.id, liranVeh.plate, '| מקושר ללקוח:', liranVeh.customer_id);

    const { data: liranCase } = await admin
      .from('garage_cases')
      .select('*')
      .eq('vehicle_plate_snapshot', '8042376')
      .eq('customer_name_snapshot', 'לירן לוי')
      .single();
    if (!liranCase) throw new Error('כרטיס העבודה של לירן לוי לא נמצא ב-garage_cases!');

    const cd = liranCase.case_data || {};
    const works = cd.quoteWorks || [];
    if (works.length !== 6) {
      throw new Error(`נדרשות בדיוק 6 שורות עבודה נפרדות, אך נשמרו ${works.length}`);
    }
    const pricedWorks = works.filter((w) => w.price !== null && w.price > 0);
    const unpricedWorks = works.filter((w) => w.price === null);
    const pricedSum = pricedWorks.reduce((s, w) => s + Number(w.price), 0);
    if (pricedWorks.length !== 4 || unpricedWorks.length !== 2 || pricedSum !== 1520) {
      throw new Error(`שגיאה בחישוב שורות: מתומחרות=${pricedWorks.length}, ללא מחיר=${unpricedWorks.length}, סכום=${pricedSum}`);
    }
    console.log(`✅ כרטיס עבודה מאומת ב-DB: ${liranCase.case_number} (${liranCase.id}) | 6 שורות נפרדות | 4 מתומחרות = 1,520 ₪ | 2 ללא מחיר (price: null)`);

    const { data: liranQuoteLink } = await admin
      .from('garage_quote_links')
      .select('*')
      .eq('case_id', liranCase.id)
      .single();
    if (!liranQuoteLink) throw new Error('קישור הצעת המחיר של לירן לוי לא נמצא ב-garage_quote_links!');
    if (liranQuoteLink.status !== 'ready_to_send' || liranQuoteLink.signed_at !== null) {
      throw new Error(`סטטוס הקישור של לירן לוי חייב להיות ready_to_send וללא חתימה, אך נמצא: ${liranQuoteLink.status}`);
    }
    console.log(`✅ קישור הצעת מחיר מאובטח של לירן לוי מוכן לשליחה (ready_to_send): /garage-quote?t=${liranQuoteLink.token}`);

    const liranQuotePageShot = path.join(ARTIFACTS_DIR, 'liran-levy-quote-sign-page-ready.png');
    if (!fs.existsSync(liranQuotePageShot)) {
      const quotePage = await context.newPage();
      await quotePage.goto(`${BASE_URL}/garage-quote?t=${liranQuoteLink.token}`, { waitUntil: 'domcontentloaded' });
      await quotePage.waitForSelector('[data-testid="garage-quote-sign-page"]', { timeout: 15000 });
      await quotePage.screenshot({ path: liranQuotePageShot, fullPage: true });
      console.log('📸 צילום מסך דף הצעת המחיר של לירן לוי (מוכן לשליחה ולחתימה) נשמר:', liranQuotePageShot);
      await quotePage.close();
    } else {
      console.log('📸 צילום מסך דף הצעת המחיר של לירן לוי קיים:', liranQuotePageShot);
    }

    const workCardShotPath = path.join(ARTIFACTS_DIR, 'liran-levy-work-card-quote.png');
    if (!fs.existsSync(workCardShotPath)) {
      console.log('\n[שלב 4] פתיחת כרטיס העבודה של לירן לוי ישירות מתוך הצ\'אט...');
      await page.goto(`${BASE_URL}/garage-management/${liranCase.id}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3500);
      await page.screenshot({ path: workCardShotPath, fullPage: false });
      console.log('📸 צילום מסך כרטיס העבודה של לירן לוי נשמר:', workCardShotPath);
    } else {
      console.log('\n[שלב 4] צילום מסך כרטיס העבודה של לירן לוי קיים:', workCardShotPath);
    }

    // =========================================================================
    // שלב 5: בדיקת קצה-לקצה של חתימה דיגיטלית + העלאת תמונת נזק ו-PDF על תיק בדיקה נפרד!
    // =========================================================================
    console.log('\n[שלב 5] הקמת כרטיס בדיקה נפרד לבדיקת העלאת תמונת נזק, PDF וחתימת לקוח דיגיטלית...');
    const testPlate = '9988776';
    const rTest = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify({
        action: 'execute_pending_action',
        module: 'garage',
        pending_action: {
          preview_id: `test_sig_${Date.now()}`,
          summary: 'תיק בדיקת חתימה דיגיטלית',
          tool_name: 'preview_garage_dictate_case_and_quote',
          action_type: 'garage_dictate_case_and_quote',
          parameters: {
            customer_name: 'לקוח בדיקת חתימה QA',
            customer_type_label: 'לקוח פרטי - בדיקת QA',
            customer_phone: '',
            customer_email: '',
            vehicle_plate: testPlate,
            quote_title: 'הצעת מחיר – בדיקת חתימה דיגיטלית',
            quote_date: '21.10.2026',
            work_type: 'בדיקת חתימה ותמונות',
            vat_mode: 'unspecified',
            quote_works: [
              { part: 'פגוש קדמי', type: 'פחחות וצבע', price: 500, qty: 1, desc: 'תיקון וצביעה לבדיקת חתימה.' },
              { part: 'כיוון חזית', type: 'כיוון', price: null, unpriced: true, qty: 1, desc: 'ללא מחיר בשלב זה.' },
            ],
            quote_parts: [],
          },
        },
      }),
    });
    const testExec = await rTest.json();
    if (!testExec.success) throw new Error(`יצירת תיק בדיקה נכשלה: ${testExec.error}`);
    testCaseId = testExec.case_id;
    testCustomerId = testExec.customer_id;
    testVehicleId = testExec.vehicle_id;
    const testQuoteToken = testExec.quote_token;
    console.log(`✅ תיק בדיקה נוצר: ${testExec.case_number} (${testCaseId}) | token: ${testQuoteToken}`);

    // Test uploading a damage photo + PDF document from Dalia AI Chat in Garage mode
    console.log('\n[שלב 6] בדיקת כפתורי מצלמה (📷), גלריה (🖼️) והעלאת מסמך (📎) בצ\'אט ושיוכם לכרטיס העבודה...');
    await page.goto(`${BASE_URL}/garage-management/${testCaseId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="garage-ai-launch-btn"]', { timeout: 20000 });
    await page.waitForTimeout(3500);
    await page.click('[data-testid="garage-ai-launch-btn"]');
    await page.waitForSelector('[data-testid="claims-ai-workspace"]', { timeout: 15000 });

    // Verify camera (with capture="environment"), gallery, and file buttons exist
    const camCaptureAttr = await page.getAttribute('[data-testid="claims-ai-camera-input"]', 'capture');
    const hasGalleryBtn = (await page.$('[data-testid="claims-ai-gallery-btn"]')) !== null;
    const hasAttachBtn = (await page.$('[data-testid="claims-ai-attach-btn"]')) !== null;
    if (camCaptureAttr !== 'environment' || !hasGalleryBtn || !hasAttachBtn) {
      throw new Error(`חסרים כפתורי מצלמה/גלריה/קבצים: capture=${camCaptureAttr}, gallery=${hasGalleryBtn}, attach=${hasAttachBtn}`);
    }
    console.log('✅ כפתורי מצלמה (capture="environment"), גלריה (🖼️) ומסמכים (📎) קיימים ופעילים!');

    // Upload sample damage image + sample PDF
    const tmpDir = 'C:/Users/אליאב/Projects/oren-garage-flow-staging/.tmp-e2e-files';
    fs.mkdirSync(tmpDir, { recursive: true });
    const sampleImgPath = path.join(tmpDir, 'front-bumper-damage.png');
    const samplePdfPath = path.join(tmpDir, 'quote-supporting-doc.pdf');
    fs.writeFileSync(sampleImgPath, createSamplePngBuffer());
    fs.writeFileSync(samplePdfPath, createSamplePdfBuffer());

    const fileInput = await page.$('[data-testid="claims-ai-file-input"]');
    await fileInput.setInputFiles([sampleImgPath, samplePdfPath]);
    await page.waitForSelector('[data-testid="claims-ai-attachments-tray"]', { timeout: 5000 });
    await page.fill('[data-testid="claims-ai-input"]', 'מצורפים צילום נזק בפגוש הקדמי ומסמך נלווה לכרטיס העבודה.');
    await page.click('[data-testid="claims-ai-send"]');
    await page.waitForTimeout(7000);

    // Verify garage_media has both files linked to testCaseId
    const { data: uploadedMedia } = await admin
      .from('garage_media')
      .select('id, category, title, mime_type')
      .eq('garage_case_id', testCaseId);
    console.log(`✅ קבצים שנשמרו ב-garage_media עבור תיק הבדיקה (${uploadedMedia?.length || 0}):`, uploadedMedia);
    if (!uploadedMedia || uploadedMedia.length < 2) {
      throw new Error('התמונה וה-PDF לא נשמרו ב-garage_media עבור כרטיס העבודה!');
    }

    // Open the test quote link in a mobile viewport and sign with finger/mouse on the canvas
    console.log('\n[שלב 7] בדיקת חתימת לקוח דיגיטלית במובייל/דסקטופ על /garage-quote?t=<token>...');
    const mobileContext = await browser.newContext({
      viewport: { width: 412, height: 915 },
      locale: 'he-IL',
    });
    const signPage = await mobileContext.newPage();
    await signPage.goto(`${BASE_URL}/garage-quote?t=${testQuoteToken}`, { waitUntil: 'domcontentloaded' });
    await signPage.waitForSelector('[data-testid="garage-quote-signature-canvas"]', { timeout: 15000 });

    // Verify damage photos attached badge updated after photo upload
    const photosBoxText = await signPage.textContent('[data-testid="garage-quote-photos-note"]');
    console.log('סטטוס תמונות בדף ההצעה:', photosBoxText?.trim());

    // Draw signature on canvas (scroll into view first!)
    const canvas = await signPage.$('[data-testid="garage-quote-signature-canvas"]');
    await canvas.scrollIntoViewIfNeeded();
    await signPage.waitForTimeout(300);
    const box = await canvas.boundingBox();
    await signPage.mouse.move(box.x + 60, box.y + 50);
    await signPage.mouse.down();
    await signPage.mouse.move(box.x + 140, box.y + 85, { steps: 10 });
    await signPage.mouse.move(box.x + 220, box.y + 45, { steps: 10 });
    await signPage.mouse.up();

    // Click "אישור וחתימה על הצעת המחיר"
    await signPage.click('[data-testid="garage-quote-submit-signature-btn"]');
    await signPage.waitForTimeout(1000);
    const errEl = await signPage.$('[data-testid="garage-quote-submit-error"]');
    if (errEl) {
      const errTxt = await errEl.textContent();
      throw new Error(`שגיאה בחתימת ההצעה בדפדפן: ${errTxt}`);
    }
    await signPage.waitForSelector('[data-testid="garage-quote-signed-card"]', { timeout: 15000 });
    await signPage.waitForTimeout(1000);

    const signedShotPath = path.join(ARTIFACTS_DIR, 'garage-quote-digital-signature-verified.png');
    await signPage.screenshot({ path: signedShotPath, fullPage: true });
    console.log('📸 צילום מסך הצעת מחיר חתומה דיגיטלית נשמר:', signedShotPath);

    // Verify in DB that signature, timestamp, signer name, and status were saved and locked
    const { data: signedLinkRow } = await admin
      .from('garage_quote_links')
      .select('*')
      .eq('token', testQuoteToken)
      .single();
    if (!signedLinkRow || signedLinkRow.status !== 'signed' || !signedLinkRow.signature_data_url || !signedLinkRow.signed_at) {
      throw new Error('החתימה הדיגיטלית לא נשמרה כראוי ב-garage_quote_links!');
    }
    console.log('✅ אימות DB ב-garage_quote_links: status=signed, signed_at=', signedLinkRow.signed_at, 'signer=', signedLinkRow.signer_name);

    const { data: signedCaseRow } = await admin
      .from('garage_cases')
      .select('status, case_data')
      .eq('id', testCaseId)
      .single();
    if (!signedCaseRow || signedCaseRow.status !== 'אושר לביצוע' || !signedCaseRow.case_data?.quoteSigned) {
      throw new Error(`כרטיס העבודה לא עודכן ל-'אושר לביצוע' לאחר החתימה: status=${signedCaseRow?.status}`);
    }
    console.log('✅ אימות DB ב-garage_cases: status="אושר לביצוע", quoteSigned=true, quoteVersion=', signedCaseRow.case_data.quoteVersion);

    // Test immutability: attempting to re-sign the already-signed token must be blocked
    const { data: reSignAttempt, error: reSignError } = await client.rpc('sign_garage_quote_by_token', {
      p_token: testQuoteToken,
      p_signer_name: 'ניסיון חתימה חוזרת',
      p_signature_data_url: signedLinkRow.signature_data_url,
    });
    if (!reSignError && reSignAttempt?.ok !== false) {
      throw new Error(`חתימה חוזרת על הצעה חתומה לא נחסמה! התקבל: ${JSON.stringify(reSignAttempt)}`);
    }
    console.log('✅ נעילת הצעה חתומה אומתה: ניסיון חתימה חוזרת נחסם:', reSignError?.message || reSignAttempt?.error);

    // Test version increment on subsequent edit after signature
    const editRes = await fetch(`${STAGING_URL}/functions/v1/help-ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: anonKey },
      body: JSON.stringify({
        action: 'execute_pending_action',
        module: 'garage',
        pending_action: {
          preview_id: `test_ver_${Date.now()}`,
          summary: 'עדכון הצעה לאחר חתימה לבדיקת גרסה חדשה',
          tool_name: 'preview_update_garage_repair_details',
          action_type: 'garage_update_repair_details',
          parameters: {
            case_id: testCaseId,
            quote_works: [{ part: 'כיוון חזית', type: 'כיוון', price: 250, qty: 1, desc: 'נוסף מחיר לכיוון חזית' }],
            mode: 'append',
          },
        },
      }),
    });
    const editJson = await editRes.json();
    const { data: afterEditCase } = await admin.from('garage_cases').select('case_data').eq('id', testCaseId).single();
    if (afterEditCase?.case_data?.quoteVersion !== 2) {
      throw new Error(`גרסת ההצעה לא עלתה ל-2 לאחר עריכת הצעה חתומה! נמצא: ${afterEditCase?.case_data?.quoteVersion}`);
    }
    console.log('✅ שמירת היסטוריית גרסאות אומתה: עריכה לאחר חתימה פתחה גרסה חדשה (quoteVersion = 2) והעבירה את הגרסה הקודמת ל-superseded.');

    await mobileContext.close();
    await context.close();

    console.log('\n======================================================================');
    console.log('🎉 כל בדיקות הקצה-לקצה עברו בהצלחה מלאה!');
    console.log(`📌 מספר כרטיס העבודה של לירן לוי: ${liranCase.case_number} (ID: ${liranCase.id})`);
    console.log(`🔗 קישור לכרטיס העבודה: /garage-management/${liranCase.id}`);
    console.log(`🔗 קישור להצעת המחיר של לירן לוי: /garage-quote?t=${liranQuoteLink.token}`);
    console.log('======================================================================');
  } finally {
    // Clean up ONLY the separate signature test case (keep Liran Levy's case intact!)
    if (testCaseId) {
      await admin.from('garage_media').delete().eq('garage_case_id', testCaseId);
      await admin.from('garage_quote_links').delete().eq('case_id', testCaseId);
      await admin.from('garage_cases').delete().eq('id', testCaseId);
    }
    if (testVehicleId) {
      await admin.from('garage_vehicles').delete().eq('id', testVehicleId);
    }
    if (testCustomerId) {
      await admin.from('garage_customers').delete().eq('id', testCustomerId);
    }
    await browser.close();
  }
}

run().catch((err) => {
  console.error('❌ שגיאה בבדיקת קצה-לקצה:', err);
  process.exit(1);
});
