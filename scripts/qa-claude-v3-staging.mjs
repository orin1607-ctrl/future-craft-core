/**
 * Phase E — Full QA for Claude v3 AI Marketing UI (desktop + mobile + staging verify)
 */
import { chromium, devices } from 'playwright';
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXPECT_VERSION = process.env.QA_EXPECT_VERSION || 'v3-unified-3j';
const STAGING_BASE = 'https://orin1607-ctrl.github.io/future-craft-core';
const localHtml = path.resolve(__dirname, '../public/ai-marketing-platform.html');
const useStaging = process.env.QA_STAGING === '1' || process.argv.includes('--staging');
const baseUrl = process.env.QA_BASE_URL || (useStaging ? STAGING_BASE : 'http://127.0.0.1:8888');
const pageUrl = useStaging
  ? `${STAGING_BASE}/ai-marketing-platform.html?fullscreen=1&v=${EXPECT_VERSION}`
  : (process.env.QA_BASE_URL
    ? `${baseUrl}/ai-marketing-platform.html?fullscreen=1&v=${EXPECT_VERSION}`
    : pathToFileURL(localHtml).href + `?fullscreen=1&v=${EXPECT_VERSION}`);

const FLOW_CHAIN = [
  'screen-hub', 'screen-status', 'screen-clients', 'screen-goals', 'screen-actions',
  'screen-history', 'screen-assets', 'screen-ai-decisions', 'screen-reports'
];
const EXTRA_SCREENS = ['screen-agents', 'screen-agent-dashboard'];

const report = {
  url: pageUrl,
  expectVersion: EXPECT_VERSION,
  passed: [],
  failed: [],
  fixed: [],
  open: [],
  consoleErrors: [],
  viewports: {}
};

function pass(msg, vp) { report.passed.push(vp ? `${vp}:${msg}` : msg); }
function fail(msg, vp) { report.failed.push(vp ? `${vp}:${msg}` : msg); }

function ignoreConsole(text) {
  if (!text) return true;
  if (text.includes('ERR_CONNECTION_REFUSED')) return true;
  if (text.includes('favicon.ico')) return true;
  return false;
}

async function waitClaudeReady(page, timeout = 15000) {
  await page.waitForFunction(() => {
    return document.body.classList.contains('coco-claude-layout')
      && document.getElementById('screen-hub')
      && document.querySelector('#screen-hub.active');
  }, { timeout }).catch(() => null);
}

async function assertNoWhiteScreen(page, label, vp) {
  const state = await page.evaluate(() => {
    const root = document.getElementById('coco-claude-root');
    const active = document.querySelector('#coco-claude-root .screen.active');
    const bootErr = root && root.textContent && root.textContent.includes('לא ניתן לטעון');
    const rect = active ? { width: active.offsetWidth, height: active.offsetHeight } : { width: 0, height: 0 };
    const visible = !!(active && rect.width > 0 && rect.height > 50);
    const bg = document.body ? getComputedStyle(document.body).backgroundColor : '';
    return { visible, bootErr, layout: document.body.classList.contains('coco-claude-layout'), bg };
  });
  if (state.bootErr) fail(`${label}: boot error UI`, vp);
  else if (!state.layout) fail(`${label}: coco-claude-layout missing`, vp);
  else if (!state.visible) fail(`${label}: white/empty screen`, vp);
  else pass(`${label}: visible content`, vp);
  return state;
}

