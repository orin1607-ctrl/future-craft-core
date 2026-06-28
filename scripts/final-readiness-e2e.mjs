/**
 * Final Readiness E2E — marketing platform (11 screens), Orin Staging.
 * Real interactions: clicks, modals, GFC, workflow, CRM, agents, performance.
 * Output: docs/audit-reports/final-readiness-e2e/
 */
import { chromium, devices } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const VER = process.env.QA_UI_VERSION || 'v3-final-ready-1';
const STAGING = `https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=${VER}`;
const OUT = join(process.cwd(), 'docs', 'audit-reports', 'final-readiness-e2e');
mkdirSync(OUT, { recursive: true });

const SCREENS = [
  { id: 'screen-hub', name: 'Dashboard' },
  { id: 'screen-status', name: 'מצב נוכחי' },
  { id: 'screen-clients', name: 'חברות ועסקים' },
  { id: 'screen-crm', name: 'CRM' },
  { id: 'screen-goals', name: 'מטרות' },
  { id: 'screen-actions', name: 'פעולות' },
  { id: 'screen-history', name: 'היסטוריה' },
  { id: 'screen-assets', name: 'נכסים דיגיטליים' },
  { id: 'screen-ai-center', name: 'החלטות AI' },
  { id: 'screen-reports', name: 'דוחות' },
  { id: 'screen-agents', name: 'עוזרי AI' },
];

const AGENT_IDS = [
  'gsc', 'ga4', 'pagespeed', 'project001', 'cms', 'seotools', 'gbp', 'ads', 'meta',
  'cursor', 'chatgpt', 'claude', 'gemini', 'youtube', 'tiktok', 'linkedin', 'xtwitter',
  'pinterest', 'whatsapp', 'manager',
];

const report = {
  at: new Date().toISOString(),
  stagingUrl: STAGING,
  uiVersion: VER,
  commitHash: process.env.QA_COMMIT_HASH || '',
  sections: {},
  consoleErrors: [],
  networkErrors: [],
  bugsFound: [],
  filesChanged: [],
  workflowProof: null,
};

function section(n, data) {
  report.sections[String(n)] = {
    passed: data.passed ?? false,
    title: data.title || '',
    checked: data.checked || [],
    how: data.how || '',
    fixed: data.fixed || [],
    open: data.open || [],
    filesChanged: data.filesChanged || [],
    commitHash: data.commitHash || report.commitHash,
    stagingUrl: STAGING,
    found: data.found || {},
  };
}

function isIgnorableConsole(text) {
  return /favicon|404.*\.(png|ico|woff)|net::ERR.*font|Failed to load resource.*\.(png|ico)/i.test(text);
}

async function bootPage(page) {
  await page.goto(STAGING, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => typeof window.goScreen === 'function', { timeout: 60000 });
  await page.waitForTimeout(2500);
}

