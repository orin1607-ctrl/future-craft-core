/**
 * Site Comparison — old site vs new site metrics.
 */
(function () {
  'use strict';

  var VERSION = '1.0.0';
  var COMPARE_KEY = 'coco-site-comparison-v1';

  function dash() {
    return (window.DaliaSite && DaliaSite.getDashboard && DaliaSite.getDashboard()) || {};
  }

  function buildComparison() {
    var report = null;
    try { report = JSON.parse(localStorage.getItem('coco-pre-build-work-report-v1') || 'null'); } catch (e) {}
    var hub = null;
    try { hub = JSON.parse(localStorage.getItem('coco-site-marketing-hub-v1') || 'null'); } catch (e) {}
    var sc = dash().searchConsole || {};
    var kw = (sc.keywords || []).slice(0, 10);

    var cmp = {
      version: VERSION,
      generatedAt: new Date().toISOString(),
      oldSite: {
        url: (report && report.site) || 'https://dalia-c.com/',
        pageCount: report && report.sections && report.sections.currentSiteStatus && report.sections.currentSiteStatus.pageCount,
        avgScore: report && report.sections && report.sections.currentSiteStatus && report.sections.currentSiteStatus.avgScore,
        topKeywords: kw.map(function (k) { return k.query || k.keyword; }),
        weaknesses: (report && report.sections && report.sections.siteWeaknesses) || [],
      },
      newSite: {
        previewPath: hub && hub.previewPath,
        pageCount: hub && hub.pagesCount,
        pages: (hub && hub.pages) || [],
        architecture: 'נפרד ממערכת דליה · Template קבוע',
      },
      deltas: {
        pages: ((hub && hub.pagesCount) || 0) - ((report && report.sections && report.sections.currentSiteStatus && report.sections.currentSiteStatus.pageCount) || 0),
        structure: 'מבנה חדש מלא — לא תיקון ישן',
        seo: 'מיפוי מילות מפתח לכל עמוד',
        fleetPage: 'עמוד FleetOS חדש — לא היה באתר הישן',
      },
      metrics: {
        keywords: { old: kw.length, new: (hub && hub.pages && hub.pages.length) || 0 },
        performance: { old: 'baseline', new: 'pending-lighthouse' },
        leads: { old: 'baseline', new: 'pending' },
        rankings: { old: 'GSC baseline', new: 'post-publish tracking' },
      },
    };

    try { localStorage.setItem(COMPARE_KEY, JSON.stringify(cmp)); } catch (e) {}
    if (window.AiConsultant) {
      cmp.aiConsultant = AiConsultant.getLatest() || AiConsultant.generateIdeas('hub');
      cmp.marketComparison = cmp.aiConsultant.marketComparison;
    }
    return cmp;
  }

  function exportComparisonHtml() {
    var c = buildComparison();
    var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); };
    return '<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>השוואת אתרים</title>' +
      '<style>body{font-family:Heebo,Arial,sans-serif;max-width:900px;margin:0 auto;padding:24px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px}</style></head><body>' +
      '<h1>השוואה: אתר ישן מול אתר חדש</h1>' +
      '<h2>ישן</h2><p>URL: ' + esc(c.oldSite.url) + ' · עמודים: ' + esc(c.oldSite.pageCount) + ' · ציון: ' + esc(c.oldSite.avgScore) + '</p>' +
      '<h2>חדש</h2><p>Preview: ' + esc(c.newSite.previewPath) + ' · עמודים: ' + esc(c.newSite.pageCount) + '</p>' +
      '<h2>שינויים</h2><ul><li>מבנה: ' + esc(c.deltas.structure) + '</li><li>SEO: ' + esc(c.deltas.seo) + '</li><li>FleetOS: ' + esc(c.deltas.fleetPage) + '</li></ul></body></html>';
  }

  window.SiteComparison = {
    VERSION: VERSION,
    build: buildComparison,
    get: function () { try { return JSON.parse(localStorage.getItem(COMPARE_KEY)); } catch (e) { return null; } },
    exportHtml: exportComparisonHtml,
  };
})();
