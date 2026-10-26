/**
 * The simple quote table, typed key by key (STAGING only, never Production):
 * hour rate at the top drives every hours line; each work row is פירוט | שעות | מחיר לפני הנחה | הנחה | מחיר סופי,
 * a manual amount can replace hours on a row; parts rows are שם | כמות | מחיר ליחידה | לפני הנחה | הנחה | סופי.
 * Totals / VAT / save / reopen / versions / PDF / report, together with the paint calculator and a supplier
 * invoice in the same quote. Desktop and phone (phone screenshots of the tables).
 *   node scripts/e2e-claim-quote-manual-pricing-staging.mjs [baseUrl]
 * Creates one test claim per device and soft-deletes them at the end.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REF = 'usfeoerkpcafxxlyuldl';
const SB_URL = `https://${REF}.supabase.co`;
const BASE = process.argv[2] || 'http://127.0.0.1:8095';
const RUN = Date.now().toString().slice(-6);
const CLAIMS = {
  desktop: { id: `DAL-E2E-QMD${RUN}`, plate: `44${RUN}`, name: `תמחור ידני מחשב ${RUN}` },
  phone: { id: `DAL-E2E-QMP${RUN}`, plate: `45${RUN}`, name: `תמחור ידני טלפון ${RUN}` },
};
const OUT = path.join(process.cwd(), 'docs/audit-reports/claim-quote-manual-pricing-2026-10-26');
fs.mkdirSync(OUT, { recursive: true });
if (fs.readFileSync('supabase/.temp/project-ref', 'utf8').trim() !== REF) throw new Error('linked project is not staging');

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail).slice(0, 400) });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${String(detail).slice(0, 220)}` : ''}`);
};
const money = (s) => Number(String(s).replace(/[^\d.-]/g, '')) || 0;
const r2 = (n) => Math.round(n * 100) / 100;
let admin = null;

async function softDelete() {
  if (!admin) return;
  for (const c of Object.values(CLAIMS)) {
    const { data } = await admin.from('claims_records').select('row_data').eq('id', c.id).maybeSingle();
    if (data) await admin.from('claims_records').update({ row_data: { ...data.row_data, deletedAt: new Date().toISOString() } }).eq('id', c.id);
  }
  console.log('test claims soft-deleted');
}

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

async function typeInto(page, locator, text) {
  await locator.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  if (text) await page.keyboard.type(text, { delay: 50 });
  return locator.inputValue();
}

/** before / discount / final of a table row. Work rows hold "before" in the editable price box. */
async function rowVals(row) {
  const priceBox = row.locator('input[aria-label="מחיר גלובלי"]');
  const before = (await priceBox.count()) ? money(await priceBox.inputValue()) : money(await row.locator('[data-testid="cq-before"]').first().innerText());
  const discEl = row.locator('[data-testid="cq-discount"]');
  const discount = (await discEl.count()) ? money(await discEl.first().innerText()) : 0;
  const final = money(await row.locator('[data-testid="cq-final"]').first().innerText());
  return { before, discount, final, text: `${before} / ${discount} / ${final}` };
}

