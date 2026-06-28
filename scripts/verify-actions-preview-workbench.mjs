/**
 * QA — Actions Preview Workbench on live Staging (10 user capabilities).
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { chromium, devices } from 'playwright';
import { P001 } from './project-001/_lib/config.mjs';

const VER = process.env.PREVIEW_VER || 'v3-actions-preview-2';
const STAGING =
  process.env.STAGING_PAGES_URL ||
  `https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=${VER}`;
const OUT = join(P001.root, 'docs', 'audit-reports', 'actions-preview-workbench');

mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });

const criteria = {};
function setCriterion(id, status, evidence, gap) {
  criteria[String(id)] = { status, evidence, ...(gap ? { gap } : {}) };
}

const report = {
  at: new Date().toISOString(),
  stagingUrl: STAGING,
  uiVersion: VER,
  criteria,
  viewports: {},
  writeRequests: [],
  ok: false,
};

async function runViewport(browser, label, contextOpts) {
  const ctx = await browser.newContext(contextOpts);
  const page = await ctx.newPage();
  const vp = { consoleErrors: [], checks: {} };
  const writeRequests = [];

  page.on('console', (m) => {
    if (m.type() === 'error') vp.consoleErrors.push(m.text());
  });
  page.on('request', (r) => {
    const url = r.url();
    const method = r.method();
    if (/dalia-c\.com/i.test(url) && method !== 'GET' && method !== 'HEAD') {
      writeRequests.push({ method, url: url.slice(0, 200) });
    }
  });

  await page.goto(STAGING, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(5000);

  const boot = await page.evaluate(() => ({
    uiVersion: document.querySelector('meta[name="ui-version"]')?.content,
    workbench: !!window.ActionsWorkbench,
    hasWbTabs: typeof document.querySelector !== 'undefined',
  }));
  vp.checks.boot = boot;

  await page.evaluate(() => {
    if (typeof goScreen === 'function') goScreen('screen-actions');
  });
  await page.waitForTimeout(5000);

  // Open preview workbench
  await page.evaluate(() => {
    var btn = document.querySelector('[data-act-preview]');
    if (btn) btn.click();
  });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: join(OUT, 'screenshots', `${label}-01-preview-open.png`) });

  const modalState = await page.evaluate(() => {
    var modal = document.getElementById('coco-act-preview-modal');
    var visible = modal && modal.style.display !== 'none';
    var hasWbBody = !!document.querySelector('.coco-act-wb-body');
    var tabs = Array.from(document.querySelectorAll('[data-preview-mode]')).map((t) => ({
      mode: t.getAttribute('data-preview-mode'),
      text: t.textContent.trim(),
      active: t.classList.contains('coco-act-wb-tab-active'),
    }));
    var sidebar = document.getElementById('coco-act-wb-sidebar');
    var changes = sidebar ? sidebar.querySelectorAll('[data-wb-change]').length : 0;
    var frame = document.getElementById('coco-act-preview-frame');
    var srcdoc = frame ? frame.getAttribute('srcdoc') || '' : '';
    var hasMarkers = /data-change-id|coco-change-marker/.test(srcdoc);
    var hasFullPage = /coco-pv-hero|coco-pv-site-header|coco-pv-banner/.test(srcdoc) || srcdoc.length > 3000;
    var state = modal && modal._previewState ? modal._previewState : null;
    return {
      visible,
      hasWbBody,
      tabs,
      changes,
      srcdocLen: srcdoc.length,
      hasMarkers,
      hasFullPage,
      htmlSource: state?.htmlSource,
      changeCount: state?.changes?.length || 0,
    };
  });

  vp.checks.modal = modalState;

  // 1 — See current page
  await page.evaluate(() => {
    var tab = document.querySelector('[data-preview-mode="current"]');
    if (tab) tab.click();
  });
  await page.waitForTimeout(1500);
  const currentMode = await page.evaluate(() => {
    var frame = document.getElementById('coco-act-preview-frame');
    var doc = frame?.getAttribute('srcdoc') || '';
    var tabActive = document.querySelector('[data-preview-mode="current"]')?.classList.contains('coco-act-wb-tab-active');
    return { tabActive, srcdocLen: doc.length, hasContent: doc.length > 500 };
  });
  setCriterion(
  label === 'desktop' ? '1' : '1-mobile',
    currentMode.tabActive && currentMode.hasContent ? 'pass' : 'fail',
    { live: currentMode, viewport: label },
    currentMode.hasContent ? undefined : 'תצוגת "העמוד הקיים" ריקה או ללא טאב פעיל'
  );

  // 2 — Preview after changes
  await page.evaluate(() => {
    var tab = document.querySelector('[data-preview-mode="after"]');
    if (tab) tab.click();
  });
  await page.waitForTimeout(1500);
  const afterMode = await page.evaluate(() => {
    var frame = document.getElementById('coco-act-preview-frame');
    var doc = frame?.getAttribute('srcdoc') || '';
    var tabActive = document.querySelector('[data-preview-mode="after"]')?.classList.contains('coco-act-wb-tab-active');
    var modal = document.getElementById('coco-act-preview-modal');
    var changes = modal?._previewState?.changes?.length || 0;
    return { tabActive, srcdocLen: doc.length, changes, hasAfterContent: doc.length > 500 };
  });
  setCriterion(
    label === 'desktop' ? '2' : '2-mobile',
    afterMode.tabActive && afterMode.hasAfterContent ? 'pass' : 'fail',
    { live: afterMode, viewport: label }
  );

  // 3 — Three view modes + compare
  await page.evaluate(() => {
    var tab = document.querySelector('[data-preview-mode="compare"]');
    if (tab) tab.click();
  });
  await page.waitForTimeout(1500);
  const compareMode = await page.evaluate(() => {
    var beforeF = document.getElementById('coco-act-preview-frame-before');
    var afterF = document.getElementById('coco-act-preview-frame-after');
    var tabActive = document.querySelector('[data-preview-mode="compare"]')?.classList.contains('coco-act-wb-tab-active');
  var tabs = document.querySelectorAll('[data-preview-mode]').length;
    return {
      tabActive,
      tabs,
      splitFrames: !!(beforeF && afterF),
      beforeLen: beforeF?.getAttribute('srcdoc')?.length || 0,
      afterLen: afterF?.getAttribute('srcdoc')?.length || 0,
    };
  });
  setCriterion(
    label === 'desktop' ? '3' : '3-mobile',
    compareMode.tabActive && compareMode.splitFrames && compareMode.tabs >= 3 ? 'pass' : 'fail',
    { live: compareMode, viewport: label }
  );
  await page.screenshot({ path: join(OUT, 'screenshots', `${label}-02-compare.png`) });

  // Back to after mode for marker tests
  await page.evaluate(() => {
    var tab = document.querySelector('[data-preview-mode="after"]');
    if (tab) tab.click();
  });
  await page.waitForTimeout(1200);

  // 4 — Visual markers
  const markers = await page.evaluate(() => {
    var frame = document.getElementById('coco-act-preview-frame');
    var doc = frame?.getAttribute('srcdoc') || '';
    var markerCount = (doc.match(/coco-change-marker/g) || []).length;
    var changeIds = (doc.match(/data-change-id/g) || []).length;
    return { markerCount, changeIds, hasMarkers: markerCount > 0 && changeIds > 0 };
  });
  setCriterion(
    label === 'desktop' ? '4' : '4-mobile',
    markers.hasMarkers ? 'pass' : 'fail',
    { live: markers, viewport: label }
  );

  // 5 — Continuous #N numbering
  const seq = await page.evaluate(() => {
    var state = window.ActionsWorkbench ? ActionsWorkbench.getSeqState() : null;
    var nums = Object.values(state?.assignments || {}).map(Number).sort((a, b) => a - b);
    var unique = new Set(nums).size === nums.length;
    var continuous = nums.length ? nums[nums.length - 1] - nums[0] + 1 === nums.length : false;
    var sidebarNums = Array.from(document.querySelectorAll('.coco-act-wb-change-num')).slice(0, 5).map((el) => el.textContent.trim());
    return { assigned: nums.length, unique, continuous, sidebarNums, storageKey: 'dalia-actions-seq-v1' };
  });
  setCriterion(
    label === 'desktop' ? '5' : '5-mobile',
    seq.unique && seq.continuous && seq.assigned >= 300 ? 'pass' : 'fail',
    { live: seq, viewport: label }
  );

  // 6 — List click → highlight in preview
  const listClick = await page.evaluate(async () => {
    var sidebar = document.getElementById('coco-act-wb-sidebar');
    var btn = sidebar?.querySelector('[data-wb-change]');
    if (!btn) return { ok: false, reason: 'no sidebar btn' };
    var changeId = btn.getAttribute('data-wb-change');
    btn.click();
    await new Promise((r) => setTimeout(r, 600));
    var active = sidebar.querySelector('.coco-act-wb-change-active');
    var modal = document.getElementById('coco-act-preview-modal');
    var selected = modal?._selectedChangeId;
    var frame = document.getElementById('coco-act-preview-frame');
    var doc = frame?.getAttribute('srcdoc') || '';
    var hasId = doc.includes('data-change-id="' + changeId + '"') || doc.includes("data-change-id='" + changeId + "'");
    return {
      ok: !!(active && selected === changeId && hasId),
      changeId,
      selected,
      hasActiveClass: !!active,
    };
  });
  setCriterion(
    label === 'desktop' ? '6' : '6-mobile',
    listClick.ok ? 'pass' : 'partial',
    { live: listClick, viewport: label },
    listClick.ok ? undefined : 'לחיצה ברשימה לא מסמנת פריט פעיל או לא קיים data-change-id בתצוגה'
  );

  // 7 — Preview area click → select in list (simulate postMessage)
  const previewClick = await page.evaluate(async () => {
    var modal = document.getElementById('coco-act-preview-modal');
    var changeId = modal?._previewState?.changes?.[0]?.id;
    if (!changeId) return { ok: false, reason: 'no change' };
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'coco-act-preview-select', changeId } }));
    await new Promise((r) => setTimeout(r, 400));
    var active = document.querySelector('.coco-act-wb-change-active');
    var selected = modal?._selectedChangeId;
    return { ok: selected === changeId && !!active, changeId, selected };
  });
  setCriterion(
    label === 'desktop' ? '7' : '7-mobile',
    previewClick.ok ? 'pass' : 'fail',
    { live: previewClick, viewport: label }
  );

  // 8 — Full per-change detail in sidebar
  const detail = await page.evaluate(() => {
    var btn = document.querySelector('.coco-act-wb-change');
    if (!btn) return { ok: false };
    var text = btn.textContent || '';
    return {
      ok: /נוכחי:/.test(text) && /שינוי:/.test(text) && /למה:/.test(text),
      hasSourceBadge: !!btn.querySelector('.badge'),
      hasImpact: !!btn.querySelector('.coco-act-impact-badges'),
      hasWork: /דק/.test(text),
      hasPriority: /גבוה|בינוני|נמוך/.test(text),
      sample: text.slice(0, 200),
    };
  });
  setCriterion(
    label === 'desktop' ? '8' : '8-mobile',
    detail.ok && detail.hasImpact && detail.hasWork ? 'pass' : detail.ok ? 'partial' : 'fail',
    { live: detail, viewport: label }
  );

  // 9 — Feedback + AI below preview
  const feedback = await page.evaluate(async () => {
    var modal = document.getElementById('coco-act-preview-modal');
    var changeId = modal?._previewState?.changes?.[0]?.id;
    if (changeId && window.ActionsWorkbench?.selectPreviewChange) {
      ActionsWorkbench.selectPreviewChange(changeId);
    }
    await new Promise((r) => setTimeout(r, 300));
    var fb = document.getElementById('coco-act-wb-feedback');
    if (!fb) return { ok: false, reason: 'no feedback panel' };
    return {
      ok: !!(
        fb.querySelector('[data-fb-field="liked"]') &&
        fb.querySelector('[data-fb-field="disliked"]') &&
        fb.querySelector('[data-fb-field="changeRequests"]') &&
        fb.querySelector('[data-chat-input]') &&
        fb.querySelector('[data-chat-send]')
      ),
      hasApprove: /מוכן לביצוע|מאושר/.test(fb.textContent || ''),
    };
  });
  setCriterion(
    label === 'desktop' ? '9' : '9-mobile',
    feedback.ok ? 'pass' : 'fail',
    { live: feedback, viewport: label }
  );

  // 10 — Approve localStorage only
  const approval = await page.evaluate(() => {
    var btn = document.querySelector('#coco-act-wb-feedback button[onclick*="CocoActApprove"]') ||
      document.querySelector('button[onclick*="CocoActApprove"]');
    if (!btn) return { ok: false, reason: 'no approve btn' };
    var id = btn.getAttribute('onclick').match(/CocoActApprove\('([^']+)'/)?.[1];
    btn.click();
    var map = window.ActionsWorkbench ? ActionsWorkbench.getApprovals() : {};
    return {
      ok: !!(id && map[id]?.status === 'approved_for_execution' && map[id]?.mode === 'preview'),
      id,
      mode: map[id]?.mode,
      execMode: window.ActionsWorkbench?.EXECUTION_MODE,
    };
  });
  await page.waitForTimeout(400);
  setCriterion(
    label === 'desktop' ? '10' : '10-mobile',
    approval.ok && writeRequests.length === 0 ? 'pass' : approval.ok ? 'pass' : 'fail',
    { live: { approval, writeRequests }, viewport: label }
  );

  // Hub unchanged (desktop only)
  if (label === 'desktop') {
    await page.evaluate(() => {
      if (typeof goScreen === 'function') goScreen('screen-hub');
    });
    await page.waitForTimeout(2000);
    const hub = await page.evaluate(() => {
      var cards = Array.from(document.querySelectorAll('#screen-hub .hub-card'));
      return {
        count: cards.length,
        onclicks: cards.map((c) => c.getAttribute('onclick')),
      };
    });
    const expected = [
      "goScreen('screen-status')",
      "goScreen('screen-clients')",
      "goScreen('screen-agents')",
      "goScreen('screen-goals')",
      "goScreen('screen-actions')",
      "goScreen('screen-crm')",
      "goScreen('screen-assets')",
      "goScreen('screen-ai-center')",
      "goScreen('screen-history')",
      "goScreen('screen-reports')",
    ];
    const hubOk = hub.count === 10 && expected.every((e, i) => hub.onclicks[i] === e);
    setCriterion('hub', hubOk ? 'pass' : 'fail', { live: hub });
    await page.screenshot({ path: join(OUT, 'screenshots', 'desktop-03-hub.png') });
  }

  vp.checks.writeRequests = writeRequests;
  vp.checks.consoleErrors = vp.consoleErrors.slice(0, 5);
  report.viewports[label] = vp;
  report.writeRequests.push(...writeRequests);
  await ctx.close();
}

const browser = await chromium.launch({ headless: true });
try {
  await runViewport(browser, 'desktop', { viewport: { width: 1280, height: 900 } });
  await runViewport(browser, 'mobile', devices['iPhone 13']);
} finally {
  await browser.close();
}

const desktopKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'hub'];
const allPass = desktopKeys.every((k) => criteria[k]?.status === 'pass');
const mobilePass = ['1-mobile', '2-mobile', '3-mobile', '4-mobile', '5-mobile'].every(
  (k) => criteria[k]?.status === 'pass' || criteria[k]?.status === 'partial'
);
report.ok = allPass && mobilePass && report.writeRequests.length === 0;
report.summary = {
  pass: Object.values(criteria).filter((c) => c.status === 'pass').length,
  partial: Object.values(criteria).filter((c) => c.status === 'partial').length,
  fail: Object.values(criteria).filter((c) => c.status === 'fail').length,
};

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log('Report:', join(OUT, 'report.json'));
console.log('Summary:', report.summary, 'ok:', report.ok);
process.exit(report.ok ? 0 : 1);
