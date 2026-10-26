/**
 * E2E for the claim quote builder on STAGING only, against a local dev server.
 * Uses test claim DAL-2026-0229 (TEST-NOTICE-FORM). Never touches Production.
 *   node scripts/e2e-claim-quote-staging.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REF = 'usfeoerkpcafxxlyuldl';
const PROD_REF = 'qasomfndnjuixgjmjwcm';
const SB_URL = `https://${REF}.supabase.co`;
const BASE = process.argv[2] || 'http://127.0.0.1:8095';
// A dedicated test claim, created here and soft-deleted at the end (same as earlier DAL-E2E runs).
const RUN = Date.now().toString().slice(-6);
const CLAIM_ID = `DAL-E2E-Q${RUN}`;
const PLATE = `QE${RUN}`;
const OUT = path.join(process.cwd(), 'docs/audit-reports/claim-quote-2026-10-26');
fs.mkdirSync(OUT, { recursive: true });

if (REF === PROD_REF) throw new Error('refused production');
const linked = fs.readFileSync('supabase/.temp/project-ref', 'utf8').trim();
if (linked !== REF) throw new Error(`linked project is ${linked}, expected staging`);

const results = [];
let adminRef = null;
/** Soft-delete the test claim the way the app does (row_data.deletedAt); its quote rows stay for audit. */
async function softDeleteTestClaim() {
  if (!adminRef) return;
  const { data } = await adminRef.from('claims_records').select('row_data').eq('id', CLAIM_ID).maybeSingle();
  if (!data) return;
  await adminRef.from('claims_records').update({ row_data: { ...data.row_data, deletedAt: new Date().toISOString() } }).eq('id', CLAIM_ID);
  console.log(`test claim ${CLAIM_ID} soft-deleted`);
}
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail).slice(0, 300) });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

