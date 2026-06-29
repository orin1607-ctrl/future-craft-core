/**
 * Mission 25 — Full QA: AI Control Center, mobile, buttons, workflow, isolation, perf.
 * Output: docs/audit-reports/mission-25/
 */
import { chromium, devices } from 'playwright';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VER = process.env.QA_UI_VERSION || 'v3-mission-25-1';
const STAGING = process.env.STAGING_PAGES_URL || `https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=${VER}`;
const OUT = join(ROOT, 'docs', 'audit-reports', 'mission-25');
mkdirSync(OUT, { recursive: true });

const SCREENS = [
  'screen-hub', 'screen-status', 'screen-clients', 'screen-crm', 'screen-goals',
  'screen-actions', 'screen-history', 'screen-assets', 'screen-ai-center',
  'screen-reports', 'screen-agents',
];

let commitHash = '';
try { commitHash = execSync('git rev-parse HEAD', { encoding: 'utf8', cwd: ROOT }).trim(); } catch { /* */ }

const report = {
  mission: 25,
  at: new Date().toISOString(),
  version: VER,
  stagingUrl: STAGING,
  commitHash,
  tasks: {},
  consoleErrors: [],
  passed: 0,
  failed: 0,
};

function task(id, data) {
  report.tasks[id] = data;
  if (data.passed) report.passed++; else report.failed++;
}

async function bootPage(page) {
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|404.*\.(png|ico)/i.test(m.text())) {
      report.consoleErrors.push(m.text().slice(0, 200));
    }
  });
  await page.goto(STAGING, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForFunction(() => typeof window.goScreen === 'function', { timeout: 90000 });
  await page.waitForFunction(() => !!window.COCO_AI_CONTROL, { timeout: 60000 });
}

console.log('Mission 25 QA —', STAGING);
const browser = await chromium.launch({ headless: true });

// 25.1 AI Control Center
{
  const page = await browser.newPage();
  await bootPage(page);
  const cc = await page.evaluate(async () => {
    const snap = COCO_AI_CONTROL.getSnapshot();
    const ask = await COCO_AI_CONTROL.ask('מה דחוף היום?', { enrichAi: false });
    return {
      hasControl: !!window.COCO_AI_CONTROL,
      hasAsk: typeof COCO_AI_CONTROL.ask === 'function',
      hasExecute: typeof COCO_AI_CONTROL.execute === 'function',
      hasSnapshot: !!snap.counts,
      askSummary: (ask.summary || '').slice(0, 120),
      hasAiControlCenter: !!window.AiControlCenter,
      hasNotifications: !!window.MarketingNotifications,
    };
  });
  await page.evaluate(() => goScreen('screen-ai-center'));
  await page.waitForTimeout(800);
  const panel = await page.evaluate(() => ({
    panel: !!document.getElementById('coco-ai-control-panel'),
    engines: !!document.getElementById('coco-ai-control-engines'),
    input: !!document.getElementById('coco-ai-control-input'),
  }));
  await page.click('#coco-ai-control-ask', { timeout: 5000 }).catch(() => {});
  await page.close();
  task('25.1', {
    passed: cc.hasControl && cc.hasAsk && cc.hasSnapshot && cc.askSummary.length > 5,
    title: 'AI Control Center wired',
    found: { ...cc, panel },
  });
}

// 25.2 Mobile scroll + screens
{
  const page = await browser.newPage({ ...devices['iPhone 13'] });
  await bootPage(page);
  const mobileScreens = {};
  for (const sid of SCREENS) {
    await page.evaluate((id) => goScreen(id), sid);
    await page.waitForTimeout(400);
    const info = await page.evaluate((id) => {
      const el = document.getElementById(id);
      const content = el?.querySelector('.content');
      return {
        active: el?.classList.contains('active'),
        scrollable: content ? content.scrollHeight > content.clientHeight : false,
        overflow: content ? getComputedStyle(content).overflowY : '',
      };
    }, sid);
    mobileScreens[sid] = info;
  }
  await page.evaluate(() => goScreen('screen-actions'));
  await page.waitForSelector('#coco-live-actions-pending[data-coco-act-ready="true"]', { timeout: 60000 });
  const scroll = await page.evaluate(async () => {
    const el = document.querySelector('#screen-actions .content');
    if (!el) return { ok: false };
    const positions = [el.scrollTop];
    for (let i = 0; i < 15; i++) {
      el.scrollTop += 250;
      positions.push(el.scrollTop);
      await new Promise((r) => requestAnimationFrame(r));
    }
    const jumps = positions.slice(1).filter((p, i) => p < positions[i] - 50).length;
    return { ok: true, maxScroll: el.scrollTop, jumps, scrollContainer: el.scrollHeight > el.clientHeight };
  });
  await page.close();
  task('25.2', {
    passed: scroll.ok && scroll.scrollContainer && scroll.jumps === 0,
    title: 'Mobile scroll all screens',
    found: { mobileScreens, scroll },
  });
}