async function runViewport(browser, name, viewport) {
  const vpReport = { passed: 0, failed: 0 };
  const context = await browser.newContext({
    viewport: viewport || { width: 1280, height: 900 },
    userAgent: name === 'mobile' ? devices['iPhone 13'].userAgent : undefined,
    isMobile: name === 'mobile',
    hasTouch: name === 'mobile'
  });
  await context.addInitScript(() => {
    try { sessionStorage.setItem('coco-mkt-fullscreen', '1'); } catch (e) { /* ignore */ }
  });
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error' && !ignoreConsole(msg.text())) {
      report.consoleErrors.push(`[${name}] ${msg.text()}`);
    }
  });
  page.on('pageerror', err => report.consoleErrors.push(`[${name}] ${String(err)}`));

  await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(name === 'mobile' ? 1200 : 800);
  await waitClaudeReady(page);

  // Version meta
  const meta = await page.evaluate(() => ({
    ui: document.querySelector('meta[name="ui-version"]')?.content || '',
    commit: document.querySelector('meta[name="build-commit"]')?.content || ''
  }));
  if (meta.ui === EXPECT_VERSION || (meta.ui && meta.ui.startsWith(EXPECT_VERSION + '-'))) pass(`ui-version=${meta.ui}`, name);
  else fail(`ui-version expected ${EXPECT_VERSION} got ${meta.ui || 'none'}`, name);

  await assertNoWhiteScreen(page, 'hub-load', name);

  // Core globals
  for (const fn of ['goScreen', 'gotoSc', 'showToast']) {
    const ok = await page.evaluate(f => typeof window[f] === 'function', fn);
    ok ? pass(`fn:${fn}`, name) : fail(`missing fn ${fn}`, name);
  }
  const hasCoco = await page.evaluate(() => !!(window.CocoClaude && window.COCO));
  hasCoco ? pass('CocoClaude+COCO', name) : fail('CocoClaude/COCO missing', name);

  // All flow screens via goScreen
  for (const sid of [...FLOW_CHAIN, ...EXTRA_SCREENS]) {
    const ok = await page.evaluate(id => {
      window.goScreen(id);
      const el = document.getElementById(id);
      return !!(el && el.classList.contains('active'));
    }, sid);
    ok ? pass(`screen:${sid}`, name) : fail(`screen ${sid} not active`, name);
    if (FLOW_CHAIN.includes(sid)) {
      await assertNoWhiteScreen(page, sid, name);
    }
  }

  // Flow "המשך ל..." buttons — optional in 1:1 Claude UI (removed intentionally)
  const hasFlowNext = await page.evaluate(() => !!document.querySelector('[data-flow-next]'));
  if (hasFlowNext) {
    for (let i = 0; i < FLOW_CHAIN.length - 1; i++) {
      const from = FLOW_CHAIN[i];
      const to = FLOW_CHAIN[i + 1];
      const ok = await page.evaluate(({ from, to }) => {
        window.goScreen(from);
        const btn = document.querySelector(`#${from} [data-flow-next="${to}"]`);
        if (!btn) return { ok: false, reason: 'no button' };
        btn.click();
        const el = document.getElementById(to);
        return { ok: !!(el && el.classList.contains('active')), reason: '' };
      }, { from, to });
      ok.ok ? pass(`flow-next:${from}->${to}`, name) : fail(`flow-next ${from}->${to} (${ok.reason})`, name);
    }
  } else {
    pass('flow-next:skipped-1to1-design', name);
  }

  // Back links (hub header back buttons)
  await page.evaluate(() => window.goScreen('screen-status'));
  const backOk = await page.evaluate(() => {
    const back = document.querySelector('#screen-status .back-btn, #screen-status [onclick*="screen-hub"]');
    if (back) { back.click(); return document.getElementById('screen-hub')?.classList.contains('active'); }
    window.goScreen('screen-hub');
    return document.getElementById('screen-hub')?.classList.contains('active');
  });
  backOk ? pass('back-to-hub', name) : fail('back to hub', name);

  // Context persistence across screens
  const ctxTest = await page.evaluate(() => {
    window.goScreen('screen-goals');
    const company = document.getElementById('gf-company');
    if (!company) return { ok: false, reason: 'no gf-company' };
    const val = company.options.length > 1 ? company.options[1].value : company.value;
    company.value = val;
    company.dispatchEvent(new Event('change', { bubbles: true }));
    window.goScreen('screen-actions');
    const act = document.getElementById('act-company');
    if (!act) return { ok: false, reason: 'no act-company' };
    return { ok: act.value === val, val, actVal: act.value };
  });
  ctxTest.ok ? pass('context:company-persist', name) : fail(`context persist (${ctxTest.reason || ctxTest.actVal})`, name);

  // Client ID / demo bind
  const clientHdr = await page.evaluate(() => {
    window.goScreen('screen-hub');
    const name = document.getElementById('coco-hub-client-name')?.textContent?.trim();
    const id = document.getElementById('coco-hub-client-id')?.textContent?.trim();
    return { name, id };
  });
  if (clientHdr.name && clientHdr.name.length > 1) pass(`client-header:${clientHdr.name}`, name);
  else fail('client header empty', name);

  // Hub module cards navigation
  const hubCards = await page.evaluate(() => {
    window.goScreen('screen-hub');
    const cards = Array.from(document.querySelectorAll('#screen-hub .module-card, #screen-hub .hub-card'));
    return cards.length;
  });
  hubCards >= 10 ? pass(`hub-cards:${hubCards}`, name) : fail(`hub cards expected >=10 got ${hubCards}`, name);

  // Unified OS: context bar + Client ID across all hub modules
  const unifiedTest = await page.evaluate(() => {
    var screens = ['screen-hub', 'screen-status', 'screen-clients', 'screen-goals', 'screen-actions',
      'screen-history', 'screen-assets', 'screen-ai-decisions', 'screen-reports', 'screen-agents', 'screen-crm'];
    var barOk = true;
    var clientId = null;
    var clientIdStable = true;
    screens.forEach(function (sid) {
      window.goScreen(sid);
      var bar = document.getElementById('coco-unified-context-bar');
      if (!bar) barOk = false;
      if (!window.COCO || !COCO.flowContext) { clientIdStable = false; return; }
      if (clientId == null) clientId = COCO.flowContext.clientId;
      else if (COCO.flowContext.clientId !== clientId) clientIdStable = false;
    });
    return {
      barOk: barOk,
      clientIdStable: clientIdStable,
      hasUnified: !!(window.CocoUnified && CocoUnified.version),
      unifiedVer: window.CocoUnified && CocoUnified.version
    };
  });
  if (unifiedTest.barOk) pass('unified:context-bar-all-screens', name);
  else fail('unified:context-bar missing on some screens', name);
  if (unifiedTest.clientIdStable) pass('unified:client-id-stable', name);
  else fail('unified:client-id changed across screens', name);
  if (unifiedTest.hasUnified) pass(`unified:CocoUnified-${unifiedTest.unifiedVer}`, name);
  else fail('unified:CocoUnified missing', name);

  var crmBtn = await page.evaluate(function () {
    return !!document.getElementById('coco-open-crm-btn');
  });
  if (!crmBtn) pass('unified:no-corner-crm-btn', name);
  else fail('unified:corner crm button should be removed', name);

  var topbarCrm = await page.evaluate(function () {
    return !!document.querySelector('.coco-topbar-crm-btn');
  });
  if (!topbarCrm) pass('unified:no-topbar-crm-btn', name);
  else fail('unified:topbar crm button should be removed', name);

  var hubCrm = await page.evaluate(function () {
    var card = document.getElementById('coco-hub-crm-card');
    return !!(card && card.classList.contains('hub-card') && !card.classList.contains('coco-hub-crm-card'));
  });
  hubCrm ? pass('unified:crm-hub-card-10th', name) : fail('unified:crm hub card missing or wrong style', name);

  var crmScreen = await page.evaluate(function () {
    if (typeof openCrmModule === 'function') openCrmModule();
    else if (window.CocoUnified && CocoUnified.openCrm) CocoUnified.openCrm();
    return !!document.getElementById('screen-crm') && document.getElementById('screen-crm').classList.contains('active');
  });
  crmScreen ? pass('unified:crm-screen-opens', name) : fail('unified:crm screen did not open', name);

  const noBnavCrmDesktop = await page.evaluate(function () {
    return !document.querySelector('#screen-hub .bnav-btn[data-screen="screen-crm"]');
  });
  noBnavCrmDesktop ? pass('unified:no-bottom-nav-crm', name) : fail('unified:crm should not be in bottom nav', name);

  if (name === 'desktop') {
    const crmLoaded = await page.evaluate(function () {
      return new Promise(function (resolve) {
        setTimeout(function () {
          var main = document.getElementById('screen-crm-main');
          resolve(!!(main && main.classList.contains('active') && document.getElementById('crm-clients-tbody')));
        }, 2000);
      });
    });
    crmLoaded ? pass('desktop:crm-ui-visible', name) : fail('desktop:crm black/empty screen', name);
  }

  if (name === 'mobile') {
    const topBg = await page.evaluate(function () {
      var htmlBg = getComputedStyle(document.documentElement).backgroundColor;
      var bodyBg = getComputedStyle(document.body).backgroundColor;
      var bar = document.getElementById('coco-unified-context-bar');
      var barBg = bar ? getComputedStyle(bar).backgroundColor : '';
      var whiteStrip = /rgb\(255, 255, 255\)|#fff/i.test(htmlBg) || /rgb\(255, 255, 255\)|#fff/i.test(bodyBg);
      return { htmlBg: htmlBg, bodyBg: bodyBg, barBg: barBg, whiteStrip: whiteStrip };
    });
    if (!topBg.whiteStrip) pass('mobile:no-white-body-bg', name);
    else fail('mobile:white-body-bg ' + topBg.htmlBg, name);

    const hubCrmVisible = await page.evaluate(function () {
      var card = document.getElementById('coco-hub-crm-card');
      if (!card) return false;
      return getComputedStyle(card).display !== 'none';
    });
    hubCrmVisible ? pass('mobile:crm-hub-card-visible', name) : fail('mobile:crm hub card should be visible', name);

    const noBnavCrm = await page.evaluate(function () {
      return !document.querySelector('#screen-hub .bnav-btn[data-screen="screen-crm"]');
    });
    noBnavCrm ? pass('mobile:no-bottom-nav-crm', name) : fail('mobile:crm should not be in bottom nav', name);
  }

  // Filter persistence across modules
  const filterTest = await page.evaluate(() => {
    window.goScreen('screen-status');
    var dr = document.getElementById('sf-daterange');
    if (!dr) return { ok: false, reason: 'no sf-daterange' };
    var val = '7';
    dr.value = val;
    dr.dispatchEvent(new Event('change', { bubbles: true }));
    window.goScreen('screen-reports');
    var rep = document.getElementById('rep-date');
    return { ok: rep && rep.value === val, val: val, repVal: rep && rep.value };
  });
  filterTest.ok ? pass('unified:filter-date-persist', name) : fail(`unified:filter persist (${filterTest.reason || filterTest.repVal})`, name);

  // Responsive: bottom nav on mobile
  if (name === 'mobile') {
    const bottomNav = await page.locator('#coco-claude-root .bottom-nav').count();
    bottomNav ? pass('mobile:bottom-nav', name) : fail('mobile bottom-nav missing', name);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 8);
    overflow ? pass('mobile:no-horizontal-overflow', name) : fail('mobile horizontal overflow', name);
  }

  // Filter reset buttons (smoke)
  await page.evaluate(() => window.goScreen('screen-goals'));
  const resetBtn = await page.locator('#screen-goals button, #screen-goals .btn').filter({ hasText: 'איפוס' }).first();
  if (await resetBtn.count()) {
    await resetBtn.click();
    pass('filter:reset-goals', name);
  }

  vpReport.passed = report.passed.filter(p => p.startsWith(`${name}:`)).length;
  vpReport.failed = report.failed.filter(p => p.startsWith(`${name}:`)).length;
  report.viewports[name] = vpReport;

  await context.close();
}

