/**
 * CO.CO דליה — Pipeline Bridge (Part B → full continuation)
 * 50 assistants → 10 consultants → orchestrator → 13 engines → Preview link (no downloads)
 */
(function () {
  'use strict';

  var VERSION = '1.0.0-bridge';
  var BANNER_ID = 'coco-pipeline-preview-banner';

  function parseLs(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }

  function saveLs(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); return true; } catch (e) { return false; }
  }

  function slugifyClientId(id) {
    return String(id || 'dalia-c-official').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  }

  function pagesBase() {
    var base = window.COCO_PAGES_BASE || '/';
    if (base.charAt(0) === '/') base = location.origin + base;
    if (base.charAt(base.length - 1) !== '/') base += '/';
    return base;
  }

  function ensurePreBuildReport() {
    var existing = parseLs('coco-pre-build-work-report-v1');
    if (existing && existing.sections && existing.sections.pageDetails) return existing;

    if (window.PreBuildWorkReport && PreBuildWorkReport.buildPreBuildReportModel) {
      var model = PreBuildWorkReport.buildPreBuildReportModel();
      if (model) {
        saveLs('coco-pre-build-work-report-v1', model);
        return model;
      }
    }

    var brief = parseLs('dalia_project_brief') || {};
    var ctx = parseLs('coco-pirsum-client-v1') || {};
    var company = (brief.biz && (brief.biz.companyName || brief.biz.bizName)) || ctx.clientName || 'Client';
    var clientId = ctx.clientId || 'dalia-c-official';
    var report = {
      clientId: clientId,
      company: company,
      generatedAt: new Date().toISOString(),
      sections: {
        pageDetails: [
          { order: 1, title: 'בית', slug: 'index', purpose: 'מיתוג ולידים', keywords: [], headlines: [], sections: [] },
          { order: 2, title: 'שירותים', slug: 'services', purpose: 'שירותים', keywords: [], headlines: [], sections: [] },
          { order: 3, title: 'אודות', slug: 'about', purpose: 'אמון', keywords: [], headlines: [], sections: [] },
          { order: 4, title: 'צור קשר', slug: 'contact', purpose: 'המרה', keywords: [], headlines: [], sections: [], cta: 'צור קשר' },
        ],
        services: (brief.biz && brief.biz.services) || [],
      },
    };
    saveLs('coco-pre-build-work-report-v1', report);
    return report;
  }

  function resolvePreviewUrls() {
    var ctx = parseLs('coco-pirsum-client-v1') || {};
    var slug = slugifyClientId(ctx.clientId || 'dalia-c-official');
    var bp = parseLs('coco-site-blueprint-v1');
    var engines = parseLs('coco-dalia-engines-v1');
    var c13 = engines && engines.engines && engines.engines.find(function (e) { return e.id === 'c13'; });
    var previewPath = (c13 && c13.previewPath) || (bp && bp.architecture && bp.architecture.tempPreviewPath) || '';
    var m = String(previewPath).match(/client-previews\/([^/]+)/i);
    if (m) slug = m[1];

    var base = pagesBase();
    return {
      slug: slug,
      indexUrl: base + 'client-previews/' + slug + '/index.html',
      gatewayUrl: base + 'client-previews/preview-gateway.html?slug=' + encodeURIComponent(slug),
      stagingOnly: true,
    };
  }

  function runPipelineStages() {
    ensurePreBuildReport();
    var result = null;
    if (window.CocoDaliaOrchestrator && CocoDaliaOrchestrator.runPipeline) {
      result = CocoDaliaOrchestrator.runPipeline(null, { silent: true });
    } else {
      if (window.CocoDaliaAssistantsEngine && CocoDaliaAssistantsEngine.runAll) {
        CocoDaliaAssistantsEngine.runAll(null);
      }
      if (window.CocoDaliaBuildEnginesEngine && CocoDaliaBuildEnginesEngine.runAll) {
        CocoDaliaBuildEnginesEngine.runAll(null, {});
      }
    }
    if (typeof window._cocoV5RenderAll === 'function') window._cocoV5RenderAll();
    return result;
  }

  function showPreviewBanner(urls) {
    var existing = document.getElementById(BANNER_ID);
    if (existing) existing.remove();

    var bar = document.createElement('div');
    bar.id = BANNER_ID;
    bar.setAttribute('role', 'status');
    bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:9999;padding:12px 14px;background:linear-gradient(135deg,#0f766e,#115e59);color:#fff;box-shadow:0 -4px 24px rgba(0,0,0,.35);font-family:Heebo,Arial,sans-serif;';
    bar.innerHTML =
      '<div style="max-width:720px;margin:0 auto;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;">' +
      '<div style="flex:1;min-width:200px;">' +
      '<div style="font-weight:800;font-size:13px;">✅ הזרימה הושלמה — Preview מוכן לבדיקה</div>' +
      '<div style="font-size:10.5px;opacity:.9;margin-top:2px;">Staging בלבד · ללא הורדות · ללא Production</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
      '<a href="' + urls.indexUrl + '" target="_blank" rel="noopener" id="coco-preview-open-link" style="display:inline-block;padding:10px 16px;border-radius:10px;background:#fff;color:#0f766e;font-weight:800;font-size:12px;text-decoration:none;">🔗 פתח אתר Preview ↗</a>' +
      '<a href="' + urls.gatewayUrl + '" target="_blank" rel="noopener" style="display:inline-block;padding:10px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.5);color:#fff;font-size:11px;text-decoration:none;">🌐 Gateway</a>' +
      '</div></div>';
    document.body.appendChild(bar);
    saveLs('coco-dalia-preview-link-v1', { urls: urls, at: new Date().toISOString() });
  }

  function injectWorkspacePreview(urls) {
    var area = document.getElementById('ws-preview-area');
    if (!area) return;
    var block = document.getElementById('coco-ws-live-preview');
    var html =
      '<div class="card" id="coco-ws-live-preview" style="border:2px solid rgba(16,185,129,.4);margin-bottom:10px;">' +
      '<div style="font-size:11px;color:var(--green);font-weight:800;margin-bottom:6px;">🌐 Preview אתר — Staging (קישור בלבד)</div>' +
      '<div style="font-size:10.5px;color:var(--w50);word-break:break-all;margin-bottom:10px;">' + urls.indexUrl + '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
      '<a class="btn btn-p btn-sm" href="' + urls.indexUrl + '" target="_blank" rel="noopener" id="coco-ws-preview-link">🔗 פתח Preview לבדיקה ↗</a>' +
      '<a class="btn btn-o btn-sm" href="' + urls.gatewayUrl + '" target="_blank" rel="noopener">Gateway</a>' +
      '</div>' +
      '<iframe src="' + urls.indexUrl + '" title="site preview" style="width:100%;height:min(50vh,420px);border:1px solid var(--w10);border-radius:10px;margin-top:10px;background:#fff;" loading="lazy"></iframe>' +
      '</div>';
    if (block) {
      block.outerHTML = html;
    } else {
      area.insertAdjacentHTML('afterbegin', html);
    }
  }

  function walkScreens(onDone) {
    var steps = [
      { screen: 'assistants', ms: 450, toast: '🤖 50 עוזרים' },
      { screen: 'consultants', ms: 450, toast: '👨‍💼 10 יועצים' },
      { screen: 'workspace', ms: 500, toast: '🛠️ מנועים + Preview' },
    ];
    var i = 0;

    function next() {
      if (i >= steps.length) {
        if (typeof onDone === 'function') onDone();
        return;
      }
      var step = steps[i++];
      if (typeof openScreen === 'function') openScreen(step.screen);
      if (step.screen === 'workspace') {
        if (window.CocoDaliaBuildEnginesHub) CocoDaliaBuildEnginesHub.mount('coco-build-engines-hub');
        if (window.CocoDaliaBuildEnginesEngine) CocoDaliaBuildEnginesEngine.runAll(null, {});
      }
      if (typeof toast === 'function' && step.toast) toast(step.toast);
      setTimeout(next, step.ms);
    }

    if (typeof openScreen === 'function') openScreen('assistants');
    setTimeout(next, 200);
  }

  function runFullContinuation(opts) {
    opts = opts || {};
    runPipelineStages();
    walkScreens(function () {
      var urls = resolvePreviewUrls();
      injectWorkspacePreview(urls);
      showPreviewBanner(urls);
      if (typeof toast === 'function') toast('✅ Preview מוכן — פתח בקישור');
      try {
        sessionStorage.setItem('coco-bridge-continuation-done', '1');
      } catch (e) { /* ignore */ }
    });
  }

  function runFromPartB() {
    var q = new URLSearchParams(location.search);
    var fromBridge = false;
    try { fromBridge = sessionStorage.getItem('coco-bridge-open-assistants') === '1'; } catch (e0) { /* */ }
    if (q.get('openScreen') !== 'assistants' && q.get('from') !== 'part-b' && !fromBridge) return false;

    try { sessionStorage.removeItem('coco-bridge-open-assistants'); } catch (e1) { /* */ }
    var runPipeline = false;
    try {
      runPipeline = sessionStorage.getItem('coco-bridge-run-pipeline') === '1';
      sessionStorage.removeItem('coco-bridge-run-pipeline');
    } catch (e2) { /* */ }

    if (!runPipeline) return false;

    var start = function () {
      runFullContinuation({ from: 'part-b' });
    };
    if (window.requestAnimationFrame) requestAnimationFrame(function () { setTimeout(start, 120); });
    else setTimeout(start, 180);
    return true;
  }

  window.CocoPipelineBridge = {
    VERSION: VERSION,
    ensurePreBuildReport: ensurePreBuildReport,
    resolvePreviewUrls: resolvePreviewUrls,
    runPipelineStages: runPipelineStages,
    runFullContinuation: runFullContinuation,
    runFromPartB: runFromPartB,
    showPreviewBanner: showPreviewBanner,
    injectWorkspacePreview: injectWorkspacePreview,
  };
})();