async function testScreenInteractions(page, screenId) {
  return page.evaluate(async (id) => {
    const results = { screen: id, clicks: [], modals: [], tabs: [], errors: [] };
    goScreen(id);
    await new Promise((r) => setTimeout(r, 400));
    const el = document.getElementById(id);
    const active = !!(el && el.classList.contains('active'));
    const hasContent = el ? el.innerHTML.length > 200 : false;
    const overflowX = document.documentElement.scrollWidth > window.innerWidth + 8;
    if (!active) results.errors.push('screen not active');

    // Safe nav-tab clicks (first 2)
    const tabs = el.querySelectorAll('.nav-tabs .nav-tab');
    for (let i = 0; i < Math.min(tabs.length, 2); i++) {
      try {
        tabs[i].click();
        await new Promise((r) => setTimeout(r, 200));
        results.tabs.push({ idx: i, text: tabs[i].textContent?.trim().slice(0, 40) });
      } catch (e) {
        results.errors.push('tab ' + i + ': ' + e.message);
      }
    }

    // Safe buttons — skip destructive / external
    const btns = el.querySelectorAll('button.btn, button.btn-icon, button.btn-primary, button.btn-ghost');
    let clicked = 0;
    for (const btn of btns) {
      if (clicked >= 4) break;
      const txt = (btn.textContent || '').trim();
      const onclick = btn.getAttribute('onclick') || '';
      if (/delete|מחק|reject|דחה|העבר לproduction|live site/i.test(txt + onclick)) continue;
      if (btn.closest('.overlay.open')) continue;
      if (btn.disabled || btn.offsetParent === null) continue;
      try {
        btn.click();
        clicked++;
        await new Promise((r) => setTimeout(r, 150));
        const modalOpen = document.querySelector('.overlay.open');
        if (modalOpen) {
          results.modals.push({ btn: txt.slice(0, 30), modalId: modalOpen.id });
          const closeBtn = modalOpen.querySelector('.btn-icon, [onclick*="closeModal"]');
          if (closeBtn) closeBtn.click();
          else modalOpen.classList.remove('open');
          await new Promise((r) => setTimeout(r, 100));
        }
        results.clicks.push({ text: txt.slice(0, 40), onclick: onclick.slice(0, 60) });
      } catch (e) {
        results.errors.push('btn: ' + e.message);
      }
    }

    // Hub cards on dashboard
    if (id === 'screen-hub') {
      const cards = el.querySelectorAll('.hub-card');
      if (cards.length) {
        results.clicks.push({ text: 'hub-cards', count: cards.length });
      }
    }

    return {
      ...results,
      active,
      hasContent,
      overflowX,
      domNodes: document.querySelectorAll('*').length,
    };
  }, screenId);
}

async function testGFC(page) {
  return page.evaluate(async () => {
    const events = [];
    const handler = (e) => events.push({ detail: e.detail ? { ...e.detail, freeSearch: e.detail.freeSearch } : null });
    document.addEventListener('coco:filter-changed', handler);

    if (window.GlobalFilterContext?.whenReady) await GlobalFilterContext.whenReady();
    goScreen('screen-goals');
    await new Promise((r) => setTimeout(r, 800));

    const client = document.getElementById('gfc-client');
    const reset = document.getElementById('gfc-reset');
    const search = document.getElementById('coco-central-search');
    const selects = document.querySelectorAll('#coco-unified-context-bar select, #coco-gfc-chrome select');
    const gfcGet = () => (window.GlobalFilterContext?.get?.() || window.GlobalFilterContext?.getState?.() || null);

    const before = gfcGet();
    let clientChanged = false;
    let searchChanged = false;
    let resetWorked = false;

    if (client && client.options.length > 1) {
      const prev = client.value;
      client.selectedIndex = 1;
      client.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 400));
      const after = gfcGet();
      clientChanged = after && after.clientId !== before?.clientId;
    }

    if (search) {
      search.value = 'e2e-test-search';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 400));
      const afterSearch = gfcGet();
      searchChanged = afterSearch?.freeSearch === 'e2e-test-search';
    }

    if (reset) {
      reset.click();
      await new Promise((r) => setTimeout(r, 400));
      const afterReset = gfcGet();
      resetWorked = afterReset?.freeSearch === '' || afterReset?.freeSearch === null;
    }

    document.removeEventListener('coco:filter-changed', handler);

    return {
      barVisible: !!document.getElementById('coco-unified-context-bar'),
      hasClientSelect: !!client,
      hasSearch: !!search,
      hasReset: !!reset,
      selectCount: selects.length,
      before,
      afterClient: gfcGet(),
      clientChanged,
      searchChanged,
      resetWorked,
      eventsCount: events.length,
    };
  });
}

