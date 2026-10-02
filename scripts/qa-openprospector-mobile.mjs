// QA: OpenProspector responsive layout (STAGING only, read-only – never clicks write actions).
// Usage: node scripts/qa-openprospector-mobile.mjs [baseUrl] [--shots=dir]
//   no baseUrl -> serves ./public locally
import { chromium, devices } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const shotsDir = (args.find((a) => a.startsWith('--shots=')) || '').slice(8);
let base = args.find((a) => !a.startsWith('--'));
let server;
if (!base) {
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json' };
  server = http.createServer((req, res) => {
    const f = path.join(path.resolve('public'), decodeURIComponent(req.url.split('?')[0]));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  });
  await new Promise((r) => server.listen(8998, r));
  base = 'http://localhost:8998';
}
const url = `${base.replace(/\/$/, '')}/openprospector.html`;
if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });

const results = [];
const check = (name, ok, details = '') => { results.push({ name, ok }); console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${details ? ' — ' + details : ''}`); };

/* elements whose box leaves the viewport horizontally (ignores intentionally scrollable containers' children) */
const overflowProbe = () => {
  const vw = document.documentElement.clientWidth;
  const scrollers = [...document.querySelectorAll('*')].filter((e) => { const s = getComputedStyle(e); return /(auto|scroll)/.test(s.overflowX) && e.scrollWidth > e.clientWidth + 1; });
  const inScroller = (e) => scrollers.some((s) => s !== e && s.contains(e));
  const bad = [];
  document.querySelectorAll('#view *, .top *, #panel *, .tabs').forEach((e) => {
    if (!e.offsetParent && getComputedStyle(e).position !== 'fixed') return;
    const r = e.getBoundingClientRect();
    if (!r.width || inScroller(e)) return;
    if (r.right > vw + 1 || r.left < -1) bad.push(`${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}.${String(e.className).split(' ')[0]} [${Math.round(r.left)}..${Math.round(r.right)}]`);
  });
  return { docOverflow: document.documentElement.scrollWidth - vw, bad: [...new Set(bad)].slice(0, 6), scrollers: scrollers.map((s) => s.className || s.tagName).slice(0, 6) };
};
/* tap targets smaller than 36px high inside the active view / panel */
const tapProbe = () => [...document.querySelectorAll('#view button, #view select, #view input:not([type=checkbox]):not(.toggle input), #panel button, #panel select, #panel input:not([type=checkbox]), .top button, .tabs button')]
  .filter((e) => e.offsetParent).map((e) => ({ e, r: e.getBoundingClientRect() }))
  .filter(({ r }) => r.height && r.height < 36).map(({ e, r }) => `${e.tagName.toLowerCase()}[${(e.dataset.act || e.dataset.tab || e.id || e.textContent).trim().slice(0, 18)}] h=${Math.round(r.height)}`).slice(0, 8);

const browser = await chromium.launch({ headless: true });
const widths = [360, 390, 412, 430, 768, 1440];
for (const w of widths) {
  const mobile = w < 768;
  const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 820 : 900 }, ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => { if (['POST', 'PATCH', 'DELETE'].includes(r.method()) && r.url().includes('supabase.co/rest')) errors.push('WRITE ' + r.url()); });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.S && S.remoteStatus === 'connected', null, { timeout: 30000 });
  const tag = `${w}px`;
  const shot = async (n) => shotsDir && page.screenshot({ path: path.join(shotsDir, `${w}-${n}.png`), fullPage: false });
  const ov = async (label) => { const o = await page.evaluate(overflowProbe); check(`${tag} ${label}: no horizontal overflow`, o.docOverflow <= 0 && !o.bad.length, o.docOverflow > 0 || o.bad.length ? `doc+${o.docOverflow} ${o.bad.join(' | ')}` : ''); };
  const taps = async (label) => { if (!mobile) return; const t = await page.evaluate(tapProbe); check(`${tag} ${label}: tap targets ≥36px`, !t.length, t.join(', ')); };

  check(`${tag} 618 leads loaded`, (await page.evaluate(() => C.length)) === 618);
  await ov('dashboard'); await taps('dashboard'); await shot('1-dash');

  // menu (mobile)
  if (w < 860) {
    await page.click('.menu-btn');
    await page.waitForTimeout(300);
    const open = await page.evaluate(() => document.querySelector('#side').classList.contains('open'));
    await page.click('#scrim', { position: { x: 20, y: 400 } });
    await page.waitForTimeout(300);
    const closed = await page.evaluate(() => !document.querySelector('#side').classList.contains('open'));
    check(`${tag} menu opens and closes`, open && closed);
  }

  // companies
  await page.click('.tabs button[data-tab="companies"]');
  await page.waitForTimeout(200);
  await ov('companies'); await taps('companies'); await shot('2-companies');
  if (w <= 860 && !mobile) {
    const t = page.locator('[data-act="toggleFilters"]');
    check(`${tag} filters collapsible`, (await t.count()) > 0 && !(await page.locator('#f-stage').isVisible()));
    await t.first().click(); await page.waitForTimeout(150);
  }
  if (mobile) {
    const cards = await page.evaluate(() => { const r = document.querySelector('table.co tbody tr'); const s = r && getComputedStyle(r); return s ? s.display : ''; });
    check(`${tag} companies rendered as cards`, cards === 'block' || cards === 'grid' || cards === 'flex', cards);
    const visibleKeys = await page.evaluate(() => { const r = document.querySelector('table.co tbody tr'); return r ? r.innerText : ''; });
    check(`${tag} card shows phone/fleet/stage/missing`, /0\d|טלפון|—/.test(visibleKeys) && /צי/.test(visibleKeys) && /ליד|רשומה/.test(visibleKeys) && /חסר/.test(visibleKeys));
    const fToggle = page.locator('[data-act="toggleFilters"]');
    check(`${tag} filters collapsed by default with toggle`, (await fToggle.count()) > 0 && !(await page.locator('#f-stage').isVisible()));
    if (await fToggle.count()) { await fToggle.first().click(); await page.waitForTimeout(150); }
    check(`${tag} filters open on toggle`, await page.locator('#f-stage').isVisible());
  }
  // search full width + works
  const hp = await page.evaluate(() => C[5].no);
  const sw = await page.evaluate(() => { const i = document.querySelector('#f-q'); return i.getBoundingClientRect().width / i.parentElement.getBoundingClientRect().width; });
  if (mobile) check(`${tag} search input full width`, sw > 0.9, sw.toFixed(2));
  await page.fill('#f-q', hp); await page.waitForTimeout(450);
  check(`${tag} search by ח.פ.`, (await page.locator('table.co tbody tr').count()) === 1);
  await page.fill('#f-q', ''); await page.waitForTimeout(450);
  // filter
  await page.selectOption('#f-phone', 'no');
  const nNoPhone = await page.evaluate(() => C.filter((c) => coMatch(c, S.coFilter)).length);
  check(`${tag} filter works (no phone)`, nNoPhone === 21, String(nNoPhone));
  { const cl = page.locator('[data-act="clearCoFilters"]:visible'); check(`${tag} clear-filters button visible`, (await cl.count()) > 0); if (await cl.count()) await cl.first().click(); }
  check(`${tag} clear filters`, (await page.evaluate(() => C.filter((c) => coMatch(c, S.coFilter)).length)) === 618);
  // pagination
  await page.click('[data-act="nextCoPage"] >> nth=0');
  check(`${tag} pagination`, await page.evaluate(() => S.coPage === 2));
  await ov('companies p2');

  // lead card
  await page.locator('table.co tbody tr').first().click();
  await page.waitForTimeout(400);
  check(`${tag} lead card opens`, await page.locator('#panel .panel').isVisible());
  await ov('lead card'); await taps('lead card'); await shot('3-card');
  const ptxt = await page.locator('#panel').innerText();
  check(`${tag} card sections present`, ['מידע שנמצא', 'מה חסר לליד', 'צי רכב', 'איש קשר', 'קצין בטיחות', 'עדכון ואימות ידני'].every((t) => ptxt.includes(t)));
  const stacked = await page.evaluate(() => { const b = [...document.querySelectorAll('#panel .g-3 > div')].map((d) => d.getBoundingClientRect()); return b.length === 3 && b[1].top > b[0].top && b[2].top > b[1].top; });
  if (mobile) check(`${tag} card boxes stacked one under another`, stacked);
  await page.locator('#panel .panel').evaluate((e) => (e.scrollTop = 1400));
  await shot('4-card-scrolled');
  await page.click('#panel button.x');
  check(`${tag} lead card closes`, !(await page.locator('#panel .panel').count()));

  // leads + ready
  await page.click('.tabs button[data-tab="leads"]');
  await page.waitForTimeout(200);
  await ov('leads'); await taps('leads'); await shot('5-leads');
  await page.click('button[data-lead-cat="ready"] >> nth=0');
  await page.waitForTimeout(200);
  await ov('ready'); await shot('6-ready');
  check(`${tag} ready screen opens`, (await page.locator('#view').innerText()).includes('מוכן לפנייה'));
  // render the ready table with sample data to check its mobile layout (display only, nothing saved)
  const readyHtmlOk = await page.evaluate(() => { const v = document.querySelector('#view'); v.innerHTML = stageTable(C.slice(0, 3), 'ready'); const t = document.querySelector('table.co tbody tr'); return !!t; });
  await ov('ready table (sample render)'); await shot('7-ready-sample');
  check(`${tag} ready table renders`, readyHtmlOk);

  // search tab
  await page.click('.tabs button[data-tab="search"]');
  await ov('search'); await taps('search');

  // refresh
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.S && S.remoteStatus === 'connected', null, { timeout: 30000 });
  check(`${tag} refresh keeps 618`, (await page.evaluate(() => C.length)) === 618);
  check(`${tag} no page errors / writes`, !errors.length, errors.join(' | '));
  await ctx.close();
}
await browser.close();
if (server) server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
