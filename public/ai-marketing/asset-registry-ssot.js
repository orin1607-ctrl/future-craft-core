/**
 * AssetRegistry SSOT — Multi-Asset platform (N unlimited).
 * No first/second/third logic. Every asset is a first-class citizen.
 */
(function (global) {
  'use strict';

  var STORAGE_ACTIVE = 'coco-active-asset-v1';
  var STORAGE_COMPARE = 'coco-compare-assets-v1';
  var STORAGE_MODE = 'coco-asset-mode-v1';
  var STORAGE_EXTRA = 'coco-extra-assets-v1';
  var STORAGE_MOCK4 = 'coco-mock-asset-4-v1';

  var SEED_ASSETS = [
    {
      id: 'dalia-c-com',
      type: 'website',
      icon: '🌐',
      label: 'dalia-c.com — האתר הישן',
      shortLabel: 'dalia-c.com',
      role: 'האתר הישן',
      domain: 'dalia-c.com',
      url: 'https://dalia-c.com/',
      mySiteUrl: 'https://dalia-c.com/',
      gsc: 'https://dalia-c.com/',
      ga4: 'properties/545246030',
      measurementId: 'G-73K6EDC6LV',
      gtm: 'GTM-P5BWSBR',
      status: 'live',
      live: true,
      clientId: 'dalia-c-official',
      campaignId: 'campaign-dalia-seo-primary',
      campaignName: 'דליה — קידום dalia-c.com',
      dataNote: 'GSC LIVE · GA4 LIVE · GTM LIVE',
    },
    {
      id: 'dalia-car-app',
      type: 'app',
      icon: '📱',
      label: 'אפליקציית דליה',
      shortLabel: 'אפליקציית דליה',
      role: 'אפליקציית דליה (SPA)',
      domain: 'dalia-car.online',
      url: 'https://dalia-car.online/',
      mySiteUrl: 'https://dalia-car.online/',
      gsc: 'https://dalia-car.online/',
      ga4: 'properties/545217370',
      measurementId: 'G-KGTK4YCD8F',
      gtm: 'GTM-KFMHS49G',
      status: 'live',
      live: true,
      clientId: 'dalia-c-official',
      campaignId: 'campaign-dalia-car-app',
      campaignName: 'דליה — אפליקציה',
      dataNote: 'אפליקציה LIVE · GSC/GA4 בחימום נפח',
    },
    {
      id: 'dalia-brand-site',
      type: 'website',
      icon: '🏠',
      label: 'אתר התדמית החדש',
      shortLabel: 'אתר התדמית החדש',
      role: 'אתר תדמית',
      domain: 'dalia-car.online/site',
      url: 'https://dalia-car.online/site/',
      mySiteUrl: 'https://dalia-car.online/site/',
      gsc: 'https://dalia-car.online/site/',
      ga4: 'properties/545281140',
      measurementId: 'G-KYDLXY9C39',
      gtm: 'GTM-KH38DZ6J',
      websiteId: 'e9b2bbf1-1276-4fce-8756-99060a47a44e',
      customerId: 'e244b5af-2778-4ca1-93c8-b4fa7c2f144e',
      status: 'live',
      live: true,
      clientId: 'dalia-c-official',
      campaignId: 'campaign-dalia-brand-site',
      campaignName: 'דליה — אתר תדמית',
      dataNote: 'GA4 LIVE · GSC LIVE · GTM container created (publish Pending scope) · Supabase website_id bound',
      providers: {
        ga4: 'live',
        gtm: 'pending_publish',
        gsc: 'live',
        gbp: 'live_read',
        ads: 'pending',
        pagespeed: 'quota',
      },
    },
  ];

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJson(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {}
  }

  function clone(a) {
    return JSON.parse(JSON.stringify(a));
  }

  function readExtras() {
    var list = readJson(STORAGE_EXTRA, []);
    return Array.isArray(list) ? list : [];
  }

  function writeExtras(list) {
    writeJson(STORAGE_EXTRA, list);
  }

  function mockFourthAsset() {
    if (!readJson(STORAGE_MOCK4, false)) return null;
    return {
      id: 'mock-asset-4-regression',
      type: 'website',
      icon: '🧪',
      label: 'נכס רביעי מדומה (בדיקת N)',
      shortLabel: 'Mock Asset 4',
      role: 'רגרסיית Multi-Asset',
      domain: 'mock-asset-4.local',
      url: 'https://dalia-car.online/site/?mock=4',
      mySiteUrl: 'https://dalia-car.online/site/?mock=4',
      gsc: null,
      ga4: null,
      measurementId: null,
      gtm: null,
      status: 'pending',
      live: false,
      clientId: 'dalia-c-official',
      campaignId: 'campaign-mock-4',
      campaignName: 'Mock regression',
      dataNote: 'Mock — בדיקת תמיכה ב-N נכסים',
      isMock: true,
    };
  }

  function list(customerId) {
    var cid = customerId || 'dalia-c-official';
    var base = SEED_ASSETS.filter(function (a) {
      return !cid || a.clientId === cid;
    }).map(clone);
    var extras = readExtras().filter(function (a) {
      return !cid || !a.clientId || a.clientId === cid;
    });
    var out = base.concat(extras);
    var mock = mockFourthAsset();
    if (mock) out.push(mock);
    var overlay = readJson('coco-asset-google-ids-v1', {});
    out.forEach(function (a) {
      var o = overlay[a.id];
      if (!o) return;
      if (o.ga4) a.ga4 = o.ga4;
      if (o.measurementId) a.measurementId = o.measurementId;
      if (o.gtm) a.gtm = o.gtm;
      if (o.gsc) a.gsc = o.gsc;
      if (o.status) a.status = o.status;
      if (o.dataNote) a.dataNote = o.dataNote;
      if (o.measurementId && o.gtm) {
        a.status = 'live';
        a.live = true;
      }
    });
    return out;
  }

  function get(assetId) {
    return list().filter(function (a) { return a.id === assetId; })[0] || null;
  }

  function getActiveId() {
    try {
      return localStorage.getItem(STORAGE_ACTIVE) || list()[0].id;
    } catch (e) {
      return list()[0].id;
    }
  }

  function getActive() {
    return get(getActiveId()) || list()[0];
  }

  function setActive(assetId) {
    if (!get(assetId)) return false;
    try {
      localStorage.setItem(STORAGE_ACTIVE, assetId);
    } catch (e) {}
    syncFlowContext(get(assetId));
    try {
      document.dispatchEvent(new CustomEvent('coco-asset-changed', { detail: { assetId: assetId } }));
    } catch (e2) {}
    return true;
  }

  function getMode() {
    return localStorage.getItem(STORAGE_MODE) || 'single';
  }

  function setMode(mode) {
    if (['single', 'compare', 'portfolio'].indexOf(mode) < 0) mode = 'single';
    try {
      localStorage.setItem(STORAGE_MODE, mode);
    } catch (e) {}
    return mode;
  }

  function getSelectedForCompare() {
    var ids = readJson(STORAGE_COMPARE, []);
    if (!Array.isArray(ids) || !ids.length) return [getActiveId()];
    return ids.filter(function (id) { return !!get(id); });
  }

  function setSelectedForCompare(ids) {
    if (!Array.isArray(ids)) ids = [];
    var clean = ids.filter(function (id) { return !!get(id); });
    writeJson(STORAGE_COMPARE, clean);
    return clean;
  }

  function add(assetDraft) {
    if (!assetDraft || !assetDraft.id || !assetDraft.url) {
      throw new Error('Asset requires id and url');
    }
    if (get(assetDraft.id)) {
      throw new Error('Asset already exists: ' + assetDraft.id);
    }
    var asset = Object.assign({
      type: 'website',
      icon: '🌐',
      status: 'pending',
      live: false,
      clientId: 'dalia-c-official',
      mySiteUrl: assetDraft.url,
      providers: {},
    }, assetDraft);
    var extras = readExtras();
    extras.push(asset);
    writeExtras(extras);
    return asset;
  }

  function applyGoogleIds(assetId, ids) {
    var overlay = readJson('coco-asset-google-ids-v1', {});
    overlay[assetId] = Object.assign({}, overlay[assetId] || {}, ids || {});
    writeJson('coco-asset-google-ids-v1', overlay);
    return get(assetId);
  }

  function enableMockFourthAsset(on) {
    writeJson(STORAGE_MOCK4, !!on);
    return list().length;
  }

  function syncFlowContext(asset) {
    if (!asset) return;
    var flow = readJson('coco-flow-context-v2', {});
    writeJson(
      'coco-flow-context-v2',
      Object.assign({}, flow, {
        clientId: asset.clientId,
        site: asset.domain,
        domain: asset.domain,
        url: asset.url,
        assetId: asset.id,
        ga4: asset.ga4,
        measurementId: asset.measurementId,
        gtm: asset.gtm,
        mode: getMode(),
        compareAssetIds: getSelectedForCompare(),
      }),
    );
    writeJson('coco-pirsum-client-v1', {
      clientId: asset.clientId,
      site: asset.domain,
      domain: asset.domain,
      url: asset.url,
      assetId: asset.id,
      ga4: asset.ga4,
      measurementId: asset.measurementId,
      gtm: asset.gtm,
      mySiteUrl: asset.mySiteUrl || asset.url,
    });
    writeJson('coco-pirsum-active-asset-v1', {
      clientId: asset.clientId,
      assetId: asset.id,
      domain: asset.domain,
    });
  }

  function mySiteUrl(asset) {
    var a = asset || getActive();
    return (a && (a.mySiteUrl || a.url)) || '#';
  }

  function aiContext() {
    var assets = list();
    var mode = getMode();
    var compareIds =
      mode === 'portfolio'
        ? assets.map(function (a) { return a.id; })
        : mode === 'compare'
          ? getSelectedForCompare()
          : [getActiveId()];
    return {
      customer_id: 'dalia-c-official',
      assets: assets,
      active_asset_id: getActiveId(),
      compare_asset_ids: compareIds,
      mode: mode,
      providers_by_asset: assets.reduce(function (acc, a) {
        acc[a.id] = a.providers || {
          ga4: a.measurementId ? 'live' : 'pending',
          gtm: a.gtm ? 'live' : 'pending',
          gsc: a.gsc ? 'live' : 'pending',
        };
        return acc;
      }, {}),
    };
  }

  global.AssetRegistry = {
    SEED_ASSETS: SEED_ASSETS,
    list: list,
    get: get,
    getActive: getActive,
    getActiveId: getActiveId,
    setActive: setActive,
    getMode: getMode,
    setMode: setMode,
    getSelectedForCompare: getSelectedForCompare,
    setSelectedForCompare: setSelectedForCompare,
    add: add,
    applyGoogleIds: applyGoogleIds,
    enableMockFourthAsset: enableMockFourthAsset,
    mySiteUrl: mySiteUrl,
    aiContext: aiContext,
    syncFlowContext: syncFlowContext,
  };
})(typeof window !== 'undefined' ? window : globalThis);