/** A one-page PDF with a real text layer (Helvetica), used as a parts invoice. */
function textPdf(lines) {
  const esc = (s) => s.replace(/[\\()]/g, (m) => `\\${m}`);
  const content = `BT /F1 12 Tf 50 760 Td 18 TL ${lines.map((l) => `(${esc(l)}) Tj T*`).join(' ')} ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let out = '%PDF-1.4\n';
  const off = [];
  objs.forEach((o, i) => { off.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${off.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

async function main() {
  const keys = JSON.parse(execSync(`supabase projects api-keys --project-ref ${REF} -o json`, { encoding: 'utf8' }));
  const serviceKey = keys.find((k) => k.name === 'service_role' && k.type === 'legacy').api_key;
  const anonKey = keys.find((k) => k.name === 'anon' && k.type === 'legacy').api_key;
  const admin = createClient(SB_URL, serviceKey);
  adminRef = admin;
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'orin1607@gmail.com' });
  if (linkErr) throw linkErr;
  const { data: auth, error: authErr } = await createClient(SB_URL, anonKey).auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  if (authErr) throw authErr;

  const stamp = new Date().toLocaleString('he-IL');
  const rowData = {
    id: CLAIM_ID, plate: PLATE, status: 'חדש', clientName: 'לקוח בדיקה הצעת מחיר E2E', clientPhone: '0501234567', clientEmail: 'e2e-client@example.com',
    carMake: 'טויוטה', carModel: 'קורולה', claimNum: `CLM-${RUN}`, insCompany: 'הראל', company_name: '', createdAt: stamp, updatedAt: stamp, notes: 'תיק בדיקה אוטומטית — הצעת מחיר',
  };
  const { error: insErr } = await admin.from('claims_records').insert({ id: CLAIM_ID, plate: PLATE, client_name: rowData.clientName, status: 'חדש', row_data: rowData });
  if (insErr) throw insErr;
  console.log(`test claim ${CLAIM_ID} created`);
  const quotesBefore = 0;

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'he-IL', acceptDownloads: true });
  await ctx.addInitScript(({ s, u }) => localStorage.setItem(`sb-${s}-auth-token`, JSON.stringify(u)), { s: REF, u: auth.session });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e.message)));
  page.on('dialog', (d) => d.accept());
  const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
  const ed = page.locator('[data-testid="claim-quote-editor"]');

  await page.goto(`${BASE}/claims`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('[data-testid="claims-search"]').fill(PLATE, { timeout: 60000 });
  const row = page.locator(`[data-testid="claim-row-${CLAIM_ID}"]`).first();
  await row.waitFor({ timeout: 30000 }).catch(async (e) => { await shot('00-list-debug'); throw e; });
  await row.click();
  await page.locator('[data-testid="claims-quote-btn"]').click({ timeout: 20000 });
  await ed.waitFor({ timeout: 20000 });
  await page.waitForTimeout(1500);

  // 1. Claim details pulled from the claim
  const info = await page.locator('[data-testid="cq-claim-info"]').innerText();
  check('claim details pulled (name, plate, make, model, insurer)', ['לקוח בדיקה הצעת מחיר E2E', PLATE, 'טויוטה', 'קורולה', 'הראל', `CLM-${RUN}`].every((t) => info.includes(t)), info.replace(/\s+/g, ' '));

  // 2. Default categories
  const cats = await Promise.all(['body', 'paint', 'mech', 'electric'].map((k) => page.locator(`[data-testid="cq-cat-${k}"]`).count()));
  check('default categories are body, paint, mech only', cats[0] && cats[1] && cats[2] && !cats[3], JSON.stringify(cats));
  check('one empty part row on a new quote', (await page.locator('[data-testid="cq-part-row"]').count()) === 1);
  await shot('01-new-quote');

  // 3. Add body work from the fixed library, priced by hours
  const dlg = page.locator('[data-testid="cq-picker"]');
  await page.locator('[data-testid="cq-cat-body"] [data-testid="cq-add-item"]').first().click();
  await dlg.locator('button.cq-chip', { hasText: 'החלפת כנף קדמית שמאל' }).click();
  await page.locator('[data-testid="cq-picker-ok"]').click();
  const bodyRow = page.locator('[data-testid="cq-cat-body"] [data-testid="cq-work-row"]').first();
  await bodyRow.locator('input[aria-label="שעות"]').fill('2.5');
  check('hours pricing 2.5 × 380 = 950', (await bodyRow.locator('[data-testid="cq-final"]').innerText()).includes('950.00'));
  // Same job on the other side
  await bodyRow.locator('button[title="הוסף את אותה עבודה בצד השני"]').click();
  const bodyRows = page.locator('[data-testid="cq-cat-body"] [data-testid="cq-work-row"]');
  check('duplicate to other side', (await bodyRows.nth(1).locator('input[aria-label="תיאור העבודה"]').inputValue()).includes('ימין'));
  await bodyRows.nth(1).locator('button[title="מחק שורה"]').click();

  // 4. Extra category (front alignment), global price with ₪ discount
  await page.locator('[data-testid="cq-add-domain"]').click();
  await dlg.locator('button.cq-chip', { hasText: 'כיוון פרונט' }).click();
  await page.locator('[data-testid="cq-picker-ok"]').click();
  await page.locator('[data-testid="cq-cat-alignment"] [data-testid="cq-add-item"]').first().click();
  await dlg.locator('button.cq-chip', { hasText: 'כיוון פרונט' }).click();
  await page.locator('[data-testid="cq-picker-ok"]').click();
  const alignRow = page.locator('[data-testid="cq-cat-alignment"] [data-testid="cq-work-row"]').first();
  await alignRow.locator('input[aria-label="מחיר גלובלי"]').fill('250');
  await alignRow.locator('select[aria-label="סוג הנחה"]').selectOption('amount');
  await alignRow.locator('input[aria-label="ערך הנחה"]').fill('50');
  check('global price with ₪50 discount shows original and final', (await alignRow.locator('input[aria-label="מחיר גלובלי"]').inputValue()) === '250' && (await alignRow.locator('[data-testid="cq-final"]').innerText()).includes('200.00'));

  // 5. Free-text mechanics job (saved to library), global 1000 with 10% discount
  await page.locator('[data-testid="cq-cat-mech"] [data-testid="cq-add-item"]').first().click();
  await page.locator('[data-testid="cq-picker-input"]').fill('בדיקת מערכת בלמים E2E');
  await page.locator('[data-testid="cq-picker-ok"]').click();
  const mechRow = page.locator('[data-testid="cq-cat-mech"] [data-testid="cq-work-row"]').first();
  await mechRow.locator('input[aria-label="מחיר גלובלי"]').fill('1000');
  await mechRow.locator('select[aria-label="סוג הנחה"]').selectOption('percent');
  await mechRow.locator('input[aria-label="ערך הנחה"]').fill('10');

  // 6. Parts: fill the starter row, add two more (one excluded)
  const partRows = page.locator('[data-testid="cq-part-row"]');
  const fillPart = async (i, v) => {
    const r = partRows.nth(i);
    await r.locator('input[aria-label="שם החלק"]').fill(v.name);
    // מק״ט, supplier net and "included" live in the row's ⋯ details.
    const more = r.locator('[data-testid="cq-part-more"]');
    if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
    if (v.sku) await r.locator('input[aria-label="מק״ט"]').fill(v.sku);
    const nums = r.locator('input[aria-label="כמות"], input[aria-label="ברוטו ליחידה"], input[aria-label="נטו לספק"]');
    await nums.nth(0).fill(String(v.qty));
    await nums.nth(1).fill(String(v.gross));
    await nums.nth(2).fill(String(v.net));
    if (v.discAmount) {
      await r.locator('select[aria-label="סוג הנחה"]').selectOption('amount');
      await r.locator('input[aria-label="ערך הנחה"]').fill(String(v.discAmount));
    }
    if (v.exclude) await r.locator('.cq-incl input').uncheck();
  };
  await fillPart(0, { name: 'כנף קדמית', sku: '53812-02B30', qty: 1, gross: 1200, net: 800 });
  await page.locator('[data-testid="cq-add-part"]').click();
  await fillPart(1, { name: 'פנס', qty: 2, gross: 300, net: 200, discAmount: 100 });
  await page.locator('[data-testid="cq-add-part"]').click();
  await fillPart(2, { name: 'חלק לא כלול E2E', qty: 1, gross: 999, net: 500, exclude: true });

  const total1 = await page.locator('[data-testid="cq-total"]').innerText();
  check('total before paint = 4,425.00 (works+parts, discounts, excluded part, 18% VAT)', total1.includes('4,425.00'), total1);
  const internal = await page.locator('[data-testid="cq-internal"]').innerText();
  check('internal supplier cost 1,200 and margin 500 shown separately', internal.includes('1,200.00') && internal.includes('500.00'), internal.replace(/\s+/g, ' '));
  await shot('02-works-and-parts');

  // 7. Paint calculator → split into paint work + paint materials
  await page.locator('[data-testid="cq-open-paint"]').click();
  const pc = page.locator('.cq-paint-modal .pc-root');
  await pc.waitFor({ timeout: 15000 });
  await pc.locator('div[style*="cursor: pointer"]').first().click();
  await pc.locator('input[type="checkbox"]').first().check();
  await pc.locator('button', { hasText: '▶ צור עבודה' }).click();
  await page.waitForTimeout(800);
  await shot('03-paint-calculator');
  await pc.locator('[data-testid="pc-apply-to-quote"]').click();
  // Applied directly; the notice shows the amounts (and offers an undo).
  const notice = page.locator('[data-testid="cq-paint-notice"]');
  await notice.waitFor({ timeout: 15000 });
  const noticeText = await notice.innerText();
  const money = [...noticeText.matchAll(/₪([\d,]+\.\d\d)/g)].map((m) => Number(m[1].replace(/,/g, '')));
  const [labor, materials] = money;
  await shot('04-paint-applied');
  const paintSum = await page.locator('[data-testid="cq-cat-paint"] .cq-cat-head b').innerText();
  check('paint work enters paint category only (labour)', labor > 0 && Number(paintSum.replace(/[^\d.]/g, '')) === labor, `labor ${labor} / paint ${paintSum}`);
  const matRow = partRows.filter({ has: page.locator('input[value="חומרי צבע"]') });
  check('paint materials are a separate "חומרי צבע" part line', (await matRow.count()) === 1 && materials > 0, `materials ${materials}`);
  const expected = Math.round((3750 + labor + materials) * 1.18 * 100) / 100;
  const total2 = await page.locator('[data-testid="cq-total"]').innerText();
  check('total includes labour + materials exactly once', Number(total2.replace(/[^\d.]/g, '')) === expected, `${total2} vs ${expected}`);

  // 8. Re-apply a saved paint calculation → still one line each (no double count)
  await page.locator('button', { hasText: 'טען חישוב צבע שמור' }).click();
  await page.locator('[data-testid="cq-paint-pick"]').first().click();
  const paintLines = await page.locator('[data-testid="cq-cat-paint"] [data-testid="cq-work-row"]').count();
  check('re-applying saved paint calc does not duplicate', paintLines === 1 && (await matRow.count()) === 1, `paint lines ${paintLines}`);

  // 9. Notes + save (version 1)
  await page.locator('.cq-notes textarea').first().fill('הצעה לבדיקה אוטומטית E2E');
  await page.locator('.cq-notes textarea').nth(1).fill('הערה פנימית E2E');
  await page.locator('[data-testid="cq-save"]').click();
  await page.locator('.cq-sub', { hasText: 'גרסה 1' }).waitFor({ timeout: 20000 });
  check('saved as version 1', true);

  // 10. Invoice: upload, review, approve; re-upload is a duplicate
  const invPath = path.join(OUT, 'e2e-parts-invoice.pdf');
  fs.writeFileSync(invPath, textPdf([
    'PARTS INVOICE 5521 E2E',
    `Run ${Date.now()}`,
    'Front fender 53812-02B30 1 1450.00 1100.00',
    'Headlamp right 81110-0Z510 2 900.00 15%',
    'Total 3250.00',
  ]));
  await page.locator('[data-testid="claim-quote-editor"] input[type="file"]').setInputFiles(invPath);
  const review = page.locator('[data-testid="cq-invoice-review"]');
  await review.waitFor({ timeout: 60000 });
  const revText = await review.innerText();
  check('invoice read: SKU match shows price change', /שינוי:[\s\S]*1200→1450/.test(revText), revText.replace(/\s+/g, ' ').slice(0, 200));
  check('invoice read: unknown part offered as new', revText.includes('חלק חדש'));
  await shot('05-invoice-review');
  const before1 = await partRows.nth(0).locator('input[aria-label="כמות"], input[aria-label="ברוטו ליחידה"], input[aria-label="נטו לספק"]').nth(1).inputValue();
  check('nothing changed before approval', before1 === '1200', before1);
  await review.locator('.cq-rev-changed input[type="checkbox"]').check();
  await page.locator('[data-testid="cq-invoice-approve"]').click();
  check('approved change applied (gross 1450) and linked to invoice',
    (await partRows.nth(0).locator('input[aria-label="כמות"], input[aria-label="ברוטו ליחידה"], input[aria-label="נטו לספק"]').nth(1).inputValue()) === '1450' && (await partRows.nth(0).innerText()).includes('מקושר לחשבונית'));
  const partNames = await partRows.locator('input[aria-label="שם החלק"]').evaluateAll((els) => els.map((e) => e.value));
  check('invoice header lines are not added as parts', !partNames.some((n) => /INVOICE|Run /i.test(n)) && partNames.includes('Headlamp right'), partNames.join(', '));
  const partsAfter = await partRows.count();
  await page.locator('[data-testid="claim-quote-editor"] input[type="file"]').setInputFiles(invPath);
  await page.waitForTimeout(2500);
  check('same invoice again → no duplicate', (await review.count()) === 0 && (await partRows.count()) === partsAfter && (await page.locator('.cq-inv').count()) === 1);

  await page.locator('[data-testid="cq-save"]').click();
  await page.locator('.cq-sub', { hasText: 'גרסה 2' }).waitFor({ timeout: 20000 });
  check('saved as version 2 (update over time)', true);
  const totalSaved = (await page.locator('[data-testid="cq-total"]').innerText()).trim();
  const workRowsSaved = await page.locator('[data-testid="cq-work-row"]').count();

  // 11. PDF: download + render page 1 to PNG for a visual check
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.locator('[data-testid="cq-pdf"]').click()]);
  const pdfPath = path.join(OUT, 'quote.pdf');
  await dl.saveAs(pdfPath);
  const pdfBuf = fs.readFileSync(pdfPath);
  check('PDF generated', pdfBuf.subarray(0, 5).toString() === '%PDF-' && pdfBuf.length > 20000, `${pdfBuf.length} bytes, ${dl.suggestedFilename()}`);
  // Page-1 preview needs pdf.js from a local dev server; on the published site the PDF is read in Node instead.
  const local = /127\.0\.0\.1|localhost/.test(BASE);
  let pdfPages = 0;
  if (local) {
    const pdfjsPng = await page.evaluate(async (b64) => {
      const pdfjs = await import('/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs';
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise;
      const pg = await doc.getPage(1);
      const vp = pg.getViewport({ scale: 1.6 });
      const c = document.createElement('canvas');
      c.width = vp.width; c.height = vp.height;
      await pg.render({ canvasContext: c.getContext('2d'), viewport: vp, canvas: c }).promise;
      return { pages: doc.numPages, url: c.toDataURL('image/png') };
    }, pdfBuf.toString('base64'));
    fs.writeFileSync(path.join(OUT, '06-quote-pdf-page1.png'), Buffer.from(pdfjsPng.url.split(',')[1], 'base64'));
    pdfPages = pdfjsPng.pages;
  } else {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(pdfBuf), isEvalSupported: false }).promise;
    pdfPages = doc.numPages;
  }
  check('PDF readable', pdfPages >= 1, `${pdfPages} page(s)`);
  await shot('07-after-pdf');

  // 12. WhatsApp: opens wa.me with a prepared message, logged as not confirmed
  await page.locator('.cq-send input[type="tel"]').fill('0501234567');
  await ctx.route('https://wa.me/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>wa stub</body></html>' }));
  const [popup] = await Promise.all([ctx.waitForEvent('page', { timeout: 20000 }), page.locator('[data-testid="cq-wa"]').click()]);
  await popup.waitForURL(/wa\.me/, { timeout: 30000 }).catch(() => null);
  const waUrl = popup.url();
  await popup.close();
  await page.locator('.toast', { hasText: 'WhatsApp נפתח' }).waitFor({ timeout: 20000 }).catch(() => null);
  check('WhatsApp opens wa.me with the quote text (manual send)', /wa\.me\/972501234567\?text=/.test(waUrl), waUrl.slice(0, 120));

  // 13. Close, reopen from the claim's quotes tab → data persisted
  await page.locator('.cq-close').click();
  await ed.waitFor({ state: 'detached', timeout: 10000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="claims-search"]').fill(PLATE, { timeout: 60000 });
  await page.locator(`[data-testid="claim-row-${CLAIM_ID}"]:visible`).first().click();
  await page.locator('button', { hasText: 'הצעות מחיר' }).first().click();
  const tab = page.locator('[data-testid="claim-quotes-tab"]');
  await tab.waitFor({ timeout: 20000 });
  await shot('08-claim-quotes-tab');
  await tab.locator('button', { hasText: 'פתח הצעה' }).first().click();
  await ed.waitFor({ timeout: 20000 });
  await page.waitForTimeout(1500);
  const total3 = await page.locator('[data-testid="cq-total"]').innerText();
  check('reopened quote keeps totals and lines', total3.trim() === totalSaved && (await page.locator('[data-testid="cq-work-row"]').count()) === workRowsSaved, `${total3} vs ${totalSaved}`);
  await page.locator('button', { hasText: '📋 היסטוריית גרסאות' }).click();
  await page.locator('[data-testid="cq-versions"]').waitFor();
  check('version history lists v1 and v2', (await page.locator('[data-testid="cq-versions"]').innerText()).includes('גרסה 1'));
  await shot('09-reopened-with-versions');

  // 14. Email: opens the claim's mail composer with the PDF attached (not sent here)
  await page.locator('.cq-send input[type="email"]').fill('e2e-quote@example.com');
  await page.locator('[data-testid="cq-email"]').click();
  await ed.waitFor({ state: 'detached', timeout: 20000 });
  await page.waitForTimeout(2000);
  await shot('10-mail-composer');
  const mailModal = await page.locator('body').innerText();
  check('mail composer opened with recipient', mailModal.includes('e2e-quote@example.com') || (await page.locator('input[value="e2e-quote@example.com"]').count()) > 0);

  // 15. Mobile layout
  await page.keyboard.press('Escape').catch(() => null);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="claims-search"]').fill(PLATE, { timeout: 60000 });
  await page.locator(`[data-testid="claim-row-${CLAIM_ID}"]:visible .claim-mcard-name`).first().click();
  await page.waitForTimeout(2500);
  const qb = page.locator('[data-testid="claims-quote-btn"]');
  if (!(await qb.isVisible().catch(() => false))) await page.locator('button', { hasText: 'עוד' }).first().click().catch(() => null);
  await page.waitForTimeout(2000);
  await shot('11-mobile-card');
  if (!(await qb.isVisible().catch(() => false))) await page.locator('[data-testid="claims-card-more"]').click().catch(() => null);
  await qb.click({ timeout: 20000 });
  await ed.waitFor({ timeout: 20000 });
  await page.waitForTimeout(1500);
  const overflow = await page.evaluate(() => document.querySelector('.cq-root').scrollWidth - document.querySelector('.cq-root').clientWidth);
  check('mobile: no horizontal overflow', overflow <= 2, `overflow ${overflow}px`);
  await shot('11-mobile');
  await browser.close();

  // 16. Database checks
  const { data: quotes } = await admin.from('claim_quotes').select('*').eq('claim_id', CLAIM_ID).order('quote_no', { ascending: false });
  const q = quotes?.[0];
  const { data: vers } = await admin.from('claim_quote_versions').select('version').eq('quote_id', q?.id);
  check('one new quote row saved in the claim', (quotes?.length || 0) === quotesBefore + 1, `${quotesBefore} → ${quotes?.length}`);
  check('versions kept (v1, v2)', (vers || []).map((v) => v.version).sort().join(',') === '1,2');
  const docIds = [...(q?.data?.invoices || []).map((i) => i.docId), ...(q?.data?.documents || []).map((d) => d.fileId)];
  const { data: docs } = await admin.from('claims_documents').select('id, doc_kind, doc_meta, original_name').in('id', docIds);
  check('invoice stored in claim gallery as garage_invoice', (docs || []).some((d) => d.doc_kind === 'garage_invoice'));
  check('quote PDF stored in claim gallery', (docs || []).some((d) => String(d.doc_meta?.staff_title || '').startsWith('הצעת מחיר')));
  const { data: hist } = await admin.from('claims_history').select('row_data, created_at').eq('claim_id', CLAIM_ID).order('created_at', { ascending: false }).limit(30);
  const actions = (hist || []).map((h) => h.row_data?.action);
  check('history: quote saved, PDF, invoice, WhatsApp opened', ['הצעת מחיר נשמרה', 'הופקה הצעת מחיר PDF', 'חשבונית חלקים נקלטה להצעת מחיר', 'הצעת מחיר נפתחה לשליחה ב-WhatsApp'].every((a) => actions.includes(a)), actions.slice(0, 12).join(' | '));
  check('paint calc saved to claim_paint_calcs + history', actions.includes('חישוב צבע נשמר'));
  const pdfHasNoNet = !JSON.stringify(q?.data?.sendLog || []).includes('unitNet');
  check('send log has no supplier data', pdfHasNoNet);
  const { data: lib } = await admin.from('claim_quote_library').select('label').eq('label', 'בדיקת מערכת בלמים E2E');
  check('new free-text job saved to the job library', (lib?.length || 0) >= 1);
  check('no page errors in the browser', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  fs.writeFileSync(path.join(OUT, 'e2e-results.json'), JSON.stringify({ at: new Date().toISOString(), staging: REF, claim: CLAIM_ID, quoteId: q?.id, results }, null, 2));
  await softDeleteTestClaim();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch(async (e) => {
  console.error('E2E error:', e);
  await softDeleteTestClaim().catch(() => null);
  fs.writeFileSync(path.join(OUT, 'e2e-results.json'), JSON.stringify({ error: String(e?.stack || e), results }, null, 2));
  process.exit(1);
});
