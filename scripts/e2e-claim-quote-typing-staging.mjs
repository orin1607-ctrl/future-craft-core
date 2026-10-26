/**
 * Types prices into a quote the way a person does (real key presses, not fill()), on STAGING only.
 * Covers hours × rate and fixed price in the fixed areas and in a new area, then checks totals,
 * discount, VAT, save/reopen and the PDF. Desktop and phone.
 *   node scripts/e2e-claim-quote-typing-staging.mjs [baseUrl]
 * Creates one test claim and soft-deletes it at the end.
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
// One test claim per device, so the phone run does not reopen the desktop quote.
const CLAIMS = {
  desktop: { id: `DAL-E2E-QTD${RUN}`, plate: `66${RUN}`, name: `בדיקת הקלדת מחירים מחשב ${RUN}` },
  phone: { id: `DAL-E2E-QTP${RUN}`, plate: `67${RUN}`, name: `בדיקת הקלדת מחירים טלפון ${RUN}` },
};
const OUT = path.join(process.cwd(), 'docs/audit-reports/claim-quote-typing-2026-10-26');
fs.mkdirSync(OUT, { recursive: true });
if (fs.readFileSync('supabase/.temp/project-ref', 'utf8').trim() !== REF) throw new Error('linked project is not staging');

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail).slice(0, 300) });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${String(detail).slice(0, 200)}` : ''}`);
};
const money = (s) => Number(String(s).replace(/[^\d.-]/g, '')) || 0;
let admin = null;

async function softDelete() {
  if (!admin) return;
  for (const C of Object.values(CLAIMS)) {
    const { data } = await admin.from('claims_records').select('row_data').eq('id', C.id).maybeSingle();
    if (data) await admin.from('claims_records').update({ row_data: { ...data.row_data, deletedAt: new Date().toISOString() } }).eq('id', C.id);
  }
  console.log('test claims soft-deleted');
}

/** Clicks the field, clears it with the keyboard and types key by key. */
async function typeInto(page, locator, text) {
  await locator.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(text, { delay: 60 });
  return locator.inputValue();
}

