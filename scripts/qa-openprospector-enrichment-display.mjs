// QA: OpenProspector enrichment / verification display (STAGING only, read-only).
// Usage: node scripts/qa-openprospector-enrichment-display.mjs [baseUrl]
//   no baseUrl -> serves ./public locally; otherwise e.g. https://orin1607-ctrl.github.io/future-craft-core
// Never clicks write actions (toCrm / save / enrichment request).
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const SUPABASE_URL = 'https://usfeoerkpcafxxlyuldl.supabase.co';
const html = fs.readFileSync('public/openprospector.html', 'utf8');
const ANON = (html.match(/SUPABASE_STAGING_ANON\s*=\s*["']([^"']+)["']/) || [])[1];
if (!ANON) throw new Error('anon key not found in openprospector.html');

// rules module, evaluated independently of the page
const ctx = { globalThis: {} };
vm.runInNewContext(fs.readFileSync('public/openprospector-qualify.js', 'utf8'), ctx);
const Q = ctx.globalThis.OPQualify;

async function fetchRows() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/prospect_leads?select=*&order=lead_number.asc`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, Range: `${from}-${from + 999}` },
    });
    const d = await r.json();
    rows.push(...d);
    if (d.length < 1000) break;
  }
  return rows;
}

let base = process.argv[2];
let server;
if (!base) {
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css' };
  server = http.createServer((req, res) => {
    const f = path.join(path.resolve('public'), decodeURIComponent(req.url.split('?')[0]));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  });
  await new Promise((r) => server.listen(8996, r));
  base = 'http://localhost:8996';
}
const url = `${base.replace(/\/$/, '')}/openprospector.html`;

const results = [];
const check = (name, ok, details = '') => { results.push({ name, ok }); console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${details ? ' — ' + details : ''}`); };

const rows = await fetchRows();
const hp = rows.map((r) => String(r.company_hp || '').trim());
check('Supabase: 618 leads', rows.length === 618, `${rows.length}`);
check('Supabase: no duplicate ח.פ.', new Set(hp).size === hp.length, `${new Set(hp).size} unique`);

// expected counters from the DB rows + shared rules
const exp = { stage: {}, ready: 0, noPhone: 0, noMail: 0, noContact: 0, fleetUnverified: 0 };
rows.forEach((r) => {
  const q = Q.evaluate(r), f = q.field_status;
  exp.stage[q.lead_stage] = (exp.stage[q.lead_stage] || 0) + 1;
  if (r.ready_for_contact === true && q.ready_for_contact) exp.ready++;
  if (f.phone.s === 'n') exp.noPhone++;
  if (f.email.s === 'n') exp.noMail++;
  if (f.contact_name.s === 'n') exp.noContact++;
  if (f.fleet.s !== 'v') exp.fleetUnverified++;
});
console.log('[INFO] expected', JSON.stringify(exp));

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
// guard: this QA must never write
page.on('request', (r) => { if (['POST', 'PATCH', 'DELETE'].includes(r.method()) && r.url().includes('supabase')) errors.push('WRITE ' + r.method() + ' ' + r.url()); });

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.S && S.remoteStatus === 'connected', null, { timeout: 30000 });
const stats = await page.evaluate(() => { const s = leadStats(); return { total: C.length, ...s }; });
console.log('[INFO] page', JSON.stringify(stats));
check('Page: 618 leads loaded from Supabase', stats.total === 618);
check('Dashboard counters = DB (stages)', ['review', 'verified', 'qualified', 'quality', 'basic', 'rejected'].every((k) => (stats.stage[k] || 0) === (exp.stage[k] || 0)));
check('Dashboard counters = DB (ready/missing)', stats.ready === exp.ready && stats.noPhone === exp.noPhone && stats.noMail === exp.noMail && stats.noContact === exp.noContact && stats.fleetUnverified === exp.fleetUnverified);
const dashText = await page.locator('#view').innerText();
check('Dashboard shows all 11 counters', ['סה"כ לידים', 'לידים לבדיקה', 'לידים מאומתים', 'לידים מתאימים', 'לידים איכותיים', 'מוכנים לפנייה', 'חסר טלפון', 'חסר מייל', 'חסר איש קשר', 'חסר אימות צי', 'מועמדים להעשרה בתשלום'].every((t) => dashText.includes(t)));
check('Dashboard: no hard-coded 62% certainty', !dashText.includes('62%'));

