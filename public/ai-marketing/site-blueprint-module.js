/**
 * Site Blueprint — full pre-build plan (pages, menu, forms, CTAs, SEO).
 */
(function () {
  'use strict';

  var VERSION = '1.0.0';
  var BLUEPRINT_KEY = 'coco-site-blueprint-v1';

  function parseLs(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }

  function saveBlueprint(bp) {
    try { localStorage.setItem(BLUEPRINT_KEY, JSON.stringify(bp)); return true; } catch (e) { return false; }
  }

  function buildFromReport(report) {
    report = report || parseLs('coco-pre-build-work-report-v1');
    if (!report) return null;

    var pages = (report.sections && report.sections.pageDetails) || [];
    var menu = pages.map(function (p) {
      return { title: p.title, slug: p.slug, children: [] };
    });

    var blueprint = {
      version: VERSION,
      blueprintId: 'BP-' + Date.now(),
      generatedAt: new Date().toISOString(),
      clientId: report.clientId,
      company: report.company,
      pageCount: pages.length,
      pages: pages.map(function (p) {
        return {
          order: p.order,
          title: p.title,
          slug: p.slug,
          purpose: p.purpose,
          keywords: p.keywords || [],
          contentSections: p.sections || [],
          headlines: p.headlines || [],
          cta: p.cta || 'צור קשר',
          forms: /צור קשר|contact/i.test(p.title) ? ['טופס יצירת קשר', 'WhatsApp'] : [],
          seoAreas: ['Title', 'Meta Description', 'H1', 'Schema', 'Internal Links'],
          approved: false,
        };
      }),
      menuHierarchy: menu,
      services: (report.sections && report.sections.services) || [],
      forms: ['טופס יצירת קשר', 'טופס הדגמת FleetOS', 'WhatsApp'],
      ctaButtons: ['צור קשר', 'קבלו הצעה', 'הדגמה לתוכנה', 'התקשרו עכשיו'],
      seoZones: ['Home', 'Services', 'Fleet Software', 'Blog/SEO pages', 'Contact'],
      futurePages: ['בלוג', 'מקרי בוחן', 'שאלות נוכחות', 'מחירון'],
      architecture: {
        onDaliaPlatform: false,
        tempPreviewPath: '/client-previews/' + (report.clientId || 'client').replace(/[^a-z0-9-]/gi, '-') + '/',
        productionNote: 'Deploy לדומיין/אחסון לקוח בלבד',
      },
    };

    saveBlueprint(blueprint);
    if (window.MarketingActivityLog) MarketingActivityLog.log('blueprint_created', { blueprintId: blueprint.blueprintId, pages: blueprint.pageCount });
    return blueprint;
  }

  function approvePage(slug) {
    var bp = parseLs(BLUEPRINT_KEY);
    if (!bp) return false;
    bp.pages.forEach(function (p) { if (p.slug === slug) p.approved = true; });
    saveBlueprint(bp);
    return true;
  }

  function isBlueprintApproved() {
    var bp = parseLs(BLUEPRINT_KEY);
    if (!bp || !bp.pages || !bp.pages.length) return false;
    return bp.pages.every(function (p) { return p.approved; });
  }

  function renderBlueprintHtml(bp) {
    bp = bp || parseLs(BLUEPRINT_KEY);
    if (!bp) return '<p>אין Blueprint</p>';
    var esc = function (s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;'); };
    var html = '<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>Blueprint — ' + esc(bp.company) + '</title>' +
      '<style>body{font-family:Heebo,Arial,sans-serif;max-width:900px;margin:0 auto;padding:24px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:right}</style></head><body>' +
      '<h1>Blueprint אתר — ' + esc(bp.company) + '</h1>' +
      '<p>עמודים: ' + bp.pageCount + ' · ' + esc(bp.generatedAt) + '</p>' +
      '<h2>היררכיית תפריט</h2><ul>' + bp.menuHierarchy.map(function (m) { return '<li>' + esc(m.title) + '</li>'; }).join('') + '</ul>' +
      '<h2>עמודים</h2><table><tr><th>#</th><th>שם</th><th>מטרה</th><th>מילות מפתח</th><th>CTA</th></tr>' +
      bp.pages.map(function (p) {
        return '<tr><td>' + p.order + '</td><td>' + esc(p.title) + '</td><td>' + esc(p.purpose) + '</td><td>' + esc((p.keywords || []).join(', ')) + '</td><td>' + esc(p.cta) + '</td></tr>';
      }).join('') + '</table>' +
      '<h2>טפסים</h2><p>' + esc(bp.forms.join(' · ')) + '</p>' +
      '<h2>עמודים עתידיים מומלצים</h2><p>' + esc(bp.futurePages.join(' · ')) + '</p></body></html>';
    return html;
  }

  function downloadBlueprint() {
    var bp = parseLs(BLUEPRINT_KEY) || buildFromReport();
    if (!bp) return { ok: false };
    var html = renderBlueprintHtml(bp);
    var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'site-blueprint-' + (bp.clientId || 'client') + '.html';
    a.click();
    var blob2 = new Blob([JSON.stringify(bp, null, 2)], { type: 'application/json' });
    var a2 = document.createElement('a');
    a2.href = URL.createObjectURL(blob2);
    a2.download = 'site-blueprint-' + (bp.clientId || 'client') + '.json';
    a2.click();
    return { ok: true, blueprint: bp };
  }

  window.SiteBlueprint = {
    VERSION: VERSION,
    buildFromReport: buildFromReport,
    get: function () { return parseLs(BLUEPRINT_KEY); },
    approvePage: approvePage,
    isBlueprintApproved: isBlueprintApproved,
    downloadBlueprint: downloadBlueprint,
    renderBlueprintHtml: renderBlueprintHtml,
  };
})();
