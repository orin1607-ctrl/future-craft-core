/**
 * CO.CO דליה — Google APIs Layer (Phase 4 E2E)
 * Read-only status + send-prep (no actual campaign send).
 */
(function () {
  'use strict';

  var VERSION = '4.0.0-google';

  var PROVIDERS = [
    { key: 'googleAds', name: 'Google Ads', icon: '📢' },
    { key: 'analytics4', name: 'Google Analytics 4', icon: '📊' },
    { key: 'searchConsole', name: 'Google Search Console', icon: '🔍' },
    { key: 'businessProfile', name: 'Google Business Profile', icon: '📍' },
    { key: 'googleTagManager', name: 'Google Tag Manager', icon: '🏷️' },
    { key: 'drive', name: 'Google Drive', icon: '📁' },
    { key: 'gmail', name: 'Gmail', icon: '✉️' },
    { key: 'sheets', name: 'Google Sheets', icon: '📋' },
  ];

  function parseLs(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }

  function getDashboard() {
    var cache = parseLs('coco-dalia-api-cache-v1');
    return (cache && cache.dashboard) || {};
  }

  function statusHe(conn) {
    if (!conn) return 'ממתין';
    if (conn.ok || conn.status === 'connected' || conn.status === 'oauth_connected') return 'מחובר';
    if (/pending|approval|production_access/i.test(String(conn.status || ''))) return 'דורש אישור';
    if (/error|fail|403|denied/i.test(String(conn.lastError || conn.note || ''))) return 'שגיאה';
    return 'ממתין';
  }

  function getAllStatus(apiSnap) {
    var dash = (apiSnap && apiSnap.dashboard) || getDashboard();
    var conn = dash.connections || {};
    var gads = dash.googleAds || {};
    return PROVIDERS.map(function (p) {
      var c = conn[p.key] || {};
      var item = {
        key: p.key,
        name: p.name,
        icon: p.icon,
        status: statusHe(c),
        note: c.note || c.lastError || '',
        source: 'dashboard.json',
        readOnly: true,
      };
      if (p.key === 'googleAds' && gads.customerId) {
        item.customerId = gads.customerId;
        item.kpis = gads.kpis || {};
        item.sendBlocked = true;
        item.sendNote = 'שליחת קמפיינים חסומה — דורש אישור סופי';
      }
      return item;
    });
  }

  function prepareAdsSend() {
    var dash = getDashboard();
    var gads = dash.googleAds || {};
    var draft = parseLs('dalia_gads_draft') || {};
    return {
      ready: false,
      blocked: true,
      reason: 'send_requires_final_approval',
      customerId: gads.customerId || draft.customerId || null,
      checklist: [
        { item: 'Developer Token production', done: !/test|pending/i.test(String((dash.connections || {}).googleAds && dash.connections.googleAds.status || '')) },
        { item: 'OAuth מחובר', done: !!((dash.connections || {}).googleAds && dash.connections.googleAds.ok) },
        { item: 'CID מוגדר', done: !!(gads.customerId || draft.customerId) },
        { item: 'אישור יוני לשליחה', done: false },
      ],
      message: 'הכנה בלבד — אין שליחה אמיתית עד אישור סופי',
    };
  }

  function oauthConnectHint(provider) {
    var hints = {
      googleAds: { screen: 'Google Cloud Console → APIs → OAuth', action: 'אשר Developer Token + חבר חשבון Ads' },
      searchConsole: { screen: 'Search Console → הגדרות → משתמשים', action: 'הוסף Service Account או OAuth' },
      analytics4: { screen: 'GA4 → Admin → Property Access', action: 'הענק הרשאות קריאה' },
      businessProfile: { screen: 'Google Business Profile', action: 'OAuth מחובר — ממתין לאישור API quota' },
    };
    return hints[provider] || { screen: 'הגדרות אינטגרציות', action: 'התחבר דרך דליה parent או Orin' };
  }

  function overlayIntegrations(data, apiSnap) {
    if (!data) return data;
    var statuses = getAllStatus(apiSnap);
    if (data.integrations) {
      statuses.forEach(function (s) {
        var ex = data.integrations.find(function (i) { return i.name === s.name; });
        if (ex) Object.assign(ex, s);
        else data.integrations.push(s);
      });
    }
    data._googleLayer = { version: VERSION, providers: statuses.length, adsSendBlocked: true };
    return data;
  }

  window.CocoDaliaGoogleLayer = {
    VERSION: VERSION,
    PROVIDERS: PROVIDERS,
    getAllStatus: getAllStatus,
    prepareAdsSend: prepareAdsSend,
    oauthConnectHint: oauthConnectHint,
    overlayIntegrations: overlayIntegrations,
  };
})();
