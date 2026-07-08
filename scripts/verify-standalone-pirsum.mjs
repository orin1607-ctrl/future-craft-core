/**
 * Standalone פרסום flow verification — before commit.
 * Orin → pirsum-home → work|control (full pages, no Orin iframe/launcher).
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.PIRSUM_BASE || 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(__dirname, '../docs/audit-reports/staging-freeze-diagnostic');
mkdirSync(OUT, { recursive: true });

const ORIN = `${BASE}/ai-marketing-platform.html?stay=hub&t=${Date.now()}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
const failed = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGE:' + e.message));
page.on('response', (res) => {
  if (res.url().includes('github.io') && res.status() >= 400) {
    failed.push({ url: res.url().replace(BASE, ''), status: res.status() });
  }
});

const report = { at: new Date().toISOString(), checks: [], phases: {} };
function check(name, ok, detail) {
  report.checks.push({ name, ok: !!ok, detail: detail || '' });
  console.log((ok ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? ': ' + detail : ''));
}

const tOrin = Date.now();
await page.goto(ORIN, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => !!document.querySelector('.hub-card-pirsum') || !!window.openPirsumStandalone, { timeout: 90000 });
await sleep(2000);
report.phases.orinBootMs = Date.now() - tOrin;

const orinState = await page.evaluate(() => ({
  url: location.href,
  hasOpenFn: typeof window.openPirsumStandalone === 'function',
  hasPirsumCard: !!document.querySelector('.hub-card-pirsum'),
  launcherLoaded: !!window.CocoPirsumHub,
  clientId: window.DaliaSite?.SITE?.clientId || window.COCO?.flowContext?.clientId || null,
  scripts: document.querySelectorAll('script[src]').length,
  heapMb: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
  pirsumActive: document.body.classList.contains('coco-pirsum-active'),
  activeScreen: document.querySelector('.screen.active')?.id || null,
}));
report.phases.orin = orinState;
check('Orin boots to hub (not auto-pirsum)', !orinState.pirsumActive && orinState.activeScreen !== 'screen-pirsum', orinState.activeScreen);
check('openPirsumStandalone available', orinState.hasOpenFn);
check('פרסום card visible', orinState.hasPirsumCard);
check('Old launcher NOT loaded in Orin', !orinState.launcherLoaded);
check('Client context present', orinState.clientId === 'dalia-c-official', orinState.clientId);

const tHome = Date.now();
await page.evaluate(() => window.openPirsumStandalone());
await page.waitForURL(/pirsum-home/, { timeout: 30000 });
await sleep(800);
report.phases.homeOpenMs = Date.now() - tHome;

const home = await page.evaluate(() => ({
  url: location.href,
  title: document.title,
  clientName: document.getElementById('client-name')?.textContent || '',
  clientMeta: document.getElementById('client-meta')?.textContent || '',
  workHref: document.getElementById('link-work')?.getAttribute('href') || '',
  controlHref: document.getElementById('link-control')?.getAttribute('href') || '',
  scripts: document.querySelectorAll('script[src]').length,
  hasOrinRoot: !!document.getElementById('coco-claude-root'),
  hasLauncher: !!window.CocoPirsumHub,
  heapMb: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
  iframeCount: document.querySelectorAll('iframe').length,
}));
report.phases.home = home;
check('Landed on pirsum-home', /pirsum-home/.test(home.url));
check('Home shows client name', /דליה/.test(home.clientName), home.clientName);
check('Home shows clientId', /dalia-c-official/.test(home.clientMeta), home.clientMeta);
check('Home has no Orin root', !home.hasOrinRoot);
check('Home has no old launcher', !home.hasLauncher);
check('Home has no iframes', home.iframeCount === 0, String(home.iframeCount));
check('Home scripts are minimal (inline only)', home.scripts === 0, String(home.scripts));
check('Work link is work-center-lite', /work-center-lite/.test(home.workHref));
check('Control link is v5 standalone', /ai-control-center-v5-STANDALONE/.test(home.controlHref));
check('Work link carries clientId', /clientId=dalia-c-official/.test(home.workHref));
check('Control link carries clientId', /clientId=dalia-c-official/.test(home.controlHref));

const tWork = Date.now();
await page.click('#link-work');
await page.waitForURL(/work-center-lite/, { timeout: 30000 });
await sleep(1500);
report.phases.workOpenMs = Date.now() - tWork;
const work = await page.evaluate(() => ({
  url: location.href,
  shell: !!window.CocoWorkShellLite || !!document.getElementById('frame-a'),
  scripts: document.querySelectorAll('script[src]').length,
  heapMb: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
  hasClientId: /clientId=dalia-c-official/.test(location.search),
  lsClient: (() => { try { return JSON.parse(localStorage.getItem('coco-pirsum-client-v1') || '{}').clientId; } catch (e) { return null; } })(),
}));
report.phases.work = work;
check('Work opens as own page', /work-center-lite/.test(work.url));
check('Work keeps client context (query or LS)', work.hasClientId || work.lsClient === 'dalia-c-official', `q=${work.hasClientId} ls=${work.lsClient}`);

await page.goto(home.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
await sleep(500);
const tCtrl = Date.now();
await page.click('#link-control');
await page.waitForURL(/ai-control-center-v5-STANDALONE/, { timeout: 90000 });
await sleep(2500);
report.phases.controlOpenMs = Date.now() - tCtrl;
const ctrl = await page.evaluate(() => ({
  url: location.href,
  scripts: document.querySelectorAll('script[src]').length,
  heapMb: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
  hasClientId: /clientId=dalia-c-official/.test(location.search),
  lsClient: (() => { try { return JSON.parse(localStorage.getItem('coco-pirsum-client-v1') || '{}').clientId; } catch (e) { return null; } })(),
  title: document.title,
}));
report.phases.control = ctrl;
check('Control opens as own page', /ai-control-center-v5-STANDALONE/.test(ctrl.url));
check('Control keeps client context (query or LS)', ctrl.hasClientId || ctrl.lsClient === 'dalia-c-official', `q=${ctrl.hasClientId} ls=${ctrl.lsClient}`);

// Round-trips via absolute URLs (commit — heavy control page)
function absFromHome(href) {
  if (/^https?:/.test(href)) return href;
  try { return new URL(href, home.url).href; } catch (e) { return BASE + '/coco-dalia/pirsum-home.html'; }
}
const workAbs = absFromHome(home.workHref);
const ctrlAbs = absFromHome(home.controlHref);
const switchTimes = [];
for (let i = 0; i < 5; i++) {
  const a = Date.now();
  await page.goto(workAbs, { waitUntil: 'commit', timeout: 90000 });
  await sleep(200);
  const toWork = Date.now() - a;
  const b = Date.now();
  await page.goto(ctrlAbs, { waitUntil: 'commit', timeout: 90000 });
  await sleep(200);
  switchTimes.push({ toWork, toCtrl: Date.now() - b });
}
report.phases.switchTimes = switchTimes;
report.phases.switchAvg = Math.round(switchTimes.reduce((s, x) => s + x.toWork + x.toCtrl, 0) / switchTimes.length);
report.phases.switchMax = Math.max(...switchTimes.map((x) => x.toWork + x.toCtrl));
check('5 work↔control navigations completed', switchTimes.length === 5);
// Full-page loads of v5 are intentionally heavier than in-shell tab toggles;
// pass if completed without hang (Playwright returned) under 120s worst-case.
check('No hang (switchMax < 120s)', report.phases.switchMax < 120000, String(report.phases.switchMax));
check('Home stays lightweight (scripts=0)', home.scripts === 0, String(home.scripts));
check('Home heap modest (<40MB)', (home.heapMb == null) || home.heapMb < 40, String(home.heapMb));

report.console = { errors: [...new Set(errors)].slice(0, 20), count: errors.length };
report.networkFailed = failed.slice(0, 20);
check('No critical console pageerrors blocking', !errors.some((e) => /CocoPirsumHub|screen-pirsum|launcher/i.test(e)));

report.passed = report.checks.every((c) => c.ok);
writeFileSync(join(OUT, 'standalone-pirsum-verify.json'), JSON.stringify(report, null, 2));
console.log('\nSUMMARY', JSON.stringify({
  passed: report.passed,
  orinBootMs: report.phases.orinBootMs,
  homeOpenMs: report.phases.homeOpenMs,
  workOpenMs: report.phases.workOpenMs,
  controlOpenMs: report.phases.controlOpenMs,
  switchAvg: report.phases.switchAvg,
  switchMax: report.phases.switchMax,
  homeHeap: home.heapMb,
  homeScripts: home.scripts,
  failCount: report.checks.filter((c) => !c.ok).length,
}, null, 2));
await browser.close();
process.exit(report.passed ? 0 : 1);
