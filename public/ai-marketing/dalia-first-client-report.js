/**
 * Dalia first client — 20-section full strategic report builder.
 */
(function () {
  'use strict';

  var MISSING = 'חסר מידע';

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function section(title, body) {
    return { title: title, body: body };
  }

  function buildFullReport() {
    var seed = window.DaliaFirstClientSeed || {};
    var company = seed.COMPANY || MISSING;
    var biz = {};
    try { biz = JSON.parse(localStorage.getItem('dalia_biz') || '{}'); } catch (e) {}

    var preBuild = window.PreBuildWorkReport ? PreBuildWorkReport.buildPreBuildReportModel() : null;
    var seo = window.SeoStrategy ? SeoStrategy.buildStrategyModel() : null;
    var blueprint = window.SiteBlueprint ? SiteBlueprint.get() : null;
    var ideas = window.AiConsultant ? AiConsultant.generateIdeas('report') : null;
    var googleEvals = window.GooglePageQualityStandard ? GooglePageQualityStandard.evaluatePreviewSite() : [];
    var comparison = window.SiteComparison ? SiteComparison.get() : null;

    var keywordMap = (seo && seo.keywords) || (preBuild && preBuild.seoStrategy && preBuild.seoStrategy.keywordChapters) || [];
    var pages = (blueprint && blueprint.pages) || (preBuild && preBuild.newSiteSitemap) || [];

    var sections = [
      section('1. ניתוח העסק', {
        company: company,
        positioning: biz.sector || 'ניהול תפעול ותחזוקת צי — לא מוסך',
        model: biz.model || 'שירות חודשי + תוכנה',
        audience: biz.ideal || seed.AUDIENCE,
        challenges: biz.challenges || MISSING,
      }),
      section('2. ניתוח השירותים', { services: seed.SERVICES || [], count: (seed.SERVICES || []).length }),
      section('3. ניתוח התוכנה', { product: 'FleetOS', capabilities: ['ניהול צי', 'דוחות', 'התראות', 'GPS', 'טלמטיקה', 'AI'] }),
      section('4. ניתוח האפליקציה', { apps: ['אפליקציית מנהל', 'אפליקציית נהגים'], note: biz.software || MISSING }),
      section('5. ניתוח המתחרים', {
        list: seed.COMPETITORS || [],
        research: ideas && ideas.competitorResearch ? ideas.competitorResearch : MISSING,
        comparison: comparison || MISSING,
      }),
      section('6. מחקר מילות מפתח', {
        keywords: seed.KEYWORDS || [],
        count: (seed.KEYWORDS || []).length,
        tiers: seo && seo.keywordTiers ? seo.keywordTiers : MISSING,
      }),
      section('7. מיפוי מילת מפתח → עמוד', {
        mapping: keywordMap.slice(0, 40).map(function (k) {
          return { keyword: k.keyword || k.query || k, page: k.targetPage || k.page || MISSING };
        }),
      }),
      section('8. עמודים שייבנו', {
        pages: pages.map(function (p) {
          return { title: p.title || p.name, path: p.path || p.slug, purpose: p.purpose || p.goal || MISSING };
        }),
        count: pages.length,
      }),
      section('9. עמודים מומלצים להוספה', {
        suggestions: ideas && ideas.serviceIdeas ? ideas.serviceIdeas : MISSING,
        futurePages: blueprint && blueprint.futurePages ? blueprint.futurePages : [],
      }),
      section('10. אסטרטגיית SEO', preBuild && preBuild.seoStrategy ? preBuild.seoStrategy : (seo || MISSING)),
      section('11. אסטרטגיית שיווק', preBuild && preBuild.sections && preBuild.sections.marketingStrategy ? preBuild.sections.marketingStrategy : MISSING),
      section('12. קהל יעד', { primary: biz.ideal, segments: seed.AUDIENCE, aiIdeas: ideas && ideas.targetAudienceIdeas }),
      section('13. אזורי פעילות', { regions: ['כל הארץ'], detail: biz.loc || 'ישראל' }),
      section('14. רמת התחרות', {
        level: seo && seo.marketDifficulty ? seo.marketDifficulty : (ideas && ideas.forecast && ideas.forecast.difficulty) || MISSING,
        competitors: (seed.COMPETITORS || []).length,
      }),
      section('15. יתרונות העסק', {
        items: ['FleetOS מקומי', 'שירות חודשי + תוכנה', 'תפעול ותחזוקה מקצה לקצה', 'לא מוסך — ניהול צי'],
      }),
      section('16. חסרונות / פערים', {
        items: ['מיתוג ישן (מימון)', 'חיבורי API חיים — חסר מידע', 'Core Web Vitals — הערכה בלבד'],
      }),
      section('17. הזדמנויות', ideas && ideas.marketComparison ? ideas.marketComparison : { opportunities: keywordMap.slice(0, 5) }),
      section('18. המלצות AI', ideas || MISSING),
      section('19. Google Readiness', {
        pages: googleEvals.map(function (e) {
          return { page: e.pageTitle || e.slug, score: e.readinessScore, pass: e.passPublishGate };
        }),
        average: googleEvals.length
          ? Math.round(googleEvals.reduce(function (s, e) { return s + (e.readinessScore || 0); }, 0) / googleEvals.length)
          : MISSING,
      }),
      section('20. תוכנית עבודה', {
        roadmap: seo && seo.roadmap ? seo.roadmap : MISSING,
        actionPlan: ideas && ideas.actionPlan ? ideas.actionPlan : MISSING,
        readiness: preBuild && preBuild.readinessScores ? preBuild.readinessScores : MISSING,
      }),
    ];

    return {
      generatedAt: new Date().toISOString(),
      company: company,
      clientId: seed.CLIENT_ID || 'dalia-c-official',
      sectionCount: sections.length,
      sections: sections,
      preBuild: preBuild,
      aiConsultant: ideas,
    };
  }

  function renderHtml(report) {
    report = report || buildFullReport();
    var html = '<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>דוח לקוח ראשון — ' + esc(report.company) + '</title>' +
      '<style>body{font-family:Arial,sans-serif;max-width:900px;margin:24px auto;padding:0 16px;line-height:1.6}' +
      'h1{font-size:22px}h2{font-size:16px;margin-top:28px;border-bottom:1px solid #ddd;padding-bottom:6px}' +
      'pre{background:#f5f5f5;padding:12px;border-radius:8px;overflow:auto;font-size:12px}.meta{color:#666;font-size:12px}</style></head><body>' +
      '<h1>דוח אסטרטגי מלא — ' + esc(report.company) + '</h1>' +
      '<p class="meta">Staging · ' + esc(report.generatedAt) + ' · ' + report.sectionCount + ' סעיפים</p>';

    (report.sections || []).forEach(function (s) {
      html += '<h2>' + esc(s.title) + '</h2><pre>' + esc(JSON.stringify(s.body, null, 2)) + '</pre>';
    });
    html += '</body></html>';
    return html;
  }

  function exportArtifacts() {
    var report = buildFullReport();
    var html = renderHtml(report);
    var json = JSON.stringify(report, null, 2);
    try {
      localStorage.setItem('coco-dalia-first-client-report-v1', json);
    } catch (e) { /* ignore */ }
    return { ok: true, report: report, html: html, json: json };
  }

  window.DaliaFirstClientReport = {
    buildFullReport: buildFullReport,
    renderHtml: renderHtml,
    exportArtifacts: exportArtifacts,
  };
})();