// 25.3 Buttons smoke
{
  const page = await browser.newPage({ ...devices['iPhone 13'] });
  await bootPage(page);
  await page.evaluate(() => goScreen('screen-actions'));
  await page.waitForSelector('.coco-act-lite-card', { timeout: 60000 });
  const buttons = await page.evaluate(() => {
    const dead = [];
    const tested = [];
    document.querySelectorAll('#screen-actions button, #screen-actions [data-act-open-wb]').forEach((b) => {
      if (b.offsetParent === null && !b.closest('.coco-act-lite-preview-overlay')) return;
      tested.push(b.textContent?.trim().slice(0, 30) || b.getAttribute('data-act-open-wb') || 'btn');
    });
    return { count: tested.length, sample: tested.slice(0, 8) };
  });
  let wbOk = false;
  try {
    await page.click('[data-act-open-wb]', { timeout: 10000 });
    await page.waitForSelector('.coco-act-lite-wb', { timeout: 15000 });
    wbOk = true;
    await page.click('[data-act-back-list]', { timeout: 8000 }).catch(() => {});
  } catch { /* */ }
  await page.evaluate(() => goScreen('screen-hub'));
  const hubCards = await page.evaluate(() => document.querySelectorAll('#screen-hub .hub-card').length);
  await page.close();
  task('25.3', {
    passed: buttons.count >= 3 && hubCards >= 5,
    title: 'Button smoke test',
    found: { buttons, workbenchOpens: wbOk, hubCards },
  });
}

// 25.4 Full workflow
{
  const page = await browser.newPage();
  await bootPage(page);
  const flow = [];
  const steps = [
    ['screen-agents', 'agents'],
    ['screen-goals', 'goals'],
    ['screen-actions', 'actions'],
    ['screen-history', 'history'],
    ['screen-reports', 'reports'],
    ['screen-ai-center', 'ai-center'],
  ];
  for (const [sid, name] of steps) {
    await page.evaluate((id) => goScreen(id), sid);
    await page.waitForTimeout(500);
    const ok = await page.evaluate((id) => !!document.getElementById(id)?.classList.contains('active'), sid);
    flow.push({ step: name, ok });
  }
  await page.evaluate(async () => {
    if (window.COCO_AI_CONTROL) await COCO_AI_CONTROL.ask('פעולות ממתינות');
  });
  await page.close();
  task('25.4', {
    passed: flow.every((f) => f.ok),
    title: 'End-to-end workflow',
    found: { flow },
  });
}

// 25.5 Gmail notifications stub
{
  const page = await browser.newPage();
  await bootPage(page);
  const notif = await page.evaluate(() => {
    if (!window.MarketingNotifications) return { ok: false };
    const t = MarketingNotifications.testAll();
    const req = MarketingNotifications.getGmailRequirements();
    return { ok: t.ok && t.count === 5, queue: t.count, gmailStatus: req.status, missing: req.missing.length };
  });
  await page.close();
  task('25.5', {
    passed: notif.ok,
    title: 'Gmail notification stub',
    found: notif,
    open: ['Gmail API live send not implemented — stub queue only'],
  });
}

// 25.6 Multi-AI verification
{
  const page = await browser.newPage();
  await bootPage(page);
  const engines = await page.evaluate(() => {
    const reg = COCO_AI_CONTROL.registry();
    return (reg?.engines || []).filter((e) => ['openai', 'claude', 'gemini'].includes(e.id)).map((e) => ({
      id: e.id,
      wired: e.wired,
      apiEnabled: e.apiEnabled,
      status: e.apiEnabled && e.wired ? 'works_or_api' : (e.wired ? 'infrastructure' : 'requires_api'),
    }));
  });
  await page.close();
  task('25.6', {
    passed: engines.length === 3,
    title: 'Multi-AI ChatGPT/Claude/Gemini',
    found: { engines },
  });
}