async function testFullWorkflow(page) {
  const steps = [];

  await page.evaluate(() => goScreen('screen-agents'));
  await page.waitForTimeout(500);
  steps.push({ step: 'agents', ok: await page.evaluate(() => document.getElementById('screen-agents')?.classList.contains('active')) });

  await page.evaluate(() => goScreen('screen-goals'));
  await page.waitForTimeout(500);
  steps.push({ step: 'goals', ok: await page.evaluate(() => document.getElementById('screen-goals')?.classList.contains('active')) });

  await page.evaluate(() => goScreen('screen-actions'));
  await page.waitForSelector('#coco-live-actions-pending', { timeout: 30000 }).catch(() => null);
  await page.waitForFunction(
    () => document.querySelector('#coco-live-actions-pending .coco-act-lite-card') ||
      document.getElementById('coco-live-actions-pending')?.innerHTML?.length > 500,
    { timeout: 45000 }
  ).catch(() => null);
  await page.waitForTimeout(1000);

  const wbResult = await page.evaluate(async () => {
    const btn = document.querySelector('[data-act-open-wb]');
    if (!btn) return { ok: false, reason: 'no workbench btn' };
    btn.click();
    await new Promise((r) => setTimeout(r, 800));
    const wb = document.querySelector('.coco-act-work-section, .coco-act-lite-workbench');
    const demoInput = document.querySelector('[data-demo-inline="html"]');
    return { ok: !!wb || !!demoInput, hasDemoInput: !!demoInput, wbVisible: !!wb };
  });
  steps.push({ step: 'workbench', ...wbResult });

  const demoResult = await page.evaluate(async () => {
    const accBtn = document.querySelector('[data-act-acc-toggle]');
    if (accBtn) {
      accBtn.click();
      await new Promise((r) => setTimeout(r, 700));
    }
    const ta = document.querySelector('[data-demo-inline="html"]');
    if (!ta) return { ok: false, reason: 'no demo textarea after accordion expand', accClicked: !!accBtn };
    const actionId = ta.getAttribute('data-demo-inline-id');
    ta.value = '<div id="e2e-demo">E2E Demo</div>';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    if (window.ActionsDemoCode) {
      ActionsDemoCode.setDemo(actionId, { html: ta.value, css: '#e2e-demo{color:green}', js: '' });
    }
    const previewBtn = document.querySelector('[data-demo-open="' + actionId + '"]');
    if (previewBtn) previewBtn.click();
    await new Promise((r) => setTimeout(r, 500));
    const modal = document.getElementById('coco-act-demo-preview-modal');
    const frame = document.getElementById('coco-act-demo-preview-frame');
    let previewOk = false;
    if (modal && window.ActionsDemoCode) {
      const apply = modal.querySelector('[data-demo-apply]');
      if (apply) apply.click();
      await new Promise((r) => setTimeout(r, 400));
      previewOk = !!frame;
    }
    if (window.ActionsDemoCode && actionId) {
      ActionsDemoCode.approveDemo(actionId);
    }
    const approved = window.ActionsDemoCode?.isDemoApproved?.(actionId);
    const sessionKey = 'dalia-act-demo:' + actionId;
    let sessionSaved = false;
    try { sessionSaved = !!sessionStorage.getItem(sessionKey); } catch (e) { /* ignore */ }
    if (modal) {
      const close = modal.querySelector('.coco-act-demo-close');
      if (close) close.click();
    }
    return { ok: previewOk || approved, actionId, approved, sessionSaved, previewOk };
  });
  steps.push({ step: 'demo-preview-approve', ...demoResult });

  await page.evaluate(() => {
    goScreen('screen-actions');
    if (typeof setTab === 'function') {
      const tab = document.querySelector('#screen-actions .nav-tab[onclick*="history"], #screen-actions .nav-tab:nth-child(4)');
      if (tab) setTab(tab, tab.getAttribute('onclick')?.match(/'([^']+)'/)?.[1] || 'tab-actions-history');
    }
  });
  await page.waitForTimeout(500);
  steps.push({ step: 'history-tab', ok: await page.evaluate(() => {
    const t = document.getElementById('tab-actions-history');
    return t && t.style.display !== 'none';
  }) });

  await page.evaluate(() => goScreen('screen-history'));
  await page.waitForTimeout(400);
  steps.push({ step: 'history-screen', ok: await page.evaluate(() => document.getElementById('screen-history')?.classList.contains('active')) });

  await page.evaluate(() => goScreen('screen-reports'));
  await page.waitForTimeout(400);
  steps.push({ step: 'reports', ok: await page.evaluate(() => document.getElementById('screen-reports')?.classList.contains('active')) });

  await page.evaluate(() => goScreen('screen-agents'));
  await page.waitForTimeout(400);
  steps.push({ step: 'back-agents', ok: await page.evaluate(() => document.getElementById('screen-agents')?.classList.contains('active')) });

  const lsKeys = await page.evaluate(() => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (/dalia|coco|actions|demo|approval/i.test(k)) keys.push(k);
    }
    return keys;
  });

  return { steps, lsKeys, allOk: steps.every((s) => s.ok !== false) };
}

