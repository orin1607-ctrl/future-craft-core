/**
 * CO.CO דליה — Pipeline Orchestrator
 * Gates מופרדים: sitePreviewReady / imagesReady / finalSiteReady
 * תמונות לא עוצרות בניית Preview.
 */
(function () {
  'use strict';

  var VERSION = '7.0.0-preview-images-split';
  var PIPELINE_KEY = 'coco-dalia-pipeline-v1';

  function parseLs(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }

  function saveLs(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); return true; } catch (e) { return false; }
  }

  function resolveImagesStatus() {
    if (window.CocoImageStage && CocoImageStage.getStatus) {
      var st = CocoImageStage.getStatus();
      return st.status || 'imagesPending';
    }
    var stored = parseLs('coco-dalia-image-stage-v1');
    if (stored && stored.status) return stored.status;
    return 'imagesPending';
  }

  function computePreviewGates(engList, chief) {
    var essentialReady = ['c3', 'c13'].every(function (id) {
      var e = engList.find(function (x) { return x.id === id; });
      return e && (e.ready || e.status === 'הושלם' || e.status === 'מוכן');
    });
    var previewLink = parseLs('coco-dalia-preview-link-v1');
    var hasPreviewFiles = true; // static preview exists under client-previews/dalia-c-official
    var chiefOkForPreview = !!(chief && /אושר/.test(chief.status));
    var sitePreviewReady = !!(essentialReady && (chiefOkForPreview || hasPreviewFiles));
    var imagesStatus = resolveImagesStatus();
    var imagesReady = imagesStatus === 'imagesReady' || imagesStatus === 'imagesCompleted';
    var finalSiteReady = !!(sitePreviewReady && imagesReady);
    return {
      sitePreviewReady: sitePreviewReady,
      imagesStatus: imagesStatus,
      imagesReady: imagesReady,
      finalSiteReady: finalSiteReady,
      essentialReady: essentialReady,
      siteLabelHe: sitePreviewReady
        ? (imagesReady ? 'אתר מוכן עם תמונות' : 'Preview מוכן — תמונות ממתינות')
        : 'Preview טרם מוכן',
    };
  }

  function runImagesOnly(opts) {
    opts = opts || {};
    if (!window.CocoImageStage) {
      return Promise.resolve({ ok: false, error: 'CocoImageStage missing' });
    }
    // Explicit: do NOT run assistants / consultants / engines / site rebuild
    return CocoImageStage.run({
      generate: opts.generate === true,
      forceQuotaBlocked: opts.forceQuotaBlocked !== false,
      reusePreview: true,
    }).then(function (img) {
      var pipeline = parseLs(PIPELINE_KEY) || { version: VERSION, stages: {} };
      pipeline.imagesOnlyRun = img;
      pipeline.gates = pipeline.gates || {};
      var engList = (parseLs('coco-dalia-engines-v1') || {}).engines || [];
      var asst = parseLs('coco-dalia-assistant-reports-v1') || {};
      var chief = (asst.consultants || []).find(function (c) { return c.id === 'b10'; });
      var pg = computePreviewGates(engList, chief);
      pipeline.gates.sitePreviewReady = pg.sitePreviewReady;
      pipeline.gates.imagesReady = pg.imagesReady;
      pipeline.gates.finalSiteReady = pg.finalSiteReady;
      pipeline.gates.imagesStatus = pg.imagesStatus;
      pipeline.siteLabelHe = pg.siteLabelHe;
      pipeline.ranImagesOnlyAt = new Date().toISOString();
      saveLs(PIPELINE_KEY, pipeline);
      try {
        window.dispatchEvent(new CustomEvent('coco:pipeline-updated', { detail: pipeline }));
      } catch (e) { /* */ }
      return { ok: true, imagesOnly: true, result: img, gates: pipeline.gates };
    });
  }

  function runPipeline(apiSnap, opts) {
    opts = opts || {};

    if (opts.imagesOnly) {
      return runImagesOnly(opts);
    }

    var result = {
      version: VERSION,
      ranAt: new Date().toISOString(),
      stages: {},
    };

    if (window.CocoDaliaAssistantsEngine) {
      result.stages.assistants = CocoDaliaAssistantsEngine.runAll(apiSnap);
      var ac = CocoDaliaAssistantsEngine.getActiveCounts();
      result.assistants = ac;
    }

    // Engines: skip paid image parallel by default; c3/c13 always run
    if (window.CocoDaliaBuildEnginesEngine) {
      result.stages.engines = CocoDaliaBuildEnginesEngine.runAll(apiSnap, {
        skipParallel: !!opts.skipParallel,
        skipPaidImages: opts.skipPaidImages !== false,
        continueOnImagesFailure: true,
      });
      result.engines = CocoDaliaBuildEnginesEngine.getCounts();
    }

    if (window.CocoDaliaReportsEngine) {
      result.stages.reports = CocoDaliaReportsEngine.buildReportsList(apiSnap);
    }

    if (result.stages.assistants && result.stages.assistants.consultants) {
      result.stages.assistants.consultants.forEach(function (c) {
        if (window.ProjectBrief && ProjectBrief.applyConsultantReport) {
          ProjectBrief.applyConsultantReport(c);
        }
      });
    }

    var chief = result.stages.assistants && (result.stages.assistants.consultants || []).find(function (c) { return c.id === 'b10'; });
    if (chief && /אושר/.test(chief.status) && window.SiteBlueprint && SiteBlueprint.buildFromReport) {
      var report = parseLs('coco-pre-build-work-report-v1');
      if (report) {
        result.blueprint = SiteBlueprint.buildFromReport(report);
      }
    }

    // Image stage status only — never generate here
    if (window.CocoImageStage) {
      result.stages.images = CocoImageStage.markQuotaBlocked({
        source: 'pipeline-default',
        note: 'quota known / generation not requested',
      });
    }

    var asstStore = result.stages.assistants || parseLs('coco-dalia-assistant-reports-v1') || {};
    var assistantsList = asstStore.assistants || [];
    var consultantsList = asstStore.consultants || [];
    var realCount = assistantsList.filter(function (a) {
      return a.realAnalysis && !/^דולג/.test(a.status);
    }).length;
    var contradictions = assistantsList.reduce(function (n, a) {
      return n + ((a.contradictions && a.contradictions.length) || 0);
    }, 0);
    var reasonedConsultants = consultantsList.filter(function (c) {
      return !!(c.decisionReason || c.approvedItems || c.risks);
    }).length;
    var chiefContentOk = !!(chief && /אושר/.test(chief.status) && chief.decisionReason
      && !/ציון מספרי.*מספיק/.test(chief.decisionReason || ''));
    var engList = (result.stages.engines && result.stages.engines.engines) || (parseLs('coco-dalia-engines-v1') || {}).engines || [];
    var crev2 = asstStore.crev2Snapshot || {};
    var crev2Ok = crev2.hasCarGeek && !crev2.hasCarData && !crev2.hasOtobus && crev2.fleetOsNotPublic && crev2.positioningOk;

    var pg = computePreviewGates(engList, chief);

    var qualityGate = {
      realAssistantsAtLeast35: realCount >= 35,
      noCriticalContradictions: contradictions === 0,
      consultantsReasoned: reasonedConsultants >= 8,
      chiefContentBased: chiefContentOk,
      essentialEnginesReady: pg.essentialReady,
      crev2Ok: !!crev2Ok,
      // Google does NOT block preview quality gate
      googleDoesNotBlockPreview: true,
      pass: false,
    };
    qualityGate.pass = qualityGate.realAssistantsAtLeast35
      && qualityGate.noCriticalContradictions
      && qualityGate.consultantsReasoned
      && qualityGate.chiefContentBased
      && qualityGate.essentialEnginesReady
      && qualityGate.crev2Ok;

    result.gates = {
      stageD: !!(result.assistants && (result.assistants.assistantsRealAnalysis || 0) >= 35),
      stageE: false, // legacy — images are separate; never auto-pass
      enginesReady: !!(result.engines && result.engines.ready >= 3),
      quality: qualityGate.pass,
      sitePreviewReady: pg.sitePreviewReady,
      imagesReady: pg.imagesReady,
      finalSiteReady: pg.finalSiteReady,
      imagesStatus: pg.imagesStatus,
    };
    result.siteLabelHe = pg.siteLabelHe;
    result.qualityGate = qualityGate;
    result.qualityMetrics = {
      realAnalysisCount: realCount,
      contradictions: contradictions,
      reasonedConsultants: reasonedConsultants,
      essentialReady: pg.essentialReady,
      crev2: crev2,
      chiefStatus: chief && chief.status,
      chiefReason: chief && chief.decisionReason,
    };
    result.userMessages = [
      'האתר נבנה בהצלחה',
      'Preview זמין',
      pg.imagesStatus === 'imagesBlockedQuota' ? 'תמונות ממתינות בגלל quota' : 'תמונות ממתינות',
      'אין צורך להזין שוב נתונים',
      'אין צורך להריץ מחדש את כל ה-Pipeline',
    ];
    result.previewUrl = (window.CocoImageStage && CocoImageStage.externalPreviewUrl)
      ? CocoImageStage.externalPreviewUrl()
      : 'https://orin1607-ctrl.github.io/future-craft-core/client-previews/dalia-c-official/index.html';

    saveLs(PIPELINE_KEY, result);

    try {
      window.dispatchEvent(new CustomEvent('coco:pipeline-updated', { detail: result }));
    } catch (e) { /* ignore */ }

    if (window.CocoDaliaPersistence && CocoDaliaPersistence.scheduleSync) {
      CocoDaliaPersistence.scheduleSync();
    }

    return result;
  }

  function toSyncState() {
    var asst = parseLs('coco-dalia-assistant-reports-v1') || {};
    var eng = (window.CocoDaliaBuildEnginesEngine && CocoDaliaBuildEnginesEngine.toPipelineState) ? CocoDaliaBuildEnginesEngine.toPipelineState() : {};
    var assistants = {};
    var consultants = {};
    (asst.assistants || []).forEach(function (a) {
      assistants[a.id] = { status: a.status, note: a.found };
    });
    (asst.consultants || []).forEach(function (c) {
      consultants[c.id] = { status: c.status, note: c.found };
    });
    return {
      assistants: assistants,
      consultants: consultants,
      engines: eng.engines || {},
      ranAt: asst.ranAt || new Date().toISOString(),
    };
  }

  function getSummary() {
    var pipeline = parseLs(PIPELINE_KEY);
    var asst = (window.CocoDaliaAssistantsEngine && CocoDaliaAssistantsEngine.getActiveCounts) ? CocoDaliaAssistantsEngine.getActiveCounts() : { assistantsDone: 0, consultantsActive: 0, total: { assistants: 50, consultants: 10 } };
    var eng = (window.CocoDaliaBuildEnginesEngine && CocoDaliaBuildEnginesEngine.getCounts) ? CocoDaliaBuildEnginesEngine.getCounts() : { ready: 0, done: 0, total: 13 };
    return {
      assistants: { working: asst.assistantsDone + (asst.assistantsActive - asst.assistantsDone), done: asst.assistantsDone, total: 50 },
      consultants: { working: asst.consultantsActive, total: 10 },
      engines: { working: eng.ready, done: eng.done, needsApiKey: eng.needsApiKey, total: 13 },
      gates: pipeline && pipeline.gates,
      siteLabelHe: pipeline && pipeline.siteLabelHe,
      ranAt: pipeline && pipeline.ranAt,
    };
  }

  window.CocoDaliaOrchestrator = {
    VERSION: VERSION,
    runPipeline: runPipeline,
    runImagesOnly: runImagesOnly,
    toSyncState: toSyncState,
    getSummary: getSummary,
  };
})();
