/**
 * Filter Entity Index — lazy-loaded normalized indexes for clients/campaigns/assets/pages.
 * Supports pagination for large page sets (thousands+).
 */
(function () {
  'use strict';

  var INDEX_BASE = 'marketing-index/';
  var state = {
    loaded: false,
    loading: null,
    clients: [],
    campaignsByClient: {},
    assetsByCampaign: {},
    pagesByAsset: {},
    meta: { version: 0, generatedAt: null },
  };

  var PAGE_CHUNK = 50;

  function baseUrl() {
    var b = window.COCO_PAGES_BASE || '/future-craft-core/';
    if (b.charAt(0) !== '/') b = '/' + b.replace(/^\.\//, '');
    return location.origin + b + INDEX_BASE;
  }

  function fetchJson(name) {
    var url = baseUrl() + name + '?t=' + Date.now();
    return fetch(url, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  function registerClient(client) {
    if (!client || !client.id) return;
    var exists = state.clients.some(function (c) { return c.id === client.id; });
    if (!exists) state.clients.push(client);
  }

  function registerCampaign(clientId, campaign) {
    if (!clientId || !campaign || !campaign.id) return;
    if (!state.campaignsByClient[clientId]) state.campaignsByClient[clientId] = [];
    if (!state.campaignsByClient[clientId].some(function (c) { return c.id === campaign.id; })) {
      state.campaignsByClient[clientId].push(campaign);
    }
  }

  function registerAsset(campaignId, asset) {
    if (!campaignId || !asset || !asset.id) return;
    if (!state.assetsByCampaign[campaignId]) state.assetsByCampaign[campaignId] = [];
    if (!state.assetsByCampaign[campaignId].some(function (a) { return a.id === asset.id; })) {
      state.assetsByCampaign[campaignId].push(asset);
    }
  }

  function registerPages(assetId, pages) {
    if (!assetId || !pages) return;
    state.pagesByAsset[assetId] = {
      total: pages.total != null ? pages.total : (pages.pages || pages).length,
      pages: pages.pages || pages,
    };
  }

  function bootstrapFromSsot() {
    var off = window.ClientIdSsot && ClientIdSsot.OFFICIAL;
    var camp = window.ClientIdSsot && ClientIdSsot.PRIMARY_CAMPAIGN;
    if (off) {
      registerClient({
        id: off.clientId,
        name: off.company,
        slug: off.slug || off.clientId,
        status: 'active',
      });
    }
    if (off && camp) {
      registerCampaign(off.clientId, {
        id: camp.id,
        name: camp.name,
        activityType: camp.channel || camp.type || 'seo',
        status: camp.status || 'active',
        clientId: off.clientId,
      });
      registerAsset(camp.id, {
        id: 'asset-dalia-c-com',
        type: 'website',
        label: off.domain,
        domain: off.domain,
        url: off.url,
        status: 'active',
        clientId: off.clientId,
        campaignId: camp.id,
      });
    }
    if (window.AssetFlowSsot && AssetFlowSsot.getAssets) {
      AssetFlowSsot.getAssets().forEach(function (a) {
        var cid = camp && camp.id;
        if (cid) registerAsset(cid, a);
      });
    }
  }

  function load() {
    if (state.loaded) return Promise.resolve(state);
    if (state.loading) return state.loading;

    bootstrapFromSsot();

    state.loading = Promise.all([
      fetchJson('clients-index.json'),
      fetchJson('campaigns-by-client.json'),
      fetchJson('assets-by-campaign.json'),
      fetchJson('pages-by-asset.json'),
    ]).then(function (results) {
      var clientsDoc = results[0];
      var campsDoc = results[1];
      var assetsDoc = results[2];
      var pagesDoc = results[3];

      if (clientsDoc && clientsDoc.clients) {
        state.clients = clientsDoc.clients;
        state.meta.version = clientsDoc.version || 1;
        state.meta.generatedAt = clientsDoc.generatedAt;
      }
      if (campsDoc) state.campaignsByClient = Object.assign(state.campaignsByClient, campsDoc);
      if (assetsDoc) state.assetsByCampaign = Object.assign(state.assetsByCampaign, assetsDoc);
      if (pagesDoc) state.pagesByAsset = Object.assign(state.pagesByAsset, pagesDoc);

      state.loaded = true;
      state.loading = null;
      return state;
    }).catch(function () {
      state.loaded = true;
      state.loading = null;
      return state;
    });

    return state.loading;
  }

  function getClients() {
    return state.clients.slice();
  }

  function getCampaigns(clientId) {
    if (!clientId) return [];
    return (state.campaignsByClient[clientId] || []).slice();
  }

  function getAssets(campaignId) {
    if (!campaignId) return [];
    return (state.assetsByCampaign[campaignId] || []).slice();
  }

  function getPages(assetId, opts) {
    opts = opts || {};
    var bucket = state.pagesByAsset[assetId];
    if (!bucket) return { total: 0, pages: [] };
    var all = bucket.pages || [];
    var offset = opts.offset || 0;
    var limit = opts.limit || PAGE_CHUNK;
    return {
      total: bucket.total != null ? bucket.total : all.length,
      pages: all.slice(offset, offset + limit),
    };
  }

  function searchPages(assetId, query, limit) {
    limit = limit || 20;
    query = String(query || '').toLowerCase().trim();
    var bucket = state.pagesByAsset[assetId];
    if (!bucket || !query) return [];
    return (bucket.pages || []).filter(function (p) {
      var blob = [p.id, p.path, p.title, p.url].join(' ').toLowerCase();
      return blob.indexOf(query) !== -1;
    }).slice(0, limit);
  }

  function findClient(id) {
    return state.clients.find(function (c) { return c.id === id; }) || null;
  }

  function findCampaign(clientId, campaignId) {
    return getCampaigns(clientId).find(function (c) { return c.id === campaignId; }) || null;
  }

  function findAsset(campaignId, assetId) {
    return getAssets(campaignId).find(function (a) { return a.id === assetId; }) || null;
  }

  function findPage(assetId, pageId) {
    var bucket = state.pagesByAsset[assetId];
    if (!bucket) return null;
    return (bucket.pages || []).find(function (p) { return p.id === pageId; }) || null;
  }

  function validateContext(ctx) {
    var issues = [];
    if (ctx.clientId && !findClient(ctx.clientId)) {
      issues.push({ field: 'clientId', code: 'unknown_client', id: ctx.clientId });
    }
    if (ctx.clientId && ctx.campaignId && !findCampaign(ctx.clientId, ctx.campaignId)) {
      issues.push({ field: 'campaignId', code: 'campaign_not_for_client', id: ctx.campaignId });
    }
    if (ctx.campaignId && ctx.assetId && !findAsset(ctx.campaignId, ctx.assetId)) {
      issues.push({ field: 'assetId', code: 'asset_not_for_campaign', id: ctx.assetId });
    }
    if (ctx.assetId && ctx.subCategory && ctx.subCategory.id) {
      var p = findPage(ctx.assetId, ctx.subCategory.id);
      if (!p && state.pagesByAsset[ctx.assetId]) {
        issues.push({ field: 'subCategory', code: 'page_not_for_asset', id: ctx.subCategory.id });
      }
    }
    return { ok: issues.length === 0, issues: issues };
  }

  window.FilterEntityIndex = {
    PAGE_CHUNK: PAGE_CHUNK,
    load: load,
    getClients: getClients,
    getCampaigns: getCampaigns,
    getAssets: getAssets,
    getPages: getPages,
    searchPages: searchPages,
    findClient: findClient,
    findCampaign: findCampaign,
    findAsset: findAsset,
    findPage: findPage,
    validateContext: validateContext,
    registerClient: registerClient,
    registerCampaign: registerCampaign,
    registerAsset: registerAsset,
    registerPages: registerPages,
    isLoaded: function () { return state.loaded; },
    getMeta: function () { return Object.assign({}, state.meta); },
  };
})();
