/**
 * CO.CO דליה — Google OAuth Bridge (Staging)
 * Wires "חבר אוטומטית" to real OAuth via Edge marketing-google-oauth.
 */
(function () {
  'use strict';

  var VERSION = '1.0.0';
  var PENDING_KEY = 'coco-google-oauth-pending';

  function staging() {
    return window.COCO_STAGING || {};
  }

  function edgeUrl(name) {
    var s = staging();
    if (s.edgeBase) return s.edgeBase.replace(/\/$/, '') + '/' + name;
    var base = s.supabaseUrl || 'https://usfeoerkpcafxxlyuldl.supabase.co';
    return base.replace(/\/$/, '') + '/functions/v1/' + name;
  }

  function callbackUri() {
    var base = window.COCO_PAGES_BASE || '/future-craft-core/';
    var path = 'oauth/google-callback.html';
    if (base.charAt(0) === '/') return location.origin + base + path;
    try { return new URL(path, base).href; } catch (e) { return location.origin + '/future-craft-core/' + path; }
  }

  function hasSuperAdmin() {
    return !!(staging().accessToken && staging().role === 'super_admin');
  }

  function startOAuth(assetType) {
    assetType = assetType || window.__cocoCurrentAsset || 'gsc';
    if (!hasSuperAdmin()) {
      showOwnerGuide(assetType);
      return;
    }
    var url = edgeUrl('marketing-google-oauth');
    if (typeof showToast === 'function') showToast('🔗 פותח Google OAuth…');
    fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + staging().accessToken,
        'Content-Type': 'application/json',
        apikey: staging().anonKey || '',
      },
      body: JSON.stringify({ action: 'auth_url', asset: assetType }),
    }).then(function (r) { return r.json(); }).then(function (data) {
      if (!data.ok || !data.authUrl) {
        if (typeof showToast === 'function') showToast('OAuth: ' + (data.error || 'לא זמין — הרץ project-001:auth'));
        showOwnerGuide(assetType);
        return;
      }
      try {
        sessionStorage.setItem(PENDING_KEY, JSON.stringify({
          edgeUrl: url,
          accessToken: staging().accessToken,
          anonKey: staging().anonKey,
          asset: assetType,
          at: Date.now(),
        }));
      } catch (e) { /* ignore */ }
      var w = window.open(data.authUrl, 'coco_google_oauth', 'width=520,height=720,noopener');
      if (!w) {
        location.href = data.authUrl;
      }
    }).catch(function (e) {
      if (typeof showToast === 'function') showToast('שגיאה: ' + e.message);
      showOwnerGuide(assetType);
    });
  }

  function showOwnerGuide(assetType) {
    var gcpProject = 'project001aimarketing';
    var redirect = callbackUri();
    var steps = [
      '1. Google Cloud Console → Credentials → OAuth client',
      '2. הוסף Redirect URI: ' + redirect,
      '3. אשר את כל ה-scopes (GSC, GA4, Ads, GBP, GTM)',
      '4. התחבר כ-orin1607@gmail.com',
    ];
    var html = '<div style="line-height:1.7;font-size:13px;">' +
      '<p><strong>חיבור Google — נדרש אישור בעלים</strong></p>' +
      '<p>שירות: <strong>' + esc(assetType || 'Google') + '</strong></p>' +
      '<ol style="padding-right:18px;margin:8px 0;">' +
      steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') +
      '</ol>' +
      '<p style="font-size:11px;color:var(--white50);">או בטרמינל: <code>npm run project-001:auth -- --force</code></p>' +
      '<p><a href="https://console.cloud.google.com/apis/credentials?project=' + gcpProject + '" target="_blank" rel="noopener" class="btn btn-primary btn-sm" style="display:inline-block;margin-top:8px;">פתח Google Cloud Console</a></p>' +
      '</div>';
    if (typeof openActionModal === 'function') {
      openActionModal('🔗 חיבור Google OAuth', html, [
        { label: 'סגור', onclick: "closeModal('actionModal')" },
      ]);
    } else if (typeof showToast === 'function') {
      showToast('נדרש OAuth — ראה Google Cloud Console');
    }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function onConnected(data) {
    if (typeof showToast === 'function') showToast('✅ Google מחובר' + (data.email ? ' — ' + data.email : ''));
    if (window.CocoUnified && CocoUnified.syncGoogle) CocoUnified.syncGoogle();
    if (window.CocoMarketingUnified && CocoMarketingUnified.syncGoogle) CocoMarketingUnified.syncGoogle();
    if (window.CocoDaliaIntegration && CocoDaliaIntegration.refreshFromApis) {
      CocoDaliaIntegration.refreshFromApis(window.DATA || {}, {});
    }
  }

  function patchDoAutoConnect() {
    if (window.__cocoOAuthPatched) return;
    var orig = window.doAutoConnect;
    window.doAutoConnect = function () {
      var asset = window.__cocoCurrentAsset || 'gsc';
      if (hasSuperAdmin()) {
        startOAuth(asset);
        if (typeof closeModal === 'function') closeModal('modal-asset-connect');
        return;
      }
      if (window.CocoUnified && CocoUnified.syncGoogle && staging().accessToken) {
        CocoUnified.syncGoogle();
        if (typeof closeModal === 'function') closeModal('modal-asset-connect');
        return;
      }
      if (typeof orig === 'function') {
        startOAuth(asset);
      }
    };
    window.__cocoOAuthPatched = true;
  }

  function init() {
    patchDoAutoConnect();
    var pendingCode = null;
    try { pendingCode = sessionStorage.getItem('coco-google-oauth-code'); } catch (e) { /* ignore */ }
    if (pendingCode && hasSuperAdmin()) {
      sessionStorage.removeItem('coco-google-oauth-code');
      fetch(edgeUrl('marketing-google-oauth'), {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + staging().accessToken,
          'Content-Type': 'application/json',
          apikey: staging().anonKey || '',
        },
        body: JSON.stringify({ action: 'exchange', code: pendingCode, redirectUri: callbackUri() }),
      }).then(function (r) { return r.json(); }).then(onConnected).catch(function () { /* ignore */ });
    }
  }

  window.CocoGoogleOAuth = {
    VERSION: VERSION,
    start: startOAuth,
    onConnected: onConnected,
    callbackUri: callbackUri,
    init: init,
  };

  window.addEventListener('coco:auth-ready', init);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