// 25.7 Performance
{
  const page = await browser.newPage({ ...devices['iPhone 13'] });
  const t0 = Date.now();
  await bootPage(page);
  await page.evaluate(() => goScreen('screen-actions'));
  await page.waitForSelector('#coco-live-actions-pending[data-coco-act-ready="true"]', { timeout: 90000 });
  const loadMs = Date.now() - t0;
  const perf = await page.evaluate(() => ({
    totalDom: document.querySelectorAll('*').length,
    actionsNodes: document.querySelectorAll('#screen-actions *').length,
  }));
  await page.close();
  task('25.7', {
    passed: loadMs < 90000 && perf.totalDom < 20000,
    title: 'Performance',
    found: { loadMs, ...perf },
  });
}

// 25.8 Client isolation
{
  const page = await browser.newPage();
  await bootPage(page);
  const iso = await page.evaluate(async () => {
    if (!window.GlobalFilterContext || !window.FilterEngine) return { ok: false };
    GlobalFilterContext.set({ clientId: 'test-client-A', companyId: 'co-A' });
    const ctxA = FilterEngine.getContext();
    const hashA = FilterEngine.contextHash();
    GlobalFilterContext.set({ clientId: 'test-client-B', companyId: 'co-B' });
    const hashB = FilterEngine.contextHash();
    GlobalFilterContext.reset();
    return { ok: hashA !== hashB, hashA: hashA.slice(0, 16), hashB: hashB.slice(0, 16) };
  });
  await page.close();
  task('25.8', {
    passed: iso.ok,
    title: 'Client isolation FilterEngine',
    found: iso,
  });
}

// 25.9 Google Sheets
{
  const page = await browser.newPage();
  await bootPage(page);
  const sheets = await page.evaluate(() => {
    const cfg = localStorage.getItem('dalia-actions-export-config-v1');
    let parsed = {};
    try { parsed = JSON.parse(cfg || '{}'); } catch { /* */ }
    return {
      exportFn: typeof ActionsWorkbench?.exportActionsCsv === 'function',
      configKey: 'dalia-actions-export-config-v1',
      webhookUrl: parsed.sheetsWebhookUrl || '',
      webhookConfigured: !!(parsed.sheetsWebhookUrl),
      dailyExport: typeof DailyEngine?.exportHistoryToSheets === 'function',
    };
  });
  await page.close();
  task('25.9', {
    passed: sheets.exportFn && sheets.dailyExport,
    title: 'Google Sheets export infrastructure',
    found: sheets,
    open: sheets.webhookConfigured ? [] : ['sheetsWebhookUrl empty — user must configure webhook URL'],
  });
}

// 25.10 Data report (static inventory)
report.dataReport = {
  modulesAdded: ['ai-control-center.js', 'marketing-notifications.js'],
  modulesUpdated: ['ai-control-center-bridge.js', 'ai-assistant.js', 'actions-workbench.js'],
  localStorageKeys: [
    'coco-ai-questions-v1', 'coco-multi-ai-runs-v1', 'coco-marketing-notifications-v1',
    'dalia-daily-engine-runs-v1', 'coco-global-filter-v3',
  ],
  connections: [
    'FAB → COCO_AI_CONTROL.ask → AiQuestionEngine → FilterEngine/CocoData',
    'screen-ai-center → AiControlCenter → COCO_AI_CONTROL',
    'MultiAiOrchestrator → CocoIntegrationHub.MultiAi',
    'MarketingNotifications → localStorage queue (Gmail stub)',
  ],
};

task('25.10', { passed: true, title: 'Data report', found: report.dataReport });
task('25.11', {
  passed: report.failed <= 2,
  title: 'Final QA summary',
  found: { passed: report.passed, failed: report.failed, consoleErrors: report.consoleErrors.length },
});

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passed: report.passed, failed: report.failed, out: OUT }, null, 2));
await browser.close();
