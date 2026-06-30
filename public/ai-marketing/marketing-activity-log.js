/**
 * Marketing Activity Log — full audit trail (who/when/what/why).
 * Staging only · data layer, no UI changes.
 */
(function () {
  'use strict';

  var VERSION = '1.0.0';
  var LOG_KEY = 'coco-marketing-activity-log-v1';
  var MAX_ENTRIES = 500;

  function parseLs() {
    try {
      var raw = localStorage.getItem(LOG_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function actor() {
    return (window.COCO && COCO.flowContext && COCO.flowContext.user) || 'staging-user';
  }

  function log(action, detail) {
    var entry = {
      id: 'log-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      at: new Date().toISOString(),
      who: actor(),
      action: action,
      detail: detail || {},
      reason: (detail && detail.reason) || '',
    };
    var list = parseLs();
    list.unshift(entry);
    if (list.length > MAX_ENTRIES) list.length = MAX_ENTRIES;
    try { localStorage.setItem(LOG_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
    if (window.DaliaSite && DaliaSite.logWorkProgress) {
      DaliaSite.logWorkProgress(action, typeof detail === 'string' ? detail : (detail.summary || action));
    }
    return entry;
  }

  function logChange(action, before, after, reason) {
    return log(action, { before: before, after: after, reason: reason, summary: action });
  }

  window.MarketingActivityLog = {
    VERSION: VERSION,
    log: log,
    logChange: logChange,
    getAll: parseLs,
    getRecent: function (n) { return parseLs().slice(0, n || 50); },
  };
})();
