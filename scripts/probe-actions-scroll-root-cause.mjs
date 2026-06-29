/**
 * Deep scroll bottleneck probe — actions screen only.
 * Measures bind/rerender/DOM/layout during simulated mobile scroll.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { chromium, devices } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VER = 'v3-final-strict-9';
const URL = process.env.STAGING_PAGES_URL ||
  `https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=${VER}`;
const OUT = join(ROOT, 'docs', 'audit-reports', 'actions-scroll-root-cause');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ ...devices['iPhone 13'] });

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 250)); });

await page.goto(URL, { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForFunction(() => typeof window.goScreen === 'function', { timeout: 90000 });

await page.evaluate(() => {
  window.__actProbe = {
    bindScreen: 0,
    bindAll: 0,
    bindActions: 0,
    setHtmlPending: 0,
    rerender: 0,
    innerHtmlBytes: 0,
    windowScroll: 0,
    contentScroll: 0,
    gfcSync: 0,
    deriveActionsMs: 0,
    renderMs: 0,
    events: [],
  };
  const p = window.__actProbe;

  if (window.CocoData && CocoData.bindScreen) {
    const orig = CocoData.bindScreen.bind(CocoData);
    CocoData.bindScreen = function (id) {
      if (id === 'screen-actions') {
        p.bindScreen++;
        p.events.push({ t: Date.now(), type: 'bindScreen', id });
      }
      return orig(id);
    };
  }
  if (window.CocoData && CocoData.bindAll) {
    const origA = CocoData.bindAll.bind(CocoData);
    CocoData.bindAll = function () {
      p.bindAll++;
      p.events.push({ t: Date.now(), type: 'bindAll' });
      return origA();
    };
  }
  if (window.ActionsWorkbench && ActionsWorkbench.rerender) {
    const origR = ActionsWorkbench.rerender.bind(ActionsWorkbench);
    ActionsWorkbench.rerender = function () {
      p.rerender++;
      p.events.push({ t: Date.now(), type: 'rerender' });
      return origR();
    };
  }
  const pending = document.getElementById('coco-live-actions-pending');
  if (pending) {
    const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    const origSet = desc && desc.set;
    if (origSet) {
      Object.defineProperty(pending, 'innerHTML', {
        set(v) {
          p.setHtmlPending++;
          p.innerHtmlBytes = (v && v.length) || 0;
          p.events.push({ t: Date.now(), type: 'innerHTML', bytes: p.innerHtmlBytes });
          origSet.call(this, v);
        },
        get() { return desc.get.call(this); },
        configurable: true,
      });
    }
  }
  if (window.CocoUnified && CocoUnified.syncGfcPosition) {
    const origG = CocoUnified.syncGfcPosition.bind(CocoUnified);
    CocoUnified.syncGfcPosition = function () {
      p.gfcSync++;
      return origG();
    };
  }
  window.addEventListener('scroll', () => { p.windowScroll++; }, { passive: true, capture: true });
});

await page.evaluate(() => goScreen('screen-actions'));
await page.waitForSelector('#coco-live-actions-pending[data-coco-act-ready="true"]', { timeout: 90000, state: 'attached' });
await page.waitForSelector('.coco-act-lite-card', { timeout: 60000, state: 'attached' });

const baseline = await page.evaluate(() => {
  const sc = document.getElementById('screen-actions');
  const content = sc?.querySelector('.content');
  const cs = content ? getComputedStyle(content) : null;
  return {
    totalDom: document.querySelectorAll('*').length,
    screenActionsDom: document.querySelectorAll('#screen-actions *').length,
    pendingHtml: document.getElementById('coco-live-actions-pending')?.innerHTML.length || 0,
    scrollHeight: content?.scrollHeight || 0,
    clientHeight: content?.clientHeight || 0,
    contentOverflow: cs?.overflowY,
    contentContain: cs?.contain,
    contentTouchAction: cs?.touchAction,
    gfcFixed: getComputedStyle(document.getElementById('coco-gfc-chrome') || document.body).position,
    inactiveScreensDom: Array.from(document.querySelectorAll('#coco-claude-root > .screen:not(.active)'))
      .reduce((n, s) => n + s.querySelectorAll('*').length, 0),
    goalsScreenDom: document.querySelectorAll('#screen-goals *').length,
  };
});

// Reset probe counters after load
await page.evaluate(() => {
  const p = window.__actProbe;
  ['bindScreen', 'bindAll', 'setHtmlPending', 'rerender', 'windowScroll', 'contentScroll', 'gfcSync'].forEach((k) => { p[k] = 0; });
  p.events = [];
});

const scrollProbe = await page.evaluate(async () => {
  const p = window.__actProbe;
  const content = document.querySelector('#screen-actions .content');
  if (!content) return { error: 'no content el' };

  content.addEventListener('scroll', () => { p.contentScroll++; }, { passive: true });

  const layoutSamples = [];
  const scrollSamples = [];
  const tStart = performance.now();

  // Simulate touch scroll like mobile — incremental with rAF (momentum-like)
  for (let i = 0; i < 40; i++) {
    const t0 = performance.now();
    content.scrollTop += 120;
    scrollSamples.push(performance.now() - t0);
    // Force layout read (detect thrashing pattern)
    const t1 = performance.now();
    void content.getBoundingClientRect();
    void content.scrollHeight;
    layoutSamples.push(performance.now() - t1);
    await new Promise((r) => requestAnimationFrame(r));
  }
  // Idle period — deferred bind may fire here
  await new Promise((r) => setTimeout(r, 600));
  const tEnd = performance.now();

  const deriveBench = performance.now();
  let actions = [];
  if (window.CocoData && window.FilterEngine) {
    try {
      const bundle = window.DaliaSite && DaliaSite.getWorkPlan && DaliaSite.getWorkPlan();
      const wp = bundle || {};
      // approximate deriveActions cost
      const pages = (wp.pages || []);
      actions = pages.length;
    } catch (e) { /* ignore */ }
  }

  return {
    durationMs: tEnd - tStart,
    scrollMaxMs: Math.max(...scrollSamples),
    scrollAvgMs: scrollSamples.reduce((a, b) => a + b, 0) / scrollSamples.length,
    layoutReadMaxMs: Math.max(...layoutSamples),
    layoutReadAvgMs: layoutSamples.reduce((a, b) => a + b, 0) / layoutSamples.length,
    finalScrollTop: content.scrollTop,
    probe: { ...p },
    isScrollingAfter: window.ActionsWorkbench?.isUserScrolling?.() || false,
  };
});

