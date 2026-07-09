/**
 * Mobile / touch verification — Orin → pirsum-home → work|control (20 round-trips).
 */
import { chromium, devices } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.PIRSUM_BASE || 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(__dirname, '../docs/audit-reports/staging-freeze-diagnostic');
mkdirSync(OUT, { recursive: true });

const DEVICE = devices['Pixel 5'];
const ROUNDS = 20;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const report = { at: new Date().toISOString(), device: 'Pixel 5 / Chrome mobile', checks: [], phases: {} };
function check(name, ok, detail) {
  report.checks.push({ name, ok: !!ok, detail: detail || '' });
  console.log((ok ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ': ' + detail : ''));
}

async function tapLink(page, selector) {
  const el = page.locator(selector);
  await el.waitFor({ state: 'visible', timeout: 30000 });
  const box = await el.boundingBox();
  if (!box) throw new Error('no box for ' + selector);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const t0 = Date.now();
  await page.touchscreen.tap(x, y);
  return Date.now() - t0;
}

async function probeOverlays(page) {
  return page.evaluate(() => {
    const blockers = [];
    const els = document.querySelectorAll('body *');
    for (const el of els) {
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden' || st.pointerEvents === 'none') continue;
      if (st.position !== 'fixed' && st.position !== 'absolute') continue;
      const z = parseInt(st.zIndex, 10);
      if (!z || z < 100) continue;
      const r = el.getBoundingClientRect();
      if (r.width < window.innerWidth * 0.5 || r.height < window.innerHeight * 0.5) continue;
      blockers.push({
        tag: el.tagName,
        id: el.id || '',
        className: (el.className || '').toString().slice(0, 60),
        zIndex: st.zIndex,
        pointerEvents: st.pointerEvents,
        opacity: st.opacity,
      });
    }
    return blockers.slice(0, 8);
  });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ...DEVICE,
  locale: 'he-IL',
  hasTouch: true,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGE:' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const ORIN = `${BASE}/ai-marketing-platform.html?stay=hub&t=${Date.now()}`;
const tOrin = Date.now();
await page.goto(ORIN, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => !!document.querySelector('.hub-card-pirsum') || !!window.openPirsumStandalone, { timeout: 120000 });
await sleep(2500);
report.phases.orinBootMs = Date.now() - tOrin;

const orinOverlays = await probeOverlays(page);
report.phases.orinOverlays = orinOverlays;
check('Orin: no full-screen blocker overlay', orinOverlays.length === 0, JSON.stringify(orinOverlays));

const tPirsumTap = Date.now();
await page.locator('.hub-card-pirsum').tap();
await page.waitForURL(/pirsum-home/, { timeout: 45000 });
report.phases.orinToHomeMs = Date.now() - tPirsumTap;
check('Orin → pirsum-home (touch/open)', /pirsum-home/.test(page.url()));

await sleep(600);
const homeMeta = await page.evaluate(() => ({
  workHref: document.getElementById('link-work')?.href || '',
  controlHref: document.getElementById('link-control')?.getAttribute('href') || '',
  workIsHash: (document.getElementById('link-work')?.getAttribute('href') || '') === '#',
  overlays: [],
}));
const homeOverlays = await probeOverlays(page);
homeMeta.overlays = homeOverlays;
report.phases.home = homeMeta;
check('Home: work href not #', !homeMeta.workIsHash, homeMeta.workHref.slice(0, 80));
check('Home: no full-screen overlay', homeOverlays.length === 0, JSON.stringify(homeOverlays));

const tWork = Date.now();
await tapLink(page, '#link-work');
await page.waitForURL(/work-center-lite/, { timeout: 60000 });
await page.waitForFunction(() => !!document.getElementById('frame-a'), { timeout: 30000 });
report.phases.workOpenMs = Date.now() - tWork;
check('Touch: work center opens', /work-center-lite/.test(page.url()));

await page.goto(`${BASE}/coco-dalia/pirsum-home.html?clientId=dalia-c-official&clientName=test`, { waitUntil: 'domcontentloaded' });
await sleep(400);

const tCtrl = Date.now();
await tapLink(page, '#link-control');
await page.waitForURL(/ai-control-center-v5-STANDALONE/, { timeout: 120000 });
await page.waitForFunction(() => !!document.getElementById('home') && !!document.getElementById('cat-grid'), { timeout: 120000 });
report.phases.controlOpenMs = Date.now() - tCtrl;
const ctrlOverlays = await probeOverlays(page);
report.phases.controlOverlays = ctrlOverlays;
check('Touch: control center opens', /ai-control-center-v5-STANDALONE/.test(page.url()));
check('Control: home grid rendered', await page.evaluate(() => document.querySelectorAll('#cat-grid .cat-tile').length > 0));

const homeUrl = `${BASE}/coco-dalia/pirsum-home.html?clientId=dalia-c-official`;
const workUrl = await page.evaluate(() => {
  const w = document.getElementById('link-work');
  return w ? w.href : '';
});
let ctrlUrl = await page.evaluate(() => {
  const c = document.querySelector('a[href*="pirsum-home"]');
  return c ? c.href : '';
});
if (!ctrlUrl.includes('pirsum-home')) {
  await page.goto(homeUrl, { waitUntil: 'domcontentloaded' });
  ctrlUrl = await page.evaluate(() => document.getElementById('link-control')?.href || '');
}
const workAbs = workUrl || `${BASE}/coco-dalia/work-center-lite.html?clientId=dalia-c-official`;
const ctrlAbs = ctrlUrl || `${BASE}/ai-marketing/ai-control-center-v5-STANDALONE.html?clientId=dalia-c-official`;

const switchTimes = [];
let switchFails = 0;
for (let i = 0; i < ROUNDS; i++) {
  try {
    const a = Date.now();
    await page.goto(workAbs.split('?')[0] + '?clientId=dalia-c-official&from=mobile-test&n=' + i, { waitUntil: 'commit', timeout: 90000 });
    await page.waitForSelector('#frame-a', { timeout: 30000 });
    const toWork = Date.now() - a;
    const b = Date.now();
    await page.goto(ctrlAbs.split('?')[0] + '?clientId=dalia-c-official&from=mobile-test&n=' + i, { waitUntil: 'commit', timeout: 120000 });
    await page.waitForSelector('#cat-grid .cat-tile', { timeout: 120000 });
    switchTimes.push({ toWork, toCtrl: Date.now() - b });
  } catch (e) {
    switchFails++;
    switchTimes.push({ error: String(e.message || e) });
  }
}
report.phases.switchTimes = switchTimes;
report.phases.switchFails = switchFails;
report.phases.switchMax = Math.max(...switchTimes.filter((x) => !x.error).map((x) => x.toWork + x.toCtrl), 0);
check(`${ROUNDS} work↔control round-trips`, switchFails === 0, `fails=${switchFails}`);
check('Mobile: no hang (switchMax < 180s)', report.phases.switchMax < 180000, String(report.phases.switchMax));

await page.goto(ctrlAbs.split('?')[0] + '?clientId=dalia-c-official', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForSelector('#cat-grid .cat-tile', { timeout: 120000 });
const tTile = Date.now();
await page.locator('#cat-grid .cat-tile').first().tap();
await sleep(300);
const tileOk = await page.evaluate(() => !document.getElementById('home')?.classList.contains('on'));
check('Control: touch category tile responds', tileOk, String(Date.now() - tTile) + 'ms');

report.console = { errors: [...new Set(errors)].slice(0, 25), count: errors.length };
report.passed = report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'pirsum-mobile-verify.json'), JSON.stringify(report, null, 2));
console.log('\nSUMMARY', JSON.stringify({
  passed: report.passed,
  orinBootMs: report.phases.orinBootMs,
  workOpenMs: report.phases.workOpenMs,
  controlOpenMs: report.phases.controlOpenMs,
  switchMax: report.phases.switchMax,
  switchFails: report.phases.switchFails,
  failCount: report.checks.filter((c) => !c.ok).length,
}, null, 2));
await browser.close();
process.exit(report.passed ? 0 : 1);