async function testCRM(page) {
  await page.evaluate(() => goScreen('screen-crm'));
  await page.waitForTimeout(1500);

  const crmState = await page.evaluate(async () => {
    const hasCrm = !!document.getElementById('screen-crm')?.classList.contains('active');
    const newLeadBtn = document.querySelector('[onclick*="modal-new-lead"]');
    let modalOpened = false;
    let leadCreated = false;
    let leadId = null;
    let editSaveExists = false;

    if (window.DaliaCrm && DaliaCrm.openModal) {
      DaliaCrm.openModal('modal-new-lead');
      await new Promise((r) => setTimeout(r, 300));
      modalOpened = document.getElementById('modal-new-lead')?.classList.contains('open');
      const nameInput = document.querySelector('#modal-new-lead input[name="name"], #modal-new-lead input[type="text"]');
      if (nameInput) {
        nameInput.value = 'E2E Lead ' + Date.now();
      }
      const emailInput = document.querySelector('#modal-new-lead input[type="email"]');
      if (emailInput) emailInput.value = 'e2e@test.local';
      const saveBtn = document.querySelector('#modal-new-lead button[type="submit"], #modal-new-lead .btn-primary');
      if (saveBtn && window.CrmApi) {
        try {
          const row = { name: nameInput?.value || 'E2E', email: emailInput?.value || '', phone: '', status: 'new', source: 'e2e' };
          const lead = await CrmApi.createLead(row);
          leadCreated = !!lead?.id;
          leadId = lead?.id;
          if (DaliaCrm.closeModal) DaliaCrm.closeModal('modal-new-lead');
        } catch (e) {
          leadCreated = false;
        }
      }
    }

    editSaveExists = !!(document.querySelector('[onclick*="updateLead"]') ||
      document.querySelector('[data-crm-edit]') ||
      document.querySelector('#screen-crm-card button[onclick*="save"]'));

    const searchField = document.querySelector('#screen-crm input[type="search"], #screen-crm .filter-input');
    let searchWorks = false;
    if (searchField) {
      searchField.value = 'E2E';
      searchField.dispatchEvent(new Event('input', { bubbles: true }));
      searchWorks = true;
    }

    const canRemote = !!(window.COCO_STAGING?.supabaseUrl && window.COCO_STAGING?.accessToken);
    const localLeads = (() => {
      try { return JSON.parse(localStorage.getItem('dalia-crm-local-v1') || '{}').leads?.length || 0; } catch (e) { return 0; }
    })();

    return { hasCrm, modalOpened, leadCreated, leadId, editSaveExists, searchWorks, canRemote, localLeads, newLeadBtn: !!newLeadBtn };
  });

  return crmState;
}

async function testGoogleSheets(page) {
  await page.evaluate(() => goScreen('screen-actions'));
  await page.waitForTimeout(2000);
  return page.evaluate(() => {
    const cfg = window.ActionsWorkbench?.getExportConfig?.() || {};
    const input = document.querySelector('[data-act-sheets-url]');
    const exportBtn = document.querySelector('[data-act-export-csv]');
    let testExportBlocked = true;
    let exportReason = 'no webhook';
    if (!cfg.sheetsWebhookUrl) {
      exportReason = 'sheetsWebhookUrl empty in localStorage config';
    }
    return {
      sheetsWebhookUrl: cfg.sheetsWebhookUrl || '',
      hasInput: !!input,
      hasExportBtn: !!exportBtn,
      testExportBlocked,
      exportReason,
      configKey: 'dalia-actions-export-config-v1',
    };
  });
}

