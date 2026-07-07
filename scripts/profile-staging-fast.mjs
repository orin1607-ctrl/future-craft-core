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
    iframes: Array.from(document.querySelectorAll('iframe')).map((f) => ({
      id: f.id, src: f.src, loaded: f.src && f.src !== 'about:blank',
    })),
    clientId: window.DaliaSite?.SITE?.clientId || null,
  }));
}

async function iframeMetrics(page) {
  const out = [];
  for (const f of page.frames()) {
    if (f === page.mainFrame()) continue;
    try {
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

const report = { url: URL, at: new Date().toISOString(), phases: {}, stress: {}, before: {}, after: {} };
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const t0 = Date.now();
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => document.body.classList.contains('coco-pirsum-active') || document.getElementById('screen-pirsum')?.classList.contains('active'), { timeout: 60000 });
report.phases.bootMs = Date.now() - t0;
report.phases.boot = await metrics(page);

await page.waitForTimeout(6000);
report.phases.workBoot = await metrics(page);
report.phases.workIframes = await iframeMetrics(page);

await page.click('#pirsum-tab-control');
await page.waitForTimeout(8000);
report.phases.control = await metrics(page);
report.phases.controlIframes = await iframeMetrics(page);

await page.click('#pirsum-tab-work');
await page.waitForTimeout(3000);
report.phases.backWork = await metrics(page);
report.phases.backWorkIframes = await iframeMetrics(page);

const tabStress = [];
for (let i = 0; i < 20; i++) {
  const a = Date.now();
  await page.click('#pirsum-tab-control');
  await page.waitForTimeout(200);
  const toCtrl = Date.now() - a;
  const b = Date.now();
  await page.click('#pirsum-tab-work');
  await page.waitForTimeout(200);
  tabStress.push({ i, toCtrl, toWork: Date.now() - b });
}
report.stress.tabSwitch = tabStress;
report.stress.tabAvg = +(tabStress.reduce((s, x) => s + x.toCtrl + x.toWork, 0) / tabStress.length).toFixed(0);
report.stress.tabMax = Math.max(...tabStress.map((x) => x.toCtrl + x.toWork));

const loadedIframes = report.phases.backWorkIframes.filter((f) => f.url && !f.url.includes('about:blank'));
report.singleIframeOk = loadedIframes.length <= 1;
report.errors = errors.slice(0, 20);
report.passed = report.singleIframeOk && report.stress.tabMax < 5000 && errors.length < 5;

writeFileSync(join(OUT, 'profile-fast.json'), JSON.stringify(report, null, 2));
await browser.close();
console.log(JSON.stringify(report, null, 2));
process.exit(report.passed ? 0 : 1);
