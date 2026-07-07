/**
 * Full staging performance + stability profile (Orin Staging)
 * Measures shell, iframes, memory, listeners, network, stress transitions.
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

const report = {
  url: URL,
  at: new Date().toISOString(),
  phases: {},
  scripts: {},
  network: {},
  stress: {},
  issues: [],
  consoleErrors: [],
  pageErrors: [],
};

function snap(label) {
  return { label, at: Date.now() };
}

async function collectMetrics(page, label) {
  return page.evaluate(async (lbl) => {
    function resourceSizes() {
      const entries = performance.getEntriesByType('resource');
      let js = 0, css = 0, html = 0, fetch = 0, other = 0, count = 0;
      const byName = {};
      entries.forEach((e) => {
        count++;
        const t = (e.initiatorType || 'other');
        const sz = e.transferSize || e.encodedBodySize || 0;
        if (/\.js($|\?)/i.test(e.name)) js += sz;
        else if (/\.css($|\?)/i.test(e.name)) css += sz;
        else if (/\.html($|\?)/i.test(e.name)) html += sz;
        else if (t === 'fetch' || t === 'xmlhttprequest') fetch += sz;
        else other += sz;
        const short = e.name.split('/').pop().split('?')[0];
        byName[short] = (byName[short] || 0) + sz;
      });
      return { count, js, css, html, fetch, other, byName };
    }

    function listenerCount(root) {
      let n = 0;
      const all = root.querySelectorAll('*');
      all.forEach((el) => {
        if (typeof getEventListeners === 'function') {
          const m = getEventListeners(el);
          n += Object.keys(m).reduce((a, k) => a + m[k].length, 0);
        }
      });
      return n;
    }

    const mem = performance.memory
      ? {
          usedJSHeapMb: +(performance.memory.usedJSHeapSize / 1048576).toFixed(2),
          totalJSHeapMb: +(performance.memory.totalJSHeapSize / 1048576).toFixed(2),
          limitJSHeapMb: +(performance.memory.jsHeapSizeLimit / 1048576).toFixed(2),
        }
      : null;

    const scripts = Array.from(document.querySelectorAll('script[src]')).map((s) => s.src);
    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((l) => l.href);
    const iframes = Array.from(document.querySelectorAll('iframe')).map((f) => ({
      id: f.id,
      src: f.src,
      loaded: !!(f.src && f.src !== 'about:blank'),
      display: getComputedStyle(f).display,
      className: f.className,
    }));

    let lsBytes = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        lsBytes += (k.length + (localStorage.getItem(k) || '').length) * 2;
      }
    } catch (e) { /* ignore */ }

    const domNodes = document.getElementsByTagName('*').length;
    const screens = Array.from(document.querySelectorAll('#coco-claude-root > .screen')).map((s) => s.id);

    // Long tasks in main frame (approx via PerformanceObserver buffer if any)
    const longTasks = performance.getEntriesByType('longtask').map((t) => ({
      duration: +t.duration.toFixed(1),
      start: +t.startTime.toFixed(0),
    }));

    return {
      label: lbl,
      timing: {
        domInteractive: performance.timing ? performance.timing.domInteractive - performance.timing.navigationStart : null,
        domComplete: performance.timing ? performance.timing.domComplete - performance.timing.navigationStart : null,
      },
      mem,
      domNodes,
      screens,
      scripts: { count: scripts.length, urls: scripts },
      styles: { count: styles.length, urls: styles },
      iframes,
      resources: resourceSizes(),
      localStorageKb: +(lsBytes / 1024).toFixed(1),
      longTasks,
      lite: document.body.classList.contains('coco-hub-lite'),
      clientId: window.DaliaSite?.SITE?.clientId || null,
    };
  }, label);
}

async function collectIframeMetrics(page) {
  const frames = page.frames();
  const out = [];
  for (const frame of frames) {
    if (frame === page.mainFrame()) continue;
    try {
      const m = await frame.evaluate(() => {
        const mem = performance.memory
          ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(2)
          : null;
        return {
          url: location.href,
          domNodes: document.getElementsByTagName('*').length,
          scripts: document.querySelectorAll('script[src]').length,
          heapMb: mem,
          title: document.title,
        };
      });
      out.push(m);
    } catch (e) {
      out.push({ url: frame.url(), error: String(e.message || e) });
    }
  }
  return out;
}

