/**
 * Full browser E2E for the claim quote system on STAGING only (never Production):
 * work areas → categories → items and reuse, parts categories with fixed חומרים, paint calculator
 * auto-sync (save from the claim card, update, no double charge), supplier invoices uploaded to the
 * claim gallery and synced into the quote (claim check, duplicates), totals / discounts / VAT,
 * save + reopen, PDF, the reports section (purchase cost vs sale), desktop and phone.
 *   node scripts/e2e-claim-quote-full-staging.mjs [baseUrl]
 * Creates two test claims (company E2E-QUOTE-TEST) and soft-deletes them at the end.
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
const RUN = Date.now().toString().slice(-6);
const COMPANY = 'E2E-QUOTE-TEST';
const A = { id: `DAL-E2E-QA${RUN}`, plate: `77${RUN}`, claimNum: `90${RUN}`, name: `לקוח א׳ הצעה E2E ${RUN}` };
const B = { id: `DAL-E2E-QB${RUN}`, plate: `55${RUN}`, claimNum: `80${RUN}`, name: `לקוח ב׳ הצעה E2E ${RUN}` };
const OUT = path.join(process.cwd(), 'docs/audit-reports/claim-quote-full-2026-10-26');
fs.mkdirSync(OUT, { recursive: true });

if (REF === PROD_REF) throw new Error('refused production');
if (fs.readFileSync('supabase/.temp/project-ref', 'utf8').trim() !== REF) throw new Error('linked project is not staging');

const results = [];
const check = (step, name, ok, detail = '') => {
  results.push({ step, name, ok: !!ok, detail: String(detail).slice(0, 400) });
  console.log(`${ok ? 'PASS' : 'FAIL'} [${step}] ${name}${detail ? ` — ${String(detail).slice(0, 200)}` : ''}`);
};
const money = (s) => Number(String(s).replace(/[^\d.-]/g, '')) || 0;
const r2 = (n) => Math.round(n * 100) / 100;

let admin = null;
async function softDelete() {
  if (!admin) return;
  for (const c of [A, B]) {
    const { data } = await admin.from('claims_records').select('row_data').eq('id', c.id).maybeSingle();
    if (data) await admin.from('claims_records').update({ row_data: { ...data.row_data, deletedAt: new Date().toISOString() } }).eq('id', c.id);
  }
  console.log('test claims soft-deleted');
}

/** One-page PDF with a real text layer (Helvetica). */
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
  admin = createClient(SB_URL, serviceKey);
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'orin1607@gmail.com' });
  const { data: auth, error: authErr } = await createClient(SB_URL, anonKey).auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  if (authErr) throw authErr;

  const stamp = new Date().toLocaleString('he-IL');
  for (const c of [A, B]) {
    const rd = { id: c.id, plate: c.plate, status: 'חדש', clientName: c.name, clientPhone: '0501234567', clientEmail: 'e2e@example.com', carMake: 'מאזדה', carModel: '3', claimNum: c.claimNum, insCompany: 'מגדל', company_name: COMPANY, createdAt: stamp, updatedAt: stamp };
    const { error } = await admin.from('claims_records').insert({ id: c.id, plate: c.plate, client_name: c.name, status: 'חדש', company_name: COMPANY, row_data: rd });
    if (error) throw error;
  }
  console.log(`test claims ${A.id}, ${B.id} created`);

  const invA = path.join(OUT, 'supplier-invoice-claim-A.pdf');
  fs.writeFileSync(invA, textPdf([`SUPPLIER INVOICE ${RUN}`, `Vehicle ${A.plate} Claim ${A.claimNum}`, 'Front fender 53812-02B30 1 1450.00 1100.00', 'Headlamp right 81110-0Z510 2 900.00 15%', 'Total 3250.00']));
  const invB = path.join(OUT, 'supplier-invoice-names-claim-B.pdf');
  fs.writeFileSync(invB, textPdf([`SUPPLIER INVOICE B ${RUN}`, `Vehicle ${B.plate}`, 'Rear bumper 52159-0A900 1 2100.00 1600.00', 'Total 2100.00']));

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'he-IL', acceptDownloads: true });
  await ctx.addInitScript(({ s, u }) => localStorage.setItem(`sb-${s}-auth-token`, JSON.stringify(u)), { s: REF, u: auth.session });
  await ctx.route('https://wa.me/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: 'wa stub' }));
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e.message)));
  page.on('dialog', (d) => d.accept());
  const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
  const ed = page.locator('[data-testid="claim-quote-editor"]');
  const pickerSet = async (label) => {
    await page.locator('[data-testid="cq-picker-input"]').fill(label);
    await page.locator('[data-testid="cq-picker-ok"]').click();
  };

  const openClaim = async (c) => {
    await page.goto(`${BASE}/claims`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.locator('[data-testid="claims-search"]').fill(c.plate, { timeout: 60000 });
    await page.locator(`[data-testid="claim-row-${c.id}"]:visible`).first().click({ timeout: 30000 });
    await page.waitForTimeout(2500);
  };
  const cardAction = async (testId) => {
    const b = page.locator(`[data-testid="${testId}"]`);
    if (!(await b.isVisible().catch(() => false))) await page.locator('[data-testid="claims-card-more"]').click().catch(() => null);
    await b.click({ timeout: 20000 });
  };
  const savePaintFromCard = async () => {
    await cardAction('claims-paint-calc-btn');
    const pc = page.locator('.pc-modal-content .pc-root').first();
    await pc.waitFor({ timeout: 20000 });
    // The calculator loads the claim's last draft asynchronously; wait for it before adding a row.
    await page.waitForTimeout(3000);
    await pc.locator('div[style*="cursor: pointer"]').first().click();
    await pc.locator('input[type="checkbox"]').first().check();
    await pc.locator('button', { hasText: '▶ צור עבודה' }).click();
    await page.waitForTimeout(600);
    await pc.locator('button', { hasText: 'שמור חישוב רשמי בתיק' }).click();
    await pc.locator('button', { hasText: 'נשמר בהצלחה' }).waitFor({ timeout: 20000 });
    await pc.locator('.pc-close-btn').click();
    await page.waitForTimeout(1500);
  };

  // ── 1. Open the claim; save a paint calculation from the claim card; upload two supplier invoices to the gallery
  await openClaim(A);
  await savePaintFromCard();
  const { data: pc1 } = await admin.from('claim_paint_calcs').select('id, version, calc_data').eq('claim_id', A.id).eq('is_draft', false).order('version', { ascending: false }).limit(1).single();
  check(1, 'paint calculation saved from the claim card', !!pc1, pc1 ? `v${pc1.version} labour ${pc1.calc_data.laborCost} materials ${pc1.calc_data.materialsCost}` : '');
  const L1 = r2(pc1.calc_data.laborCost);
  const M1 = r2(pc1.calc_data.materialsCost);

  await page.locator('[data-testid="claims-tab-group-docs"]').click();
  await page.locator('[data-testid="claims-tab-sub-invoice"]').click();
  await page.locator('[data-testid="invoice-drop-input"]').setInputFiles([invA, invB]);
  await page.locator('[data-testid="invoice-drop-save"]').click();
  await page.waitForTimeout(6000);
  const { data: galleryDocs } = await admin.from('claims_documents').select('id, doc_kind, original_name').eq('claim_id', A.id);
  check(1, 'two supplier invoices uploaded to the claim gallery (invoice tab)', (galleryDocs || []).filter((d) => d.doc_kind === 'garage_invoice').length === 2, (galleryDocs || []).map((d) => `${d.original_name}:${d.doc_kind}`).join(', '));
  await shot('01-claim-gallery-invoices');

  // ── 2. Open the quote: claim details and automatic paint fill
  await cardAction('claims-quote-btn');
  await ed.waitFor({ timeout: 20000 });
  await page.waitForTimeout(1500);
  const info = await page.locator('[data-testid="cq-claim-info"]').innerText();
  check(2, 'claim details pulled into the quote', [A.name, A.plate, 'מאזדה', A.claimNum, 'מגדל'].every((t) => info.includes(t)), info.replace(/\s+/g, ' '));
  const notice = page.locator('[data-testid="cq-paint-notice"]');
  check(2, 'paint works filled automatically from the saved paint calculation', await notice.isVisible(), (await notice.innerText().catch(() => '')).replace(/\s+/g, ' '));
  const paintHead = await page.locator('[data-testid="cq-cat-paint"] .cq-cat-head b').first().innerText();
  check(2, 'paint labour = calculator labour', money(paintHead) === L1, `${paintHead} vs ${L1}`);
  const matRows = page.locator('[data-testid="cq-pgroup-חומרים"] [data-testid="cq-part-row"]');
  check(2, 'paint materials in the fixed חומרים category, separate from labour', (await matRows.count()) === 1 && money(await matRows.first().locator('.cq-price b').innerText()) === M1);
  check(2, 'fixed areas shown: פחחות, צבע, מכונאות', (await page.locator('[data-testid="cq-cat-body"]').count()) && (await page.locator('[data-testid="cq-cat-paint"]').count()) && (await page.locator('[data-testid="cq-cat-mech"]').count()));
  check(2, 'fixed parts categories חלקים and חומרים shown', (await page.locator('[data-testid="cq-pgroup-חלקים"]').count()) === 1 && (await page.locator('[data-testid="cq-pgroup-חומרים"]').count()) === 1);
  await shot('02-quote-opened-paint-auto');

  // ── 3. Add a work area, a category in it, and an item; items in fixed areas
  const DOM = `עבודות חשמל E2E ${RUN}`;
  const GRP = `חיווט E2E ${RUN}`;
  const ITEM = `החלפת צמת חוטים E2E ${RUN}`;
  await page.locator('[data-testid="cq-add-domain"]').click();
  await pickerSet(DOM);
  const dom = page.locator(`[data-testid="cq-cat-custom:${DOM}"]`);
  check(3, 'new work area added', (await dom.count()) === 1);
  await dom.locator('[data-testid="cq-add-group"]').click();
  await pickerSet(GRP);
  const grp = dom.locator(`[data-testid="cq-group-custom:${DOM}-${GRP}"]`);
  check(3, 'category added inside the new area', (await grp.count()) === 1);
  await grp.locator('[data-testid="cq-add-item"]').click();
  await pickerSet(ITEM);
  const itemRow = grp.locator('[data-testid="cq-work-row"]').first();
  await itemRow.locator('button', { hasText: 'גלובלי' }).click();
  await itemRow.locator('input[aria-label="מחיר גלובלי"]').fill('600');
  check(3, 'item added inside the category with a global price', money(await itemRow.locator('.cq-price b').innerText()) === 600);

  const body = page.locator('[data-testid="cq-cat-body"]');
  await body.locator('[data-testid="cq-add-item"]').first().click();
  await page.locator('[data-testid="cq-picker"] button.cq-chip', { hasText: 'החלפת כנף קדמית שמאל' }).click();
  await page.locator('[data-testid="cq-picker-ok"]').click();
  await body.locator('[data-testid="cq-work-row"]').first().locator('input[aria-label="שעות"]').fill('2.5');
  check(3, 'fixed body item from the saved list, priced by hours (2.5 × 380 = 950)', money(await body.locator('[data-testid="cq-work-row"] .cq-price b').first().innerText()) === 950);

  const mech = page.locator('[data-testid="cq-cat-mech"]');
  await mech.locator('[data-testid="cq-add-item"]').first().click();
  await pickerSet(`בדיקת בלמים E2E ${RUN}`);
  const mrow = mech.locator('[data-testid="cq-work-row"]').first();
  await mrow.locator('button', { hasText: 'גלובלי' }).click();
  await mrow.locator('input[aria-label="מחיר גלובלי"]').fill('1000');
  await mrow.locator('select[aria-label="סוג הנחה"]').selectOption('percent');
  await mrow.locator('input[aria-label="ערך הנחה"]').fill('10');
  check(3, 'mechanics item with 10% discount (1000 → 900)', money(await mrow.locator('.cq-price b').innerText()) === 900);
  await shot('03-areas-categories-items');

  // ── 4. Parts and materials: new parts category with items (description, qty, price)
  const parts = page.locator('[data-testid="cq-pgroup-חלקים"]');
  const p0 = parts.locator('[data-testid="cq-part-row"]').first();
  const fillPart = async (row, v) => {
    await row.locator('input[aria-label="שם החלק"]').fill(v.name);
    if (v.sku) await row.locator('input[aria-label="מק״ט"]').fill(v.sku);
    if (v.desc) await row.locator('input[aria-label="תיאור"]').fill(v.desc);
    const f = row.locator('.cq-f input');
    await f.nth(0).fill(String(v.qty));
    await f.nth(1).fill(String(v.gross));
    await f.nth(2).fill(String(v.net));
    if (v.disc) { await row.locator('select[aria-label="סוג הנחה"]').selectOption('amount'); await row.locator('input[aria-label="ערך הנחה"]').fill(String(v.disc)); }
    if (v.exclude) await row.locator('.cq-incl input').uncheck();
  };
  await fillPart(p0, { name: 'כנף קדמית', sku: '53812-02B30', qty: 1, gross: 1200, net: 800 });
  await parts.locator('[data-testid="cq-add-part-item"]').click();
  await fillPart(parts.locator('[data-testid="cq-part-row"]').nth(1), { name: 'פנס', qty: 2, gross: 300, net: 200, disc: 100 });
  await parts.locator('[data-testid="cq-add-part-item"]').click();
  await fillPart(parts.locator('[data-testid="cq-part-row"]').nth(2), { name: 'חלק לא כלול E2E', qty: 1, gross: 999, net: 500, exclude: true });
  const PG = `צמיגים E2E ${RUN}`;
  await page.locator('[data-testid="cq-add-part-group"]').click();
  await pickerSet(PG);
  const tyres = page.locator(`[data-testid="cq-pgroup-${PG}"]`);
  check(4, 'new parts category added', (await tyres.count()) === 1);
  await tyres.locator('[data-testid="cq-add-part-item"]').click();
  await fillPart(tyres.locator('[data-testid="cq-part-row"]').first(), { name: 'צמיג', qty: 4, gross: 400, net: 300, desc: '205/55R16' });
  check(4, 'item in the new category: 4 × 400 = 1,600', money(await tyres.locator('.cq-cat-head b').innerText()) === 1600);
  const groupsOrder = await page.locator('[data-testid^="cq-pgroup-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  check(4, 'parts categories order: חלקים … חומרים last', groupsOrder[0] === 'cq-pgroup-חלקים' && groupsOrder[groupsOrder.length - 1] === 'cq-pgroup-חומרים', groupsOrder.join(', '));
  await shot('04-parts-categories');

  // ── 6. Supplier invoices uploaded to the claim → sync into the quote
  const pending = page.locator('[data-testid="cq-pending-invoices"]');
  check(6, 'quote lists the 2 invoices uploaded to the claim, not yet synced', (await pending.locator('.cq-inv').count()) === 2);
  await pending.locator('.cq-inv', { hasText: 'claim-A' }).locator('[data-testid="cq-sync-claim-invoice"]').click();
  const review = page.locator('[data-testid="cq-invoice-review"]');
  await review.waitFor({ timeout: 60000 });
  const chk = await review.locator('[data-testid="cq-claim-check"]').innerText();
  check(6, 'invoice A recognised as belonging to this claim', chk.includes('✓'), chk);
  const revText = await review.innerText();
  check(6, 'existing part matched by SKU, price change shown (1200→1450)', /1200→1450/.test(revText));
  check(6, 'unknown part offered as new', revText.includes('חלק חדש'));
  check(6, 'nothing changed before approval', (await p0.locator('.cq-f input').nth(1).inputValue()) === '1200');
  await review.locator('.cq-rev-changed input[type="checkbox"]').check();
  await shot('05-invoice-review-match');
  await page.locator('[data-testid="cq-invoice-approve"]').click();
  check(6, 'approved: price updated to 1450, supplier net 1100 kept separately, linked to invoice',
    (await p0.locator('.cq-f input').nth(1).inputValue()) === '1450' && (await p0.locator('.cq-f input').nth(2).inputValue()) === '1100' && (await p0.innerText()).includes('מקושר לחשבונית'));
  const names = await page.locator('[data-testid="cq-part-row"] input[aria-label="שם החלק"]').evaluateAll((els) => els.map((e) => e.value));
  check(6, 'new invoice part added once; header lines not added', names.filter((n) => n === 'Headlamp right').length === 1 && !names.some((n) => /INVOICE|Vehicle|Total/i.test(n)), names.join(' | '));

  await pending.locator('.cq-inv', { hasText: 'claim-B' }).locator('[data-testid="cq-sync-claim-invoice"]').click();
  await review.waitFor({ timeout: 60000 });
  const chkB = await review.locator('[data-testid="cq-claim-check"]').innerText();
  check(6, 'invoice naming another claim is flagged with that claim', chkB.includes('⚠') && chkB.includes(B.plate), chkB);
  const preChecked = await review.locator('input[type="checkbox"][aria-label="אשר שורה"]:checked').count();
  check(6, 'nothing pre-selected from the other claim\'s invoice', preChecked === 0, `${preChecked} pre-checked`);
  await shot('06-invoice-other-claim-flag');
  const before = names.length;
  await review.locator('button', { hasText: 'סגור בלי לשנות' }).click();
  check(6, 'closing without approval changes nothing', (await page.locator('[data-testid="cq-part-row"]').count()) === before);

  await page.locator('[data-testid="claim-quote-editor"] input[type="file"]').setInputFiles(invA);
  await page.waitForTimeout(2500);
  check(6, 'same invoice uploaded again → no duplicate', (await review.count()) === 0 && (await page.locator('.cq-inv').filter({ hasNotText: 'סנכרן' }).count()) === 2 && (await page.locator('[data-testid="cq-part-row"]').count()) === before);

  // ── 7. Prices, discounts, VAT, totals
  const works = 950 + L1 + 900 + 600;
  const partsSale = 1450 + 500 + 1800 + 1600 + M1;
  const expTotal = r2(r2(works + partsSale) * 1.18);
  const total1 = money(await page.locator('[data-testid="cq-total"]').innerText());
  check(7, 'total incl. 18% VAT matches all areas, parts, discounts and the excluded part', total1 === expTotal, `${total1} vs ${expTotal}`);
  const sum = await page.locator('[data-testid="cq-summary"]').innerText();
  check(7, 'summary shows other works (custom area) and customer discounts', sum.includes('600.00') && sum.includes('-₪200.00'), sum.replace(/\s+/g, ' '));
  const internal = await page.locator('[data-testid="cq-internal"]').innerText();
  const expCost = 1100 + 400 + 1530 + 1200;
  check(7, 'internal: supplier purchase cost shown separately from sale', internal.includes(expCost.toLocaleString('en-US') + '.00'), internal.replace(/\s+/g, ' '));
  await shot('07-totals');

  // ── 8. Save and reopen
  await page.locator('[data-testid="cq-save"]').click();
  await page.locator('.cq-sub', { hasText: 'גרסה 1' }).waitFor({ timeout: 20000 });
  await page.locator('.cq-close').click();
  await openClaim(A);
  await cardAction('claims-quote-btn');
  await ed.waitFor({ timeout: 20000 });
  await page.waitForTimeout(1500);
  check(8, 'reopened: same total', money(await page.locator('[data-testid="cq-total"]').innerText()) === expTotal);
  check(8, 'reopened: custom area, its category and item kept', (await page.locator(`[data-testid="cq-cat-custom:${DOM}"] [data-testid="cq-group-custom:${DOM}-${GRP}"] [data-testid="cq-work-row"]`).count()) === 1);
  check(8, 'reopened: parts category kept', (await page.locator(`[data-testid="cq-pgroup-${PG}"] [data-testid="cq-part-row"]`).count()) === 1);
  check(8, 'reopened: no paint notice (already in sync)', (await notice.count()) === 0);

  // ── 3b. Reuse in a future quote: area, category, item and parts category are offered
  await page.locator('.cq-head button', { hasText: '+ הצעה חדשה' }).click();
  await page.waitForTimeout(800);
  check(3, 'new quote also gets paint works automatically', await notice.isVisible());
  await page.locator('[data-testid="cq-add-domain"]').click();
  const chipDom = page.locator('[data-testid="cq-picker"] button.cq-chip', { hasText: DOM });
  check(3, 'saved work area offered in the next quote', (await chipDom.count()) === 1);
  await chipDom.click();
  await page.locator('[data-testid="cq-picker-ok"]').click();
  await page.locator(`[data-testid="cq-cat-custom:${DOM}"] [data-testid="cq-add-group"]`).click();
  const chipGrp = page.locator('[data-testid="cq-picker"] button.cq-chip', { hasText: GRP });
  check(3, 'saved category offered in the next quote', (await chipGrp.count()) === 1);
  await chipGrp.click();
  await page.locator('[data-testid="cq-picker-ok"]').click();
  await page.locator(`[data-testid="cq-group-custom:${DOM}-${GRP}"] [data-testid="cq-add-item"]`).click();
  check(3, 'saved item offered in the next quote', (await page.locator('[data-testid="cq-picker"] button.cq-chip', { hasText: ITEM }).count()) === 1);
  await page.locator('[data-testid="cq-picker"] button', { hasText: 'ביטול' }).click();
  await page.locator('[data-testid="cq-add-part-group"]').click();
  check(3, 'saved parts category offered in the next quote', (await page.locator('[data-testid="cq-picker"] button.cq-chip', { hasText: PG }).count()) === 1);
  await page.locator('[data-testid="cq-picker"] button', { hasText: 'ביטול' }).click();
  await shot('08-reuse-in-new-quote');
  await page.locator('.cq-close').click(); // discards the unsaved second quote (dialog accepted)

  // ── 5. Paint calculator changes → quote updates automatically, no double charge
  await openClaim(A);
  await savePaintFromCard();
  const { data: pc2 } = await admin.from('claim_paint_calcs').select('id, version, calc_data').eq('claim_id', A.id).eq('is_draft', false).order('version', { ascending: false }).limit(1).single();
  const L2 = r2(pc2.calc_data.laborCost);
  const M2 = r2(pc2.calc_data.materialsCost);
  check(5, 'second paint calculation saved (changed amounts)', pc2.version === 2 && (L2 !== L1 || M2 !== M1), `v${pc2.version}: ${L1}→${L2}, ${M1}→${M2}`);
  await cardAction('claims-quote-btn');
  await ed.waitFor({ timeout: 20000 });
  await page.waitForTimeout(1500);
  const n2 = await notice.innerText().catch(() => '');
  check(5, 'quote updated automatically with old → new amounts', n2.includes('עודכן אוטומטית') && n2.includes('גרסה 2'), n2.replace(/\s+/g, ' '));
  check(5, 'still one paint line and one paint-materials line (no double charge)',
    (await page.locator('[data-testid="cq-cat-paint"] [data-testid="cq-work-row"]').count()) === 1 && (await matRows.count()) === 1);
  const expTotal2 = r2(r2(950 + L2 + 900 + 600 + 1450 + 500 + 1800 + 1600 + M2) * 1.18);
  check(5, 'total reflects the new paint amounts only once', money(await page.locator('[data-testid="cq-total"]').innerText()) === expTotal2, `${expTotal2}`);
  await shot('09-paint-auto-update');
  await page.locator('[data-testid="cq-save"]').click();
  await page.locator('.cq-sub', { hasText: 'גרסה 2' }).waitFor({ timeout: 20000 });

  // ── 9. PDF
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.locator('[data-testid="cq-pdf"]').click()]);
  const pdfPath = path.join(OUT, 'quote.pdf');
  await dl.saveAs(pdfPath);
  const pdfBuf = fs.readFileSync(pdfPath);
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdfBuf), isEvalSupported: false }).promise;
  check(9, 'PDF generated and readable', pdfBuf.subarray(0, 5).toString() === '%PDF-' && doc.numPages >= 1, `${doc.numPages} page(s), ${pdfBuf.length} bytes`);
  if (/127\.0\.0\.1|localhost/.test(BASE)) {
    for (let i = 1; i <= doc.numPages; i += 1) {
      const png = await page.evaluate(async ({ b64, n }) => {
        const m = await import('/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
        m.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs';
        const d = await m.getDocument({ data: Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) }).promise;
        const pg = await d.getPage(n);
        const vp = pg.getViewport({ scale: 1.5 });
        const c = document.createElement('canvas');
        c.width = vp.width; c.height = vp.height;
        await pg.render({ canvasContext: c.getContext('2d'), viewport: vp, canvas: c }).promise;
        return c.toDataURL('image/png');
      }, { b64: pdfBuf.toString('base64'), n: i });
      fs.writeFileSync(path.join(OUT, `10-pdf-page${i}.png`), Buffer.from(png.split(',')[1], 'base64'));
    }
  }
  const { data: qRow } = await admin.from('claim_quotes').select('*').eq('claim_id', A.id).single();
  const pdfDocId = qRow?.data?.documents?.[0]?.fileId;
  const { data: pdfDoc } = await admin.from('claims_documents').select('doc_meta').eq('id', pdfDocId || '-').maybeSingle();
  check(9, 'PDF saved in the claim gallery', String(pdfDoc?.doc_meta?.staff_title || '').startsWith('הצעת מחיר'), pdfDoc?.doc_meta?.staff_title || '');
  await page.locator('.cq-close').click();

  // ── 10. Reports: invoices and prices per claim and customer
  await page.goto(`${BASE}/claims?view=reports`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const rep = page.locator('[data-testid="claim-quotes-report"]');
  await rep.waitFor({ timeout: 60000 });
  await rep.locator('[data-testid="claim-quotes-report-search"]').fill(A.plate);
  const repRow = rep.locator(`[data-testid="claim-quotes-report-row-${A.id}"]`);
  await repRow.waitFor({ timeout: 20000 });
  const head = await repRow.locator('.cqr-row-head').innerText();
  const saleExp = r2(1450 + 500 + 1800 + 1600 + M2);
  check(10, 'report row for the claim and customer with purchase cost, sale and difference',
    head.includes(A.name) && head.includes(A.plate) && money(head.match(/קנייה[^\n]*/)?.[0]) === expCost && money(head.match(/מכירה[^\n]*/)?.[0]) === saleExp, head.replace(/\s+/g, ' '));
  check(10, 'report shows the invoices linked to the claim, each once', head.includes('2 חשבוניות'));
  check(10, 'no row for the other claim (no quote, invoice not mixed in)', (await rep.locator(`[data-testid="claim-quotes-report-row-${B.id}"]`).count()) === 0);
  await repRow.locator('.cqr-row-head').click();
  const detail = await repRow.locator('.cqr-detail').innerText();
  const pillTexts = await repRow.locator('.cqr-inv').allInnerTexts();
  check(10, 'report flags the invoice that names another claim', pillTexts.some((t) => t.includes('claim-B') && t.includes('⚠')) && pillTexts.some((t) => t.includes('claim-A') && t.includes('✓')), pillTexts.join(' | '));
  check(10, 'report detail: parts, quantities, supplier and sale prices', ['כנף קדמית', 'Headlamp right', 'צמיג', '1,100.00', '1,450.00', 'e2e', '(לא כלול)'].filter((t) => t !== 'e2e').every((t) => detail.includes(t)), detail.replace(/\s+/g, ' ').slice(0, 300));
  await repRow.scrollIntoViewIfNeeded();
  await shot('11-report');

  // ── 11. Phone
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/claims?view=reports`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await rep.waitFor({ timeout: 60000 });
  const repOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(11, 'phone: report has no horizontal page overflow', repOverflow <= 2, `${repOverflow}px`);
  await shot('12-phone-report');
  await page.goto(`${BASE}/claims`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('[data-testid="claims-search"]').fill(A.plate, { timeout: 60000 });
  await page.locator(`[data-testid="claim-row-${A.id}"]:visible .claim-mcard-name`).first().click();
  await page.waitForTimeout(2500);
  await cardAction('claims-quote-btn');
  await ed.waitFor({ timeout: 20000 });
  await page.waitForTimeout(1500);
  const qOverflow = await page.evaluate(() => { const r = document.querySelector('.cq-root'); return r.scrollWidth - r.clientWidth; });
  check(11, 'phone: quote screen has no horizontal overflow', qOverflow <= 2, `${qOverflow}px`);
  await page.locator('[data-testid="cq-add-domain"]').click();
  const pickerBox = await page.locator('[data-testid="cq-picker"]').boundingBox();
  check(11, 'phone: add-area dialog opens within the screen', !!pickerBox && pickerBox.x >= 0 && pickerBox.x + pickerBox.width <= 391, JSON.stringify(pickerBox));
  await page.locator('[data-testid="cq-picker"] button', { hasText: 'ביטול' }).click();
  check(11, 'phone: totals visible', money(await page.locator('[data-testid="cq-total"]').innerText()) === expTotal2);
  await shot('13-phone-quote');
  await browser.close();

  // ── DB checks
  const { data: vers } = await admin.from('claim_quote_versions').select('version').eq('quote_id', qRow.id);
  check(8, 'versions kept in the database (1, 2)', (vers || []).map((v) => v.version).sort().join(',') === '1,2');
  const { data: lib } = await admin.from('claim_quote_library').select('kind, category, label, company_name').eq('company_name', COMPANY);
  const has = (kind, label) => (lib || []).some((l) => l.kind === kind && l.label === label);
  check(3, 'library saved: area, category, item, parts category (under the shop only)', has('domain', DOM) && has('work_group', GRP) && has('work', ITEM) && has('part_group', PG), (lib || []).map((l) => `${l.kind}:${l.label}`).join(', ').slice(0, 300));
  const { count: leaked } = await admin.from('claim_quote_library').select('id', { count: 'exact', head: true }).eq('company_name', '').like('label', `%${RUN}%`);
  check(3, 'test library items did not leak into the shared library', (leaked || 0) === 0);
  const { data: hist } = await admin.from('claims_history').select('row_data').eq('claim_id', A.id);
  const acts = (hist || []).map((h) => h.row_data?.action);
  check(6, 'history: invoice synced from the claim, quote saved, PDF, paint calc', ['חשבונית ספק מהתיק סונכרנה להצעת מחיר', 'הצעת מחיר נשמרה', 'הופקה הצעת מחיר PDF', 'חישוב צבע נשמר'].every((a) => acts.includes(a)));
  const invInQuote = (qRow.data.invoices || []).map((i) => i.docId);
  check(6, 'quote stores each invoice once', new Set(invInQuote).size === invInQuote.length && invInQuote.length === 2);
  check(0, 'no JavaScript errors on the pages', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

  await softDelete();
  fs.writeFileSync(path.join(OUT, 'e2e-results.json'), JSON.stringify({ at: new Date().toISOString(), base: BASE, staging: REF, claims: [A.id, B.id], results }, null, 2));
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch(async (e) => {
  console.error('E2E error:', e);
  await softDelete().catch(() => null);
  fs.writeFileSync(path.join(OUT, 'e2e-results.json'), JSON.stringify({ error: String(e?.stack || e), results }, null, 2));
  process.exit(1);
});
