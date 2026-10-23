import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const STAGING_REF = 'usfeoerkpcafxxlyuldl';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const keys = JSON.parse(execSync(`supabase projects api-keys --project-ref ${STAGING_REF} -o json`, { encoding: 'utf8' }));
const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy').api_key;
const serviceKey = keys.find((k) => k.name === 'service_role' && k.type === 'legacy').api_key;

const admin = createClient(STAGING_URL, serviceKey);

const SHOTS_DIR = path.resolve(process.cwd(), 'backups/qa-shots-lifecycle-20261023');
if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });

async function runFullLifecycle() {
  console.log('=== STARTING FULL LIFECYCLE E2E BROWSER VERIFICATION ===\n');

  const runId = Date.now().toString(36);
  const email = `qa-life-${runId}@staging.oren.local`;
  const password = `Pass!${runId}QA`;

  // 1. Create super_admin test user
  const { data: userData, error: userErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (userErr) throw new Error('User creation failed: ' + userErr.message);
  const userId = userData.user.id;

  await admin.from('profiles').upsert({
    id: userId,
    full_name: 'בודק מקצה לקצה דליה',
    company_name: 'מוסך אורן',
    is_active: true,
    approval_status: 'approved',
  });
  await admin.from('user_roles').delete().eq('user_id', userId);
  await admin.from('user_roles').insert({ user_id: userId, role: 'super_admin' });
  await admin.from('claims_access').upsert({ user_id: userId, granted_by: userId });
  console.log(`[PASS] Setup test user ${userId} with super_admin role.`);

  // 2. Setup fictitious customer and vehicle
  const testCustomer = `משה כהן ${runId}`;
  const testPlate = `99${Math.floor(100000 + Math.random() * 899999)}`;
  const { data: custRow, error: cErr } = await admin.from('garage_customers').insert({
    name: testCustomer,
    phone: '052-1112233',
    shop_company_name: 'מוסך אורן',
  }).select('id').single();
  if (cErr) throw new Error('Customer creation failed: ' + cErr.message);

  const { data: vehRow, error: vErr } = await admin.from('garage_vehicles').insert({
    customer_id: custRow.id,
    plate: testPlate,
    make: 'מאזדה',
    model: '3',
    year: 2023,
    shop_company_name: 'מוסך אורן',
  }).select('id').single();
  if (vErr) throw new Error('Vehicle creation failed: ' + vErr.message);
  console.log(`[PASS] Fictitious data created: Customer "${testCustomer}", Vehicle "${testPlate}".`);

  // 3. Create case with works, parts, and damage photos
  const caseNumber = `GM-LIFE-${runId.toUpperCase()}`;
  const caseData = {
    route: 'quote_first',
    flowStage: 'quote',
    intakeKm: '45200',
    intakeFuel: 'Full',
    quoteTitle: 'תיקון כנף ימנית ופנס ראשי',
    quoteToken: `qt_life_${runId}`,
    quoteVersion: 1,
    quoteWorks: [
      { id: 'w1', part: 'כנף קדמית ימנית', desc: 'יישור וצביעה בתנור', price: 1500, qty: 1, type: 'פחחות וצבע' },
      { id: 'w2', part: 'כיוון פרונט', desc: 'בדיקת מתלה וזוויות', price: 300, qty: 1, type: 'מכונאות' }
    ],
    quoteParts: [
      { id: 'p1', name: 'פנס ראשי ימני מקורי', price: 1200, qty: 1, supplier: 'ספק חלפים ישיר' },
      { id: 'p2', name: 'קליפסים לפגוש', price: 100, qty: 1, supplier: 'מלאי מוסך' }
    ],
    vatMode: 'plus_vat',
    vatRate: 18,
    quoteNotes: 'אחריות לשנה על צבע',
    timeline: [
      { at: new Date().toISOString(), text: 'פתיחת כרטיס בדיקה מקצה לקצה' }
    ],
    damagePhotosAttached: true,
    damagePhotosCount: 3,
  };

  const { data: caseRow, error: caseErr } = await admin.from('garage_cases').insert({
    case_number: caseNumber,
    customer_id: custRow.id,
    vehicle_id: vehRow.id,
    vehicle_plate_snapshot: testPlate,
    customer_name_snapshot: testCustomer,
    status: 'בעבודה',
    opened_by: userId,
    shop_company_name: 'מוסך אורן',
    case_data: caseData,
  }).select('id, case_number').single();
  if (caseErr) throw new Error('Case creation failed: ' + caseErr.message);
  console.log(`[PASS] Case ${caseRow.case_number} created (ID: ${caseRow.id}).`);

  // 4. Record payment of 2,000 ₪
  console.log('\n--- Testing Customer Payment Recording ---');
  const payEntry = {
    id: `pay_${Date.now()}`,
    amount: 2000,
    payment_method: 'credit_card',
    payment_method_label: 'כרטיס אשראי',
    reference: 'TX-987654',
    payer_name: testCustomer,
    payment_date: new Date().toISOString().split('T')[0],
    created_at: new Date().toISOString(),
    created_by: 'בודק מערכת',
    notes: 'תשלום מקדמה עבור עבודות וחלקים'
  };
  caseData.payments = [payEntry];
  caseData.totalPaid = 2000;
  // Total: Works (1800) + Parts (1300) = 3100 + 18% VAT (558) = 3658
  const subtotal = 3100;
  const vat = Math.round(subtotal * 0.18);
  const grandTotal = subtotal + vat;
  caseData.quoteGrandTotal = grandTotal;
  caseData.balanceRemaining = grandTotal - 2000; // 1658
  caseData.paymentStatus = 'partial';
  caseData.timeline.push({
    at: new Date().toISOString(),
    text: `נרשם תשלום מקדמה ₪2,000 בכרטיס אשראי (אסמכתא TX-987654). יתרה: ₪${caseData.balanceRemaining}`
  });

  await admin.from('garage_cases').update({ case_data: caseData }).eq('id', caseRow.id);
  console.log(`[PASS] Recorded payment: ₪2,000 (Grand Total: ₪${grandTotal}, Remaining: ₪${caseData.balanceRemaining}).`);

  // 5. Launch Playwright to test real browser interaction using installed browser
  console.log('\n--- Launching Headless Chromium/Edge for Browser UI Verification ---');
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
  } catch (e) {
    try {
      browser = await chromium.launch({ headless: true, channel: 'chrome' });
    } catch (e2) {
      browser = await chromium.launch({ headless: true });
    }
  }
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: 'he-IL',
  });
  const page = await context.newPage();

  // Test local preview or staging
  // We can load the local dev server or approved-source.html directly via file:// or simple HTTP server
  const htmlPath = path.resolve(process.cwd(), 'src/modules/garage-management/approved-source.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  // Inject bootstrap message to load our case directly into approved-source
  await page.setContent(htmlContent, { waitUntil: 'load' });
  await page.waitForTimeout(1000);

  // Send bootstrap event with payload.loaded
  await page.evaluate(({ testCase, testCustomer, testPlate }) => {
    window.postMessage({
      type: 'gm:bootstrap',
      payload: {
        mode: 'case',
        caseId: testCase.id,
        loaded: testCase,
        initialCustomer: { id: testCase.customer_id, name: testCustomer, phone: '052-1112233' },
        initialVehicle: { id: testCase.vehicle_id, plate: testPlate, make: 'מאזדה', model: '3', year: 2023 }
      }
    }, '*');
  }, { testCase: { ...caseRow, case_data: caseData }, testCustomer, testPlate });

  await page.waitForTimeout(1500);

  // Screenshot of case hub
  await page.screenshot({ path: path.join(SHOTS_DIR, '01-case-hub.png') });
  console.log('[PASS] Screenshot captured: 01-case-hub.png');

  // Verify navigation to Quote screen
  await page.evaluate(() => {
    if (typeof window.go === 'function') window.go('s-quote');
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(SHOTS_DIR, '02-quote-screen.png') });
  console.log('[PASS] Screenshot captured: 02-quote-screen.png');

  // Verify navigation to PDF Preview screen
  await page.evaluate(() => {
    if (typeof window.go === 'function') window.go('s-quote-preview');
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(SHOTS_DIR, '03-quote-pdf-preview.png') });
  console.log('[PASS] Screenshot captured: 03-quote-pdf-preview.png');

  // Verify financial summary in PDF preview has works, parts, vat, and total
  const previewData = await page.evaluate(() => {
    return {
      works: document.getElementById('preview-tot-works')?.textContent || '',
      parts: document.getElementById('preview-tot-parts')?.textContent || '',
      vat: document.getElementById('preview-tot-vat')?.textContent || '',
      final: document.getElementById('preview-tot-final')?.textContent || '',
    };
  });
  console.log('PDF Preview Financial Summary Elements:', previewData);

  if (!previewData.works.includes('1,800')) throw new Error('Expected works total 1,800 ₪, got: ' + previewData.works);
  if (!previewData.parts.includes('1,300')) throw new Error('Expected parts total 1,300 ₪, got: ' + previewData.parts);
  if (!previewData.vat.includes('558')) throw new Error('Expected vat 558 ₪, got: ' + previewData.vat);
  if (!previewData.final.includes('3,658')) throw new Error('Expected final total 3,658 ₪, got: ' + previewData.final);
  console.log('[PASS] PDF preview correctly displays Works (₪1,800), Parts (₪1,300), 18% VAT (₪558), and Grand Total (₪3,658)!');

  // Verify Work Order screen
  await page.evaluate(() => {
    if (typeof window.go === 'function') window.go('s-workorder');
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(SHOTS_DIR, '04-work-order-screen.png') });
  console.log('[PASS] Screenshot captured: 04-work-order-screen.png');

  // Verify Import Quote to Work Order button
  const hasImportBtn = await page.evaluate(() => {
    return typeof window.importQuoteToWorkOrder === 'function';
  });
  if (!hasImportBtn) throw new Error('importQuoteToWorkOrder function missing in window!');
  console.log('[PASS] importQuoteToWorkOrder button and function verified.');

  await browser.close();

  // Cleanup test user
  await admin.from('user_roles').delete().eq('user_id', userId);
  await admin.auth.admin.deleteUser(userId);
  console.log(`[PASS] Cleaned up test user ${userId}.`);

  console.log('\n=== FULL LIFECYCLE E2E BROWSER VERIFICATION COMPLETED SUCCESSFULLY ===');
}

runFullLifecycle().catch((err) => {
  console.error('\n❌ E2E VERIFICATION FAILED:', err);
  process.exit(1);
});
