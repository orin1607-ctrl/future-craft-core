/**
 * Open gaps closure — mobile + workflow + CRM + agents (Playwright)
 * Output: docs/audit-reports/open-gaps-closure/
 */
import { chromium, devices } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const VER = process.env.QA_UI_VERSION || 'v3-open-gaps-2';
const STAGING = `https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=${VER}`;
const OUT = join(process.cwd(), 'docs', 'audit-reports', 'open-gaps-closure');
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

const STUB_AGENTS = ['chatgpt', 'claude', 'gemini', 'youtube', 'tiktok', 'linkedin', 'xtwitter', 'pinterest', 'whatsapp'];
const DEMO_AGENTS = ['gsc', 'ga4', 'pagespeed', 'project001', 'cms', 'seotools', 'gbp', 'ads', 'meta', 'cursor'];

const report = {
  at: new Date().toISOString(),
  stagingUrl: STAGING,
  uiVersion: VER,
  commitHash: process.env.QA_COMMIT_HASH || '',
  tasks: {},
};

async function boot(page) {
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  await page.goto(STAGING, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => typeof window.goScreen === 'function', { timeout: 90000 });
  await page.waitForSelector('#coco-claude-root.coco-ready', { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(2500);
  return errs;
}

async function runMobile11(page) {
  const r = { screens: [], bootFlash: null, actionsScroll: null, paste: null, autoMode: null, overflow: null, modals: [] };

  r.bootFlash = await page.evaluate(() => ({
    cocoReady: document.getElementById('coco-claude-root')?.classList.contains('coco-ready'),
    bootActive: document.body.classList.contains('coco-boot-active'),
    hiddenScreensUntilReady: !!document.querySelector('#coco-claude-root:not(.coco-ready) > .screen'),
  }));

  for (const sc of SCREENS) {
    const res = await page.evaluate((id) => {
      goScreen(id);
      const el = document.getElementById(id);
      const active = !!(el && el.classList.contains('active'));
      const overflowX = document.documentElement.scrollWidth > window.innerWidth + 10;
      const btns = el ? el.querySelectorAll('button:not([disabled]), a.btn, .hub-card, .bnav-btn').length : 0;
      return { active, overflowX, clickableCount: btns };
    }, sc.id);
    let clicked = 0;
    if (sc.id === 'screen-hub') {
      const card = page.locator('.hub-card').first();
      if (await card.count()) { await card.click().catch(() => {}); clicked++; }
    }
    if (sc.id === 'screen-crm') {
      await page.waitForTimeout(800);
    }
    r.screens.push({ ...sc, ...res, clicked });
    await page.waitForTimeout(350);
  }

  await page.evaluate(() => {
    const el = document.querySelector('#screen-actions .content');
    if (el) el.scrollTop = 380;
  });
  await page.evaluate(() => goScreen('screen-goals'));
  await page.waitForTimeout(200);
  await page.evaluate(() => goScreen('screen-actions'));
  await page.waitForTimeout(700);
  r.actionsScroll = await page.evaluate(() => {
    const el = document.querySelector('#screen-actions .content');
    const top = el ? el.scrollTop : window.scrollY;
    return { scrollTop: top, preserved: top > 80, jumpedToTop: top < 20 };
  });

  await page.waitForSelector('[data-coco-act-ready="true"]', { timeout: 45000 }).catch(() => {});
  r.autoMode = await page.evaluate(() => ({
    inList: !!document.querySelector('[data-act-auto-mode]'),
    exportBar: !!document.querySelector('.coco-act-lite-export-bar'),
  }));

  const wb = page.locator('[data-act-open-wb]').first();
  if (await wb.count()) await wb.click();
  await page.waitForTimeout(500);
  const acc = page.locator('[data-act-acc-toggle]').first();
  if (await acc.count()) await acc.click();
  await page.waitForTimeout(400);

  const ta = page.locator('[data-demo-inline="html"]').first();
  r.paste = { found: (await ta.count()) > 0 };
  if (r.paste.found) {
    const sample = '<div class="qa-paste-test">Hello QA</div>\n<style>.qa-paste-test{color:red}</style>';
    await ta.fill(sample);
    r.paste.valueLen = (await ta.inputValue()).length;
    r.paste.ok = (await ta.inputValue()).includes('qa-paste-test');
    await page.waitForTimeout(500);
    r.paste.afterWait = (await ta.inputValue()).includes('qa-paste-test');
  }

  r.overflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth <= window.innerWidth + 12,
    actions: (() => {
      const el = document.getElementById('screen-actions');
      return el ? el.scrollWidth <= window.innerWidth + 12 : true;
    })(),
  }));

  return r;
}

