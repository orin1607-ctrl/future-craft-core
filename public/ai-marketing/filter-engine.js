/**
 * Filter Engine — single filtering SSOT for all screens (Phase B: full scope + specificItem).
 */
(function () {
  'use strict';

  function getContext() {
    if (window.GlobalFilterContext && GlobalFilterContext.get) {
      return GlobalFilterContext.get();
    }
    return (window.COCO && COCO.flowContext) || {};
  }

  function contextHash(c) {
    c = c || getContext();
    var sub = c.subCategory;
    var si = c.specificItem;
    return [
      c.clientId, c.activityType, c.campaignId || c.campaign,
      c.assetId, c.interfaceId, sub && sub.id, si && si.id,
      c.dateRange && c.dateRange.preset, c.status, c.freeSearch,
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

  function isPageKind(id) {
    return window.FilterTaxonomy && FilterTaxonomy.isPageKind
      ? FilterTaxonomy.isPageKind(id)
      : ['home', 'service', 'article', 'product', 'category', 'other'].indexOf(id) >= 0;
  }

  function statusMatches(itemStatus, filterStatus) {
    if (!filterStatus) return true;
    var s = norm(itemStatus);
    var f = norm(filterStatus);
    if (f === 'active' && /active|connected|פעיל/.test(s)) return true;
    if (f === 'pending' && /pending|ממתין|review|draft/.test(s)) return true;
    if (f === 'in_progress' && /in_progress|progress|בביצוע/.test(s)) return true;
    if (f === 'done' && /done|completed|הושלם|בוצע/.test(s)) return true;
    if (f === 'paused' && /paused|נעצר|מושהה/.test(s)) return true;
    if (f === 'error' && /error|fail|שגיאה/.test(s)) return true;
    return matchFilter(itemStatus, filterStatus);
  }

  function specificItemMatches(itemMeta, c) {
    var si = c.specificItem;
    if (!si || !si.id) return true;
    if (si.type === 'page' || itemMeta.pageId) {
      if (itemMeta.pageId && itemMeta.pageId === si.id) return true;
      if (itemMeta.pagePath && si.path && itemMeta.pagePath === si.path) return true;
      if (itemMeta.pagePath && si.path && si.path !== '/' && norm(itemMeta.pagePath).indexOf(norm(si.path)) >= 0) return true;
      if (itemMeta.page && (itemMeta.page === si.path || itemMeta.page === si.id)) return true;
      return false;
    }
    if (itemMeta.entityId) return itemMeta.entityId === si.id;
    if (itemMeta.id) return itemMeta.id === si.id;
    return true;
  }

  function subCategoryMatches(itemMeta, c) {
    var sub = c.subCategory;
    if (!sub || !sub.id) return true;
    if (isPageKind(sub.id)) {
      if (!itemMeta.pageKind) return true;
      return itemMeta.pageKind === sub.id;
    }
    if (sub.matchType === 'page') {
      if (itemMeta.pageId && itemMeta.pageId === sub.id) return true;
      if (itemMeta.pagePath && sub.path && itemMeta.pagePath === sub.path) return true;
      return false;
    }
    return true;
  }

  function pageMatches(itemMeta, c) {
    if (c.specificItem && c.specificItem.id) return specificItemMatches(itemMeta, c);
    return subCategoryMatches(itemMeta, c);
  }

  function clientMatches(itemMeta, c) {
    if (!c.clientId) return true;
    if (itemMeta.clientId && itemMeta.clientId === c.clientId) return true;
    if (itemMeta.customerId && itemMeta.customerId === c.clientId) return true;
    if (itemMeta.clientId && matchFilter(itemMeta.clientId, c.clientId)) return true;
    if (window.ClientIdSsot && ClientIdSsot.isOfficialClientId(c.clientId) && itemMeta.officialClient) return true;
    if (!itemMeta.clientId && !itemMeta.customerId) {
      if (window.ClientIdSsot && ClientIdSsot.isOfficialClientId(c.clientId)) return true;
      return false;
    }
    return false;
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

  function interfaceMatches(itemMeta, c) {
    if (!c.interfaceId) return true;
    var src = itemMeta.source || itemMeta.channel || itemMeta.interface || itemMeta.interfaceId || '';
    if (window.FilterTaxonomy && FilterTaxonomy.interfaceMatchesSource) {
      return FilterTaxonomy.interfaceMatchesSource(c.interfaceId, src);
    }
    return matchFilter(src, c.interfaceId);
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

  function dateMatches(itemMeta, c, opts) {
    opts = opts || {};
    var dr = c.dateRange;
    if (!dr || !dr.preset) return true;
    if (opts.skipDefaultMonth && dr.preset === 'month' && !dr.from && !dr.to) return true;
    var itemDate = itemMeta.date || itemMeta.createdAt || itemMeta.updatedAt;
    if (!itemDate) return true;
    try {
      var d = new Date(itemDate);
      if (isNaN(d.getTime())) return true;
      var now = new Date();
      if (dr.preset === 'today') return d.toDateString() === now.toDateString();
      if (dr.preset === 'week') return d >= new Date(now.getTime() - 7 * 86400000);
      if (dr.preset === 'month') return d >= new Date(now.getTime() - 30 * 86400000);
      if (dr.preset === 'custom' && dr.from) {
        var from = new Date(dr.from);
        var to = dr.to ? new Date(dr.to) : now;
        return d >= from && d <= to;
      }
    } catch (e) { /* ignore */ }
    return true;
  }

  function hasUserScope(c) {
    return !!(
      (c.specificItem && c.specificItem.id) ||
      (c.subCategory && c.subCategory.id) ||
      c.status ||
      (c.freeSearch && c.freeSearch.trim()) ||
      (c.dateRange && c.dateRange.preset && c.dateRange.preset !== 'month') ||
      (c.dateRange && c.dateRange.preset === 'custom' && (c.dateRange.from || c.dateRange.to))
    );
  }

  function matches(item, itemMeta) {
    var c = getContext();
    itemMeta = itemMeta || {};
    if (!freeSearchMatches(item, itemMeta, c)) return false;
    if (!clientMatches(itemMeta, c)) return false;
    if (!activityMatches(itemMeta, c)) return false;
    if (!campaignMatches(itemMeta, c)) return false;
    if (!assetMatches(itemMeta, c)) return false;
    if (!interfaceMatches(itemMeta, c)) return false;
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
    var liveMode = window.DaliaSite && DaliaSite.isLiveOnly && DaliaSite.isLiveOnly();

    if (liveMode && !hasUserScope(c)) {
      var freeOnly = (c.freeSearch || '').trim().toLowerCase();
      var isOfficialClient = !c.clientId || (window.ClientIdSsot && ClientIdSsot.isOfficialClientId(c.clientId));
      if (isOfficialClient && !freeOnly) return items;
      return items.filter(function (item) {
        var meta = mapFn(item);
        if (!isOfficialClient && !clientMatches(meta, c)) return false;
        if (!isOfficialClient && (c.campaignId || c.campaign) && !campaignMatches(meta, c)) return false;
        if (freeOnly && JSON.stringify(item).toLowerCase().indexOf(freeOnly) < 0) return false;
        return true;
      });
    }

    if (liveMode && hasUserScope(c)) {
      return items.filter(function (item) {
        var meta = mapFn(item);
        if (!freeSearchMatches(item, meta, c)) return false;
        if (c.specificItem && c.specificItem.id && !specificItemMatches(meta, c)) return false;
        if (c.subCategory && c.subCategory.id && !subCategoryMatches(meta, c)) return false;
        if (c.status && meta.status && !statusMatches(meta.status, c.status)) return false;
        if (!dateMatches(meta, c, { skipDefaultMonth: true })) return false;
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
    if (c.interfaceId) base.interfaceId = c.interfaceId;
    if (c.subCategory && c.subCategory.id) base.subCategoryId = c.subCategory.id;
    if (c.specificItem && c.specificItem.id) base.specificItemId = c.specificItem.id;
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
    hasUserScope: hasUserScope,
    specificItemMatches: specificItemMatches,
    subCategoryMatches: subCategoryMatches,
  };
})();
