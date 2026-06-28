/**
 * Global Filter Context (GFC) v3 — SSOT for marketing filter state.
 * Syncs to legacy COCO.flowContext for backward compatibility (Phase A: no UI changes).
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'coco-global-filter-v3';
  var LEGACY_KEY = 'coco-flow-context-v2';
  var VERSION = 3;
  var EVENT_NAME = 'coco:filter-changed';

  var CASCADE_RESET = {
    clientId: ['activityType', 'campaignId', 'campaignName', 'assetId', 'assetType', 'assetLabel', 'subCategory', 'site', 'domain', 'campaign', 'page'],
    activityType: ['campaignId', 'campaignName', 'assetId', 'assetType', 'assetLabel', 'subCategory', 'page'],
    campaignId: ['assetId', 'assetType', 'assetLabel', 'subCategory', 'page'],
    assetId: ['subCategory', 'page'],
    subCategory: ['page'],
  };

  var state = defaultState();
  var listeners = [];
  var readyPromise = null;
  var _syncGuard = false;

  function defaultState() {
    return {
      version: VERSION,
      clientId: null,
      clientName: '',
      activityType: null,
      campaignId: null,
      campaignName: '',
      assetId: null,
      assetType: null,
      assetLabel: '',
      subCategory: null,
      dateRange: { preset: 'month', from: '', to: '' },
      status: null,
      freeSearch: '',
      serviceType: '',
      customerStatus: '',
      site: '',
      domain: '',
      campaign: '',
      page: '',
      channel: '',
    };
  }

  function cloneState() {
    return JSON.parse(JSON.stringify(state));
  }

  function mapLegacyDatePreset(val) {
    if (!val) return 'month';
    if (val === 'custom') return 'custom';
    if (val === 'today' || val === 'week' || val === 'month') return val;
    if (/^\d+$/.test(String(val))) return 'month';
    return val;
  }

  function migrateFromV2(raw) {
    if (!raw || typeof raw !== 'object') return;
    if (raw.clientId) state.clientId = raw.clientId;
    if (raw.clientName || raw.company) state.clientName = raw.clientName || raw.company;
    if (raw.activityType) state.activityType = raw.activityType;
    else if (raw.channel) state.activityType = raw.channel;
    if (raw.campaignId) state.campaignId = raw.campaignId;
    else if (raw.campaign) state.campaignId = raw.campaign;
    if (raw.campaignName) state.campaignName = raw.campaignName;
    if (raw.activeAssetId || raw.assetId) state.assetId = raw.activeAssetId || raw.assetId;
    if (raw.assetType) state.assetType = raw.assetType;
    if (raw.site || raw.domain) {
      state.assetLabel = raw.site || raw.domain;
      state.site = raw.site || raw.domain;
      state.domain = raw.domain || raw.site;
    }
    if (raw.subCategory) state.subCategory = raw.subCategory;
    else if (raw.page) {
      state.subCategory = { type: 'page', id: raw.page, label: raw.page, path: raw.page };
      state.page = raw.page;
    }
    if (raw.dateRange || raw.dateFrom || raw.dateTo) {
      state.dateRange = {
        preset: mapLegacyDatePreset(raw.dateRange),
        from: raw.dateFrom || '',
        to: raw.dateTo || '',
      };
    }
    if (raw.status) state.status = raw.status;
    if (raw.freeSearch) state.freeSearch = raw.freeSearch;
    if (raw.serviceType) state.serviceType = raw.serviceType;
    if (raw.customerStatus) state.customerStatus = raw.customerStatus;
    if (raw.channel) state.channel = raw.channel;
    state.campaign = state.campaignId || state.campaignName || raw.campaign || '';
  }

  function loadPersisted() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.version === VERSION) {
          Object.assign(state, defaultState(), parsed);
          return;
        }
      }
    } catch (e) { /* ignore */ }
    try {
      var leg = localStorage.getItem(LEGACY_KEY);
      if (leg) migrateFromV2(JSON.parse(leg));
    } catch (e2) { /* ignore */ }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* ignore */ }
  }

  function syncToFlowContext() {
    if (_syncGuard) return;
    _syncGuard = true;
    if (!window.COCO) window.COCO = {};
    if (!COCO.flowContext) COCO.flowContext = {};
    var sub = state.subCategory;
    var pageVal = sub ? (sub.path || sub.label || sub.id || '') : state.page;
    Object.assign(COCO.flowContext, {
      clientId: state.clientId,
      clientName: state.clientName,
      company: state.clientName,
      activityType: state.activityType,
      campaignId: state.campaignId,
      campaignName: state.campaignName,
      campaign: state.campaignId || state.campaignName || state.campaign,
      activeAssetId: state.assetId,
      assetId: state.assetId,
      assetType: state.assetType,
      site: state.assetLabel || state.site,
      domain: state.domain || state.assetLabel || state.site,
      page: pageVal,
      subCategory: state.subCategory,
      dateRange: state.dateRange.preset === 'custom' ? 'custom' : state.dateRange.preset,
      dateFrom: state.dateRange.from,
      dateTo: state.dateRange.to,
      status: state.status,
      freeSearch: state.freeSearch,
      serviceType: state.serviceType,
      customerStatus: state.customerStatus,
      channel: state.channel || state.activityType,
    });
    try {
      localStorage.setItem(LEGACY_KEY, JSON.stringify(COCO.flowContext));
    } catch (e) { /* ignore */ }
    _syncGuard = false;
  }

  function syncFromFlowContext() {
    if (!window.COCO || !COCO.flowContext) return;
    migrateFromV2(COCO.flowContext);
  }

  function applyCascade(changedKey) {
    var reset = CASCADE_RESET[changedKey];
    if (!reset) return;
    reset.forEach(function (key) {
      if (key === 'subCategory') state.subCategory = null;
      else if (key === 'dateRange') { /* keep */ }
      else state[key] = key === 'campaignName' || key === 'assetLabel' ? '' : null;
    });
    if (reset.indexOf('site') >= 0) { state.site = ''; state.domain = ''; }
    if (reset.indexOf('campaign') >= 0) state.campaign = '';
    if (reset.indexOf('page') >= 0) state.page = '';
  }

  function detectChangedKeys(prev, next) {
    var keys = Object.keys(next);
    var changed = [];
    keys.forEach(function (k) {
      if (k === 'version') return;
      var a = JSON.stringify(prev[k]);
      var b = JSON.stringify(next[k]);
      if (a !== b) changed.push(k);
    });
    return changed;
  }

  function emit(detail) {
    try {
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: detail }));
    } catch (e) { /* ignore */ }
    listeners.forEach(function (fn) {
      try { fn(detail); } catch (err) { console.warn('GFC listener', err); }
    });
  }

  function set(partial, opts) {
    opts = opts || {};
    var prev = cloneState();
    var keys = Object.keys(partial || {});
    keys.forEach(function (k) {
      if (k === 'version') return;
      if (k === 'subCategory' && partial[k] === null) {
        state.subCategory = null;
        state.page = '';
        return;
      }
      state[k] = partial[k];
    });

    if (!opts.skipCascade) {
      keys.forEach(function (k) {
        if (CASCADE_RESET[k]) applyCascade(k);
      });
    }

    if (state.campaignId) state.campaign = state.campaignId;
    if (state.assetLabel) {
      state.site = state.assetLabel;
      state.domain = state.assetLabel;
    }
    if (state.subCategory && state.subCategory.path) {
      state.page = state.subCategory.path;
    }

    if (!opts.skipValidation && window.FilterEntityIndex && FilterEntityIndex.isLoaded()) {
      var v = FilterEntityIndex.validateContext(state);
      if (!v.ok && !opts.allowInvalid) {
        Object.assign(state, prev);
        return { ok: false, validation: v };
      }
    }

    persist();
    syncToFlowContext();
    var changed = detectChangedKeys(prev, state);
    emit({ context: get(), changed: changed, source: opts.source || 'set' });
    return { ok: true, changed: changed };
  }

  function get() {
    return cloneState();
  }

  function reset(fromStep) {
    var steps = ['clientId', 'activityType', 'campaignId', 'assetId', 'subCategory'];
    var idx = fromStep ? steps.indexOf(fromStep) : 0;
    if (idx < 0) idx = 0;
    for (var i = idx; i < steps.length; i++) {
      applyCascade(steps[i]);
    }
    if (idx === 0) {
      state.clientName = '';
      state.freeSearch = '';
      state.serviceType = '';
      state.customerStatus = '';
      state.status = null;
      state.dateRange = { preset: 'month', from: '', to: '' };
    }
    persist();
    syncToFlowContext();
    emit({ context: get(), changed: ['reset'], source: 'reset' });
  }

  function contextHash() {
    if (window.FilterEngine && FilterEngine.contextHash) {
      return FilterEngine.contextHash(state);
    }
    var sub = state.subCategory;
    return [state.clientId, state.activityType, state.campaignId, state.assetId,
      sub && sub.id, state.dateRange.preset, state.status, state.freeSearch].join('|');
  }

  function onChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
    return function () {
      listeners = listeners.filter(function (f) { return f !== fn; });
    };
  }

  function whenReady() {
    if (readyPromise) return readyPromise;
    loadPersisted();
    syncToFlowContext();
    readyPromise = (window.FilterEntityIndex && FilterEntityIndex.load
      ? FilterEntityIndex.load()
      : Promise.resolve()
    ).then(function () {
      return get();
    });
    return readyPromise;
  }

  function init() {
    loadPersisted();
    syncToFlowContext();
    return whenReady();
  }

  window.GlobalFilterContext = {
    VERSION: VERSION,
    STORAGE_KEY: STORAGE_KEY,
    EVENT_NAME: EVENT_NAME,
    defaultState: defaultState,
    get: get,
    set: set,
    reset: reset,
    init: init,
    whenReady: whenReady,
    onChange: onChange,
    contextHash: contextHash,
    syncToFlowContext: syncToFlowContext,
    syncFromFlowContext: syncFromFlowContext,
    migrateFromV2: migrateFromV2,
  };
})();
