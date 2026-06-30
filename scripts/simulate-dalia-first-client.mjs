#!/usr/bin/env node
/**
 * Dalia first real client — full end-to-end simulation + 20-section report.
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
const PORT = Number(process.env.QA_PORT || 8866);
const LOCAL_BASE = `http://127.0.0.1:${PORT}/`;
const USE_LOCAL = process.env.FORCE_STAGING_URL !== '1';
const URL = USE_LOCAL
  ? `${LOCAL_BASE}ai-marketing-platform.html?v=${HEAD}&t=${Date.now()}`
  : (process.env.STAGING_PAGES_URL ||
    `https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=${HEAD}&t=${Date.now()}`);
const OUT = join(ROOT, 'docs', 'audit-reports', 'dalia-first-client-simulation');
mkdirSync(OUT, { recursive: true });

const COMPANY = 'דליה פתרונות תפעול ותחזוקה לרכב';
const report = {
  at: new Date().toISOString(),
  commit: HEAD,
  company: COMPANY,
  stagingUrl: `https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=${HEAD}`,
  checks: {},
  pass: 0,
  fail: 0,
  simulation: {},
};

function add(name, ok, detail) {
  report.checks[name] = { ok: !!ok, detail: detail || '' };
  if (ok) report.pass += 1; else report.fail += 1;
}

function isBenignConsoleError(t) {
  return /favicon|404.*\.(png|ico|svg|woff|webp)|net::ERR.*font|Failed to load resource.*\.(png|ico|svg|woff|webp)/i.test(t)
    || /ERR_CONNECTION_REFUSED|ERR_NAME_NOT_RESOLVED|Failed to fetch|NetworkError/i.test(t)
    || (/Failed to load resource/i.test(t) && /404/i.test(t));
}

function probe() {
  return new Promise((resolve) => {
    const req = http.get(`${LOCAL_BASE}ai-marketing-platform.html`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
  });
}

async function ensureLocalServer() {
  if (!USE_LOCAL) return null;
  if (await probe()) return null;
  const child = spawn('npx', ['--yes', 'http-server', PUBLIC_ROOT, '-p', String(PORT), '-c-1'], {
    cwd: ROOT, stdio: 'ignore', shell: true,
  });
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await probe()) return child;
  }
  child.kill('SIGTERM');
  throw new Error('Local server failed on port ' + PORT);
}

async function runSimulation(deviceName, opts) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);
  page.setDefaultNavigationTimeout(120000);
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (isBenignConsoleError(t)) return;
    consoleErrors.push(t.slice(0, 200));
  });

  const p = (k, ok, detail) => add(`${deviceName}_${k}`, ok, detail);

  try {
    await page.goto(URL, { waitUntil: 'load', timeout: 180000 });
    let bootReady = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      const ready = await page.evaluate(() => ({
        go: typeof goScreen === 'function',
        seed: !!window.DaliaFirstClientSeed,
        report: !!window.DaliaFirstClientReport,
      }));
      if (ready.go && ready.seed && ready.report) {
        bootReady = true;
        break;
      }
      await page.waitForTimeout(2000);
      if (attempt === 59) throw new Error('Boot timeout: ' + JSON.stringify(ready));
    }
    p('boot_ready', bootReady, 'modules loaded');

    // Seed full Dalia profile
    const seedResult = await page.evaluate(() => DaliaFirstClientSeed.applyFullProfile(true));
    p('seed_applied', seedResult.ok && seedResult.keywordCount >= 30, JSON.stringify(seedResult));

    const bizCheck = await page.evaluate(() => {
      var biz = JSON.parse(localStorage.getItem('dalia_biz') || '{}');
      return {
        name: biz.name,
        hasServices: (biz.services || '').split(',').length >= 15,
        notGarage: biz.sector && biz.sector.indexOf('לא מוסך') >= 0,
      };
    });
    p('biz_profile', bizCheck.name === 'דליה פתרונות תפעול ותחזוקה לרכב' && bizCheck.hasServices && bizCheck.notGarage, JSON.stringify(bizCheck));

    // Negative: gates block before approval
    const negGates = await page.evaluate(() => ({
      summary: !BusinessSummaryApproval.assertGate(),
      briefing: !StrategicBriefing.assertGate(),
      materials: !MaterialsReadinessGate.assertGate(),
      seo: !SeoStrategy.assertGate(),
      report: !PreBuildWorkReport.assertBuildGate(),
    }));
    p('neg_gates_block', negGates.summary && negGates.briefing && negGates.materials && negGates.seo && negGates.report, JSON.stringify(negGates));

    // Real user flow: hub → strategy wizard
    await page.evaluate(() => goScreen('screen-hub'));
    await page.locator('#screen-hub .hub-card', { hasText: 'חברות ועסקים' }).first().click();
    await page.waitForSelector('#biz-strategy-root .tb', { timeout: 30000 });

    for (let i = 0; i < 3; i++) await page.evaluate(() => { if (typeof nextT === 'function') nextT(); });
    await page.evaluate(() => startAnalysis());
    await page.waitForFunction(() => document.getElementById('ana-done')?.style.display !== 'none', { timeout: 40000 });
    for (let i = 0; i < 3; i++) { await page.evaluate(() => { if (typeof nextT === 'function') nextT(); }); await page.waitForTimeout(200); }
    await page.waitForFunction(() => document.getElementById('exported')?.style.display !== 'none', { timeout: 15000 });

    // Re-apply seed after wizard export (wizard may overwrite)
    await page.evaluate(() => DaliaFirstClientSeed.applyFullProfile(false));

    // Business summary — click approve if panel exists
    const summaryFlow = await page.evaluate(() => {
      BusinessSummaryApproval.aggregateSummary();
      var s = BusinessSummaryApproval.get();
      var hasCompany = s.company && s.company.indexOf('דליה') >= 0;
      var res = BusinessSummaryApproval.approveSummary();
      return { hasCompany, approved: res.ok && BusinessSummaryApproval.isReady() };
    });
    p('business_summary', summaryFlow.approved && summaryFlow.hasCompany, JSON.stringify(summaryFlow));

    // Strategic briefing with full keywords
    const briefingFlow = await page.evaluate(() => {
      var st = DaliaFirstClientSeed.buildBriefingState();
      localStorage.setItem('coco-strategic-briefing-v1', JSON.stringify(st));
      var res = StrategicBriefing.approveBriefing(st);
      return {
        ok: res.ok && StrategicBriefing.isReady(),
        kw: StrategicBriefing.allKeywords(st).length,
      };
    });
    p('strategic_briefing', briefingFlow.ok && briefingFlow.kw >= 30, String(briefingFlow.kw));

    // AI Consultant at briefing stage
    const aiBrief = await page.evaluate(() => {
      var ideas = AiConsultant.generateIdeas('briefing');
      return { ok: !!(ideas.keywordIdeas && ideas.targetAudienceIdeas && ideas.actionPlan), cats: Object.keys(ideas).length };
    });
    p('ai_consultant_briefing', aiBrief.ok, String(aiBrief.cats));

    // Materials gate
    const materials = await page.evaluate(() => {
      var st = MaterialsReadinessGate.get();
      MaterialsReadinessGate.CHECKLIST_ITEMS.forEach(function (it) { st.checklist[it.id] = true; });
      st.hasAdditionalInfo = false;
      st.materialsConfirmed = true;
      localStorage.setItem('coco-materials-gate-v1', JSON.stringify(st));
      return MaterialsReadinessGate.isReady();
    });
    p('materials_gate', materials, 'ready');

    // SEO + AI
    const seoFlow = await page.evaluate(() => {
      var model = SeoStrategy.buildStrategyModel();
      var res = SeoStrategy.approveStrategy(model);
      var ideas = AiConsultant.generateIdeas('seo');
      return {
        ok: res.ok && SeoStrategy.isApproved(),
        keywords: (model.keywords || []).length,
        ai: !!(ideas.competitorResearch && ideas.forecast),
      };
    });
    p('seo_strategy', seoFlow.ok && seoFlow.keywords >= 10, JSON.stringify(seoFlow));

    // Pre-build report + export
    const reportFlow = await page.evaluate(() => {
      PreBuildWorkReport.exportPreBuildReportArtifacts();
      PreBuildWorkReport.approveReport();
      PreBuildWorkReport.updateBuildButtonsGate();
      var ideas = AiConsultant.generateIdeas('report');
      AiConsultant.exportStrategicReport('json');
      return {
        approved: PreBuildWorkReport.isApproved(),
        hasReadiness: !!(PreBuildWorkReport.buildPreBuildReportModel().readinessScores),
        ai: !!ideas.strategicReport,
      };
    });
    p('prebuild_report', reportFlow.approved && reportFlow.hasReadiness, JSON.stringify(reportFlow));

    // 20-section full report
    const fullReport = await page.evaluate(() => {
      var exp = DaliaFirstClientReport.exportArtifacts();
      return {
        ok: exp.ok && exp.report.sectionCount === 20,
        sections: exp.report.sectionCount,
        htmlLen: exp.html.length,
        jsonLen: exp.json.length,
        company: exp.report.company,
        html: exp.html,
        json: exp.json,
      };
    });
    p('report_20_sections', fullReport.ok, JSON.stringify({ sections: fullReport.sections, htmlLen: fullReport.htmlLen }));
    if (deviceName === 'desktop') {
      report.simulation.fullReport = fullReport;
    }

    // Website builder
    await page.evaluate(() => goScreen('screen-business-strategy'));
    await page.waitForTimeout(400);
    await page.locator('#exported button', { hasText: 'צור אתר AI' }).first().click();
    await page.waitForSelector('#website-builder-root .tb', { timeout: 15000 });
    for (let i = 0; i < 7; i++) { await page.locator('#wb-next').click(); await page.waitForTimeout(120); }
    await page.locator('#wb-next').click();
    await page.waitForSelector('#wb-complete', { state: 'visible', timeout: 30000 });

    const preview = await page.evaluate(() => {
      var d = JSON.parse(localStorage.getItem('coco-website-builder-preview-site-v1') || 'null');
      var url = localStorage.getItem('coco-client-preview-permanent-url-v1');
      return { pages: d && d.pages ? d.pages.length : 0, previewUrl: url };
    });
    p('preview', preview.pages >= 4 && !!preview.previewUrl, JSON.stringify(preview));

    // Google standard + page advisor
    const quality = await page.evaluate(() => {
      var evals = GooglePageQualityStandard.evaluatePreviewSite();
      var slug = JSON.parse(localStorage.getItem('coco-website-builder-preview-site-v1') || '{}').pages;
      slug = slug && slug[0] && slug[0].slug;
      var advice = slug ? AiPageAdvisor.advisePage(slug) : null;
      return { google: evals.length, advisor: !!(advice && advice.score != null) };
    });
    p('google_and_advisor', quality.google > 0 && quality.advisor, JSON.stringify(quality));

    await page.evaluate(() => {
      var cb = document.getElementById('wb-approval-check');
      if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
      if (typeof wbToggleApproval === 'function') wbToggleApproval(true);
    });
    await page.evaluate(() => {
      if (typeof wbContinueToAgents === 'function') wbContinueToAgents();
      else goScreen('screen-agents');
    });
    await page.waitForFunction(() => document.getElementById('screen-agents')?.classList.contains('active'), { timeout: 20000 });

    for (const sid of ['screen-goals', 'screen-actions', 'screen-history']) {
      await page.evaluate((id) => goScreen(id), sid);
      await page.waitForTimeout(350);
      p(`post_${sid}`, await page.evaluate((id) => !!document.getElementById(id)?.classList.contains('active'), sid), sid);
    }

    const hub = await page.evaluate(() => {
      var h = localStorage.getItem('coco-site-marketing-hub-v1');
      return h ? JSON.parse(h).active : false;
    });
    p('site_hub_active', hub, 'hub');

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
  await runSimulation('desktop', { viewport: { width: 1366, height: 900 } });
  await runSimulation('iphone13', { ...devices['iPhone 13'], locale: 'he-IL' });
} finally {
  if (serverProc) serverProc.kill('SIGTERM');
}

// Write report artifacts from desktop simulation
if (report.simulation.fullReport) {
  const fr = report.simulation.fullReport;
  writeFileSync(join(OUT, 'DALIA-FIRST-CLIENT-REPORT.html'), fr.html || '');
  writeFileSync(join(OUT, 'DALIA-FIRST-CLIENT-REPORT.json'), fr.json || '{}');
  delete report.simulation.fullReport.html;
  delete report.simulation.fullReport.json;
}

report.ok = report.fail === 0;
writeFileSync(join(OUT, 'simulation-report.json'), JSON.stringify(report, null, 2));

// Generate Hebrew summary report
const heReport = `# דוח סימולציית לקוח ראשון — ${COMPANY}

**תאריך:** ${report.at.split('T')[0]}  
**Commit:** \`${HEAD}\`  
**Staging:** ${report.stagingUrl}

## תוצאות סימולציה

| מדד | ערך |
|-----|-----|
| עבר | ${report.pass} |
| נכשל | ${report.fail} |
| סטטוס | ${report.ok ? '✅ PASS' : '❌ FAIL'} |

## 20 סעיפי דוח

${report.simulation.fullReport ? '✅ דוח 20 סעיפים נוצר (HTML + JSON ב-localStorage `coco-dalia-first-client-report-v1`)' : '⚠️ לא נוצר'}

## PDF

❌ PDF אמיתי לא קיים — זמין: HTML + JSON + הדפסה מ-Pre-Build Report

## בדיקות עיקריות

${Object.entries(report.checks).filter(([k]) => k.startsWith('desktop_')).map(([k, v]) => `- ${v.ok ? '✅' : '❌'} ${k.replace('desktop_', '')}: ${v.detail}`).join('\n')}

## המלצה

${report.ok ? 'המערכת עברה סימולציית לקוח ראשון מלאה.' : 'יש לתקן כשלונות לפני המשך.'}
`;
writeFileSync(join(OUT, 'REPORT-HE.md'), heReport);

console.log(JSON.stringify({ ok: report.ok, pass: report.pass, fail: report.fail, out: OUT }, null, 2));
process.exit(report.ok ? 0 : 1);