async function run(page, label, mobile) {
  const C = CLAIMS[label];
  const ed = page.locator('[data-testid="claim-quote-editor"]');
  await page.goto(`${BASE}/claims`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('[data-testid="claims-search"]').fill(C.plate, { timeout: 60000 });
  const row = page.locator(`[data-testid="claim-row-${C.id}"]:visible`).first();
  if (mobile) await row.locator('.claim-mcard-name').click({ timeout: 30000 }); else await row.click({ timeout: 30000 });
  await page.waitForTimeout(2500);
  const qb = page.locator('[data-testid="claims-quote-btn"]');
  if (!(await qb.isVisible().catch(() => false))) await page.locator('[data-testid="claims-card-more"]').click().catch(() => null);
  await qb.click({ timeout: 20000 });
  await ed.waitFor({ timeout: 20000 });
  await page.waitForTimeout(1500);

  // Returns a fixed reference to the new row (by position), not "the last row", which moves on later adds.
  const addItem = async (areaTestId, label2) => {
    const rows = page.locator(`[data-testid="${areaTestId}"] [data-testid="cq-work-row"]`);
    const before = await rows.count();
    await page.locator(`[data-testid="${areaTestId}"] [data-testid="cq-add-item"]`).first().click();
    await page.locator('[data-testid="cq-picker-input"]').fill(label2);
    await page.locator('[data-testid="cq-picker-ok"]').click();
    return rows.nth(before);
  };

  // Hour rate at the top (400) × typed hours in פחחות
  const rate = await typeInto(page, page.locator('[data-testid="cq-hour-rate"] input'), '400');
  const body = await addItem('cq-cat-body', `פחחות לפי שעות ${label}`);
  // The phone types a comma as the decimal point, as Hebrew phone keyboards often do.
  const hoursText = mobile ? '2,5' : '2.5';
  const h = await typeInto(page, body.locator('input[aria-label="שעות"]'), hoursText);
  const bodyPrice = money(await body.locator('[data-testid="cq-final"]').innerText());
  check(`${label}: פחחות — typed hours "${hoursText}" × rate at the top "400" → 1,000`, h === '2.5' && rate === '400' && bodyPrice === 1000, `hours="${h}" rate="${rate}" price=${bodyPrice}`);
  const pre = await body.locator('input[aria-label="מחיר גלובלי"]').inputValue();
  check(`${label}: the price box shows the hours amount (1000)`, pre === '1000', `price="${pre}"`);
  await typeInto(page, body.locator('input[aria-label="מחיר גלובלי"]'), '1100');
  check(`${label}: typing a price makes the line manual (1,100)`, (await body.locator('[data-testid="cq-price-hours"]').count()) === 1 && money(await body.locator('[data-testid="cq-final"]').innerText()) === 1100);
  await body.locator('[data-testid="cq-price-hours"]').click();
  check(`${label}: and back to hours keeps 2.5 h → 1,000`, (await body.locator('input[aria-label="שעות"]').inputValue()) === '2.5' && money(await body.locator('[data-testid="cq-final"]').innerText()) === 1000);

  // Fixed price in צבע (manual line next to the paint calculator)
  const paint = await addItem('cq-cat-paint', `צבע ידני ${label}`);
  const gp = await typeInto(page, paint.locator('input[aria-label="מחיר גלובלי"]'), '1250.50');
  check(`${label}: צבע — typed fixed price "1250.50"`, gp === '1250.50' && money(await paint.locator('[data-testid="cq-final"]').innerText()) === 1250.5, `value="${gp}"`);

  // Fixed price in מכונאות with a % discount, then back to hours (each line chooses on its own)
  const mech = await addItem('cq-cat-mech', `מכונאות ${label}`);
  await typeInto(page, mech.locator('input[aria-label="מחיר גלובלי"]'), '800');
  await mech.locator('select[aria-label="סוג הנחה"]').selectOption('percent');
  const zero = await typeInto(page, mech.locator('input[aria-label="ערך הנחה"]'), '0');
  check(`${label}: "0" can be typed`, zero === '0', `value="${zero}"`);
  const disc = await typeInto(page, mech.locator('input[aria-label="ערך הנחה"]'), '10');
  check(`${label}: מכונאות — fixed 800 with typed 10% discount → 720`, disc === '10' && money(await mech.locator('[data-testid="cq-final"]').innerText()) === 720);
  const mech2 = await addItem('cq-cat-mech', `מכונאות שעות ${label}`);
  const h2 = await typeInto(page, mech2.locator('input[aria-label="שעות"]'), '0.5');
  check(`${label}: מכונאות — hours "0.5" can be typed (starts with 0) → 200`, h2 === '0.5' && money(await mech2.locator('[data-testid="cq-final"]').innerText()) === 200, `hours="${h2}"`);

  // A new work area: both methods
  await page.locator('[data-testid="cq-add-domain"]').click();
  await page.locator('[data-testid="cq-picker-input"]').fill(`תחום חדש ${label} ${RUN}`);
  await page.locator('[data-testid="cq-picker-ok"]').click();
  const areaId = `cq-cat-custom:תחום חדש ${label} ${RUN}`;
  const n1 = await addItem(areaId, 'לפי שעות');
  await typeInto(page, n1.locator('input[aria-label="שעות"]'), '3');
  const n2 = await addItem(areaId, 'סכום קבוע');
  await typeInto(page, n2.locator('input[aria-label="מחיר גלובלי"]'), '450');
  check(`${label}: new area — hours 3 × 400 = 1,200 and fixed 450`, money(await n1.locator('[data-testid="cq-final"]').innerText()) === 1200 && money(await n2.locator('[data-testid="cq-final"]').innerText()) === 450);

  // Delete-and-retype: clearing a field to empty and typing a new value
  const cleared = await typeInto(page, n2.locator('input[aria-label="מחיר גלובלי"]'), '');
  const retyped = await typeInto(page, n2.locator('input[aria-label="מחיר גלובלי"]'), '460');
  check(`${label}: field can be cleared and retyped`, cleared === '' && retyped === '460');

  // Totals: works = 1000 + 1250.5 + 720 + 200 + 1200 + 460 (+ starter empty part = 0)
  const works = 1000 + 1250.5 + 720 + 200 + 1200 + 460;
  const total = money(await page.locator('[data-testid="cq-total"]').innerText());
  const exp = Math.round(works * 1.18 * 100) / 100;
  check(`${label}: totals incl. discount and 18% VAT`, total === exp, `${total} vs ${exp}`);
  const sum = await page.locator('[data-testid="cq-summary"]').innerText();
  // Per-area totals are before discounts (מכונאות 800 + 200 = 1,000); the 10% (₪80) is its own line.
  check(`${label}: summary per area (before discounts) and the discount line`, sum.includes('1,000.00') && sum.includes('1,250.50') && sum.includes('1,660.00') && sum.includes('-₪80.00'), sum.replace(/\s+/g, ' '));
  await page.screenshot({ path: path.join(OUT, `${label}-typed.png`) });

  // Save, reopen, PDF
  await page.locator('[data-testid="cq-save"]').click();
  await page.locator('.cq-sub', { hasText: 'גרסה' }).waitFor({ timeout: 20000 });
  await page.locator('.cq-close').click();
  await page.goto(`${BASE}/claims`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('[data-testid="claims-search"]').fill(C.plate, { timeout: 60000 });
  const row2 = page.locator(`[data-testid="claim-row-${C.id}"]:visible`).first();
  if (mobile) await row2.locator('.claim-mcard-name').click({ timeout: 30000 }); else await row2.click({ timeout: 30000 });
  await page.waitForTimeout(2500);
  if (!(await qb.isVisible().catch(() => false))) await page.locator('[data-testid="claims-card-more"]').click().catch(() => null);
  await qb.click({ timeout: 20000 });
  await ed.waitFor({ timeout: 20000 });
  await page.waitForTimeout(1500);
  check(`${label}: saved and reopened with the same total`, money(await page.locator('[data-testid="cq-total"]').innerText()) === exp);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.locator('[data-testid="cq-pdf"]').click()]);
  const pdfPath = path.join(OUT, `${label}-quote.pdf`);
  await dl.saveAs(pdfPath);
  check(`${label}: PDF generated`, fs.readFileSync(pdfPath).subarray(0, 5).toString() === '%PDF-');
  await page.locator('.cq-close').click();
  return exp;
}

async function main() {
  const keys = JSON.parse(execSync(`supabase projects api-keys --project-ref ${REF} -o json`, { encoding: 'utf8' }));
  admin = createClient(SB_URL, keys.find((k) => k.name === 'service_role' && k.type === 'legacy').api_key);
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'orin1607@gmail.com' });
  const { data: auth, error } = await createClient(SB_URL, keys.find((k) => k.name === 'anon' && k.type === 'legacy').api_key).auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  if (error) throw error;
  const stamp = new Date().toLocaleString('he-IL');
  for (const C of Object.values(CLAIMS)) {
    const rd = { id: C.id, plate: C.plate, status: 'חדש', clientName: C.name, carMake: 'קיה', carModel: 'ספורטז׳', claimNum: `70${C.plate}`, insCompany: 'הראל', company_name: 'E2E-QUOTE-TEST', createdAt: stamp, updatedAt: stamp };
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
