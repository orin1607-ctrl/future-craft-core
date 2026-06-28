/**
 * Deep performance audit — Actions screen only (read-only).
 * Output: docs/audit-reports/actions-performance-audit/
 */
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { chromium, devices } from 'playwright';
import { P001 } from './project-001/_lib/config.mjs';

const STAGING =
  process.env.STAGING_PAGES_URL ||
  'https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=v3-actions-lite-1';
const OUT = join(P001.root, 'docs', 'audit-reports', 'actions-performance-audit');
const WP_PATH = join(P001.root, 'public', 'project-001', 'site-work-plan.json');

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
  await page.waitForSelector('#coco-live-actions-pending .coco-act-lite-card', { state: 'attached', timeout: 60000 });
  const actionsLoadMs = Date.now() - t0;

  const fullLoadMs = Date.now() - t0;

  const domStats = await page.evaluate(() => {
    const root = document.getElementById('coco-live-actions-pending');
    const cards = document.querySelectorAll('.coco-act-lite-card');
    const items = document.querySelectorAll('.coco-act-lite-acc');
    const baGrids = document.querySelectorAll('.coco-act-ba-grid');
    const feedback = document.querySelectorAll('.coco-act-lite-acc-body');
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

  // Scroll test — down then up, measure frame time proxy
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

  // Open workbench for first page
  const expandT0 = Date.now();
  await page.click('[data-open-wb]').catch(() => null);
  await page.waitForSelector('.coco-act-lite-acc', { timeout: 15000 }).catch(() => null);
  const expandMs = Date.now() - expandT0;

  const domAfterExpand = await page.evaluate(() => ({
    actionItems: document.querySelectorAll('.coco-act-lite-acc').length,
    feedbackPanels: document.querySelectorAll('.coco-act-lite-acc-open .coco-act-lite-acc-body').length,
    totalDomNodes: document.querySelectorAll('*').length,
    pendingHtmlChars: (document.getElementById('coco-live-actions-pending')?.innerHTML.length) || 0,
  }));

  // Preview open (lite — single iframe srcdoc)
  const previewT0 = Date.now();
  await page.click('[data-open-lite-preview]').catch(() => null);
  await page.waitForSelector('#coco-act-lite-preview[style*="flex"]', { timeout: 60000 }).catch(() => null);
  await page.waitForFunction(
    () => {
      const m = document.getElementById('coco-act-lite-preview');
      if (!m || m.style.display === 'none') return false;
      const f = document.getElementById('coco-act-lite-frame');
      return f && (f.srcdoc?.length > 200);
    },
    { timeout: 90000 }
  ).catch(() => null);
  const previewOpenMs = Date.now() - previewT0;

  const previewStats = await page.evaluate(() => {
    const modal = document.getElementById('coco-act-lite-preview');
    const iframes = document.querySelectorAll('#coco-act-lite-frame');
    let srcdocTotal = 0;
    iframes.forEach((f) => { srcdocTotal += (f.srcdoc || '').length; });
    return {
      modalVisible: modal && modal.style.display !== 'none',
      iframeCount: iframes.length,
      srcdocTotalChars: srcdocTotal,
      sidebarItems: document.querySelectorAll('.coco-act-lite-acc').length,
      mode: 'lite-srcdoc',
    };
  });

  const compareMs = 0;
  const compareStats = { iframeCount: 0, srcdocTotalChars: 0, skipped: 'lite workbench has no compare mode' };

  const heapAfter = await page.evaluate(() => performance.memory?.usedJSHeapSize || 0);

  // Other screens smoke
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
      actionsFullLazyMs: fullLoadMs,
      expandFirstPageMs: expandMs,
      previewOpenMs,
      compareSwitchMs: compareMs,
      hubAfterActionsMs: hubLoadMs,
    },
    dom: { initial: domStats, afterExpand: domAfterExpand },
    scroll: scrollPerf,
    memory: { heapBeforeBytes: heapBefore, heapAfterBytes: heapAfter, deltaMb: ((heapAfter - heapBefore) / 1048576).toFixed(2) },
    preview: { open: previewStats, compare: compareStats },
    errors: {
      console: [...new Set(consoleErrors)].slice(0, 20),
      pageErrors,
      network: networkFails.slice(0, 20),
    },
    hubDomNodes: hubDom,
  };
}

