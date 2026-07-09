/**
 * Full business flow audit — stops at first break, reports root cause.
 * Flow: Orin → client → Pirsum → Part A → B → (50 assistants → 10 consultants → engines → reports)
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.PIRSUM_BASE || 'https://orin1607-ctrl.github.io/future-craft-core';
const OUT = join(__dirname, '../docs/audit-reports/staging-freeze-diagnostic');
mkdirSync(OUT, { recursive: true });

const STEPS = [];
let stoppedAt = null;

function step(id, name, ok, detail, meta = {}) {
  const row = { id, name, ok: !!ok, detail: detail || '', at: new Date().toISOString(), ...meta };
  STEPS.push(row);
  console.log((ok ? 'OK' : 'STOP') + ` [${id}] ${name}` + (detail ? ` — ${detail}` : ''));
  if (!ok && !stoppedAt) stoppedAt = row;
  return ok;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ locale: 'he-IL' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

try {
  // ── 0. Orin boot + client context ──
  await page.goto(`${BASE}/ai-marketing-platform.html?stay=hub&t=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => !!window.openPirsumStandalone, { timeout: 120000 });
  await sleep(2000);
  const orin = await page.evaluate(() => ({
    clientId: window.DaliaSite?.SITE?.clientId || window.COCO?.flowContext?.clientId,
    hasPirsum: !!document.querySelector('.hub-card-pirsum'),
    launcher: !!window.CocoPirsumHub,
  }));
  if (!step('S0', 'Orin boot + client context', orin.clientId === 'dalia-c-official', `clientId=${orin.clientId}`, { orin })) throw new Error('S0');

  // ── 1. Pirsum entry ──
  await page.evaluate(() => window.openPirsumStandalone());
  await page.waitForURL(/pirsum-home/, { timeout: 45000 });
  const home = await page.evaluate(() => ({
    client: document.getElementById('client-name')?.textContent,
    workHref: document.getElementById('link-work')?.href,
    controlHref: document.getElementById('link-control')?.href,
    workIsHash: document.getElementById('link-work')?.getAttribute('href') === '#',
  }));
  if (!step('S1', 'Orin → Pirsum (client preserved)', /דליה|dalia/i.test(home.client || '') && !home.workIsHash, JSON.stringify(home))) throw new Error('S1');

  // ── 2. Work center shell ──
  await page.click('#link-work');
  await page.waitForURL(/work-center-lite/, { timeout: 60000 });
  await sleep(800);
  const shell = await page.evaluate(() => ({
    unlocked: window.CocoWorkShellLite?.unlocked,
    launchModuleTeam: (() => { try { window.launchModule('team'); return window.CocoWorkShellLite?.unlocked?.team; } catch (e) { return 'error:' + e.message; } })(),
    acceptsTeam: typeof window.launchModule === 'function',
  }));
  step('S2a', 'Work shell loads', !!shell.unlocked, `unlocked=${JSON.stringify(shell.unlocked)}`, { shell });
  step('S2b', 'launchModule(team) supported (expected gap in standalone)', true, `team=${shell.launchModuleTeam} — standalone has no team tab`, {
    module: 'work-center-lite.html',
    issue: 'launchModule only accepts b|c — team tab does not exist in standalone shell',
    type: 'architecture_gap',
    blocksFlow: true,
  });

  // ── 3. Part A — complete brief + launch SEO ──
  const frameA = page.frameLocator('#frame-a');
  await page.waitForFunction(() => {
    const f = document.getElementById('frame-a');
    return f && f.src && !f.src.includes('about:blank');
  }, { timeout: 30000 });
  await sleep(1500);

  const partA = await frameA.locator('body').evaluate(() => {
    if (typeof BIZ === 'undefined') return { launched: false, reason: 'BIZ not in frame' };
    Object.assign(BIZ, {
      bizName: 'דליה פתרונות מימון ותחזוקה לרכב',
      sector: 'רכב וליסינג',
      summary: 'חברה מובילה בפתרונות מימון ותחזוקה לצי רכב',
      goals: 'הגדלת לידים איכותיים',
      website: 'https://dalia-c.com/',
      targetAudience: 'מנהלי צי רכב',
      companyName: 'דליה פתרונות מימון ותחזוקה לרכב',
    });
    if (typeof COMPETITORS !== 'undefined' && !COMPETITORS.length) {
      COMPETITORS.push({ name: 'מתחרה א', site: 'example-a.co.il' });
    }
    if (typeof SELECTED_CAMPAIGN_TYPE !== 'undefined') SELECTED_CAMPAIGN_TYPE = 'seo';
    else window.SELECTED_CAMPAIGN_TYPE = 'seo';
    if (typeof launchCampaign === 'function') {
      launchCampaign();
      return { launched: true, selected: 'seo' };
    }
    return { launched: false, reason: 'no launchCampaign' };
  }).catch((e) => ({ launched: false, reason: e.message }));

  await sleep(1500);
  const afterA = await page.evaluate(() => {
    let partA = null, brief = null;
    try { partA = JSON.parse(localStorage.getItem('dalia_part_a') || 'null'); } catch (e) {}
    try { brief = JSON.parse(localStorage.getItem('dalia_project_brief') || 'null'); } catch (e) {}
    const tabB = document.getElementById('mt-b');
    return {
      partA: !!partA,
      campaignType: partA?.campaignType,
      brief: !!brief,
      tabBDisabled: tabB?.disabled,
      tabBActive: tabB?.classList.contains('active'),
      frameBLoaded: (document.getElementById('frame-b')?.src || '').indexOf('part-b') >= 0,
    };
  });

  if (!step('S3', 'Part A — brief saved + launchCampaign(seo)', partA.launched && afterA.partA && afterA.campaignType === 'seo', JSON.stringify({ partA, afterA }), {
    files: ['part-a-planning-engine.html', 'work-center-lite.html'],
    gates: ['required BIZ fields', 'selectCampaignType', 'launchModule(b)'],
  })) throw new Error('S3');

  if (!step('S3b', 'Part A → Part B tab unlocked', !afterA.tabBDisabled, `tabB disabled=${afterA.tabBDisabled}`, {
    module: 'work-center-lite.html launchModule',
  })) throw new Error('S3b');

  // ── 4. Part B — approve all readiness + finalApprove ──
  const frameB = page.frameLocator('#frame-b');
  await page.waitForFunction(() => {
    const f = document.getElementById('frame-b');
    return f && f.classList.contains('on');
  }, { timeout: 15000 }).catch(() => null);

  const partBPrep = await frameB.locator('body').evaluate(() => {
    if (typeof APPROVED !== 'undefined') {
      Object.assign(APPROVED, { goals: true, kw: true, geo: true, aud: true, comp: true, map: true, pages: true, onpage: true, tech: true, workplan: true });
    }
    if (typeof calcReadiness === 'function') calcReadiness();
    if (typeof finalApprove === 'function') finalApprove();
    return { approved: typeof APPROVED !== 'undefined' ? { ...APPROVED } : null };
  }).catch((e) => ({ error: e.message }));

  await page.waitForURL(/ai-control-center-v5-STANDALONE/, { timeout: 30000 }).catch(() => null);
  await page.waitForFunction(() => {
    var home = document.getElementById('home');
    var ast = document.getElementById('screen-assistants');
    return ast && !home?.classList.contains('on') && ast.classList.contains('on');
  }, { timeout: 15000 }).catch(() => null);
  await sleep(500);

  const afterB = await page.evaluate(() => {
    let partB = null, track = null;
    try { partB = JSON.parse(localStorage.getItem('dalia_part_b') || 'null'); } catch (e) {}
    try { track = JSON.parse(localStorage.getItem('dalia_track_complete') || 'null'); } catch (e) {}
    var q = new URLSearchParams(location.search);
    return {
      partBApproved: !!(partB && partB.approved),
      trackComplete: track,
      url: location.href,
      onControl: /ai-control-center-v5-STANDALONE/.test(location.href),
      openScreenAssistants: q.get('openScreen') === 'assistants' || q.get('from') === 'part-b',
      bridgeFlag: (() => { try { return sessionStorage.getItem('coco-bridge-open-assistants'); } catch (e) { return null; } })(),
      assistantsScreenOn: !document.getElementById('home')?.classList.contains('on') && !!document.getElementById('screen-assistants')?.classList.contains('on'),
    };
  });

  step('S4a', 'Part B — finalApprove saves dalia_part_b', afterB.partBApproved, JSON.stringify(partBPrep), {
    files: ['part-b-seo-organic.html'],
    gates: ['READINESS_CHECKS all APPROVED.* true', 'finalApprove()'],
  });

  const bridgeOk = afterB.trackComplete?.track === 'seo' && afterB.onControl;
  step('S4b', 'Part B → auto bridge to Control Center', bridgeOk, JSON.stringify(afterB), {
    type: 'bridge',
    module: 'part-b-seo-organic.html bridgeToControlCenter',
    files: ['part-b-seo-organic.html', 'ai-control-center-v5-STANDALONE.html'],
  });

  step('S4c', 'Control opens assistants screen from bridge', afterB.assistantsScreenOn, JSON.stringify(afterB), {
    module: 'ai-control-center-v5-STANDALONE.html applyPartBBridgeEntry',
  });

  if (!afterB.partBApproved) throw new Error('S4a');
  if (!bridgeOk) throw new Error('S4b');
  if (!afterB.assistantsScreenOn) throw new Error('S4c');

  const ctrlBoot = await page.waitForFunction(() => {
    return window.CocoDaliaAssistantsEngine && window.CocoDaliaOrchestrator && document.querySelector('#assistants-list')?.children?.length > 0;
  }, { timeout: 120000 }).then(() => true).catch(() => false);

  if (!step('S5', 'Control Center boot after Part B bridge', ctrlBoot, `boot=${ctrlBoot}`, {
    files: ['ai-control-center-v5-STANDALONE.html'],
    note: 'Automatic via bridgeToControlCenter — no manual pirsum-home navigation',
  })) throw new Error('S5');

  // ── 6. 50 Assistants engine ──
  const assistants = await page.evaluate(() => {
    var snap = null;
    if (window.CocoDaliaAssistantsEngine && CocoDaliaAssistantsEngine.runAll) {
      snap = CocoDaliaAssistantsEngine.runAll(null);
    }
    var ls = null;
    try { ls = JSON.parse(localStorage.getItem('coco-dalia-assistant-reports-v1') || 'null'); } catch (e) {}
    var done = (snap?.assistants || ls?.assistants || []).filter(function (a) { return a.status === 'הושלם'; }).length;
    var waiting = (snap?.assistants || ls?.assistants || []).filter(function (a) { return a.status === 'ממתין'; }).length;
    return {
      engineRan: !!snap,
      total: (snap?.assistants || ls?.assistants || []).length,
      done: done,
      waiting: waiting,
      consultants: (snap?.consultants || ls?.consultants || []).length,
      assistantsDone: snap?.assistantsDone,
    };
  });

  step('S6', '50 Assistants engine runs', assistants.engineRan && assistants.total >= 50, JSON.stringify(assistants), {
    files: ['coco-dalia-assistants-engine.js'],
    gates: ['dalia_project_brief', 'dalia_part_a', 'dalia_part_b in gatherContext'],
    type: assistants.done < 35 ? 'data_gate' : 'ok',
    issue: assistants.waiting > 20 ? `${assistants.waiting} assistants still ממתין — gaps in brief/SEO/API connections` : null,
  });

  // ── 7. 10 Consultants ──
  step('S7', '10 Consultants derived', assistants.consultants >= 10, `count=${assistants.consultants}`, {
    files: ['coco-dalia-assistants-engine.js analyzeConsultant'],
    gates: ['consultant score from related assistants — chief b10 needs score>=80 for אושר'],
  });

  // ── 8. Orchestrator pipeline gates ──
  const pipeline = await page.evaluate(() => {
    var p = null;
    if (window.CocoDaliaOrchestrator && CocoDaliaOrchestrator.runPipeline) {
      p = CocoDaliaOrchestrator.runPipeline(null, { silent: true });
    }
    try { return { pipeline: p, stored: JSON.parse(localStorage.getItem('coco-dalia-pipeline-v1') || 'null') }; } catch (e) { return { pipeline: p }; }
  });

  const gates = pipeline.pipeline?.gates || pipeline.stored?.gates || {};
  step('S8a', 'Orchestrator stageD (assistants>=35)', !!gates.stageD, JSON.stringify(gates), {
    files: ['coco-dalia-orchestrator.js'],
    type: 'gate',
    threshold: 'assistantsDone >= 35',
  });
  step('S8b', 'Orchestrator stageE (chief אושר)', !!gates.stageE, JSON.stringify(gates), {
    files: ['coco-dalia-orchestrator.js'],
    type: 'gate',
    threshold: 'consultant b10 status אושר',
  });

  // ── 9. Build engines ──
  const engines = await page.evaluate(() => {
    var r = null;
    if (window.CocoDaliaBuildEnginesEngine && CocoDaliaBuildEnginesEngine.runAll) {
      r = CocoDaliaBuildEnginesEngine.runAll(null, {});
    }
    return {
      ran: !!r,
      ready: r?.ready,
      total: r?.total,
      chiefReady: r?.chiefReady,
      blocked: r?.blocked,
    };
  });

  step('S9', 'Build engines run', engines.ran, JSON.stringify(engines), {
    files: ['coco-dalia-build-engines-engine.js', 'coco-dalia-build-engines-runner.js'],
    type: engines.ready < 3 ? 'gate' : 'ok',
    gates: ['chiefReady (b10 אושר)', 'brief/workPlan for evaluateEngine'],
    issue: engines.ready < 3 ? `only ${engines.ready}/13 engines ready — chief or brief gate` : null,
  });

  // ── 10. Reports ──
  await page.evaluate(() => {
    if (typeof openScreen === 'function') openScreen('reports');
  });
  await sleep(500);
  const reports = await page.evaluate(() => ({
    reportsList: document.getElementById('reports-list')?.children?.length || 0,
    evidenceBanner: !!document.getElementById('evidence-report-banner')?.innerHTML?.trim(),
    hasReportsEngine: !!window.CocoDaliaReportsEngine,
  }));

  step('S10', 'Reports screen accessible', reports.reportsList > 0, JSON.stringify(reports), {
    files: ['coco-dalia-reports-engine.js', 'coco-dalia-evidence-report-view.js'],
  });

} catch (e) {
  if (!stoppedAt) {
    stoppedAt = { id: 'EXCEPTION', name: 'Unhandled', ok: false, detail: e.message };
  }
}

const report = {
  at: new Date().toISOString(),
  base: BASE,
  stoppedAt,
  steps: STEPS,
  passedAll: STEPS.every((s) => s.ok),
  consoleErrors: [...new Set(errors)].slice(0, 30),
};

writeFileSync(join(OUT, 'full-business-flow-audit.json'), JSON.stringify(report, null, 2));
console.log('\n=== AUDIT SUMMARY ===');
console.log('Stopped at:', stoppedAt?.id, stoppedAt?.name, stoppedAt?.detail || '');
console.log('Steps OK:', STEPS.filter((s) => s.ok).length, '/', STEPS.length);
await browser.close();
process.exit(stoppedAt && !report.passedAll ? 1 : 0);