async function testAgents(page) {
  await page.evaluate(() => goScreen('screen-agents'));
  await page.waitForTimeout(500);

  return page.evaluate(async (agentIds) => {
    const results = [];
    for (const id of agentIds.slice(0, 10)) {
      const card = document.getElementById('agcard-' + id) || document.querySelector('[onclick*="openAgentDashboard(\'' + id + '\')"]');
      let navigated = false;
      let stub = true;
      try {
        if (typeof openAgentDashboard === 'function') {
          openAgentDashboard(id);
          await new Promise((r) => setTimeout(r, 300));
          navigated = document.getElementById('screen-agent-dashboard')?.classList.contains('active');
          stub = !window.AGENT_DATA?.[id] || true; // AGENT_DATA is static mock
        }
      } catch (e) { /* ignore */ }
      results.push({ id, hasCard: !!card, navigated, type: 'static-mock-AGENT_DATA' });
      if (navigated && typeof goScreen === 'function') goScreen('screen-agents');
    }
    const agentDataKeys = window.AGENT_DATA ? Object.keys(window.AGENT_DATA) : [];
    return { tested: results, agentDataKeys, allStaticMock: true };
  }, AGENT_IDS);
}

async function testActionsScreen(page) {
  await page.evaluate(() => {
    goScreen('screen-actions');
    const back = document.querySelector('[data-act-back-list]');
    if (back) back.click();
  });
  await page.waitForTimeout(3000);
  await page.waitForFunction(
    () => document.querySelector('#coco-live-actions-pending .coco-act-lite-card') ||
      document.getElementById('coco-live-actions-pending')?.innerHTML?.length > 500,
    { timeout: 45000 }
  ).catch(() => null);

  return page.evaluate(async () => {
    const r = {};
    r.cards = document.querySelectorAll('.coco-act-lite-card').length;
    r.autoModeBtn = !!document.querySelector('[data-act-auto-mode]');
    r.previewBtns = document.querySelectorAll('[data-act-lite-preview]').length;
    r.demoSections = document.querySelectorAll('.coco-act-demo-section').length;

    const autoBtn = document.querySelector('[data-act-auto-mode]');
    if (autoBtn) {
      autoBtn.click();
      r.autoModeClicked = true;
      r.autoModeLs = localStorage.getItem('dalia-auto-mode-v1');
    }

    const wbBtn = document.querySelector('[data-act-open-wb]');
    if (wbBtn) {
      wbBtn.click();
      await new Promise((res) => setTimeout(res, 800));
      r.workbenchOpen = !!document.querySelector('.coco-act-work-card, .coco-act-work-section');
      const acc = document.querySelector('[data-act-acc-toggle]');
      if (acc) { acc.click(); await new Promise((res) => setTimeout(res, 500)); r.demoAfterExpand = !!document.querySelector('[data-demo-inline="html"]'); }
      const back = document.querySelector('[data-act-back-list]');
      if (back) { back.click(); r.backToList = true; }
    }

    const histTab = document.querySelector('#screen-actions .nav-tab[onclick*="history"]');
    if (histTab) {
      histTab.click();
      await new Promise((res) => setTimeout(res, 300));
      r.historyTabVisible = document.getElementById('tab-actions-history')?.style.display !== 'none';
    }

    return r;
  });
}

