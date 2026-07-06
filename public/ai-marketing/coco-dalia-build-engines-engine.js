/**
 * CO.CO דליה — 13 Build Engines (Phase 5)
 * Registry c1–c13, readiness evaluation, internal engine (c13) via SiteBlueprint.
 */
(function () {
  'use strict';

  var VERSION = '5.2.0-engines';
  var ENGINES_KEY = 'coco-dalia-engines-v1';
  var BUILD_PKG_KEY = 'coco-dalia-build-package-v1';

  var REGISTRY = [
    { id: 'c1', name: 'Vercel v0', category: 'מנועי קוד', icon: '▲', provider: 'claude', needsApiKey: 'v0', capabilities: ['html', 'react'] },
    { id: 'c2', name: 'Plasmic', category: 'מנועי קוד', icon: '🔷', provider: null, needsApiKey: 'plasmic', capabilities: ['html', 'react'] },
    { id: 'c3', name: 'מנוע קוד סטטי (HTML/CSS/JS)', category: 'מנועי קוד', icon: '📄', provider: null, needsApiKey: null, capabilities: ['html'] },
    { id: 'c4', name: 'Google Stitch', category: 'מנועי עיצוב', icon: '🎨', provider: 'gemini', needsApiKey: 'stitch', capabilities: ['html', 'design'] },
    { id: 'c5', name: 'Figma', category: 'מנועי עיצוב', icon: '✏️', provider: null, needsApiKey: 'figma', capabilities: ['design'] },
    { id: 'c6', name: 'מנוע עיצוב גרפי AI', category: 'מנועי עיצוב', icon: '🖌️', provider: 'openai', needsApiKey: 'openai', capabilities: ['design', 'images'] },
    { id: 'c7', name: 'Builder.io', category: 'מנועי CMS', icon: '🧩', provider: null, needsApiKey: 'builder', capabilities: ['html', 'react', 'content'] },
    { id: 'c8', name: 'מנוע WordPress', category: 'מנועי CMS', icon: '📰', provider: null, needsApiKey: 'wordpress', capabilities: ['wordpress', 'content'] },
    { id: 'c9', name: 'מנוע Webflow', category: 'מנועי CMS', icon: '🌊', provider: null, needsApiKey: 'webflow', capabilities: ['webflow', 'content'] },
    { id: 'c10', name: 'מנוע תוכן AI', category: 'מנועי תוכן', icon: '✍️', provider: 'claude', needsApiKey: null, capabilities: ['content'] },
    { id: 'c11', name: 'מנוע תמונות AI', category: 'מנועי תמונות', icon: '🖼️', provider: 'openai', needsApiKey: 'openai', capabilities: ['images'] },
    { id: 'c12', name: 'מנוע וידאו AI', category: 'מנועי וידאו', icon: '🎬', provider: 'runway', needsApiKey: 'runway', capabilities: ['video'] },
    { id: 'c13', name: 'מנוע פנימי שלנו', category: 'מנוע פנימי', icon: '🛡️', provider: null, needsApiKey: null, capabilities: ['html', 'content'], internal: true },
  ];

  function parseLs(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }

  function saveLs(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); return true; } catch (e) { return false; }
  }

  function gatherBuildContext(apiSnap) {
    var brief = parseLs('dalia_project_brief') || {};
    var partA = parseLs('dalia_part_a') || {};
    var pb = (window.ProjectBrief && ProjectBrief.get) ? ProjectBrief.get() : parseLs('coco-project-brief-v1');
    var blueprint = parseLs('coco-site-blueprint-v1');
    var asst = parseLs('coco-dalia-assistant-reports-v1');
    var wp = (apiSnap && apiSnap.workPlan) || (parseLs('coco-dalia-api-cache-v1') || {}).workPlan;
    var apiClient = apiSnap && apiSnap.clientFromDb;
    var chiefDone = asst && asst.consultants && asst.consultants.some(function (c) {
      return c.id === 'b10' && /אושר/.test(c.status);
    });
    return {
      hasBrief: !!(brief.biz && (brief.biz.companyName || brief.biz.bizName)) || !!(partA.bizName || partA.name) || !!apiClient,
      hasBlueprint: !!(blueprint && blueprint.pages && blueprint.pages.length),
      hasWorkPlan: !!(wp && wp.pages && wp.pages.length),
      stageEApproved: !!(pb && pb.approval && pb.approval.stageE),
      chiefReady: chiefDone,
      pageCount: (blueprint && blueprint.pageCount) || (wp && wp.pages && wp.pages.length) || 0,
      consultantsApproved: asst ? (asst.consultants || []).filter(function (c) { return /אושר/.test(c.status); }).length : 0,
    };
  }

  function buildPackage(ctx) {
    var blueprint = parseLs('coco-site-blueprint-v1');
    var brief = parseLs('dalia_project_brief') || {};
    var pkg = {
      version: VERSION,
      builtAt: new Date().toISOString(),
      brief: brief,
      blueprint: blueprint,
      pageCount: ctx.pageCount,
      ready: ctx.hasBrief && (ctx.hasBlueprint || ctx.hasWorkPlan),
    };
    saveLs(BUILD_PKG_KEY, pkg);
    return pkg;
  }

  function hasEdgeAi() {
    return !!(window.CocoDaliaAiClient && CocoDaliaAiClient.hasAuth && CocoDaliaAiClient.hasAuth());
  }

  function evaluateEngine(eng, ctx) {
    var status = 'ממתין';
    var note = '';
    var gaps = [];
    var ready = false;

    if (!ctx.hasBrief && !ctx.hasWorkPlan) {
      gaps.push('חסר Brief עסקי / תוכנית עבודה');
      status = 'ממתין';
    } else if (!ctx.chiefReady && !ctx.hasBlueprint && !ctx.hasWorkPlan) {
      gaps.push('ממתין לאישור יועצים / Blueprint');
      status = 'ממתין';
    } else if (eng.internal) {
      status = 'מוכן';
      ready = true;
      note = 'מנוע פנימי — תמיד זמין';
    } else if (eng.id === 'c3') {
      status = 'מוכן';
      ready = true;
      note = 'HTML סטטי — אין תלות API חיצוני';
    } else if (eng.id === 'c10') {
      status = 'מוכן';
      ready = true;
      note = hasEdgeAi() ? 'תוכן AI — Edge auth' : 'תוכן rule-based — ללא API חיצוני';
    } else if (eng.provider && hasEdgeAi() && (eng.provider === 'openai' || eng.provider === 'claude' || eng.provider === 'gemini')) {
      status = 'מוכן';
      ready = true;
      note = 'AI דרך Supabase Edge (' + eng.provider + ')';
    } else if (eng.needsApiKey) {
      status = 'דורש API Key';
      note = 'נדרש חיבור: ' + eng.needsApiKey;
      gaps.push('API Key חסר: ' + eng.needsApiKey);
    } else {
      status = 'מוכן';
      ready = true;
      note = 'מוכן לקבלת Build Package';
    }

    if (ctx.pageCount > 0 && ready) {
      note += ' · ' + ctx.pageCount + ' עמודים';
    }

    return {
      id: eng.id,
      name: eng.name,
      category: eng.category,
      icon: eng.icon,
      status: status,
      ready: ready,
      note: note,
      gaps: gaps,
      capabilities: eng.capabilities,
      provider: eng.provider,
      internal: !!eng.internal,
      updatedAt: new Date().toISOString(),
      source: 'engines-engine-v5',
    };
  }

  function runInternalEngine(pkg) {
    if (window.SiteBlueprint && SiteBlueprint.buildFromReport) {
      var report = parseLs('coco-pre-build-work-report-v1');
      if (report) {
        var bp = SiteBlueprint.buildFromReport(report);
        return { ok: true, engine: 'c13', blueprint: bp, previewPath: bp && bp.architecture && bp.architecture.tempPreviewPath };
      }
    }
    if (pkg && pkg.brief) {
      return { ok: true, engine: 'c13', note: 'Build Package מ-Brief — Blueprint ייווצר בהמשך', fallback: true };
    }
    return { ok: false, reason: 'no-brief' };
  }

  function runAll(apiSnap, opts) {
    opts = opts || {};
    var ctx = gatherBuildContext(apiSnap);
    var pkg = buildPackage(ctx);
    var engines = REGISTRY.map(function (e) { return evaluateEngine(e, ctx); });

    function applyRunnerResult(id, result) {
      if (!result) return;
      var eng = engines.find(function (e) { return e.id === id; });
      if (!eng) return;
      if (result.status) eng.status = result.status;
      if (result.ready != null) eng.ready = result.ready;
      if (result.note) eng.note = result.note;
      if (result.previewPath) eng.previewPath = result.previewPath;
      if (result.needsKey) eng.needsKey = result.needsKey;
      eng.ownerAction = result.ownerAction || null;
      eng.lastRun = result.ranAt || new Date().toISOString();
    }

    var c13 = engines.find(function (e) { return e.id === 'c13'; });
    if (c13 && c13.ready && !opts.skipLocal) {
      var internal = runInternalEngine(pkg);
      if (internal.ok) {
        c13.status = 'הושלם';
        c13.note = 'Blueprint פנימי נוצר · ' + (internal.previewPath || 'LS');
        c13.previewPath = internal.previewPath;
      }
    }

    var store = { engines: engines, buildPackage: pkg, ranAt: new Date().toISOString(), version: VERSION, context: ctx };
    saveLs(ENGINES_KEY, store);

    if (!opts.skipParallel && window.CocoDaliaBuildEnginesRunner) {
      CocoDaliaBuildEnginesRunner.runAllParallel(ctx, pkg).then(function (batch) {
        (batch.results || []).forEach(function (row) {
          applyRunnerResult(row.id, row.result);
        });
        store.engines = engines;
        store.parallelAt = new Date().toISOString();
        store.ownerPending = CocoDaliaBuildEnginesRunner.getOwnerActions();
        saveLs(ENGINES_KEY, store);
        try {
          window.dispatchEvent(new CustomEvent('coco:engines-updated', { detail: store }));
        } catch (e) { /* ignore */ }
      });
    }

    return store;
  }

  function loadEngines() {
    return parseLs(ENGINES_KEY);
  }

  function getCounts() {
    var store = loadEngines() || runAll();
    var ready = (store.engines || []).filter(function (e) { return e.ready || e.status === 'מוכן' || e.status === 'הושלם'; }).length;
    var done = (store.engines || []).filter(function (e) { return e.status === 'הושלם'; }).length;
    var needsKey = (store.engines || []).filter(function (e) { return e.status === 'דורש API Key'; }).length;
    return { total: 13, ready: ready, done: done, needsApiKey: needsKey, active: ready };
  }

  function overlayToV5Data(data, apiSnap) {
    if (!data) return data;
    var store = loadEngines();
    if (!store || !store.ranAt) store = runAll(apiSnap);
    var age = Date.now() - new Date(store.ranAt).getTime();
    if (age > 10 * 60 * 1000) store = runAll(apiSnap);

    if (data.pages && store.engines) {
      var best = store.engines.find(function (e) { return e.status === 'הושלם'; }) ||
        store.engines.find(function (e) { return e.ready; });
      var engName = best ? best.name : 'טרם הופק';
      data.pages.forEach(function (p, i) {
        if (best && (p.engine === 'Vercel v0' || p.engine === 'טרם הופק' || !p._engineLive)) {
          p.engine = i % 2 === 0 ? engName : (store.engines[0] && store.engines[0].name) || engName;
          p._engineLive = true;
        }
      });
    }
    data._enginesEngine = { version: VERSION, counts: getCounts() };
    return data;
  }

  function toPipelineState() {
    var store = loadEngines() || runAll();
    var engines = {};
    (store.engines || []).forEach(function (e) {
      engines[e.id] = { status: e.status, note: e.note };
    });
    return { engines: engines };
  }

  window.CocoDaliaBuildEnginesEngine = {
    VERSION: VERSION,
    REGISTRY: REGISTRY,
    runAll: runAll,
    loadEngines: loadEngines,
    getCounts: getCounts,
    runInternalEngine: runInternalEngine,
    overlayToV5Data: overlayToV5Data,
    toPipelineState: toPipelineState,
    gatherBuildContext: gatherBuildContext,
  };
})();
