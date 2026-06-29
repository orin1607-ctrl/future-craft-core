/**
 * AI Control Center Bridge — wires Multi-AI + Question Engine (no UI changes).
 */
(function () {
  'use strict';

  function init() {
    if (window.CocoIntegrationHub && window.MultiAiOrchestrator) {
      CocoIntegrationHub.MultiAi = MultiAiOrchestrator;
    }
    window.COCO_AI_CONTROL = {
      ask: function (q, opts) {
        return window.AiQuestionEngine ? AiQuestionEngine.ask(q, opts) : Promise.resolve({ summary: 'AiQuestionEngine not loaded' });
      },
      execute: function (opts) {
        return window.MultiAiOrchestrator ? MultiAiOrchestrator.execute(opts) : Promise.resolve(null);
      },
      registry: function () {
        return window.MultiAiOrchestrator ? MultiAiOrchestrator.getRegistry() : null;
      },
      version: '1.0.0',
    };
    document.dispatchEvent(new CustomEvent('coco:ai-control-ready', { detail: window.COCO_AI_CONTROL }));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.AiControlCenterBridge = { init: init };
})();