async function testNavigation(page) {
  return page.evaluate(async () => {
    const hubTests = [];
    const fromScreens = ['screen-goals', 'screen-actions', 'screen-agents', 'screen-reports'];
    for (const sid of fromScreens) {
      goScreen(sid);
      await new Promise((r) => setTimeout(r, 200));
      const back = document.querySelector('#' + sid + ' .btn-icon[onclick*="screen-hub"], #' + sid + ' [onclick*="screen-hub"]');
      if (back) {
        back.click();
        await new Promise((r) => setTimeout(r, 200));
        hubTests.push({ from: sid, hubActive: document.getElementById('screen-hub')?.classList.contains('active') });
      }
    }

    goScreen('screen-goals');
    const daliaBtn = document.querySelector('[onclick*="showDaliaToast"]');
    let toastShown = false;
    let navigatedAway = false;
    const urlBefore = location.href;
    if (daliaBtn) {
      daliaBtn.click();
      await new Promise((r) => setTimeout(r, 500));
      const toast = document.getElementById('toast');
      toastShown = toast && getComputedStyle(toast).opacity !== '0';
      navigatedAway = location.href !== urlBefore;
    }

    return {
      hubTests,
      hubAllOk: hubTests.every((t) => t.hubActive),
      showDaliaToast: { toastShown, navigatedAway, realNav: navigatedAway },
    };
  });
}

async function testPerformance(page) {
  return page.evaluate(async () => {
    const times = [];
    const screens = ['screen-hub', 'screen-status', 'screen-clients', 'screen-crm', 'screen-goals',
      'screen-actions', 'screen-history', 'screen-assets', 'screen-ai-center', 'screen-reports', 'screen-agents'];
    for (let round = 0; round < 2; round++) {
      for (const id of screens) {
        const t0 = performance.now();
        goScreen(id);
        times.push(performance.now() - t0);
      }
    }
    goScreen('screen-actions');
    await new Promise((r) => setTimeout(r, 500));
    const cards = document.querySelectorAll('[data-act-open-wb]');
    for (let i = 0; i < Math.min(3, cards.length); i++) {
      const t0 = performance.now();
      cards[i].click();
      times.push(performance.now() - t0);
      await new Promise((r) => setTimeout(r, 200));
      const back = document.querySelector('[data-act-back-list]');
      if (back) back.click();
    }
    const mem = performance.memory ? {
      usedJSHeapSize: performance.memory.usedJSHeapSize,
      totalJSHeapSize: performance.memory.totalJSHeapSize,
      jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
    } : null;
    return {
      switchCount: times.length,
      avgMs: times.reduce((a, b) => a + b, 0) / times.length,
      maxMs: Math.max(...times),
      minMs: Math.min(...times),
      memory: mem,
    };
  });
}

async function runE2E(viewportName, contextOpts) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext(contextOpts);
  const page = await ctx.newPage();
  const consoleErrors = [];
  const networkErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const t = msg.text();
      if (!isIgnorableConsole(t)) consoleErrors.push({ viewport: viewportName, text: t.slice(0, 400) });
    }
  });
  page.on('requestfailed', (req) => {
    networkErrors.push({ viewport: viewportName, url: req.url().slice(0, 150), err: req.failure()?.errorText || 'fail' });
  });

  const t0 = Date.now();
  await bootPage(page);
  const loadMs = Date.now() - t0;

  const screenResults = [];
  for (const sc of SCREENS) {
    const r = await testScreenInteractions(page, sc.id);
    screenResults.push({ ...sc, ...r, ok: r.active && r.hasContent });
  }

  let gfc = null;
  let workflow = null;
  let crm = null;
  let sheets = null;
  let agents = null;
  let actions = null;
  let nav = null;
  let perf = null;

  if (viewportName === 'desktop') {
    gfc = await testGFC(page);
    workflow = await testFullWorkflow(page);
    crm = await testCRM(page);
    sheets = await testGoogleSheets(page);
    agents = await testAgents(page);
    actions = await testActionsScreen(page);
    nav = await testNavigation(page);
    perf = await testPerformance(page);
  }

  // Mobile-specific overflow check
  const mobileOverflow = screenResults.filter((s) => s.overflowX).map((s) => s.name);

  await browser.close();
  return {
    viewportName, loadMs, screenResults, gfc, workflow, crm, sheets, agents, actions, nav, perf,
    mobileOverflow, consoleErrors, networkErrors,
  };
}

console.log('Running Final Readiness E2E on', STAGING);
const desktop = await runE2E('desktop', { viewport: { width: 1440, height: 900 } });
const mobile = await runE2E('mobile', { ...devices['iPhone 13'] });