async function run(page, label, mobile) {
  const C = CLAIMS[label];
  const ed = page.locator('[data-testid="claim-quote-editor"]');
  const openClaim = async () => {
    await page.goto(`${BASE}/claims`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.locator('[data-testid="claims-search"]').fill(C.plate, { timeout: 60000 });
    const row = page.locator(`[data-testid="claim-row-${C.id}"]:visible`).first();
    if (mobile) await row.locator('.claim-mcard-name').click({ timeout: 30000 }); else await row.click({ timeout: 30000 });
    await page.waitForTimeout(2500);
  };
  const cardAction = async (testId) => {
    const b = page.locator(`[data-testid="${testId}"]`);
    if (!(await b.isVisible().catch(() => false))) await page.locator('[data-testid="claims-card-more"]').click().catch(() => null);
    await b.click({ timeout: 20000 });
  };
  const openQuote = async () => {
    await cardAction('claims-quote-btn');
    await ed.waitFor({ timeout: 20000 });
    await page.waitForTimeout(1500);
  };

  // Paint calculation saved from the claim card + supplier invoice uploaded to the claim gallery
  await openClaim();
  await cardAction('claims-paint-calc-btn');
  const pc = page.locator('.pc-modal-content .pc-root').first();
  await pc.waitFor({ timeout: 20000 });
  await page.waitForTimeout(3000);
  await pc.locator('div[style*="cursor: pointer"]').first().click();
  await pc.locator('input[type="checkbox"]').first().check();
  await pc.locator('button', { hasText: '▶ צור עבודה' }).click();
  await page.waitForTimeout(600);
  await pc.locator('button', { hasText: 'שמור חישוב רשמי בתיק' }).click();
  await pc.locator('button', { hasText: 'נשמר בהצלחה' }).waitFor({ timeout: 20000 });
  await pc.locator('.pc-close-btn').click();
  const { data: calc } = await admin.from('claim_paint_calcs').select('calc_data').eq('claim_id', C.id).eq('is_draft', false).order('version', { ascending: false }).limit(1).single();
  const L = r2(calc.calc_data.laborCost);
  const M = r2(calc.calc_data.materialsCost);
  const inv = path.join(OUT, `invoice-${label}.pdf`);
  fs.writeFileSync(inv, textPdf([`SUPPLIER INVOICE ${RUN}`, `Vehicle ${C.plate}`, 'Headlamp right 81110-0Z510 2 900.00 765.00', 'Total 1800.00']));
  await page.locator('[data-testid="claims-tab-group-docs"]').click();
  await page.locator('[data-testid="claims-tab-sub-invoice"]').click();
  await page.locator('[data-testid="invoice-drop-input"]').setInputFiles(inv);
  await page.locator('[data-testid="invoice-drop-save"]').click();
  await page.waitForTimeout(5000);

  await openQuote();
  check(`${label}: paint works filled from the calculator (${L} + materials ${M})`, money(await page.locator('[data-testid="cq-cat-paint"] .cq-cat-head b').first().innerText()) === L);

  // Hour rate at the top: 400
  const rateBox = page.locator('[data-testid="cq-hour-rate"] input[aria-label="מחיר שעת עבודה"]');
  await typeInto(page, rateBox, '400');
  check(`${label}: hour rate at the top set to 400`, (await rateBox.inputValue()) === '400');

  const bodyRows = page.locator('[data-testid="cq-cat-body"] [data-testid="cq-work-row"]');
  const addBody = async (desc) => {
    const n = await bodyRows.count();
    await page.locator('[data-testid="cq-cat-body"] [data-testid="cq-add-work-line"]').first().click();
    await page.keyboard.type(desc, { delay: 25 });
    return bodyRows.nth(n);
  };

  // 1. The example: פירוק והרכבת פגוש קדמי | 3 שעות | 1,200 | 10% | 1,080
  const w1 = await addBody('פירוק והרכבת פגוש קדמי');
  const focusedOk = (await w1.locator('input[aria-label="תיאור העבודה"]').inputValue()) === 'פירוק והרכבת פגוש קדמי';
  check(`${label}: "+ הוסף עבודה" adds a table row and the description is typed straight into it`, focusedOk);
  await typeInto(page, w1.locator('input[aria-label="שעות"]'), '3');
  let v1 = await rowVals(w1);
  check(`${label}: 3 hours × 400 (rate at the top) → price before discount 1,200`, v1.before === 1200, v1.text);
  await typeInto(page, w1.locator('input[aria-label="ערך הנחה"]'), '10');
  v1 = await rowVals(w1);
  check(`${label}: discount 10% → -120 → final 1,080`, v1.discount === -120 && v1.final === 1080, v1.text);

  // 2. Manual price on a row instead of hours, with a ₪ discount
  const w2 = await addBody('יישור דופן ימין');
  await typeInto(page, w2.locator('input[aria-label="מחיר גלובלי"]'), '1000');
  await w2.locator('select[aria-label="סוג הנחה"]').selectOption('amount');
  await typeInto(page, w2.locator('input[aria-label="ערך הנחה"]'), '100');
  const v2 = await rowVals(w2);
  const manualShown = (await w2.locator('[data-testid="cq-price-hours"]').innerText()).includes('ידני');
  check(`${label}: manual price 1,000 on a row (hours cell says "ידני"), discount ₪100 → 900`, manualShown && v2.before === 1000 && v2.discount === -100 && v2.final === 900, v2.text);

  // 3. Another hours row without discount
  const w3 = await addBody('החלפת פנס קדמי');
  await typeInto(page, w3.locator('input[aria-label="שעות"]'), '1.5');
  const v3 = await rowVals(w3);
  check(`${label}: 1.5 hours × 400 → 600, no discount → 600`, v3.before === 600 && v3.discount === 0 && v3.final === 600, v3.text);

  // Changing the rate at the top recalculates the hours rows only
  await typeInto(page, rateBox, '420');
  const r1 = await rowVals(w1);
  const r2v = await rowVals(w2);
  check(`${label}: rate 420 → 3 h = 1,260, 10% → 1,134; manual row stays 1,000`, r1.before === 1260 && r1.final === 1134 && r2v.before === 1000, `${r1.text} | ${r2v.text}`);
  await typeInto(page, rateBox, '400');

  // 4. Parts row: name | qty | unit price | before | discount ₪100 | final; supplier net in the row details
  const partRows = page.locator('[data-testid="cq-pgroup-חלקים"] [data-testid="cq-part-row"]');
  const before = await partRows.count();
  await page.locator('[data-testid="cq-add-part"]').click();
  const p1 = partRows.nth(before);
  await page.keyboard.type('חלק חילוף ידני', { delay: 25 });
  await typeInto(page, p1.locator('input[aria-label="כמות"]'), '1');
  await typeInto(page, p1.locator('input[aria-label="ברוטו ליחידה"]'), '600');
  await p1.locator('select[aria-label="סוג הנחה"]').selectOption('amount');
  await typeInto(page, p1.locator('input[aria-label="ערך הנחה"]'), '100');
  await p1.locator('[data-testid="cq-part-more"]').click();
  await typeInto(page, p1.locator('input[aria-label="נטו לספק"]'), '450');
  const pv = await rowVals(p1);
  check(`${label}: part row 1 × 600 → before 600, discount ₪100 → final 500`, pv.before === 600 && pv.discount === -100 && pv.final === 500, pv.text);
  await p1.locator('[data-testid="cq-part-more"]').click();

  // Material row: 3 × 40
  await page.locator('[data-testid="cq-pgroup-חומרים"] [data-testid="cq-add-part-item"]').click();
  const mats = page.locator('[data-testid="cq-pgroup-חומרים"] [data-testid="cq-part-row"]');
  const m1 = mats.nth((await mats.count()) - 1);
  await page.keyboard.type('חומר איטום', { delay: 25 });
  await typeInto(page, m1.locator('input[aria-label="כמות"]'), '3');
  await typeInto(page, m1.locator('input[aria-label="ברוטו ליחידה"]'), '40');
  const mv = await rowVals(m1);
  check(`${label}: material row 3 × 40 → 120`, mv.before === 120 && mv.final === 120, mv.text);

  if (mobile) {
    const bodyTable = page.locator('[data-testid="cq-cat-body"] .cq-table').first();
    await bodyTable.scrollIntoViewIfNeeded();
    await bodyTable.screenshot({ path: path.join(OUT, 'phone-works-table.png') });
    const partsTable = page.locator('[data-testid="cq-pgroup-חלקים"] .cq-table').first();
    await partsTable.scrollIntoViewIfNeeded();
    await partsTable.screenshot({ path: path.join(OUT, 'phone-parts-table.png') });
  }

  // 7. Supplier invoice from the claim gallery into the same quote
  await page.locator('[data-testid="cq-pending-invoices"] [data-testid="cq-sync-claim-invoice"]').first().click();
  const review = page.locator('[data-testid="cq-invoice-review"]');
  await review.waitFor({ timeout: 60000 });
  await page.locator('[data-testid="cq-invoice-approve"]').click();
  const head = page.locator('[data-testid="cq-part-row"]').filter({ has: page.locator('input[value="Headlamp right"]') });
  const b5 = await rowVals(head);
  check(`${label}: supplier invoice line added (2 × 900 = 1,800) next to the manual lines`, (await head.count()) === 1 && b5.final === 1800, b5.text);

  // 5–6. Totals, discounts once, VAT
  const worksBefore = 1200 + 1000 + 600 + L;
  const partsBefore = 600 + 120 + 1800 + M;
  const discounts = 120 + 100 + 100;
  const after = r2(worksBefore + partsBefore - discounts);
  const vat = r2(after * 0.18);
  const total = r2(after + vat);
  const sum = page.locator('[data-testid="cq-summary"]');
  const sumText = (await sum.innerText()).replace(/\s+/g, ' ');
  check(`${label}: summary — before discounts, customer discounts once (-₪320), after discounts, VAT, total`,
    sumText.includes(`-₪320.00`) && money(await page.locator('[data-testid="cq-total"]').innerText()) === total && sumText.includes(vat.toLocaleString('en-US', { minimumFractionDigits: 2 })),
    `${sumText.slice(0, 300)} | expected total ${total}, vat ${vat}`);
  await page.screenshot({ path: path.join(OUT, `${label}-quote.png`), fullPage: false });
  if (mobile) {
    const sumBox = page.locator('[data-testid="cq-summary"]');
    await sumBox.scrollIntoViewIfNeeded();
    await sumBox.screenshot({ path: path.join(OUT, 'phone-summary.png') });
  }

  // Save → reopen → values and discounts kept; change → version 2
  await page.locator('[data-testid="cq-save"]').click();
  await page.locator('.cq-sub', { hasText: 'גרסה 1' }).waitFor({ timeout: 20000 });
  await page.locator('.cq-close').click();
  await openClaim();
  await openQuote();
  const w1r = page.locator('[data-testid="cq-cat-body"] [data-testid="cq-work-row"]').filter({ has: page.locator('input[value="פירוק והרכבת פגוש קדמי"]') });
  const p1r = page.locator('[data-testid="cq-part-row"]').filter({ has: page.locator('input[value="חלק חילוף ידני"]') });
  const rv1 = await rowVals(w1r);
  const rv3 = await rowVals(p1r);
  check(`${label}: reopened — 1,200 / -120 / 1,080 and part 600 / -100 / 500 kept`, rv1.before === 1200 && rv1.final === 1080 && rv3.final === 500 && rv3.discount === -100, `${rv1.text} | ${rv3.text}`);
  check(`${label}: reopened — rate at the top still 400`, (await page.locator('[data-testid="cq-hour-rate"] input').inputValue()) === '400');
  check(`${label}: reopened — same total`, money(await page.locator('[data-testid="cq-total"]').innerText()) === total);
  await typeInto(page, w1r.locator('input[aria-label="ערך הנחה"]'), '20');
  check(`${label}: discount changed to 20% → 1,200 → 960`, (await rowVals(w1r)).final === 960);
  await page.locator('[data-testid="cq-save"]').click();
  await page.locator('.cq-sub', { hasText: 'גרסה 2' }).waitFor({ timeout: 20000 });
  const total2 = r2((after - 120) * 1.18);
  check(`${label}: version 2 saved with the new total`, money(await page.locator('[data-testid="cq-total"]').innerText()) === total2, `${total2}`);

  // PDF
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.locator('[data-testid="cq-pdf"]').click()]);
  const pdfPath = path.join(OUT, `${label}-quote.pdf`);
  await dl.saveAs(pdfPath);
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(pdfPath)), isEvalSupported: false }).promise;
  check(`${label}: PDF generated (${doc.numPages} page(s))`, doc.numPages >= 1);
  if (!mobile && /127\.0\.0\.1|localhost/.test(BASE)) {
    const b64 = fs.readFileSync(pdfPath).toString('base64');
    for (let i = 1; i <= doc.numPages; i += 1) {
      const png = await page.evaluate(async ({ b64: data, n }) => {
        const m = await import('/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
        m.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs';
        const d = await m.getDocument({ data: Uint8Array.from(atob(data), (c) => c.charCodeAt(0)) }).promise;
        const pg = await d.getPage(n);
        const vp = pg.getViewport({ scale: 1.5 });
        const c = document.createElement('canvas');
        c.width = vp.width; c.height = vp.height;
        await pg.render({ canvasContext: c.getContext('2d'), viewport: vp, canvas: c }).promise;
        return c.toDataURL('image/png');
      }, { b64, n: i });
      fs.writeFileSync(path.join(OUT, `desktop-pdf-page${i}.png`), Buffer.from(png.split(',')[1], 'base64'));
    }
  }
  await page.locator('.cq-close').click();

  // Report: purchase cost vs sale after discounts for this claim
  await page.goto(`${BASE}/claims?view=reports`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const rep = page.locator('[data-testid="claim-quotes-report"]');
  await rep.waitFor({ timeout: 60000 });
  await rep.locator('[data-testid="claim-quotes-report-search"]').fill(C.plate);
  const rr = rep.locator(`[data-testid="claim-quotes-report-row-${C.id}"]`);
  await rr.waitFor({ timeout: 20000 });
  const rh = (await rr.locator('.cqr-row-head').innerText()).replace(/\s+/g, ' ');
  const cost = 450 + 2 * 765;
  const sale = r2(500 + 120 + 1800 + M);
  check(`${label}: report — purchase ${cost}, sale after part discount ${sale}, difference ${r2(sale - cost)}`,
    money(rh.match(/קנייה[^₪]*₪[\d,.]+/)?.[0]) === cost && money(rh.match(/מכירה[^₪]*₪[\d,.]+/)?.[0]) === sale, rh);
}

async function main() {
  const keys = JSON.parse(execSync(`supabase projects api-keys --project-ref ${REF} -o json`, { encoding: 'utf8' }));
  admin = createClient(SB_URL, keys.find((k) => k.name === 'service_role' && k.type === 'legacy').api_key);
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'orin1607@gmail.com' });
  const { data: auth, error } = await createClient(SB_URL, keys.find((k) => k.name === 'anon' && k.type === 'legacy').api_key).auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  if (error) throw error;
  const stamp = new Date().toLocaleString('he-IL');
  for (const C of Object.values(CLAIMS)) {
    const rd = { id: C.id, plate: C.plate, status: 'חדש', clientName: C.name, carMake: 'יונדאי', carModel: 'i20', claimNum: `60${C.plate}`, insCompany: 'כלל', company_name: 'E2E-QUOTE-TEST', createdAt: stamp, updatedAt: stamp };
    const { error: insErr } = await admin.from('claims_records').insert({ id: C.id, plate: C.plate, client_name: C.name, status: 'חדש', company_name: 'E2E-QUOTE-TEST', row_data: rd });
    if (insErr) throw insErr;
  }
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const [label, opts, mobile] of [
    ['desktop', { viewport: { width: 1440, height: 950 } }, false],
    ['phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }, true],
  ]) {
    const ctx = await browser.newContext({ ...opts, locale: 'he-IL', acceptDownloads: true });
    await ctx.addInitScript(({ s, u }) => localStorage.setItem(`sb-${s}-auth-token`, JSON.stringify(u)), { s: REF, u: auth.session });
    const page = await ctx.newPage();
    page.on('dialog', (d) => d.accept());
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    try {
      await run(page, label, mobile);
    } catch (e) {
      check(`${label}: flow finished`, false, String(e.message || e).split('\n')[0]);
      await page.screenshot({ path: path.join(OUT, `${label}-error.png`) }).catch(() => null);
    }
    if (mobile) {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check('phone: no horizontal page overflow', overflow <= 2, `${overflow}px`);
    }
    check(`${label}: no page errors`, errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }
  await browser.close();
  await softDelete();
  fs.writeFileSync(path.join(OUT, `results-${BASE.includes('github.io') ? 'live' : 'local'}.json`), JSON.stringify({ at: new Date().toISOString(), base: BASE, results }, null, 2));
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch(async (e) => { console.error(e); await softDelete().catch(() => null); process.exit(1); });
