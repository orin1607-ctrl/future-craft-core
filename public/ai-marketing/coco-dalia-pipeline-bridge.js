/**
 * CO.CO דליה — Pipeline Bridge
 * Preview ללא תמונות + באנר סטטוסים + קישור חיצוני
 */
(function () {
  'use strict';

  var VERSION = '2.0.0-preview-images-split';
  var BANNER_ID = 'coco-pipeline-preview-banner';
  var EXTERNAL_PREVIEW =
    'https://orin1607-ctrl.github.io/future-craft-core/client-previews/dalia-c-official/index.html';

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
      externalUrl: EXTERNAL_PREVIEW,
      stagingOnly: true,
    };
  }

  function imagesStatusLabel() {
    var st = (window.CocoImageStage && CocoImageStage.getStatus) ? CocoImageStage.getStatus() : parseLs('coco-dalia-image-stage-v1');
    var status = (st && st.status) || 'imagesPending';
    if (status === 'imagesBlockedQuota') return 'תמונות ממתינות בגלל quota';
    if (status === 'imagesCompleted' || status === 'imagesReady') return 'תמונות מוכנות';
    if (status === 'imagesFailed') return 'תמונות נכשלו';
    return 'תמונות ממתינות';
  }

  function runPipelineStages() {
    ensurePreBuildReport();
    var result = null;
    if (window.CocoDaliaOrchestrator && CocoDaliaOrchestrator.runPipeline) {
      result = CocoDaliaOrchestrator.runPipeline(null, {
        silent: true,
        skipPaidImages: true,
        continueOnImagesFailure: true,
      });
    } else {
      if (window.CocoDaliaAssistantsEngine && CocoDaliaAssistantsEngine.runAll) {
        CocoDaliaAssistantsEngine.runAll(null);
      }
      if (window.CocoDaliaBuildEnginesEngine && CocoDaliaBuildEnginesEngine.runAll) {
        CocoDaliaBuildEnginesEngine.runAll(null, { skipPaidImages: true });
      }
    }
    if (typeof window._cocoV5RenderAll === 'function') window._cocoV5RenderAll();
    return result;
  }

  function showPreviewBanner(urls) {
    var existing = document.getElementById(BANNER_ID);
    if (existing) existing.remove();

    var imgLabel = imagesStatusLabel();
    var gates = (parseLs('coco-dalia-pipeline-v1') || {}).gates || {};
    var siteOk = gates.sitePreviewReady !== false;

    var bar = document.createElement('div');
    bar.id = BANNER_ID;
    bar.setAttribute('role', 'status');
    bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:9999;padding:12px 14px;background:linear-gradient(135deg,#0f766e,#115e59);color:#fff;box-shadow:0 -4px 24px rgba(0,0,0,.35);font-family:Heebo,Arial,sans-serif;';
    bar.innerHTML =
      '<div style="max-width:820px;margin:0 auto;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;">' +
      '<div style="flex:1;min-width:220px;">' +
      '<div style="font-weight:800;font-size:13px;">' + (siteOk ? '✅ האתר נבנה בהצלחה — Preview זמין' : '⏳ Preview בהכנה') + '</div>' +
      '<div style="font-size:10.5px;opacity:.95;margin-top:3px;">' + imgLabel + ' · אין צורך להזין שוב נתונים · אין צורך להריץ מחדש את כל ה-Pipeline</div>' +
      '<div style="font-size:10px;opacity:.85;margin-top:2px;">Staging בלבד · sitePreviewReady / imagesBlockedQuota מופרדים</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
      '<a href="' + (urls.externalUrl || EXTERNAL_PREVIEW) + '" target="_blank" rel="noopener" id="coco-preview-open-link" style="display:inline-block;padding:10px 16px;border-radius:10px;background:#fff;color:#0f766e;font-weight:800;font-size:12px;text-decoration:none;">🔗 Preview דליה ↗</a>' +
      '<a href="' + urls.indexUrl + '" target="_blank" rel="noopener" style="display:inline-block;padding:10px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.5);color:#fff;font-size:11px;text-decoration:none;">מקומי</a>' +
      '<button type="button" id="coco-retry-images-btn" style="padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.45);background:transparent;color:#fff;font-size:11px;cursor:pointer;">🖼️ תמונות מחדש (ללא Pipeline)</button>' +
      '</div></div>';
    document.body.appendChild(bar);

    var btn = document.getElementById('coco-retry-images-btn');
    if (btn) {
      btn.addEventListener('click', function () {
        if (window.CocoDaliaOrchestrator && CocoDaliaOrchestrator.runImagesOnly) {
          CocoDaliaOrchestrator.runImagesOnly({ generate: false, forceQuotaBlocked: true }).then(function () {
            if (typeof toast === 'function') toast('תמונות: סטטוס עודכן בלי Pipeline מלא');
            showPreviewBanner(resolvePreviewUrls());
          });
        } else if (window.CocoImageStage) {
          CocoImageStage.run({ generate: false, forceQuotaBlocked: true });
          if (typeof toast === 'function') toast('CocoImageStage בלבד — ללא יצירה');
        }
      });
    }

    saveLs('coco-dalia-preview-link-v1', {
      urls: urls,
      externalUrl: urls.externalUrl || EXTERNAL_PREVIEW,
      siteLabelHe: 'Preview מוכן — תמונות ממתינות',
      at: new Date().toISOString(),
    });
  }

  function injectWorkspacePreview(urls) {
    var area = document.getElementById('ws-preview-area');
    if (!area) return;
    var block = document.getElementById('coco-ws-live-preview');
    var imgLabel = imagesStatusLabel();
    var html =
      '<div class="card" id="coco-ws-live-preview" style="border:2px solid rgba(16,185,129,.4);margin-bottom:10px;">' +
      '<div style="font-size:11px;color:var(--green);font-weight:800;margin-bottom:6px;">🌐 Preview אתר — נבנה בהצלחה (ללא תמונות AI)</div>' +
      '<ul style="font-size:10.5px;color:var(--w70);margin:0 0 10px;padding-right:16px;line-height:1.6;">' +
      '<li>האתר נבנה בהצלחה</li>' +
      '<li>Preview זמין</li>' +
      '<li>' + imgLabel + '</li>' +
      '<li>אין צורך להזין שוב נתונים</li>' +
      '<li>אין צורך להריץ מחדש את כל ה-Pipeline</li>' +
      '</ul>' +
      '<div style="font-size:10.5px;color:var(--w50);word-break:break-all;margin-bottom:8px;">' +
      '<a href="' + (urls.externalUrl || EXTERNAL_PREVIEW) + '" target="_blank" rel="noopener" style="color:var(--acc2);">' +
      (urls.externalUrl || EXTERNAL_PREVIEW) + '</a></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
      '<a class="btn btn-p btn-sm" href="' + (urls.externalUrl || EXTERNAL_PREVIEW) + '" target="_blank" rel="noopener" id="coco-ws-preview-link">🔗 פתח Preview דליה ↗</a>' +
      '<a class="btn btn-o btn-sm" href="' + urls.gatewayUrl + '" target="_blank" rel="noopener">Gateway</a>' +
      '<button type="button" class="btn btn-o btn-sm" id="coco-ws-images-only">🖼️ הרץ תמונות בלבד</button>' +
      '</div>' +
      '<iframe src="' + (urls.externalUrl || urls.indexUrl) + '" title="site preview" style="width:100%;height:min(50vh,420px);border:1px solid var(--w10);border-radius:10px;margin-top:10px;background:#fff;" loading="lazy"></iframe>' +
      '</div>';
    if (block) {
      block.outerHTML = html;
    } else {
      area.insertAdjacentHTML('afterbegin', html);
    }
    var imgBtn = document.getElementById('coco-ws-images-only');
    if (imgBtn) {
      imgBtn.addEventListener('click', function () {
        if (window.CocoDaliaOrchestrator && CocoDaliaOrchestrator.runImagesOnly) {
          CocoDaliaOrchestrator.runImagesOnly({ generate: false }).then(function () {
            if (typeof toast === 'function') toast('Images-only — ללא Pipeline מלא, ללא יצירה');
            injectWorkspacePreview(resolvePreviewUrls());
          });
        }
      });
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
        if (window.CocoDaliaBuildEnginesEngine) {
          CocoDaliaBuildEnginesEngine.runAll(null, { skipPaidImages: true });
        }
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
      if (typeof toast === 'function') toast('✅ Preview מוכן — תמונות ממתינות');
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
    EXTERNAL_PREVIEW: EXTERNAL_PREVIEW,
    ensurePreBuildReport: ensurePreBuildReport,
    resolvePreviewUrls: resolvePreviewUrls,
    runPipelineStages: runPipelineStages,
    runFullContinuation: runFullContinuation,
    runFromPartB: runFromPartB,
    showPreviewBanner: showPreviewBanner,
    injectWorkspacePreview: injectWorkspacePreview,
  };
})();