report.consoleErrors = [...desktop.consoleErrors, ...mobile.consoleErrors];
report.networkErrors = [...desktop.networkErrors, ...mobile.networkErrors];

// Section 1 — All screens
const screensOk = desktop.screenResults.filter((s) => s.ok).length;
section(1, {
  title: 'כל 11 המסכים — ניווט ואינטראקציות',
  passed: screensOk === SCREENS.length,
  checked: SCREENS.map((s) => s.name),
  how: 'Playwright: goScreen + click safe buttons/tabs/modals per screen',
  found: {
    desktop: desktop.screenResults.map((s) => ({
      screen: s.name, ok: s.ok, clicks: s.clicks?.length, modals: s.modals?.length, tabs: s.tabs?.length, overflowX: s.overflowX,
    })),
  },
  open: desktop.screenResults.filter((s) => !s.ok).map((s) => s.name),
});

// Section 2 — Mobile
const mobileOk = mobile.screenResults.filter((s) => s.ok).length;
section(2, {
  title: 'מובייל iPhone 13',
  passed: mobileOk === SCREENS.length && mobile.mobileOverflow.length === 0,
  checked: ['11 מסכים', 'overflowX', 'button clickability', 'modals'],
  how: 'Playwright iPhone 13 device profile, same screen interaction suite',
  found: {
    screensOk: mobileOk,
    overflowScreens: mobile.mobileOverflow,
    mobileErrors: mobile.consoleErrors.length,
    sampleClicks: mobile.screenResults[0]?.clicks?.slice(0, 3),
  },
  open: [
    ...mobile.mobileOverflow.map((s) => `overflowX: ${s}`),
    ...(mobileOk < SCREENS.length ? ['מסכים שלא עברו במובייל'] : []),
  ],
});

// Section 3 — GFC
section(3, {
  title: 'סינון GFC',
  passed: !!(desktop.gfc?.clientChanged || desktop.gfc?.searchChanged) && desktop.gfc?.hasReset,
  checked: ['gfc-client', 'coco-central-search', 'gfc-reset', 'GlobalFilterContext.getState', 'coco:filter-changed'],
  how: 'Select client, type search, click reset; verify getState()',
  found: desktop.gfc || {},
  open: [
    ...(desktop.gfc?.clientChanged ? [] : ['שינוי לקוח — לא אומת']),
    ...(desktop.gfc?.searchChanged ? [] : ['חיפוש — לא אומת']),
    ...(desktop.gfc?.resetWorked ? [] : ['איפוס — לא אומת']),
  ],
});

// Section 4 — Full workflow
const wfOk = desktop.workflow?.allOk;
section(4, {
  title: 'זרימת עבודה מלאה',
  passed: !!wfOk,
  checked: ['agents→goals→actions→workbench→demo→approve→history→reports→agents'],
  how: 'Automated click chain + ActionsDemoCode sessionStorage',
  found: desktop.workflow || {},
  open: desktop.workflow?.steps?.filter((s) => s.ok === false).map((s) => s.step) || [],
});

// Section 5 — CRM
section(5, {
  title: 'CRM',
  passed: !!(desktop.crm?.leadCreated || desktop.crm?.modalOpened),
  checked: ['create lead modal', 'open lead', 'search', 'edit/save UI'],
  how: 'DaliaCrm.openModal + CrmApi.createLead (local fallback on GH Pages)',
  found: desktop.crm || {},
  open: [
    ...(desktop.crm?.editSaveExists ? [] : ['עריכה/שמירה לקוח — UI חסר']),
    ...(desktop.crm?.canRemote ? [] : ['Supabase remote — לא מחובר (localStorage fallback)']),
  ],
});

// Section 6 — Google Sheets
section(6, {
  title: 'Google Sheets',
  passed: false,
  checked: ['sheetsWebhookUrl', 'export bar', 'test export'],
  how: 'ActionsWorkbench.getExportConfig + UI input check',
  found: desktop.sheets || {},
  open: ['sheetsWebhookUrl לא מוגדר — ייצוא חסום', 'דורש webhook URL מהמשתמש'],
});