function note(severity, where, what, evidence) {
  report.issues.push({ severity, where, what, evidence });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const requests = [];
page.on('request', (r) => {
  requests.push({ url: r.url(), type: r.resourceType(), at: Date.now() });
});
page.on('console', (msg) => {
  if (msg.type() === 'error') report.consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => report.pageErrors.push(String(err)));

const t0 = Date.now();
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => document.getElementById('screen-hub') && !document.body.classList.contains('coco-boot-active'), { timeout: 120000 });
report.phases.shellReadyMs = Date.now() - t0;
report.phases.shell = await collectMetrics(page, 'shell-ready');
report.phases.shellIframes = await collectIframeMetrics(page);

// Open פרסום
const tPirsum = Date.now();
await page.click('#screen-hub .hub-card-pirsum');
await page.waitForSelector('#screen-pirsum.active', { timeout: 30000 });
report.phases.pirsumOpenMs = Date.now() - tPirsum;
report.phases.pirsum = await collectMetrics(page, 'pirsum-open');

// Work iframe
const tWork = Date.now();
await page.click('#pirsum-tab-work');
await page.waitForFunction(() => {
  const f = document.getElementById('pirsum-frame-work');
  return f && f.src && f.src !== 'about:blank';
}, { timeout: 120000 });
await page.waitForTimeout(5000);
report.phases.workIframeMs = Date.now() - tWork;
report.phases.work = await collectMetrics(page, 'work-iframe');
report.phases.workIframes = await collectIframeMetrics(page);

// Control iframe
const tCtrl = Date.now();
await page.click('#pirsum-tab-control');
await page.waitForFunction(() => {
  const f = document.getElementById('pirsum-frame-control');
  return f && f.src && f.src !== 'about:blank';
}, { timeout: 120000 });
await page.waitForTimeout(8000);
report.phases.controlIframeMs = Date.now() - tCtrl;
report.phases.both = await collectMetrics(page, 'both-iframes');
report.phases.bothIframes = await collectIframeMetrics(page);

// Network summary
const apiCalls = requests.filter((r) =>
  /supabase|functions\/v1|googleapis|google\.com|openai|anthropic|gemini/i.test(r.url)
);
report.network = {
  totalRequests: requests.length,
  apiLikeRequests: apiCalls.length,
  apiSamples: apiCalls.slice(0, 30).map((r) => r.url.split('?')[0]),
  jsRequests: requests.filter((r) => r.type === 'script').length,
  cssRequests: requests.filter((r) => r.type === 'stylesheet').length,
};

// Stress: 20 hub <-> pirsum + 20 tab switches
const stress = { hubPirsum: [], tabSwitch: [], freezes: [] };
for (let i = 0; i < 20; i++) {
  const a = Date.now();
  await page.click('button:has-text("חזרה ל-Orin")').catch(() => page.evaluate(() => goScreen('screen-hub')));
  await page.waitForSelector('#screen-hub.active', { timeout: 15000 });
  const toHub = Date.now() - a;
  const b = Date.now();
  await page.click('#screen-hub .hub-card-pirsum');
  await page.waitForSelector('#screen-pirsum.active', { timeout: 15000 });
  const toPirsum = Date.now() - b;
  stress.hubPirsum.push({ i, toHub, toPirsum, total: toHub + toPirsum });
  if (toHub + toPirsum > 3000) stress.freezes.push({ type: 'hub-pirsum', i, ms: toHub + toPirsum });
}

for (let i = 0; i < 20; i++) {
  const a = Date.now();
  await page.click('#pirsum-tab-work');
  await page.waitForTimeout(300);
  const toWork = Date.now() - a;
  const b = Date.now();
  await page.click('#pirsum-tab-control');
  await page.waitForTimeout(300);
  const toCtrl = Date.now() - b;
  stress.tabSwitch.push({ i, toWork, toCtrl });
  if (toWork > 2000 || toCtrl > 2000) stress.freezes.push({ type: 'tab-switch', i, toWork, toCtrl });
}

report.phases.afterStress = await collectMetrics(page, 'after-stress');
report.phases.afterStressIframes = await collectIframeMetrics(page);
report.stress = {
  hubPirsumAvg: +(stress.hubPirsum.reduce((s, x) => s + x.total, 0) / stress.hubPirsum.length).toFixed(0),
  hubPirsumMax: Math.max(...stress.hubPirsum.map((x) => x.total)),
  tabSwitchWorkAvg: +(stress.tabSwitch.reduce((s, x) => s + x.toWork, 0) / stress.tabSwitch.length).toFixed(0),
  tabSwitchCtrlAvg: +(stress.tabSwitch.reduce((s, x) => s + x.toCtrl, 0) / stress.tabSwitch.length).toFixed(0),
  freezes: stress.freezes,
  samples: { hubPirsum: stress.hubPirsum.slice(0, 5), tabSwitch: stress.tabSwitch.slice(0, 5) },
};

report.totalMs = Date.now() - t0;

// Auto-detect issues from metrics
if (report.phases.bothIframes?.length >= 2) {
  const heaps = report.phases.bothIframes.filter((f) => f.heapMb).map((f) => f.heapMb);
  const doms = report.phases.bothIframes.filter((f) => f.domNodes).map((f) => f.domNodes);
  if (heaps.length >= 2 && heaps.reduce((a, b) => a + b, 0) > 80) {
    note('high', 'iframes', 'Dual iframe memory — both מרכז עבודה and מרכז שליטה loaded simultaneously',
      { heaps, doms });
  }
}
if (report.phases.shell?.domNodes > 3000) {
  note('medium', 'shell', 'Shell DOM still large despite Lite', { domNodes: report.phases.shell.domNodes });
}
if (report.stress.freezes.length) {
  note('high', 'navigation', 'Slow transitions detected in stress test', report.stress.freezes);
}
const workFrame = report.phases.bothIframes?.find((f) => /coco-dalia-full/i.test(f.url || ''));
if (workFrame?.domNodes > 5000) {
  note('high', 'iframe-work', 'מרכז העבודה DOM extremely heavy', workFrame);
}

writeFileSync(join(OUT, 'profile.json'), JSON.stringify(report, null, 2));
await page.screenshot({ path: join(OUT, 'final-state.png'), timeout: 15000 }).catch(() => {});
await browser.close();

console.log('Profile written:', join(OUT, 'profile.json'));
console.log('Total ms:', report.totalMs);
console.log('Issues:', report.issues.length);
report.issues.forEach((i) => console.log(`[${i.severity}] ${i.where}: ${i.what}`));
process.exit(0);