// companies table
await page.click('.tabs button[data-tab="companies"]');
const tbl = () => page.locator('table.co tbody tr');
check('Companies: 50 rows on page 1', (await tbl().count()) === 50);
const head = await page.locator('table.co thead').innerText();
check('Companies: key columns present', ['טלפון', 'מייל', 'צי רכב', 'איש קשר', 'קצב"ת', 'שלב', 'מה חסר', 'בדיקה אחרונה'].every((t) => head.includes(t)));
const allTableText = await page.evaluate(() => { const f = { ...S.coFilter }; S.coPageSize = 1000; const h = V.companies(); S.coPageSize = 50; return h; });
check('Companies: no legacy placeholders (50–100 עובדים / צי צמ"ה ברישוי)', !/50–100 עובדים|צי צמ"ה ומשאיות ברישוי/.test(allTableText));
check('Companies: no fleet shown as verified without source', !/✓ צי רכב מאומת/.test(allTableText) || rows.some((r) => Q.evaluate(r).field_status.fleet.s === 'v'));
await page.click('button[data-act="nextCoPage"] >> nth=0');
check('Pagination: page 2', (await page.locator('text=עמוד 2 מתוך').count()) > 0);

const sample = rows.find((r) => r.company_hp);
await page.fill('#f-q', sample.company_hp);
await page.waitForTimeout(500);
check('Search by ח.פ.', (await tbl().count()) === 1 && (await tbl().first().innerText()).includes(sample.company_name));
await page.fill('#f-q', '');
await page.waitForTimeout(400);

const filterCases = [
  ['f-phone', 'no', (q) => q.field_status.phone.s === 'n'],
  ['f-mail', 'no', (q) => q.field_status.email.s === 'n'],
  ['f-contact', 'yes', (q) => q.field_status.contact_name.s !== 'n'],
  ['f-fleet', 'v', (q) => q.field_status.fleet.s === 'v'],
  ['f-quality', 'high', (q) => q.lead_quality === 'high'],
  ['f-quality', 'medium', (q) => q.lead_quality === 'medium'],
  ['f-stage', 'qualified', (q) => q.lead_stage === 'qualified'],
  ['f-missing', 'required', (q) => q.blockers.length > 0],
  ['f-ready', 'yes', (q, r) => r.ready_for_contact === true && q.ready_for_contact],
];
for (const [id, val, pred] of filterCases) {
  await page.selectOption('#' + id, val);
  const n = await page.evaluate(() => C.filter((c) => coMatch(c, S.coFilter)).length);
  const e = rows.filter((r) => pred(Q.evaluate(r), r)).length;
  check(`Filter ${id}=${val}`, n === e, `${n} (expected ${e})`);
  await page.selectOption('#' + id, '');
}
const city = rows.find((r) => r.city).city;
await page.selectOption('#f-city', city);
check('Filter city', (await page.evaluate(() => C.filter((c) => coMatch(c, S.coFilter)).length)) === rows.filter((r) => r.city === city).length);
await page.selectOption('#f-city', '');

// lead cards: verified only with source, OVDIM never a safety officer, "מה חסר" from missing_fields
let badVerified = 0, ovdimBad = 0, missBad = 0, opened = 0;
const cardIds = await page.evaluate(() => C.filter((c, i) => i % 31 === 0 || (c.enr && (c.enr.safety_officer_name || c.enr.certified_professional))).slice(0, 30).map((c) => c.id));
for (const id of cardIds) {
  await page.evaluate((id) => { S.panel = { co: id }; renderPanel(); }, id);
  const info = await page.evaluate((id) => {
    const c = C.find((x) => x.id === id), q = QF(c);
    const trs = [...document.querySelectorAll('#panel table.co tbody tr')].map((tr) => [...tr.children].map((td) => td.innerText.trim()));
    const verifiedNoSrc = trs.filter((t) => t.length === 4 && t[2].includes('מאומת') && !t[2].includes('דורש') && !t[3]).length;
    const panel = document.querySelector('#panel').innerText;
    const cp = c.enr && c.enr.certified_professional && c.enr.certified_professional.name;
    const so = q.field_status.safety_officer;
    const missingShown = [...document.querySelectorAll('#panel .badge')].filter((b) => /^חסר/.test(b.innerText.trim())).length;
    return { verifiedNoSrc, hasFound: panel.includes('מידע שנמצא'), hasMissing: panel.includes('מה חסר לליד'),
      ovdimAsSo: !!(cp && so.s !== 'n' && so.val === cp), missingShown, missingExpected: q.missing_fields.length };
  }, id);
  opened++;
  badVerified += info.verifiedNoSrc;
  if (info.ovdimAsSo) ovdimBad++;
  if (!info.hasFound || !info.hasMissing || info.missingShown < info.missingExpected) missBad++;
}
check(`Lead card: "מידע שנמצא" + "מה חסר לליד" rendered (${opened} cards)`, missBad === 0, `${missBad} bad`);
check('Lead card: no "מאומת" without source', badVerified === 0, `${badVerified} rows`);
check('Lead card: OVDIM never shown as safety officer', ovdimBad === 0);
await page.evaluate(() => { S.panel = null; renderPanel(); });

// ready-for-contact screen
await page.click('.tabs button[data-tab="leads"]');
await page.click('button[data-lead-cat="ready"] >> nth=0');
const readyRows = await page.locator('table.co tbody tr').count();
const readyText = await page.locator('#view').innerText();
check('Ready screen: only ready_for_contact=true', exp.ready === 0 ? readyText.includes('אין כרגע לידים') : readyRows === Math.min(50, exp.ready), `${exp.ready} ready`);

// refresh + new session
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => window.S && S.remoteStatus === 'connected', null, { timeout: 30000 });
check('Refresh: still 618 from Supabase', (await page.evaluate(() => C.length)) === 618);
const p2 = await (await browser.newContext()).newPage();
await p2.goto(url, { waitUntil: 'networkidle' });
await p2.waitForFunction(() => window.S && S.remoteStatus === 'connected', null, { timeout: 30000 });
check('New session (empty cache): 618 from Supabase', (await p2.evaluate(() => C.length)) === 618);

check('No page errors and no writes to Supabase', errors.length === 0, errors.join(' | '));
await browser.close();
if (server) server.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
