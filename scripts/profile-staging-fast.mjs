/**
 * Fast staging stability profile (Lite + single iframe)
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const URL = `${BASE}/ai-marketing-platform.html?hub=lite&perf=${Date.now()}`;
const OUT = join(__dirname, '../docs/audit-reports/staging-performance-profile');
mkdirSync(OUT, { recursive: true });

async function metrics(page) {
  return page.evaluate(() => ({
    heapMb: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
    dom: document.getElementsByTagName('*').length,
    scripts: document.querySelectorAll('script[src]').length,
    lite: document.body.classList.contains('coco-hub-lite'),
    pirsumActive: document.body.classList.contains('coco-pirsum-active'),
    screens: Array.from(document.querySelectorAll('#coco-claude-root > .screen')).map((s) => s.id),
    iframes: Array.from(document.querySelectorAll('iframe')).map((f) => ({
      id: f.id, src: f.src, loaded: !!(f.src && f.src !== 'about:blank'),
    })),
    clientId: window.DaliaSite?.SITE?.clientId || null,
  }));
}

async function iframeMetrics(page) {
  const out = [];
  for (const f of page.frames()) {
    if (f === page.mainFrame()) continue;
    try {
      const url = f.url();
      if (!url || url === 'about:blank') continue;
      out.push(await f.evaluate(() => ({
        url: location.href.split('?')[0],
        dom: document.getElementsByTagName('*').length,
        heapMb: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
        scripts: document.querySelectorAll('script[src]').length,
      })));
    } catch (e) {
      out.push({ url: f.url(), error: String(e.message || e) });
    }
  }
  return out;
}

async function showTab(page, tab) {
  return page.evaluate(function (t) {
    if (window.CocoPirsumHub && CocoPirsumHub.showTab) {
      CocoPirsumHub.showTab(t);
      return true;
    }
    return false;
  }, tab);
}

const report = { url: URL, at: new Date().toISOString(), phases: {}, stress: {} };
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const t0 = Date.now();
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => document.getElementById('screen-pirsum')?.classList.contains('active'), { timeout: 90000 });
await page.waitForFunction(() => !!(window.CocoPirsumHub && window.CocoPirsumHub.showTab), { timeout: 30000 });
report.phases.bootMs = Date.now() - t0;
report.phases.boot = await metrics(page);

const tWork = Date.now();
await showTab(page, 'work');
await page.waitForFunction(() => {
  const f = document.getElementById('pirsum-frame-work');
  return f && f.src && f.src !== 'about:blank';
}, { timeout: 120000 });
report.phases.workIframeMs = Date.now() - tWork;
report.phases.work = await metrics(page);
report.phases.workIframes = await iframeMetrics(page);

const tCtrl = Date.now();
await showTab(page, 'control');
await page.waitForFunction(() => {
  const f = document.getElementById('pirsum-frame-control');
  return f && f.src && f.src !== 'about:blank';
}, { timeout: 120000 });
report.phases.controlIframeMs = Date.now() - tCtrl;
report.phases.control = await metrics(page);
report.phases.controlIframes = await iframeMetrics(page);

const tabStress = [];
for (let i = 0; i < 20; i++) {
  const a = Date.now();
  await showTab(page, 'control');
  const toCtrl = Date.now() - a;
  const b = Date.now();
  await showTab(page, 'work');
  tabStress.push({ i, toCtrl, toWork: Date.now() - b });
}
report.stress.tabSwitch = tabStress;
report.stress.tabAvg = +(tabStress.reduce((s, x) => s + x.toCtrl + x.toWork, 0) / tabStress.length).toFixed(0);
report.stress.tabMax = Math.max(...tabStress.map((x) => x.toCtrl + x.toWork));

report.phases.afterStress = await metrics(page);
report.phases.afterStressIframes = await iframeMetrics(page);
report.tabCacheOk = report.stress.tabMax < 2000;
report.passed = report.tabCacheOk && report.stress.tabAvg < 1000 && report.phases.boot.screens?.join(',') === 'screen-hub,screen-pirsum';

writeFileSync(join(OUT, 'profile-fast.json'), JSON.stringify(report, null, 2));
await browser.close();
console.log(JSON.stringify({ passed: report.passed, bootMs: report.phases.bootMs, workIframeMs: report.phases.workIframeMs, controlIframeMs: report.phases.controlIframeMs, tabAvg: report.stress.tabAvg, tabMax: report.stress.tabMax, tabCacheOk: report.tabCacheOk }, null, 2));
process.exit(report.passed ? 0 : 1);
