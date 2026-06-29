/**
 * AI Control Center Bridge — wires Multi-AI + Question Engine + data adapters.
 */
(function () {
  'use strict';

  function getDailySnapshot() {
    var out = { runs: 0, drafts: 0, keywords: 0, historyLite: 0 };
    try {
      out.runs = JSON.parse(localStorage.getItem('dalia-daily-engine-runs-v1') || '[]').length;
      out.drafts = JSON.parse(localStorage.getItem('dalia-daily-engine-draft-actions-v1') || '[]').length;
      out.keywords = JSON.parse(localStorage.getItem('dalia-daily-engine-keywords-v1') || '[]').length;
      out.historyLite = JSON.parse(localStorage.getItem('dalia-daily-engine-history-lite-v1') || '[]').length;
    } catch (e) { /* ignore */ }
    if (window.DailyEngine) {
      if (DailyEngine.getRuns) out.runs = (DailyEngine.getRuns() || []).length;
      if (DailyEngine.getKeywords) out.keywords = (DailyEngine.getKeywords() || []).length;
    }
    return out;
  }

  function getContext() {
    if (window.FilterEngine && FilterEngine.getContext) return FilterEngine.getContext();
    if (window.GlobalFilterContext && GlobalFilterContext.get) return GlobalFilterContext.get();
    return {};
  }

  function getSnapshot() {
    var bundle = null;
    if (window.CocoData && CocoData.getBundle) bundle = CocoData.getBundle();
    else if (window.DaliaSite && DaliaSite.buildLiveBundle) {
      var dash = (DaliaSite.getDashboard && DaliaSite.getDashboard()) || {};
      bundle = DaliaSite.buildLiveBundle(dash);
    }
    var wp = (bundle && bundle.workPlan) || (window.DaliaSite && DaliaSite.getWorkPlan && DaliaSite.getWorkPlan()) || {};
    var actions = (wp.actions || []).slice();
    var pages = (wp.pages || []).slice();
    var pending = actions.filter(function (a) { return !/done|completed|הושלם/i.test(a.status || ''); });
    return {
      at: new Date().toISOString(),
      context: getContext(),
      daily: getDailySnapshot(),
      counts: {
        actions: actions.length,
        pending: pending.length,
        pages: pages.length,
        customers: (window.CocoData && CocoData.getCustomers) ? (CocoData.getCustomers() || []).length : 0,
      },
      multiAiRuns: (function () {
        try { return JSON.parse(localStorage.getItem('coco-multi-ai-runs-v1') || '[]').length; } catch (e) { return 0; }
      })(),
      questionHistory: (window.AiQuestionEngine && AiQuestionEngine.getHistory) ? AiQuestionEngine.getHistory(5).length : 0,
    };
  }

  function getEngineStatus() {
    if (!window.MultiAiOrchestrator || !MultiAiOrchestrator.getRegistry) return [];
    var reg = MultiAiOrchestrator.getRegistry();
    return (reg && reg.engines) ? reg.engines : [];
  }

  function init() {
    if (window.CocoIntegrationHub && window.MultiAiOrchestrator) {
      CocoIntegrationHub.MultiAi = MultiAiOrchestrator;
    }
    window.COCO_AI_CONTROL = {
      ask: function (q, opts) {
        return window.AiQuestionEngine ? AiQuestionEngine.ask(q, opts) : Promise.resolve({ summary: 'AiQuestionEngine not loaded', mode: 'error' });
      },
      execute: function (opts) {
        return window.MultiAiOrchestrator ? MultiAiOrchestrator.execute(opts) : Promise.resolve(null);
      },
      registry: function () {
        return window.MultiAiOrchestrator ? MultiAiOrchestrator.getRegistry() : null;
      },
      getSnapshot: getSnapshot,
      getContext: getContext,
      getEngineStatus: getEngineStatus,
      version: '1.1.0-mission25',
    };
    document.dispatchEvent(new CustomEvent('coco:ai-control-ready', { detail: window.COCO_AI_CONTROL }));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.AiControlCenterBridge = { init: init, getSnapshot: getSnapshot };
})();
