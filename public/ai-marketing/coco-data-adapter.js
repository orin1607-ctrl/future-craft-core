/**
 * Phase 0/1a — bridge CO.CO shell ↔ Orin legacy + Project Brief merge (Orin→Brief one-way).
 * Read-only MarketingApi.loadBundle when canRemote(); postMessage auth unchanged.
 */
(function () {
  'use strict';

  var KEYS = {
    partA: 'dalia_part_a',
    biz: 'dalia_biz',
    partB: 'dalia_part_b',
    partC: 'dalia_part_c',
    strategic: 'coco-strategic-briefing-v1',
    seoDraft: 'dalia_seo_draft',
  };

  var BRIEF_WATCH_KEYS = [KEYS.partA, KEYS.biz, KEYS.partB, KEYS.partC, KEYS.strategic, KEYS.seoDraft];

  function parseLs(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveLs(key, obj) {
    try {
      localStorage.setItem(key, JSON.stringify(obj));
      return true;
    } catch (e) {
      return false;
    }
  }

  function partAToBiz(a) {
    if (!a || typeof a !== 'object') return null;
    return {
      name: a.name || '',
      company: a.bizName || a.name || '',
      site: a.site || '',
      website: a.site || '',
      campaignType: a.campaignType || '',
      updatedAt: a.ts || new Date().toISOString(),
      _cocoPhase0: true,
    };
  }

  function bizToPartA(biz) {
    if (!biz || typeof biz !== 'object') return null;
    return {
      name: biz.name || biz.contact_person || '',
      bizName: biz.company || biz.name || '',
      site: biz.site || biz.website || '',
      campaignType: biz.campaignType || '',
      ts: biz.updatedAt || new Date().toISOString(),
    };
  }

  function mergePartA(existing, patch) {
    return Object.assign({}, existing || {}, patch || {});
  }

  function syncPartAToBiz() {
    var a = parseLs(KEYS.partA);
    if (!a) return null;
    var biz = parseLs(KEYS.biz) || {};
    var merged = Object.assign({}, biz, partAToBiz(a));
    saveLs(KEYS.biz, merged);
    return merged;
  }

  function syncBizToPartA() {
    var biz = parseLs(KEYS.biz);
    if (!biz) return null;
    var a = parseLs(KEYS.partA) || {};
    var mapped = bizToPartA(biz);
    if (!a.ts && mapped.ts) a.ts = mapped.ts;
    if (!a.name && mapped.name) a.name = mapped.name;
    if (!a.bizName && mapped.bizName) a.bizName = mapped.bizName;
    if (!a.site && mapped.site) a.site = mapped.site;
    if (!a.campaignType && mapped.campaignType) a.campaignType = mapped.campaignType;
    saveLs(KEYS.partA, a);
    return a;
  }

  function loadFromMarketingApi(customerId) {
    var api = window.MarketingApi;
    if (!api || typeof api.canRemote !== 'function' || !api.canRemote()) {
      return Promise.resolve(null);
    }
    var id = customerId || new URLSearchParams(location.search).get('customer');
    if (!id) return Promise.resolve(null);
    return api.loadBundle(id).then(function (bundle) {
      if (!bundle || !bundle.customer) return null;
      var c = bundle.customer;
      var sites = bundle.sites || [];
      var siteUrl = '';
      if (sites[0]) siteUrl = sites[0].url || sites[0].domain || '';
      var camps = bundle.campaigns || [];
      var campType = camps[0] && camps[0].type ? camps[0].type : '';
      var partA = {
        name: c.contact_person || c.name || '',
        bizName: c.name || '',
        site: siteUrl,
        campaignType: campType,
        ts: new Date().toISOString(),
        _source: 'marketing-api',
      };
      saveLs(KEYS.partA, partA);
      syncPartAToBiz();
      return partA;
    }).catch(function (err) {
      console.warn('[CocoDataAdapter] loadBundle failed', err);
      return null;
    });
  }

  function mergeBriefFromLegacy() {
    if (window.ProjectBrief && typeof ProjectBrief.mergeFromLegacy === 'function') {
      return ProjectBrief.mergeFromLegacy();
    }
    return null;
  }

  function onStorage(e) {
    if (!e || !e.key) return;
    if (e.key === KEYS.partA) syncPartAToBiz();
    if (e.key === KEYS.biz) syncBizToPartA();
    if (BRIEF_WATCH_KEYS.indexOf(e.key) >= 0) mergeBriefFromLegacy();
  }

  function initAuthListener() {
    window.addEventListener('message', function (e) {
      var data = e.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'dalia-coco-auth') {
        window.COCO_STAGING = data;
        if (window.CocoDataAdapter && CocoDataAdapter.onAuthReady) CocoDataAdapter.onAuthReady();
      }
      if (data.type === 'dalia-coco-scope') {
        window.COCO_SCOPE = data;
      }
      if (data.type === 'dalia-coco-open-customer' && data.customerId) {
        if (window.CocoDataAdapter) CocoDataAdapter.loadFromApi(data.customerId);
      }
    });
    if (window.parent !== window) {
      try {
        window.parent.postMessage({ type: 'dalia-coco-ready' }, '*');
      } catch (err) { /* ignore */ }
    }
    if (window.COCO_STAGING && window.COCO_STAGING.accessToken) {
      loadFromMarketingApi();
    }
  }

  window.CocoDataAdapter = {
    KEYS: KEYS,
    readPartA: function () { return parseLs(KEYS.partA); },
    readBiz: function () { return parseLs(KEYS.biz); },
    writePartA: function (data) {
      var next = mergePartA(parseLs(KEYS.partA), data);
      saveLs(KEYS.partA, next);
      syncPartAToBiz();
      mergeBriefFromLegacy();
      return next;
    },
    syncPartAToBiz: syncPartAToBiz,
    syncBizToPartA: syncBizToPartA,
    mergeBriefFromLegacy: mergeBriefFromLegacy,
    loadFromApi: loadFromMarketingApi,
    onAuthReady: function () {
      var id = new URLSearchParams(location.search).get('customer');
      return loadFromMarketingApi(id);
    },
  };

  syncBizToPartA();
  syncPartAToBiz();
  mergeBriefFromLegacy();
  window.addEventListener('storage', onStorage);
  initAuthListener();
})();