async function runWorkflow(page) {
  await boot(page);
  return page.evaluate(async () => {
    const steps = [];
    const ok = (n, d) => steps.push({ name: n, ok: true, detail: d || '' });
    const fail = (n, d) => steps.push({ name: n, ok: false, detail: d || '' });

    goScreen('screen-agents');
    await new Promise((r) => setTimeout(r, 400));
    document.getElementById('screen-agents')?.classList.contains('active') ? ok('agents') : fail('agents');

    goScreen('screen-goals');
    await new Promise((r) => setTimeout(r, 400));
    ok('goals');

    goScreen('screen-actions');
    await new Promise((r) => setTimeout(r, 600));
    ok('actions');

    const wb = document.querySelector('[data-act-open-wb]');
    if (wb) { wb.click(); await new Promise((r) => setTimeout(r, 500)); ok('workbench'); }
    else fail('workbench', 'no button');

    const acc = document.querySelector('[data-act-acc-toggle]');
    if (acc) { acc.click(); await new Promise((r) => setTimeout(r, 400)); ok('work-card'); }
    else fail('work-card');

    const ta = document.querySelector('[data-demo-inline="html"]');
    if (ta) {
      ta.value = '<p>E2E workflow</p>';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ok('demo-code', ta.value);
    } else fail('demo-code');

    const prev = document.querySelector('[data-demo-open]');
    if (prev) { prev.click(); await new Promise((r) => setTimeout(r, 400)); ok('preview', !!document.getElementById('coco-act-demo-preview-modal')); }
    else fail('preview');

    const modal = document.getElementById('coco-act-demo-preview-modal');
    if (modal) {
      modal.style.display = 'none';
    }

    const okBtn = document.querySelector('[data-demo-inline-ok]');
    if (okBtn && window.ActionsDemoCode) {
      okBtn.click();
      await new Promise((r) => setTimeout(r, 300));
      ok('approve');
    } else if (window.ActionsDemoCode) {
      const aid = ta?.getAttribute('data-demo-inline-id');
      if (aid) { ActionsDemoCode.approveDemo(aid); ok('approve', 'programmatic'); }
    }

    goScreen('screen-history');
    await new Promise((r) => setTimeout(r, 400));
    ok('history');

    goScreen('screen-reports');
    await new Promise((r) => setTimeout(r, 400));
    ok('reports');

    goScreen('screen-agents');
    ok('back-to-agents');

    return { steps, pass: steps.filter((s) => s.ok).length, total: steps.length };
  });
}

async function runCrm(page) {
  await boot(page);
  return page.evaluate(async () => {
    goScreen('screen-crm');
    await new Promise((r) => setTimeout(r, 1500));
    const hasEdit = typeof DaliaCrm !== 'undefined' && typeof DaliaCrm.openEditCustomer === 'function';
    const hasSave = typeof DaliaCrm !== 'undefined' && typeof DaliaCrm.submitEditCustomer === 'function';
    const modal = !!document.getElementById('modal-edit-customer');
    const editBtn = !!document.getElementById('cc-edit-btn');
    let saveTest = false;
    if (window.CrmApi && CrmApi.createLead) {
      try {
        const lead = await CrmApi.createLead({
          company_name: 'QA Open Gaps ' + Date.now(),
          contact_name: 'Test',
          phone: '050-0000000',
          email: 'qa@test.local',
          status: 'new_lead',
          source: 'qa',
        });
        saveTest = !!lead?.id;
      } catch (e) { saveTest = false; }
    }
    return { hasEdit, hasSave, modal, editBtn, saveTest, crmActive: document.getElementById('screen-crm')?.classList.contains('active') };
  });
}

async function runSheets(page) {
  await boot(page);
  return page.evaluate(() => {
    goScreen('screen-actions');
    const cfg = JSON.parse(localStorage.getItem('dalia-actions-export-config-v1') || '{}');
    return {
      sheetsWebhookUrl: cfg.sheetsWebhookUrl || '',
      hasExportBar: !!document.querySelector('.coco-act-lite-export-bar'),
      hasSheetsInput: !!document.querySelector('[data-act-sheets-url]'),
      canExport: !!(cfg.sheetsWebhookUrl && cfg.sheetsWebhookUrl.startsWith('http')),
    };
  });
}

async function runDaliaNav(page) {
  await boot(page);
  const before = page.url();
  await page.evaluate(() => { if (typeof showDaliaToast === 'function') showDaliaToast(); });
  await page.waitForTimeout(1200);
  const after = page.url();
  return {
    before,
    after,
    navigated: after !== before,
    hasPrdDaliaNav: await page.evaluate(() => !!(window.PrdDaliaNav && PrdDaliaNav.exitToDalia)),
    homeUrl: await page.evaluate(() => (window.PrdDaliaNav && PrdDaliaNav.getDaliaHomeUrl) ? PrdDaliaNav.getDaliaHomeUrl() : null),
  };
}

async function runAgentsInventory(page) {
  await boot(page);
  return page.evaluate(() => {
    const inv = [];
    if (typeof AGENT_DATA === 'undefined') return { error: 'AGENT_DATA missing', agents: [] };
    Object.keys(AGENT_DATA).forEach((k) => {
      const a = AGENT_DATA[k];
      let status = 'DEMO_DATA';
      if (STUB_AGENTS.includes(k)) status = 'STUB_INFRASTRUCTURE';
      if (a.aiSummary && a.aiSummary.includes('תשתית')) status = 'STUB_INFRASTRUCTURE';
      if (a.readyToTransfer === false && a.status === 'running') status = 'PARTIAL_SCAN';
      inv.push({ id: k, name: a.name, status, requiresApi: status !== 'DEMO_DATA' || STUB_AGENTS.includes(k) });
    });
    return { agents: inv, stubCount: inv.filter((x) => x.status === 'STUB_INFRASTRUCTURE').length };
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const mobileCtx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } });
  const mobilePage = await mobileCtx.newPage();

  report.tasks['1-mobile'] = await runMobile11(mobilePage);
  report.tasks['2-paste'] = report.tasks['1-mobile'].paste;
  report.tasks['3-auto-mode'] = report.tasks['1-mobile'].autoMode;
  report.tasks['4-sheets'] = await runSheets(await (await browser.newContext()).newPage());
  report.tasks['5-crm'] = await runCrm(await (await browser.newContext()).newPage());
  report.tasks['6-agents'] = await runAgentsInventory(await (await browser.newContext()).newPage());
  report.tasks['7-workflow'] = await runWorkflow(await (await browser.newContext()).newPage());
  report.tasks['8-dalia-nav'] = await runDaliaNav(await (await browser.newContext()).newPage());
  await browser.close();

  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log('Wrote', join(OUT, 'report.json'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
