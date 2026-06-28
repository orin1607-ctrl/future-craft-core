/**
 * Filter Engine — single filtering SSOT for all screens.
 * Reads context from GlobalFilterContext (v3) with legacy COCO.flowContext fallback.
 */
(function () {
  'use strict';

  var _matchMemo = { hash: null, fn: null };

  function getContext() {
    if (window.GlobalFilterContext && GlobalFilterContext.get) {
      return GlobalFilterContext.get();
    }
    return (window.COCO && COCO.flowContext) || {};
  }

  function contextHash(c) {
    c = c || getContext();
    var sub = c.subCategory;
    return [
      c.clientId, c.activityType, c.campaignId || c.campaign,
      c.assetId, sub && (sub.id || sub.path), c.dateRange && c.dateRange.preset,
      c.status, c.freeSearch, c.serviceType, c.customerStatus,
      c.site, c.channel, c.page,
    ].join('\u001f');
  }

  function norm(s) {
    return String(s == null ? '' : s).toLowerCase().trim();
  }

  function matchFilter(val, filterVal) {
    if (!filterVal) return true;
    if (val == null || val === '') return false;
    var a = norm(val);
    var b = norm(filterVal);
    return a.indexOf(b) !== -1 || b.indexOf(a) !== -1;
  }

  function statusMatches(itemStatus, filterStatus) {
    if (!filterStatus) return true;
    var s = norm(itemStatus);
    var f = norm(filterStatus);
    if (f === 'active' && /active|connected|פעיל/.test(s)) return true;
    if (f === 'pending' && /pending|ממתין|review|draft/.test(s)) return true;
    if (f === 'in_progress' && /in_progress|progress|בביצוע|active/.test(s)) return true;
    if (f === 'done' && /done|completed|הושלם|בוצע/.test(s)) return true;
    if (f === 'paused' && /paused|נעצר|מושהה/.test(s)) return true;
    if (f === 'error' && /error|fail|שגיאה/.test(s)) return true;
    return matchFilter(itemStatus, filterStatus);
  }

  function pageMatches(itemMeta, c) {
    var sub = c.subCategory;
    if (sub && sub.id) {
      if (itemMeta.pageId && itemMeta.pageId === sub.id) return true;
      if (itemMeta.page && (itemMeta.page === sub.path || itemMeta.page === sub.label)) return true;
      if (sub.path && itemMeta.pagePath === sub.path) return true;
      return false;
    }
    if (c.page && itemMeta.page) return matchFilter(itemMeta.page, c.page);
    return true;
  }

  function clientMatches(itemMeta, c) {
    if (!c.clientId) return true;
    if (itemMeta.clientId) return itemMeta.clientId === c.clientId;
    return true;
  }

  function campaignMatches(itemMeta, c) {
    var camp = c.campaignId || c.campaign;
    if (!camp) return true;
    if (itemMeta.campaignId) return matchFilter(itemMeta.campaignId, camp);
    if (itemMeta.campaign) return matchFilter(itemMeta.campaign, camp);
    return true;
  }

  function assetMatches(itemMeta, c) {
    if (!c.assetId && !c.assetLabel && !c.site && !c.domain) return true;
    var dom = c.assetLabel || c.site || c.domain;
    if (itemMeta.assetId && c.assetId) return itemMeta.assetId === c.assetId;
    if (itemMeta.site && dom) return matchFilter(itemMeta.site, dom);
    if (itemMeta.domain && dom) return matchFilter(itemMeta.domain, dom);
    if (itemMeta.pageUrl && dom) return norm(itemMeta.pageUrl).indexOf(norm(dom)) !== -1;
    return true;
  }

  function activityMatches(itemMeta, c) {
    if (!c.activityType) return true;
    if (itemMeta.activityType) return itemMeta.activityType === c.activityType;
    if (itemMeta.channel) return matchFilter(itemMeta.channel, c.activityType);
    if (itemMeta.category && c.activityType === 'seo') return true;
    return true;
  }

  function freeSearchMatches(item, itemMeta, c) {
    var free = (c.freeSearch || '').trim().toLowerCase();
    if (!free) return true;
    var blob = JSON.stringify(item).toLowerCase();
    if (blob.indexOf(free) !== -1) return true;
    if (itemMeta && JSON.stringify(itemMeta).toLowerCase().indexOf(free) !== -1) return true;
    return false;
  }

  function dateMatches(itemMeta, c) {
    var dr = c.dateRange;
    if (!dr || !dr.preset || dr.preset === 'custom' && !dr.from && !dr.to) return true;
    var itemDate = itemMeta.date || itemMeta.createdAt || itemMeta.updatedAt;
    if (!itemDate) return true;
    try {
      var d = new Date(itemDate);
      if (isNaN(d.getTime())) return true;
      var now = new Date();
      if (dr.preset === 'today') {
        return d.toDateString() === now.toDateString();
      }
      if (dr.preset === 'week') {
        var weekAgo = new Date(now.getTime() - 7 * 86400000);
        return d >= weekAgo;
      }
      if (dr.preset === 'month') {
        var monthAgo = new Date(now.getTime() - 30 * 86400000);
        return d >= monthAgo;
      }
      if (dr.preset === 'custom' && dr.from) {
        var from = new Date(dr.from);
        var to = dr.to ? new Date(dr.to) : now;
        return d >= from && d <= to;
      }
    } catch (e) { /* ignore */ }
    return true;
  }

  /**
   * @param {object} item — data row
   * @param {object} itemMeta — normalized fields from mapFn(item)
   */
  function matches(item, itemMeta) {
    var c = getContext();
    itemMeta = itemMeta || {};
    if (!freeSearchMatches(item, itemMeta, c)) return false;
    if (!clientMatches(itemMeta, c)) return false;
    if (!activityMatches(itemMeta, c)) return false;
    if (!campaignMatches(itemMeta, c)) return false;
    if (!assetMatches(itemMeta, c)) return false;
    if (!pageMatches(itemMeta, c)) return false;
    if (c.serviceType && itemMeta.serviceType && !matchFilter(itemMeta.serviceType, c.serviceType)) return false;
    if (c.customerStatus && itemMeta.customerStatus && !matchFilter(itemMeta.customerStatus, c.customerStatus)) return false;
    if (c.channel && itemMeta.channel && !matchFilter(itemMeta.channel, c.channel)) return false;
    if (c.status && itemMeta.status && !statusMatches(itemMeta.status, c.status)) return false;
    if (c.goal && itemMeta.goal && !matchFilter(itemMeta.goal, c.goal)) return false;
    if (c.action && itemMeta.action && !matchFilter(itemMeta.action, c.action)) return false;
    if (!dateMatches(itemMeta, c)) return false;
    return true;
  }

  function filter(items, mapFn) {
    if (!Array.isArray(items)) return [];
    mapFn = mapFn || function () { return {}; };
    var c = getContext();
    var hash = contextHash(c);
    var liveOnlyFreeSearch = window.DaliaSite && DaliaSite.isLiveOnly && DaliaSite.isLiveOnly();
    var free = (c.freeSearch || '').trim().toLowerCase();
    var hasPageScope = c.subCategory && c.subCategory.id;

    if (liveOnlyFreeSearch) {
      if (!free && !hasPageScope) return items;
      return items.filter(function (item) {
        var meta = mapFn(item);
        if (free && JSON.stringify(item).toLowerCase().indexOf(free) === -1) return false;
        if (hasPageScope && !pageMatches(meta, c)) return false;
        return true;
      });
    }

    return items.filter(function (item) {
      return matches(item, mapFn(item));
    });
  }

  function scopeQuery(base) {
    var c = getContext();
    base = base || {};
    if (c.clientId) base.clientId = c.clientId;
    if (c.activityType) base.activityType = c.activityType;
    if (c.campaignId || c.campaign) base.campaignId = c.campaignId || c.campaign;
    if (c.assetId) base.assetId = c.assetId;
    if (c.subCategory && c.subCategory.id) base.pageId = c.subCategory.id;
    if (c.status) base.status = c.status;
    if (c.dateRange) base.dateRange = c.dateRange;
    if (c.freeSearch) base.q = c.freeSearch;
    return base;
  }

  window.FilterEngine = {
    getContext: getContext,
    contextHash: contextHash,
    matchFilter: matchFilter,
    matches: matches,
    filter: filter,
    scopeQuery: scopeQuery,
  };
})();