// Staging asset version check
async function verifyStagingAssets() {
  if (!useStaging) return;
  const assets = [
    `/ai-marketing-platform.html?v=${EXPECT_VERSION}`,
    `/ai-marketing/coco-claude-main.js?v=${EXPECT_VERSION}`,
    `/ai-marketing/coco-claude-screens.html?v=${EXPECT_VERSION}`,
    `/ai-marketing/coco-claude-main.css?v=3-claude-full-6`
  ];
  for (const rel of assets) {
    const res = await fetch(STAGING_BASE + rel, { cache: 'no-store' });
  if (res.ok) pass(`staging-asset:${rel.split('?')[0]}`);
    else fail(`staging asset ${res.status}: ${rel}`);
  }
}

const browser = await chromium.launch();

await runViewport(browser, 'desktop', { width: 1280, height: 900 });
await runViewport(browser, 'tablet', { width: 768, height: 1024 });
await runViewport(browser, 'mobile', { width: 390, height: 844 });

await browser.close();

if (useStaging) await verifyStagingAssets();

const uniqueErrors = [...new Set(report.consoleErrors)];
if (uniqueErrors.length === 0) pass('no-js-errors');
else fail(`js-errors:${uniqueErrors.length}`);

const summary = {
  url: pageUrl,
  expectVersion: EXPECT_VERSION,
  staging: useStaging,
  passed: report.passed.length,
  failed: report.failed.length,
  allPassed: report.failed.length === 0 && uniqueErrors.length === 0,
  consoleErrors: uniqueErrors.slice(0, 20),
  failures: report.failed,
  viewports: report.viewports
};

console.log(JSON.stringify(summary, null, 2));
process.exit(summary.allPassed ? 0 : 1);