// CPU cost of full render path
const renderCost = await page.evaluate(() => {
  if (!window.ActionsWorkbench || !window.CocoData) return null;
  const t0 = performance.now();
  CocoData.bindScreen('screen-actions');
  const bindMs = performance.now() - t0;
  return { bindScreenMs: bindMs, probe: { ...window.__actProbe } };
});

// WebKit-specific: check if document is scrollable instead of content
const scrollTarget = await page.evaluate(() => {
  const content = document.querySelector('#screen-actions .content');
  const docEl = document.documentElement;
  return {
    bodyScrollTop: document.body.scrollTop,
    docScrollTop: docEl.scrollTop,
    contentScrollTop: content?.scrollTop || 0,
    bodyOverflow: getComputedStyle(document.body).overflow,
    rootMinHeight: getComputedStyle(document.getElementById('coco-claude-root')).minHeight,
    screenDisplay: getComputedStyle(document.getElementById('screen-actions')).display,
    screenHeight: document.getElementById('screen-actions')?.getBoundingClientRect().height,
    contentHeight: content?.getBoundingClientRect().height,
  };
});

await browser.close();

const report = {
  at: new Date().toISOString(),
  url: URL,
  baseline,
  duringScroll: scrollProbe,
  fullBindCost: renderCost,
  scrollTarget,
  consoleErrors,
  analysis: {
    domInActionsScreen: baseline.screenActionsDom,
    hiddenInactiveScreensDom: baseline.inactiveScreensDom,
    goalsScreenDom: baseline.goalsScreenDom,
    bindDuringScroll: scrollProbe.probe?.bindScreen || 0,
    innerHtmlDuringScroll: scrollProbe.probe?.setHtmlPending || 0,
    rerenderDuringScroll: scrollProbe.probe?.rerender || 0,
    bindAllDuringScroll: scrollProbe.probe?.bindAll || 0,
    gfcSyncDuringScroll: scrollProbe.probe?.gfcSync || 0,
    postScrollIdleEvents: (scrollProbe.probe?.events || []).filter((e) => e.type !== 'contentScroll'),
  },
};

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  screenActionsDom: baseline.screenActionsDom,
  inactiveScreensDom: baseline.inactiveScreensDom,
  bindDuringScroll: report.analysis.bindDuringScroll,
  innerHtmlDuringScroll: report.analysis.innerHtmlDuringScroll,
  rerenderDuringScroll: report.analysis.rerenderDuringScroll,
  bindAllDuringScroll: report.analysis.bindAllDuringScroll,
  bindScreenMs: renderCost?.bindScreenMs,
  scrollMaxMs: scrollProbe.scrollMaxMs,
  contentScrollEvents: scrollProbe.probe?.contentScroll,
  windowScrollEvents: scrollProbe.probe?.windowScroll,
  contentContain: baseline.contentContain,
}, null, 2));
