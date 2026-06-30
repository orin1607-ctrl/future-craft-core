#!/usr/bin/env node
/**
 * Marketing comprehensive stability audit — gates, buttons, reports, preview, negative tests.
 * Desktop 1366x900 · iPhone 13 · Pixel 5
 */
import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawn } from 'child_process';
import http from 'http';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HEAD = execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
const PUBLIC_ROOT = join(ROOT, 'public');
const PORT = Number(process.env.QA_PORT || 8765);
const LOCAL_BASE = `http://127.0.0.1:${PORT}/`;
const URL = process.env.STAGING_PAGES_URL ||
  `${LOCAL_BASE}ai-marketing-platform.html?v=${HEAD}&t=${Date.now()}`;
const OUT = join(ROOT, 'docs', 'audit-reports', 'marketing-comprehensive-stability');
mkdirSync(OUT, { recursive: true });

const report = {
  at: new Date().toISOString(),
  commit: HEAD,
  stagingUrl: `https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=${HEAD}`,
  localUrl: URL.split('&t=')[0],
  checks: {},
  pass: 0,
  fail: 0,
  byDevice: {},
};

function add(name, ok, detail) {
  report.checks[name] = { ok: !!ok, detail: detail || '' };
  if (ok) report.pass += 1; else report.fail += 1;
}

function deviceAdd(device, name, ok, detail) {
  const key = `${device}_${name}`;
  add(key, ok, detail);
  if (!report.byDevice[device]) report.byDevice[device] = { pass: 0, fail: 0 };
  if (ok) report.byDevice[device].pass += 1;
  else report.byDevice[device].fail += 1;
}

function isBenignConsoleError(t) {
  return /favicon|404.*\.(png|ico|svg|woff|webp)|net::ERR.*font|Failed to load resource.*\.(png|ico|svg|woff|webp)/i.test(t)
    || /ERR_CONNECTION_REFUSED|ERR_NAME_NOT_RESOLVED|Failed to fetch|NetworkError/i.test(t)
    || (/Failed to load resource/i.test(t) && /404/i.test(t));
}

async function ensureLocalServer() {
  if (process.env.STAGING_PAGES_URL) return null;
  const probe = () => new Promise((resolve) => {
    const req = http.get(`${LOCAL_BASE}ai-marketing-platform.html`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
  });
  if (await probe()) return null;
  const child = spawn('npx', ['--yes', 'http-server', PUBLIC_ROOT, '-l', String(PORT)], {
    cwd: ROOT,
    stdio: 'ignore',
    shell: true,
  });
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await probe()) return child;
  }
  throw new Error('Local server failed on port ' + PORT);
}

async function runStrategyToExport(page) {
  await page.locator('#screen-hub .hub-card', { hasText: 'חברות ועסקים' }).first().click();
  await page.waitForSelector('#biz-strategy-root .tb', { timeout: 30000 });
  for (let i = 0; i < 3; i++) await page.evaluate(() => { if (typeof nextT === 'function') nextT(); });
  await page.waitForTimeout(300);
  await page.evaluate(() => startAnalysis());
  await page.waitForFunction(() => document.getElementById('ana-done')?.style.display !== 'none', { timeout: 40000 });
  for (let i = 0; i < 3; i++) { await page.evaluate(() => { if (typeof nextT === 'function') nextT(); }); await page.waitForTimeout(200); }
  await page.waitForFunction(() => document.getElementById('exported')?.style.display !== 'none', { timeout: 15000 });
}

