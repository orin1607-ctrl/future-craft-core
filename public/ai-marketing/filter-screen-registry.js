/**
 * Filter Screen Registry — hook new screens into GFC without architecture changes.
 */
(function () {
  'use strict';

  var registry = {};
  var defaultRefresh = function (screenId) {
    if (window.CocoData && CocoData.bindScreen) CocoData.bindScreen(screenId);
  };

  function register(screenId, opts) {
    opts = opts || {};
    registry[screenId] = {
      screenId: screenId,
      needsFilter: opts.needsFilter !== false,
      refresh: opts.refresh || defaultRefresh,
      bind: opts.bind,
    };
  }

  function refresh(screenId) {
    var entry = registry[screenId];
    if (entry && entry.refresh) entry.refresh(screenId);
    else defaultRefresh(screenId);
  }

  function refreshAll() {
    Object.keys(registry).forEach(function (id) {
      var entry = registry[id];
      if (entry && entry.needsFilter) refresh(id);
    });
    if (window.CocoData && CocoData.bindAll) CocoData.bindAll();
  }

  function registerDefaults() {
    [
      'screen-hub', 'screen-status', 'screen-clients', 'screen-agents',
      'screen-goals', 'screen-actions', 'screen-history', 'screen-assets',
      'screen-ai-decisions', 'screen-ai-center', 'screen-reports', 'screen-crm',
    ].forEach(function (id) {
      register(id, { needsFilter: true });
    });
  }

  registerDefaults();

  window.FilterScreenRegistry = {
    register: register,
    refresh: refresh,
    refreshAll: refreshAll,
    get: function (id) { return registry[id] || null; },
    list: function () { return Object.keys(registry); },
  };

  if (window.GlobalFilterContext && GlobalFilterContext.onChange) {
    GlobalFilterContext.onChange(function () {
      if (window.CocoMarketingUnified && CocoMarketingUnified.refreshAllModules) {
        CocoMarketingUnified.refreshAllModules();
      } else {
        refreshAll();
      }
    });
  }
})();
