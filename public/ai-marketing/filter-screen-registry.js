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

  var MARKETING_HUB_SCREENS = [
    { id: 'screen-hub', labelHe: 'מרכז שיווק' },
    { id: 'screen-status', labelHe: 'מצב נוכחי' },
    { id: 'screen-clients', labelHe: 'חברות ולקוחות' },
    { id: 'screen-business-strategy', labelHe: 'אסטרטגיית שיווק AI' },
    { id: 'screen-goals', labelHe: 'מטרות' },
    { id: 'screen-actions', labelHe: 'פעולות' },
    { id: 'screen-history', labelHe: 'היסטוריה' },
    { id: 'screen-assets', labelHe: 'נכסים דיגיטליים' },
    { id: 'screen-ai-center', labelHe: 'קבלת החלטות AI' },
    { id: 'screen-reports', labelHe: 'דוחות' },
    { id: 'screen-crm', labelHe: 'CRM' },
  ];

  function registerDefaults() {
    MARKETING_HUB_SCREENS.forEach(function (s) {
      register(s.id, { needsFilter: true });
    });
    register('screen-agents', { needsFilter: true });
    register('screen-agent-dashboard', { needsFilter: true });
    register('screen-crm-card', { needsFilter: true });
    register('screen-ai-decisions', { needsFilter: false });
  }

  registerDefaults();

  window.FilterScreenRegistry = {
    register: register,
    refresh: refresh,
    refreshAll: refreshAll,
    get: function (id) { return registry[id] || null; },
    list: function () { return Object.keys(registry); },
    marketingScreens: function () { return MARKETING_HUB_SCREENS.slice(); },
  };

  if (window.GlobalFilterContext && GlobalFilterContext.onChange) {
    GlobalFilterContext.onChange(function () {
      if (window.CocoUnified && CocoUnified.refreshAllModules) {
        CocoUnified.refreshAllModules();
      } else {
        refreshAll();
      }
    });
  }
})();
