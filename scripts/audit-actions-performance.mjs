/**
 * Deep performance audit — Actions screen lite (read-only).
 * Output: docs/audit-reports/actions-performance-audit/
 */
import { writeFileSync, mkdirSync, readFileSync, copyFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { chromium, devices } from 'playwright';
import { P001 } from './project-001/_lib/config.mjs';

const VER = process.env.ACTIONS_AUDIT_VER || 'v3-actions-lite-1';
const STAGING =
  process.env.STAGING_PAGES_URL ||
  `https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=${VER}`;
const OUT = join(P001.root, 'docs', 'audit-reports', 'actions-performance-audit');
const WP_PATH = join(P001.root, 'public', 'project-001', 'site-work-plan.json');
const OUT_SUFFIX = process.env.AUDIT_OUT_SUFFIX || '';

mkdirSync(OUT, { recursive: true });

function git(cmd) {
  try {
    return execSync(cmd, { cwd: P001.root, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

const wp = JSON.parse(readFileSync(WP_PATH, 'utf8'));
const pages = wp.pages || [];
const actions = wp.actions || [];

async function auditViewport(name, viewport) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext(viewport ? { ...devices[viewport] } : { viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const consoleErrors = [];
  const networkFails = [];
  const pageErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300));
  });
  page.on('pageerror', (err) => pageErrors.push(String(err.message).slice(0, 300)));
  page.on('requestfailed', (req) => {
    networkFails.push({ url: req.url().slice(0, 120), err: req.failure()?.errorText || 'fail' });
  });

  const t0 = Date.now();
  await page.goto(STAGING, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => typeof window.goScreen === 'function', { timeout: 60000 });
  await page.evaluate(() => goScreen('screen-actions'));
  await page.waitForSelector('#coco-live-actions-pending .coco-act-lite-card, #coco-live-actions-pending .coco-act-page-card', { state: 'attached', timeout: 60000 });
  const actionsLoadMs = Date.now() - t0;

  await page.waitForFunction(
    () => document.getElementById('coco-live-actions-pending')?.getAttribute('data-coco-act-ready') === 'true',
    { timeout: 30000 }
  ).catch(() => null);
  const fullLoadMs = Date.now() - t0;

  const domStats = await page.evaluate(() => {
    const root = document.getElementById('coco-live-actions-pending');
    const cards = document.querySelectorAll('.coco-act-lite-card, .coco-act-page-card');
    const items = document.querySelectorAll('.coco-act-item, .coco-act-lite-acc-item');
    const baGrids = document.querySelectorAll('.coco-act-ba-grid');
    const feedback = document.querySelectorAll('.coco-act-feedback');
    const htmlLen = root ? root.innerHTML.length : 0;
    let lsBytes = 0;
    ['dalia-actions-seq-v1', 'dalia-actions-workbench-v1', 'dalia-action-approvals-v1'].forEach((k) => {
      try { lsBytes += (localStorage.getItem(k) || '').length; } catch (e) { /* ignore */ }
    });
    return {
      cards: cards.length,
      actionItems: items.length,
      beforeAfterBlocks: baGrids.length,
      feedbackPanels: feedback.length,
      pendingHtmlChars: htmlLen,
      totalDomNodes: document.querySelectorAll('*').length,
      lsBytes,
    };
  });

  const scrollPerf = await page.evaluate(async () => {
    const el = document.querySelector('#screen-actions .page-body') || document.scrollingElement;
    const steps = 20;
    const down = [];
    const up = [];
    for (let i = 0; i < steps; i++) {
      const t = performance.now();
      el.scrollTop += 400;
      down.push(performance.now() - t);
      await new Promise((r) => requestAnimationFrame(r));
    }
    for (let i = 0; i < steps; i++) {
      const t = performance.now();
      el.scrollTop -= 400;
      up.push(performance.now() - t);
      await new Promise((r) => requestAnimationFrame(r));
    }
    const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const max = (arr) => Math.max(...arr);
    return { scrollDownAvgMs: avg(down), scrollUpAvgMs: avg(up), scrollDownMaxMs: max(down), scrollUpMaxMs: max(up) };
  });

  const heapBefore = await page.evaluate(() => performance.memory?.usedJSHeapSize || 0);

  const workbenchT0 = Date.now();
  await page.click('[data-act-open-wb]').catch(() => null);
  await page.waitForSelector('.coco-act-lite-wb, .coco-act-lite-acc-list', { timeout: 15000 }).catch(() => null);
  const workbenchMs = Date.now() - workbenchT0;

  const domAfterWorkbench = await page.evaluate(() => ({
    actionItems: document.querySelectorAll('.coco-act-lite-acc-item, .coco-act-item').length,
    feedbackPanels: document.querySelectorAll('.coco-act-feedback').length,
    totalDomNodes: document.querySelectorAll('*').length,
    pendingHtmlChars: (document.getElementById('coco-live-actions-pending')?.innerHTML.length) || 0,
  }));

  const expandT0 = Date.now();
  await page.click('[data-act-acc-toggle]').catch(() => null);
  await page.waitForSelector('.coco-act-ba-grid', { timeout: 10000 }).catch(() => null);
  const expandMs = Date.now() - expandT0;

  const previewT0 = Date.now();
  await page.click('[data-act-lite-preview]').catch(() => null);
  await page.waitForSelector('#coco-act-lite-preview-modal[style*="flex"], #coco-act-lite-preview-modal:not([style*="none"])', { timeout: 30000 }).catch(() => null);
  await page.waitForFunction(
    () => {
      const f = document.getElementById('coco-act-lite-preview-frame');
      return f && (f.srcdoc?.length > 50 || f.contentDocument?.documentElement);
    },
    { timeout: 30000 }
  ).catch(() => null);
  const previewOpenMs = Date.now() - previewT0;

  const previewStats = await page.evaluate(() => {
    const modal = document.getElementById('coco-act-lite-preview-modal');
    const frame = document.getElementById('coco-act-lite-preview-frame');
    return {
      modalVisible: modal && modal.style.display !== 'none',
      iframeCount: frame ? 1 : 0,
      srcdocTotalChars: frame ? (frame.srcdoc || '').length : 0,
      accordionItems: document.querySelectorAll('.coco-act-lite-acc-item').length,
    };
  });

  const heapAfter = await page.evaluate(() => performance.memory?.usedJSHeapSize || 0);

  const hubT0 = Date.now();
  await page.evaluate(() => goScreen('screen-hub'));
  await page.waitForSelector('#screen-hub.active, #screen-hub:not([style*="display: none"])', { timeout: 15000 }).catch(() => null);
  const hubLoadMs = Date.now() - hubT0;
  const hubDom = await page.evaluate(() => document.querySelectorAll('*').length);

  await browser.close();

  return {
    viewport: name,
    timings: {
      actionsFirstPaintMs: actionsLoadMs,
      actionsFullLoadMs: fullLoadMs,
      openWorkbenchMs: workbenchMs,
      expandFirstActionMs: expandMs,
      previewOpenMs,
      hubAfterActionsMs: hubLoadMs,
    },
    dom: { initial: domStats, afterWorkbench: domAfterWorkbench },
    scroll: scrollPerf,
    memory: { heapBeforeBytes: heapBefore, heapAfterBytes: heapAfter, deltaMb: ((heapAfter - heapBefore) / 1048576).toFixed(2) },
    preview: previewStats,
    errors: {
      console: [...new Set(consoleErrors)].slice(0, 20),
      pageErrors,
      network: networkFails.slice(0, 20),
    },
    hubDomNodes: hubDom,
  };
}

function analyzePages() {
  const byPage = {};
  actions.forEach((a) => {
    if (!byPage[a.pageId]) byPage[a.pageId] = [];
    byPage[a.pageId].push(a);
  });

  return pages.map((p) => {
    const acts = byPage[p.id] || [];
    const failCount = p.checklist ? Object.values(p.checklist).filter((v) => v === 'fail').length : 0;
    const gscClicks = p.gsc?.clicks || 0;
    const ga4 = p.ga4Views || 0;
    const score = (p.seoScore || 0) * 10 + gscClicks * 5 + ga4 * 0.1 + (p.tier === 1 ? 50 : p.tier === 2 ? 30 : p.tier === 3 ? 10 : 0);
    let strategy = 'fix';
    if (p.tier >= 4 && ga4 < 5 && gscClicks === 0) strategy = 'defer';
    else if (failCount >= 12 && (p.seoScore || 0) <= 4) strategy = 'rebuild';
    else if (p.tier === 1 || p.rank <= 5) strategy = 'fix_priority';
    return {
      id: p.id,
      path: p.path,
      title: p.title,
      rank: p.rank,
      actionCount: acts.length,
      strategy,
      businessValue: score > 80 ? 'גבוה' : score > 40 ? 'בינוני' : 'נמוך',
    };
  }).sort((a, b) => a.rank - b.rank);
}

const pageAnalysis = analyzePages();
const desktop = await auditViewport('desktop', null);
const mobile = await auditViewport('mobile', 'iPhone 13');

const report = {
  at: new Date().toISOString(),
  version: VER,
  stagingUrl: STAGING,
  commit: git('git log origin/main -1 --format=%H'),
  commitMsg: git('git log origin/main -1 --format=%s'),
  ssot: { pages: pages.length, actions: actions.length },
  performance: { desktop, mobile },
  pageAnalysis,
  rootCauses: [
    {
      id: 'pagination',
      severity: 'low',
      finding: `Lite list: ${desktop.dom.initial.cards} cards visible (max 8/page) vs ${pages.length} total`,
      evidence: `HTML ${desktop.dom.initial.pendingHtmlChars} chars`,
    },
    {
      id: 'workbench_on_demand',
      severity: 'medium',
      finding: 'Workbench + accordion expand loads detail only on demand',
      evidence: `after workbench: ${desktop.dom.afterWorkbench.totalDomNodes} nodes`,
    },
    {
      id: 'lite_preview',
      severity: 'low',
      finding: 'Single iframe srcdoc preview — no proxy/compare',
      evidence: `srcdoc ${desktop.preview.srcdocTotalChars} chars, iframes ${desktop.preview.iframeCount}`,
    },
  ],
};

const outFile = OUT_SUFFIX ? `report-${OUT_SUFFIX}.json` : 'report.json';
const outPath = join(OUT, outFile);
if (outFile === 'report.json' && existsSync(outPath) && !process.env.AUDIT_SKIP_BACKUP) {
  copyFileSync(outPath, join(OUT, 'report-before-lite.json'));
}
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log('Report:', outPath);
console.log(JSON.stringify({ desktop: desktop.timings, mobile: mobile.timings, scroll: desktop.scroll }, null, 2));
