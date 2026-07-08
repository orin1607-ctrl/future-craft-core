/**
 * Freeze check after work-lite shell (#1 root fix)
 * Expects: work-center-lite (not WIRED), single heavy iframe alive, stable tab switches.
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const URL = `${BASE}/ai-marketing-platform.html?hub=lite&t=${Date.now()}`;
const OUT = join(__dirname, '../docs/audit-reports/staging-freeze-diagnostic');
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const report = { url: URL, at: new Date().toISOString(), beforeNote: 'prefix: tabMax~100s+ Playwright hung; WIRED 469KB' };
const t0 = Date.now();
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => document.querySelector('.screen.active'), { timeout: 90000 });
await sleep(2500);
report.bootMs = Date.now() - t0;

const snap = () => page.evaluate(() => ({
  ver: window.CocoPirsumHub?.VERSION,
  liteShell: !!(window.CocoPirsumHub && CocoPirsumHub.useLiteWorkShell && CocoPirsumHub.useLiteWorkShell()),
  clientId: window.DaliaSite?.SITE?.clientId || null,
  screens: [...document.querySelectorAll('#coco-claude-root > .screen')].map((s) => s.id),
  iframes: [...document.querySelectorAll('iframe')].map((f) => ({ id: f.id, src: f.src, on: f.classList.contains('on') })),
  heapMb: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
}));

report.boot = await snap();

if (report.boot.screens.indexOf('screen-pirsum') < 0 || !report.boot.iframes.find((f) => f.id === 'pirsum-frame-work' && f.src && f.src !== 'about:blank')) {
  await page.click('.hub-card-pirsum').catch(() => {});
  await sleep(2000);
}

await page.evaluate(() => window.CocoPirsumHub?.showTab('work'));
await page.waitForFunction(() => {
  const f = document.getElementById('pirsum-frame-work');
  return f && f.src && f.src !== 'about:blank';
}, { timeout: 60000 });
await sleep(1500);
report.work = await snap();

const workSrc = report.work.iframes.find((f) => f.id === 'pirsum-frame-work')?.src || '';
report.usesLiteShell = /work-center-lite/.test(workSrc);
report.usesWired = /WIRED/.test(workSrc);

const tabs = [];
for (let i = 0; i < 12; i++) {
  const a = Date.now();
  await page.evaluate(() => window.CocoPirsumHub?.showTab('control'));
  await page.waitForFunction(() => {
    const f = document.getElementById('pirsum-frame-control');
    return f && f.src && /control-center/.test(f.src);
  }, { timeout: 60000 }).catch(() => {});
  const toCtrl = Date.now() - a;
  const mid = await snap();
  const workAlive = mid.iframes.find((f) => f.id === 'pirsum-frame-work')?.src;
  const ctrlAlive = mid.iframes.find((f) => f.id === 'pirsum-frame-control')?.src;
  const bothHeavy = workAlive && workAlive !== 'about:blank' && ctrlAlive && ctrlAlive !== 'about:blank';

  const b = Date.now();
  await page.evaluate(() => window.CocoPirsumHub?.showTab('work'));
  await page.waitForFunction(() => {
    const f = document.getElementById('pirsum-frame-work');
    return f && f.src && f.src !== 'about:blank';
  }, { timeout: 60000 }).catch(() => {});
  const toWork = Date.now() - b;
  tabs.push({ i, toCtrl, toWork, bothHeavy });
}
report.tabs = tabs;
report.tabAvg = Math.round(tabs.reduce((s, x) => s + x.toCtrl + x.toWork, 0) / tabs.length);
report.tabMax = Math.max(...tabs.map((x) => x.toCtrl + x.toWork));
report.bothHeavyCount = tabs.filter((x) => x.bothHeavy).length;
report.final = await snap();
report.consoleErrors = [...new Set(errors)].slice(0, 20);
report.passed =
  report.usesLiteShell &&
  !report.usesWired &&
  report.tabMax < 8000 &&
  report.bothHeavyCount === 0 &&
  report.boot.clientId === 'dalia-c-official' &&
  /1\.3\.0-work-lite/.test(report.boot.ver || '');

writeFileSync(join(OUT, 'after-work-lite.json'), JSON.stringify(report, null, 2));
await browser.close();
console.log(JSON.stringify({
  passed: report.passed,
  bootMs: report.bootMs,
  ver: report.boot.ver,
  usesLiteShell: report.usesLiteShell,
  usesWired: report.usesWired,
  tabAvg: report.tabAvg,
  tabMax: report.tabMax,
  bothHeavyCount: report.bothHeavyCount,
  clientId: report.boot.clientId,
}, null, 2));
process.exit(report.passed ? 0 : 1);
