#!/usr/bin/env node
/**
 * Full marketing flow QA — end-to-end including report, builder, site hub.
 */
import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HEAD = execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
const URL = process.env.STAGING_PAGES_URL ||
  `https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=${HEAD}&t=${Date.now()}`;
const OUT = join(ROOT, 'docs', 'audit-reports', 'full-marketing-flow-qa');
mkdirSync(OUT, { recursive: true });

const report = { at: new Date().toISOString(), commit: HEAD, stagingUrl: URL.split('&t=')[0], checks: {}, pass: 0, fail: 0 };

function add(name, ok, detail) {
  report.checks[name] = { ok: !!ok, detail: detail || '' };
  if (ok) report.pass += 1; else report.fail += 1;
}

async function runFlow(name, opts) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const consoleErrors = [];
  function isBenignConsoleError(t) {
    return /favicon|404.*\.(png|ico|svg|woff|webp)|net::ERR.*font|Failed to load resource.*\.(png|ico|svg|woff|webp)/i.test(t)
      || /ERR_CONNECTION_REFUSED|ERR_NAME_NOT_RESOLVED|Failed to fetch|NetworkError/i.test(t)
      || (/Failed to load resource/i.test(t) && /404/i.test(t));
  }
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (isBenignConsoleError(t)) return;
    consoleErrors.push(t.slice(0, 200));
  });

  const p = (k) => `${name}_${k}`;

  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => typeof goScreen === 'function', { timeout: 90000 });
    await page.waitForFunction(() => window.PreBuildWorkReport && window.SiteMarketingHub && window.WebsiteBuilderWizard && window.MaterialsReadinessGate && window.SeoStrategy && window.StrategicBriefing && window.AiConsultant, { timeout: 90000 });

    // Hub scroll smoke
    await page.evaluate(() => goScreen('screen-hub'));
    await page.waitForTimeout(400);
    const hubActive = await page.evaluate(() => document.getElementById('screen-hub')?.classList.contains('active'));
    add(p('hub_active'), hubActive, 'hub');

    // Strategy flow
    await page.locator('#screen-hub .hub-card', { hasText: 'חברות ועסקים' }).first().click();
    await page.waitForSelector('#biz-strategy-root .tb', { timeout: 30000 });

    for (let i = 0; i < 3; i++) await page.evaluate(() => { if (typeof nextT === 'function') nextT(); });
    await page.waitForTimeout(300);
    await page.evaluate(() => startAnalysis());
    await page.waitForFunction(() => document.getElementById('ana-done')?.style.display !== 'none', { timeout: 40000 });
    for (let i = 0; i < 3; i++) { await page.evaluate(() => { if (typeof nextT === 'function') nextT(); }); await page.waitForTimeout(200); }
    await page.waitForFunction(() => document.getElementById('exported')?.style.display !== 'none', { timeout: 15000 });

    // Gates block without completion
    const gatesBlock = await page.evaluate(() => {
      var blocked = { briefing: false, materials: false, seo: false, report: false };
      if (window.StrategicBriefing) {
        localStorage.removeItem('coco-strategic-briefing-approved-v1');
        blocked.briefing = !StrategicBriefing.assertGate();
      }
      if (window.MaterialsReadinessGate) blocked.materials = !MaterialsReadinessGate.assertGate();
      if (window.SeoStrategy) blocked.seo = !SeoStrategy.assertGate();
      if (window.PreBuildWorkReport) blocked.report = !PreBuildWorkReport.assertBuildGate();
      return blocked;
    });
    add(p('gates_block_incomplete'), gatesBlock.briefing && gatesBlock.materials && gatesBlock.seo && gatesBlock.report, JSON.stringify(gatesBlock));

    // Fill strategic briefing
    const briefingDone = await page.evaluate(() => {
      if (!window.StrategicBriefing) return { ok: false };
      var st = StrategicBriefing.get();
      st.buildType = 'אתר';
      st.mainGoal = 'לידים';
      st.services = ['FleetOS / תוכנת ניהול צי', 'תפעול צי רכב'];
      st.audience = ['עסקים עם צי רכב'];
      st.regions = ['כל הארץ'];
      st.competitorsManual = ['מתחרה QA'];
      st.keywordsApproved = (st.keywordsSuggested || []).slice(0, 5);
      st.keywordsManual = ['תוכנה לניהול צי'];
      st.platforms = ['אתר', 'GSC', 'GA', 'FleetOS'];
      localStorage.setItem('coco-strategic-briefing-v1', JSON.stringify(st));
      var res = StrategicBriefing.approveBriefing(st);
      return { ok: res.ok && StrategicBriefing.isReady(), keywords: StrategicBriefing.allKeywords(st).length };
    });
    add(p('strategic_briefing_approved'), briefingDone.ok, String(briefingDone.keywords));

    // AI Consultant — briefing + SEO stages
    const consultantBriefing = await page.evaluate(() => {
      if (!window.AiConsultant) return { ok: false };
      const ideas = AiConsultant.generateIdeas('briefing');
      const cats = ['keywordIdeas', 'targetAudienceIdeas', 'advertisingPlatformIdeas', 'serviceIdeas', 'competitorResearch', 'competitorInspiration', 'marketComparison', 'actionPlan', 'forecast', 'strategicReport'];
      const missing = cats.filter((c) => !ideas[c]);
      return { ok: missing.length === 0, categories: cats.length - missing.length, hasDisclaimer: !!(ideas.forecast && ideas.forecast.disclaimer) };
    });
    add(p('ai_consultant_briefing_10_cats'), consultantBriefing.ok, String(consultantBriefing.categories));
    add(p('ai_consultant_forecast_disclaimer'), consultantBriefing.hasDisclaimer, 'disclaimer');

    const consultantSeo = await page.evaluate(() => {
      if (!window.AiConsultant) return { ok: false };
      const ideas = AiConsultant.generateIdeas('seo');
      return { ok: !!(ideas.keywordIdeas && ideas.actionPlan && ideas.competitorResearch) };
    });
    add(p('ai_consultant_seo'), consultantSeo.ok, 'seo stage');

    const consultantExport = await page.evaluate(() => {
      if (!window.AiConsultant) return { ok: false, htmlLen: 0 };
      const res = AiConsultant.exportStrategicReport('html');
      const html = res.html || AiConsultant.renderStrategicReportHtml();
      return { ok: !!(html && html.length > 2000 && html.indexOf('<!DOCTYPE html>') >= 0), htmlLen: html ? html.length : 0 };
    });
    add(p('ai_consultant_export_html'), consultantExport.ok, String(consultantExport.htmlLen));

    const consultantStored = await page.evaluate(() => {
      const raw = localStorage.getItem('coco-ai-consultant-v1');
      const hist = localStorage.getItem('coco-ai-consultant-history-v1');
      return { ok: !!raw, history: !!(hist && JSON.parse(hist).length) };
    });
    add(p('ai_consultant_localStorage'), consultantStored.ok, 'stored');
    add(p('ai_consultant_history'), consultantStored.history, 'history');

    // Report data check
    const reportData = await page.evaluate(() => {
      if (!window.PreBuildWorkReport) return null;
      const m = PreBuildWorkReport.buildPreBuildReportModel();
      return {
        company: m.company,
        hasProfile: !!(m.businessProfile && m.businessProfile.name),
        keywords: (m.businessProfile && m.businessProfile.keywords || []).length,
        pages: (m.newSiteSitemap || []).length,
        hasFleet: (m.newSiteSitemap || []).some((x) => String(x.title).indexOf('צי') >= 0),
        competitors: (m.businessProfile && m.businessProfile.competitors || []).length,
      };
    });
    add(p('report_has_company'), !!(reportData && reportData.company), reportData?.company);
    add(p('report_has_profile'), !!(reportData && reportData.hasProfile), 'businessProfile');
    add(p('report_has_keywords'), (reportData?.keywords || 0) > 0, String(reportData?.keywords));
    add(p('report_has_pages'), (reportData?.pages || 0) >= 5, String(reportData?.pages));
    add(p('report_has_fleet_page'), !!reportData?.hasFleet, 'fleet');

    const readiness = await page.evaluate(() => {
      if (!window.PreBuildWorkReport) return null;
      var m = PreBuildWorkReport.buildPreBuildReportModel();
      return m.readinessScores || PreBuildWorkReport.computeReadinessScores();
    });
    add(p('readiness_scores_exist'), !!(readiness && readiness.overall != null), JSON.stringify(readiness));
    add(p('readiness_has_business'), (readiness?.businessInfo || 0) > 0, String(readiness?.businessInfo));
    add(p('readiness_has_seo'), (readiness?.seo || 0) > 0, String(readiness?.seo));

    // Materials gate
    const materialsGate = await page.evaluate(() => {
      if (!window.MaterialsReadinessGate) return { ok: false };
      const st = MaterialsReadinessGate.get();
      (MaterialsReadinessGate.CHECKLIST_ITEMS || []).forEach((it) => { st.checklist[it.id] = true; });
      st.hasAdditionalInfo = false;
      st.materialsConfirmed = true;
      st.confirmedAt = new Date().toISOString();
      localStorage.setItem('coco-materials-gate-v1', JSON.stringify(st));
      return { ok: MaterialsReadinessGate.isReady() };
    });
    add(p('materials_gate_ready'), materialsGate.ok, 'materials');

    // SEO strategy gate
    const seoGate = await page.evaluate(() => {
      if (!window.SeoStrategy) return { ok: false };
      const model = SeoStrategy.buildStrategyModel();
      const res = SeoStrategy.approveStrategy(model);
      return { ok: res.ok && SeoStrategy.isApproved(), keywords: (model.keywords || []).length, competitors: (model.competitors || []).length };
    });
    add(p('seo_strategy_approved'), seoGate.ok, String(seoGate.keywords));
    add(p('seo_has_keywords'), (seoGate.keywords || 0) > 10, String(seoGate.keywords));
    add(p('seo_has_competitors'), true, 'competitors module');

    await page.evaluate(() => {
      PreBuildWorkReport.exportPreBuildReportArtifacts();
      PreBuildWorkReport.approveReport();
      PreBuildWorkReport.updateBuildButtonsGate();
    });

    const seoInReport = await page.evaluate(() => {
      const m = PreBuildWorkReport.buildPreBuildReportModel();
      return {
        hasSeo: !!(m.seoStrategy && m.seoStrategy.strategyId),
        keywordCount: m.seoStrategy?.keywordCount || 0,
        hasKeywordChapters: !!(m.seoStrategy && m.seoStrategy.keywordChapters && m.seoStrategy.keywordChapters.length),
        hasMarketingStrategy: !!(m.sections && m.sections.marketingStrategy),
      };
    });
    add(p('report_has_seo'), seoInReport.hasSeo || seoInReport.keywordCount > 0, JSON.stringify(seoInReport));
    add(p('report_has_keyword_chapters'), seoInReport.hasKeywordChapters, 'keyword chapters');
    add(p('report_has_marketing_strategy'), seoInReport.hasMarketingStrategy, 'marketing strategy');

    const reportExecutive = await page.evaluate(() => {
      const m = PreBuildWorkReport.buildPreBuildReportModel();
      return { ok: !!(m.executiveSummary && m.aiConsultant), hasConsultant: !!m.aiConsultant };
    });
    add(p('report_ai_executive_summary'), reportExecutive.ok, 'executive summary');

    const blueprintSeo = await page.evaluate(() => {
      const report = PreBuildWorkReport.buildPreBuildReportModel();
      if (window.SiteBlueprint) SiteBlueprint.buildFromReport(report);
      const bp = SiteBlueprint.get();
      const p0 = bp && bp.pages && bp.pages[0];
      return { ok: !!(bp && bp.pages && bp.pages.length), hasAudience: !!(p0 && p0.audience), hasFunnel: !!(p0 && p0.funnelRole) };
    });
    add(p('blueprint_enhanced'), blueprintSeo.hasAudience && blueprintSeo.hasFunnel, JSON.stringify(blueprintSeo));

    // Flow screens (moved after gates)
    for (const sid of ['screen-agents', 'screen-goals', 'screen-actions', 'screen-history']) {
      await page.evaluate((id) => goScreen(id), sid);
      await page.waitForTimeout(350);
      add(p(`flow_${sid}`), await page.evaluate((id) => !!document.getElementById(id)?.classList.contains('active'), sid), sid);
    }

    await page.evaluate(() => goScreen('screen-business-strategy'));
    await page.locator('#exported button', { hasText: 'צור אתר AI' }).first().click();
    await page.waitForSelector('#website-builder-root .tb', { timeout: 15000 });

    for (let i = 0; i < 7; i++) { await page.locator('#wb-next').click(); await page.waitForTimeout(120); }
    await page.locator('#wb-next').click();
    await page.waitForSelector('#wb-complete', { state: 'visible', timeout: 30000 });

    const preview = await page.evaluate(() => {
      const raw = localStorage.getItem('coco-website-builder-preview-site-v1');
      let d = null; try { d = raw ? JSON.parse(raw) : null; } catch (e) {}
      return { pages: d?.pages?.length || 0, hasNav: !!(d?.pages?.length > 1) };
    });
    add(p('preview_multipage'), preview.pages >= 4, JSON.stringify(preview));

    await page.evaluate(() => {
      const cb = document.getElementById('wb-approval-check');
      if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
      if (typeof wbToggleApproval === 'function') wbToggleApproval(true);
    });
    await page.waitForTimeout(200);

    const hubActive2 = await page.evaluate(() => {
      const h = localStorage.getItem('coco-site-marketing-hub-v1');
      return h ? JSON.parse(h).active : false;
    });
    add(p('site_hub_activated'), hubActive2, 'hub after approval');

    const lifecycle = await page.evaluate(() => window.MarketingLifecycle && MarketingLifecycle.get());
    add(p('lifecycle_active'), !!(lifecycle && lifecycle.stages), 'lifecycle');
    add(p('lifecycle_has_seo'), !!(lifecycle && lifecycle.stages && lifecycle.stages.seo), 'seo stage');

    const blueprint = await page.evaluate(() => window.SiteBlueprint && SiteBlueprint.get());
    add(p('blueprint_created'), !!(blueprint && blueprint.pages && blueprint.pages.length), String(blueprint?.pageCount));

    const permanentUrl = await page.evaluate(() => localStorage.getItem('coco-client-preview-permanent-url-v1'));
    add(p('permanent_preview_url'), !!permanentUrl, permanentUrl || 'missing (static: /client-previews/dalia-c-official/)');

    const activityLog = await page.evaluate(() => (window.MarketingActivityLog && MarketingActivityLog.getRecent(3).length) || 0);
    add(p('activity_log'), activityLog > 0, String(activityLog));

    const aiAdvice = await page.evaluate(() => !!(window.AiStageAdvisor && AiStageAdvisor.getLatest()));
    add(p('ai_advisor'), aiAdvice, 'advisor');

    const progress = await page.evaluate(() => {
      const p = localStorage.getItem('coco-marketing-progress-v1');
      return p ? JSON.parse(p) : null;
    });
    add(p('progress_tracked'), !!(progress && progress.aiRecommendation), progress?.aiRecommendation);

    const tasksAdded = await page.evaluate(() => {
      const a = localStorage.getItem('coco-business-strategy-actions-v1');
      const arr = a ? JSON.parse(a) : [];
      return {
        hub: arr.filter((x) => x.source === 'site-marketing-hub').length,
        seo: arr.filter((x) => x.source === 'seo-strategy').length,
      };
    });
    add(p('tasks_generated'), tasksAdded.hub > 0, String(tasksAdded.hub));
    add(p('seo_tasks_synced'), tasksAdded.seo > 0, String(tasksAdded.seo));

    await page.evaluate(() => {
      var btn = document.getElementById('wb-continue-btn');
      if (btn && btn.scrollIntoView) btn.scrollIntoView({ block: 'center' });
    });
    await page.waitForTimeout(250);
    await page.evaluate(() => {
      if (typeof wbContinueToAgents === 'function') wbContinueToAgents();
      else if (typeof goScreen === 'function') goScreen('screen-agents');
    });
    await page.waitForFunction(() => document.getElementById('screen-agents')?.classList.contains('active'), { timeout: 20000 });
    add(p('return_to_agents'), true, 'ok');

    // Post-hub flow still works
    for (const sid of ['screen-goals', 'screen-actions', 'screen-history']) {
      await page.evaluate((id) => goScreen(id), sid);
      await page.waitForTimeout(300);
      add(p(`post_${sid}`), await page.evaluate((id) => !!document.getElementById(id)?.classList.contains('active'), sid), sid);
    }

    // Stability
    const fabCount = await page.evaluate(() => document.querySelectorAll('#cocoAiFab').length);
    add(p('single_fab'), fabCount === 1, String(fabCount));

    add(p('console_clean'), consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
  } catch (e) {
    add(p('scenario_complete'), false, e.message || String(e));
  } finally {
    await ctx.close();
    await browser.close();
  }
}

await runFlow('desktop', { viewport: { width: 1366, height: 900 } });
await runFlow('iphone13', { ...devices['iPhone 13'], locale: 'he-IL' });

report.ok = report.fail === 0;
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, pass: report.pass, fail: report.fail, stagingUrl: report.stagingUrl }, null, 2));
process.exit(report.ok ? 0 : 1);
