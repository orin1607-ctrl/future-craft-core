/**
 * CO.CO דליה — Auth Bridge (Phase 3)
 * postMessage auth from Dalia parent → COCO_STAGING → read-only API refresh.
 * No writes to Supabase from this module.
 */
(function () {
  'use strict';

  var VERSION = '3.0.0-auth-readonly';
  var _ready = false;
  var _listeners = [];

  function emitAuthReady() {
    _listeners.forEach(function (fn) {
      try { fn(window.COCO_STAGING); } catch (e) { console.warn('[CocoAuthBridge]', e); }
    });
    try {
      window.dispatchEvent(new CustomEvent('coco:auth-ready', { detail: window.COCO_STAGING || null }));
    } catch (e2) { /* ignore */ }
    if (window.CocoDaliaIntegration && CocoDaliaIntegration.refreshFromApis && window.DATA) {
      CocoDaliaIntegration.refreshFromApis(window.DATA, { onRefresh: window._cocoV5RenderAll });
    } else if (window.CocoDaliaIntegration && CocoDaliaIntegration.refreshFromApis) {
      CocoDaliaIntegration.refreshFromApis({}, {});
    }
  }

  function onMessage(e) {
    var data = e.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'dalia-coco-auth') {
      window.COCO_STAGING = data;
      if (window.CocoDataAdapter && CocoDataAdapter.onAuthReady) {
        CocoDataAdapter.onAuthReady();
      }
      emitAuthReady();
    }
    if (data.type === 'dalia-coco-scope') {
      window.COCO_SCOPE = data;
    }
    if (data.type === 'dalia-coco-open-customer' && data.customerId) {
      if (window.CocoDataAdapter && CocoDataAdapter.loadFromApi) {
        CocoDataAdapter.loadFromApi(data.customerId).then(emitAuthReady);
      }
    }
  }

  function onAuth(fn) {
    if (typeof fn === 'function') _listeners.push(fn);
    if (window.COCO_STAGING && window.COCO_STAGING.accessToken) {
      try { fn(window.COCO_STAGING); } catch (e) { /* ignore */ }
    }
    return function () {
      _listeners = _listeners.filter(function (f) { return f !== fn; });
    };
  }

  function init() {
    if (_ready) return;
    _ready = true;
    window.addEventListener('message', onMessage);
    if (window.parent !== window) {
      try {
        window.parent.postMessage({ type: 'dalia-coco-ready' }, '*');
      } catch (e) { /* ignore */ }
    }
    if (window.COCO_STAGING && window.COCO_STAGING.accessToken) {
      emitAuthReady();
    }
  }

  function hasAuth() {
    var c = window.COCO_STAGING || {};
    return !!(c.supabaseUrl && c.anonKey && c.accessToken);
  }

  window.CocoDaliaAuthBridge = {
    VERSION: VERSION,
    init: init,
    onAuth: onAuth,
    hasAuth: hasAuth,
    emitAuthReady: emitAuthReady,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
