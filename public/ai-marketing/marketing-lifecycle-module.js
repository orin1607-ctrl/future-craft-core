/**
 * Marketing Lifecycle — full site lifecycle stage tracking.
 */
(function () {
  'use strict';

  var VERSION = '1.0.0';
  var LIFECYCLE_KEY = 'coco-marketing-lifecycle-v1';

  var STAGES = [
    { id: 'research', label: 'מחקר ואיסוף נתונים' },
    { id: 'strategy', label: 'אסטרטגיית שיווק' },
    { id: 'report', label: 'דוח Pre-Build' },
    { id: 'blueprint', label: 'Blueprint' },
    { id: 'build', label: 'בניית אתר' },
    { id: 'preview', label: 'Preview ואישורים' },
    { id: 'publish', label: 'פרסום (Staging)' },
    { id: 'manage', label: 'ניהול שוטף' },
  ];

  function get() {
    try { return JSON.parse(localStorage.getItem(LIFECYCLE_KEY) || 'null'); } catch (e) { return null; }
  }

  function save(state) {
    try { localStorage.setItem(LIFECYCLE_KEY, JSON.stringify(state)); return true; } catch (e) { return false; }
  }

  function init(clientId) {
    var state = {
      version: VERSION,
      clientId: clientId || 'dalia-c-official',
      currentStage: 'research',
      stages: {},
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    STAGES.forEach(function (s) {
      state.stages[s.id] = { status: 'pending', at: null, label: s.label };
    });
    state.stages.research.status = 'in_progress';
    state.stages.research.at = new Date().toISOString();
    save(state);
    return state;
  }

  function advance(stageId, status) {
    var state = get() || init();
    if (!state.stages[stageId]) state.stages[stageId] = { label: stageId };
    state.stages[stageId].status = status || 'completed';
    state.stages[stageId].at = new Date().toISOString();
    state.currentStage = stageId;
    state.updatedAt = new Date().toISOString();
    save(state);
    if (window.MarketingActivityLog) MarketingActivityLog.log('lifecycle_' + stageId, { status: status || 'completed' });
    if (window.AiStageAdvisor) AiStageAdvisor.advise(stageId);
    return state;
  }

  function hydrate() {
    var state = get();
    if (!state) state = init();
    if (window.COCO) COCO.lifecycle = state;
    return state;
  }

  window.MarketingLifecycle = {
    VERSION: VERSION,
    STAGES: STAGES,
    init: init,
    get: get,
    advance: advance,
    hydrate: hydrate,
  };
})();
