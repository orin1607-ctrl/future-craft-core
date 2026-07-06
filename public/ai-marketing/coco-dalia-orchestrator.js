/**
 * CO.CO דליה — Pipeline Orchestrator (Phase 5)
 * Full flow: Assistants → Consultants → Blueprint → Engines
 */
(function () {
  'use strict';

  var VERSION = '5.0.0-orchestrator';
  var PIPELINE_KEY = 'coco-dalia-pipeline-v1';

  function parseLs(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }

  function saveLs(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); return true; } catch (e) { return false; }
  }

  function runPipeline(apiSnap, opts) {
    opts = opts || {};
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

    if (window.CocoDaliaBuildEnginesEngine) {
      result.stages.engines = CocoDaliaBuildEnginesEngine.runAll(apiSnap);
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

    result.gates = {
      stageD: !!(result.assistants && result.assistants.assistantsDone >= 35),
      stageE: !!(chief && /אושר/.test(chief.status)),
      enginesReady: !!(result.engines && result.engines.ready >= 3),
    };

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
      ranAt: pipeline && pipeline.ranAt,
    };
  }

  window.CocoDaliaOrchestrator = {
    VERSION: VERSION,
    runPipeline: runPipeline,
    toSyncState: toSyncState,
    getSummary: getSummary,
  };
})();