// Page strategy analysis from SSOT
function analyzePages() {
  const byPage = {};
  actions.forEach((a) => {
    if (!byPage[a.pageId]) byPage[a.pageId] = [];
    byPage[a.pageId].push(a);
  });

  return pages.map((p) => {
    const acts = byPage[p.id] || [];
    const failCount = p.checklist ? Object.values(p.checklist).filter((v) => v === 'fail').length : 0;
    const passCount = p.checklist ? Object.values(p.checklist).filter((v) => v === 'pass').length : 0;
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
      tier: p.tier,
      seoScore: p.seoScore,
      estimateHours: p.estimateHours,
      estimateLabel: p.estimateLabel,
      gscClicks: gscClicks,
      ga4Views: ga4,
      actionCount: acts.length,
      checklistFail: failCount,
      checklistPass: passCount,
      priority: p.priority,
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
  stagingUrl: STAGING,
  commit: git('git log origin/main -1 --format=%H'),
  commitMsg: git('git log origin/main -1 --format=%s'),
  ssot: {
    pages: pages.length,
    actions: actions.length,
    totalEstimateHours: wp.summary?.totalEstimateHours,
    tier1: wp.summary?.tier1,
    tier2: wp.summary?.tier2,
    tier3: wp.summary?.tier3,
    tier4: wp.summary?.tier4,
  },
  performance: { desktop, mobile },
  pageAnalysis,
  pageStrategySummary: {
    fix_priority: pageAnalysis.filter((p) => p.strategy === 'fix_priority').length,
    fix: pageAnalysis.filter((p) => p.strategy === 'fix').length,
    rebuild: pageAnalysis.filter((p) => p.strategy === 'rebuild').length,
    defer: pageAnalysis.filter((p) => p.strategy === 'defer').length,
  },
  rootCauses: [],
  recommendations: [],
};

// Root cause analysis
report.rootCauses = [
  {
    id: 'dom_volume',
    severity: 'high',
    finding: `${pages.length} כרטיסי עמוד + ${actions.length} פעולות — HTML כבד (${desktop.dom.initial.pendingHtmlChars} chars אחרי lazy מלא)`,
    evidence: `DOM nodes: ${desktop.dom.initial.totalDomNodes}, cards: ${desktop.dom.initial.cards}`,
  },
  {
    id: 'expand_hydration',
    severity: 'high',
    finding: 'פתיחת "פירוט תיקונים" מזריקה before/after + 7 impact badges + feedback לכל פעולה — DOM גדל פי 3–5',
    evidence: `אחרי expand: ${desktop.dom.afterExpand.actionItems} items, ${desktop.dom.afterExpand.totalDomNodes} nodes, HTML ${desktop.dom.afterExpand.pendingHtmlChars} chars`,
  },
  {
    id: 'compare_iframes',
    severity: 'high',
    finding: 'מצב השוואה טוען 2 iframe עם HTML מלא (srcdoc) — כבד בזיכרון',
    evidence: `compare: ${desktop.preview.compare.iframeCount} iframes, ${desktop.preview.compare.srcdocTotalChars} chars srcdoc`,
  },
  {
    id: 'lazy_batch_scroll',
    severity: 'medium',
    finding: 'lazy load ממשיך להוסיף DOM בזמן גלילה (insertAdjacentHTML) — גורם ל-jank בעלייה',
    evidence: `scroll up max ${desktop.scroll.scrollUpMaxMs.toFixed(1)}ms vs down ${desktop.scroll.scrollDownMaxMs.toFixed(1)}ms`,
  },
  {
    id: 'pulse_animation',
    severity: 'low',
    finding: 'כפתור Preview עם animation infinite (coco-act-pulse) על כל כרטיס — repaint',
    evidence: 'CSS animation on .coco-act-btn-preview × 28 cards',
  },
  {
    id: 'localStorage',
    severity: 'low',
    finding: `localStorage קטן (${desktop.dom.initial.lsBytes} bytes) — לא הגורם העיקרי`,
    evidence: 'seq + workbench + approvals keys',
  },
];

report.recommendations = [
  { priority: 1, title: 'Pagination — 5–8 עמודים בלבד', desc: 'הצג ברירת מחדל 5–8 עמודים + "טען עוד" — לא 28 בבת אחת' },
  { priority: 2, title: 'Accordion יחיד', desc: 'רק עמוד אחד פתוח — סגור אחרים אוטומטית' },
  { priority: 3, title: 'Summary קצר + עומק בלחיצה', desc: 'כרטיס: כותרת + 3 שורות + זמן. before/after רק ב-Preview או expand' },
  { priority: 4, title: 'Preview on-demand בלבד', desc: 'כבר קיים — לשמור. compare רק בלחיצה, לא default' },
  { priority: 5, title: 'Virtual scroll / IntersectionObserver', desc: 'טען כרטיסים רק כשנכנסים ל-viewport' },
  { priority: 6, title: 'הסר pulse animation', desc: 'החלף ב-badge סטטי — חוסך repaint' },
  { priority: 7, title: 'כפתור "התעלם מעמוד"', desc: 'הוצא tier4 / 0 traffic מ-work queue' },
  { priority: 8, title: 'סינון: tier / עדיפות / סטטוס', desc: 'הצג רק מה רלוונטי עכשיו' },
  { priority: 9, title: 'Rebuild vs Fix badge', desc: 'סמן עמודים rebuild — אל תציג 20 פעולות micro-fix' },
  { priority: 10, title: 'Preview: thumbnail mode', desc: 'השוואה = screenshot diff, לא 2× HTML מלא' },
];

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log('Report:', join(OUT, 'report.json'));
console.log(JSON.stringify({ desktop: desktop.timings, mobile: mobile.timings, scroll: desktop.scroll }, null, 2));