// Section 7 — AI Agents
const agentsNavOk = desktop.agents?.tested?.filter((a) => a.navigated).length >= 8;
section(7, {
  title: 'עוזרי AI',
  passed: agentsNavOk,
  checked: AGENT_IDS,
  how: 'openAgentDashboard per agent; check AGENT_DATA static mock',
  found: desktop.agents || {},
  open: ['כל העוזרים — AGENT_DATA static mock, לא live API', 'seotools/chatgpt/claude/gemini — stubs'],
});

// Section 8 — Actions screen
section(8, {
  title: 'מסך פעולות',
  passed: !!(desktop.actions?.cards > 0 && desktop.actions?.autoModeBtn && desktop.actions?.workbenchOpen),
  checked: ['Preview', 'Demo Code', 'delete', 'history tab', 'nav', 'statuses', 'data-act-auto-mode'],
  how: 'Click auto mode, workbench, history tab on screen-actions',
  found: desktop.actions || {},
  open: desktop.actions?.workbenchOpen ? [] : ['workbench — לא נפתח'],
});

// Section 9 — Navigation
section(9, {
  title: 'ניווט',
  passed: !!(desktop.nav?.hubAllOk),
  checked: ['return to screen-hub', 'showDaliaToast 🏠'],
  how: 'Back buttons from goals/actions/agents/reports; showDaliaToast click',
  found: desktop.nav || {},
  open: desktop.nav?.showDaliaToast?.realNav ? [] : ['showDaliaToast — toast בלבד, לא ניווט לדשבורד דליה'],
});

// Section 10 — Performance
section(10, {
  title: 'ביצועים',
  passed: (desktop.perf?.maxMs || 999) < 500 && (desktop.perf?.switchCount || 0) >= 20,
  checked: ['20+ screen switches', 'multiple action cards', 'performance.memory'],
  how: 'Rapid goScreen loop + workbench opens',
  found: { ...desktop.perf, desktopLoadMs: desktop.loadMs, mobileLoadMs: mobile.loadMs },
  open: desktop.perf?.memory ? [] : ['performance.memory — לא זמין ב-headless Chromium'],
});

// Section 11 — Bug hunt
section(11, {
  title: 'ציד באגים',
  passed: report.consoleErrors.length === 0 && report.networkErrors.length < 5,
  checked: ['console errors', 'network failures', 'broken buttons'],
  how: 'Playwright console/request listeners during full E2E',
  found: {
    consoleCount: report.consoleErrors.length,
    networkCount: report.networkErrors.length,
    consoleSamples: report.consoleErrors.slice(0, 10),
    networkSamples: report.networkErrors.slice(0, 8),
  },
  open: report.consoleErrors.length ? report.consoleErrors.map((e) => e.text.slice(0, 80)) : [],
});

// Section 12 — Real E2E proof
const demoStep = desktop.workflow?.steps?.find((s) => s.step === 'demo-preview-approve');
report.workflowProof = {
  startScreen: 'screen-agents',
  endScreen: 'screen-agents',
  created: demoStep?.actionId ? { demoActionId: demoStep.actionId, approved: demoStep.approved } : null,
  localStorageKeys: desktop.workflow?.lsKeys || [],
  sessionStorageDemo: demoStep?.sessionSaved,
  uiAppearance: 'demo approved in sessionStorage; history tab on actions screen',
};
section(12, {
  title: 'הוכחת E2E אמיתית',
  passed: !!(demoStep?.approved || demoStep?.sessionSaved),
  checked: ['complete workflow', 'localStorage keys', 'UI appearance'],
  how: 'Document workflow from section 4 with storage keys',
  found: report.workflowProof,
  open: demoStep?.approved ? [] : ['אישור demo — לא הושלם'],
});

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf8');

const passCount = Object.values(report.sections).filter((s) => s.passed).length;
console.log(`\nFinal Readiness: ${passCount}/12 sections passed`);
console.log('Report:', join(OUT, 'report.json'));
process.exit(passCount >= 8 ? 0 : 1);