async function runFlow(deviceName, opts) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (isBenignConsoleError(t)) return;
    consoleErrors.push(t.slice(0, 200));
  });

  const p = (k, ok, detail) => deviceAdd(deviceName, k, ok, detail);

  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => typeof goScreen === 'function', { timeout: 90000 });
    await page.waitForFunction(() =>
      window.BusinessSummaryApproval && window.GooglePageQualityStandard && window.AiPageAdvisor &&
      window.PreBuildWorkReport && window.StrategicBriefing && window.WebsiteBuilderWizard,
      { timeout: 90000 });

    await page.evaluate(() => goScreen('screen-hub'));
    p('hub_active', await page.evaluate(() => document.getElementById('screen-hub')?.classList.contains('active')), 'hub');

    await runStrategyToExport(page);

    // Negative: business summary blocks
    const summaryBlock = await page.evaluate(() => {
      localStorage.removeItem('coco-business-summary-approved-v1');
      return window.BusinessSummaryApproval ? !BusinessSummaryApproval.assertGate() : false;
    });
    p('neg_business_summary_blocks', summaryBlock, 'blocked');

    const gatesBlock = await page.evaluate(() => {
      var blocked = { summary: false, briefing: false, materials: false, seo: false, report: false };
      localStorage.removeItem('coco-business-summary-approved-v1');
      if (window.BusinessSummaryApproval) blocked.summary = !BusinessSummaryApproval.assertGate();
      if (window.StrategicBriefing) {
        localStorage.removeItem('coco-strategic-briefing-approved-v1');
        blocked.briefing = !StrategicBriefing.assertGate();
      }
      if (window.MaterialsReadinessGate) blocked.materials = !MaterialsReadinessGate.assertGate();
      if (window.SeoStrategy) blocked.seo = !SeoStrategy.assertGate();
      if (window.PreBuildWorkReport) blocked.report = !PreBuildWorkReport.assertBuildGate();
      return blocked;
    });
    p('neg_gates_block_incomplete', gatesBlock.summary && gatesBlock.briefing && gatesBlock.materials && gatesBlock.seo && gatesBlock.report, JSON.stringify(gatesBlock));

    // Approve business summary
    const summaryApproved = await page.evaluate(() => {
      if (!window.BusinessSummaryApproval) return { ok: false };
      var biz = JSON.parse(localStorage.getItem('dalia_biz') || '{}');
      if (!biz.name && !biz.company) biz = { name: 'QA עסק', company: 'QA עסק', mainService: 'FleetOS', ideal: 'עסקים עם צי' };
      localStorage.setItem('dalia_biz', JSON.stringify(biz));
      BusinessSummaryApproval.aggregateSummary();
      var res = BusinessSummaryApproval.approveSummary();
      return { ok: res.ok && BusinessSummaryApproval.isReady() };
    });
    p('business_summary_approved', summaryApproved.ok, 'approved');

    // Strategic briefing
    const briefingDone = await page.evaluate(() => {
      if (!window.StrategicBriefing) return { ok: false };
      var st = StrategicBriefing.get();
      st.buildType = 'אתר';
      st.mainGoal = 'לידים';
      st.services = ['FleetOS / תוכנת ניהול צי'];
      st.audience = ['עסקים עם צי רכב'];
      st.regions = ['כל הארץ'];
      st.competitorsManual = ['מתחרה QA'];
      st.keywordsApproved = (st.keywordsSuggested || []).slice(0, 5);
      st.platforms = ['אתר', 'GSC'];
      var res = StrategicBriefing.approveBriefing(st);
      return { ok: res.ok && StrategicBriefing.isReady() };
    });
    p('strategic_briefing_approved', briefingDone.ok, 'briefing');

    const materialsGate = await page.evaluate(() => {
      if (!window.MaterialsReadinessGate) return { ok: false };
      const st = MaterialsReadinessGate.get();
      (MaterialsReadinessGate.CHECKLIST_ITEMS || []).forEach((it) => { st.checklist[it.id] = true; });
      st.hasAdditionalInfo = false;
      st.materialsConfirmed = true;
      localStorage.setItem('coco-materials-gate-v1', JSON.stringify(st));
      return { ok: MaterialsReadinessGate.isReady() };
    });
    p('materials_gate_ready', materialsGate.ok, 'materials');

    const seoGate = await page.evaluate(() => {
      if (!window.SeoStrategy) return { ok: false };
      const model = SeoStrategy.buildStrategyModel();
      const res = SeoStrategy.approveStrategy(model);
      return { ok: res.ok && SeoStrategy.isApproved() };
    });
    p('seo_strategy_approved', seoGate.ok, 'seo');

    await page.evaluate(() => {
      PreBuildWorkReport.exportPreBuildReportArtifacts();
      PreBuildWorkReport.approveReport();
      PreBuildWorkReport.updateBuildButtonsGate();
    });
    p('prebuild_report_approved', await page.evaluate(() => window.PreBuildWorkReport && PreBuildWorkReport.isApproved()), 'report');

    // Flow screens — actions must not stack overflow
    for (const sid of ['screen-agents', 'screen-goals', 'screen-actions', 'screen-history']) {
      const actionsOk = await page.evaluate((id) => {
        goScreen(id);
        return !!document.getElementById(id)?.classList.contains('active');
      }, sid);
      await page.waitForTimeout(400);
      if (sid === 'screen-actions') {
        const actReady = await page.evaluate(() => {
          var el = document.getElementById('coco-live-actions-pending');
          return el && el.getAttribute('data-coco-act-ready') === 'true';
        });
        p('flow_screen_actions_no_crash', actionsOk && actReady, sid);
      } else {
        p(`flow_${sid}`, actionsOk, sid);
      }
    }

    // Website builder
    await page.evaluate(() => goScreen('screen-business-strategy'));
    await page.locator('#exported button', { hasText: 'צור אתר AI' }).first().click();
    await page.waitForSelector('#website-builder-root .tb', { timeout: 15000 });
    for (let i = 0; i < 7; i++) { await page.locator('#wb-next').click(); await page.waitForTimeout(120); }
    await page.locator('#wb-next').click();
    await page.waitForSelector('#wb-complete', { state: 'visible', timeout: 30000 });

    const googleScores = await page.evaluate(() => {
      var root = document.getElementById('wb-google-scores-root');
      var hasModule = !!window.GooglePageQualityStandard;
      var evals = hasModule ? GooglePageQualityStandard.evaluatePreviewSite() : [];
      return { hasModule, evalCount: evals.length, hasDom: !!(root && root.textContent && root.textContent.indexOf('Google') >= 0) };
    });
    p('google_standard_scores', googleScores.hasModule && googleScores.evalCount > 0, JSON.stringify(googleScores));

    const advisor = await page.evaluate(() => {
      if (!window.AiPageAdvisor) return { ok: false };
      var preview = JSON.parse(localStorage.getItem('coco-website-builder-preview-site-v1') || 'null');
      var slug = preview && preview.pages && preview.pages[0] && preview.pages[0].slug;
      var advice = slug ? AiPageAdvisor.advisePage(slug) : null;
      return { ok: !!(advice && advice.score != null), score: advice && advice.score };
    });
    p('ai_page_advisor', advisor.ok, String(advisor.score));

    const preview = await page.evaluate(() => {
      const raw = localStorage.getItem('coco-website-builder-preview-site-v1');
      let d = null; try { d = raw ? JSON.parse(raw) : null; } catch (e) {}
      return { pages: d?.pages?.length || 0 };
    });
    p('preview_multipage', preview.pages >= 4, JSON.stringify(preview));

    await page.evaluate(() => {
      const cb = document.getElementById('wb-approval-check');
      if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
      if (typeof wbToggleApproval === 'function') wbToggleApproval(true);
    });
    await page.evaluate(() => {
      if (typeof wbContinueToAgents === 'function') wbContinueToAgents();
      else goScreen('screen-agents');
    });
    await page.waitForFunction(() => document.getElementById('screen-agents')?.classList.contains('active'), { timeout: 20000 });
    p('return_to_agents', true, 'ok');

    const fabCount = await page.evaluate(() => document.querySelectorAll('#cocoAiFab').length);
    p('single_fab', fabCount === 1, String(fabCount));

    p('console_clean', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
    p('scenario_complete', true, 'ok');
  } catch (e) {
    p('scenario_complete', false, e.message || String(e));
  } finally {
    await ctx.close();
    await browser.close();
  }
}

let serverProc = null;
try {
  serverProc = await ensureLocalServer();
  await runFlow('desktop', { viewport: { width: 1366, height: 900 } });
  await runFlow('iphone13', { ...devices['iPhone 13'], locale: 'he-IL' });
  await runFlow('android', { ...devices['Pixel 5'], locale: 'he-IL' });
} finally {
  if (serverProc) serverProc.kill('SIGTERM');
}

report.ok = report.fail === 0;
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  ok: report.ok,
  pass: report.pass,
  fail: report.fail,
  byDevice: report.byDevice,
  stagingUrl: report.stagingUrl,
}, null, 2));
process.exit(report.ok ? 0 : 1);
