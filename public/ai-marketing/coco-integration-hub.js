/**
 * COCO Integration Hub — חיבור מקצה לקצה (תשתית + סטטוס, ללא מפתחות AI)
 * שלב א: נתונים אמיתיים | AI engines: ממתין למפתח/הרשאה
 */
(function () {
  'use strict';

  var PENDING = 'ממתין לחיבור';
  var PENDING_KEY = 'ממתין למפתח';
  var PENDING_AUTH = 'ממתין להרשאה';

  var AI_ENGINES = [
    { id: 'openai', label: 'OpenAI (ChatGPT)', icon: '🟢', wired: true, apiEnabled: true, reason: 'Edge marketing-ai-chat' },
    { id: 'claude', label: 'Claude', icon: '🟣', wired: true, apiEnabled: false, reason: 'ממתין ל-ANTHROPIC_API_KEY בשרת' },
    { id: 'gemini', label: 'Gemini', icon: '🔵', wired: true, apiEnabled: true, reason: 'Edge marketing-gemini-chat' },
  ];

  var ASSISTANTS = [
    { id: 'website', label: 'Website AI', icon: '🌐', feeds: ['site_crawl', 'gsc_pages'] },
    { id: 'seo', label: 'SEO AI', icon: '🔍', feeds: ['gsc_queries', 'gsc_pages', 'indexing'] },
    { id: 'analytics', label: 'Analytics AI', icon: '📊', feeds: ['ga4'] },
    { id: 'search_console', label: 'Search Console AI', icon: '📈', feeds: ['gsc_queries', 'gsc_pages'] },
    { id: 'google_business', label: 'Google Business AI', icon: '📍', feeds: ['gbp'] },
    { id: 'google_ads', label: 'Google Ads AI', icon: '🎯', feeds: ['google_ads'] },
    { id: 'meta', label: 'Meta AI', icon: '👥', feeds: ['social'] },
    { id: 'content', label: 'Content AI', icon: '✍️', feeds: ['gsc_pages', 'ga4_pages'] },
    { id: 'campaign', label: 'Campaign AI', icon: '📣', feeds: ['google_ads', 'ga4'] },
    { id: 'reports', label: 'Reports AI', icon: '📋', feeds: ['gsc', 'ga4', 'history'] },
    { id: 'competitors', label: 'Competitors AI', icon: '⚔️', feeds: ['site_crawl'] },
    { id: 'manager', label: 'AI Manager', icon: '🤖', feeds: ['all_modules'] },
  ];

  var FLOW_SCREENS = [
    'screen-hub', 'screen-status', 'screen-clients', 'screen-agents', 'screen-goals',
    'screen-actions', 'screen-crm', 'screen-history', 'screen-assets', 'screen-ai-center', 'screen-reports',
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function resolveDataFeeds(raw) {
    var conn = (raw && raw.connections) || {};
    return {
      gsc: !!(conn.searchConsole && conn.searchConsole.ok),
      ga4: !!(conn.analytics4 && conn.analytics4.ok),
      gbp: !!(conn.businessProfile && conn.businessProfile.ok),
      google_ads: !!(conn.googleAds && conn.googleAds.ok),
      gtm: !!(conn.googleTagManager && conn.googleTagManager.ok),
      site_crawl: !!(window.DaliaSite && DaliaSite.getDashboard()),
      gsc_queries: ((raw && raw.searchConsole && raw.searchConsole.keywords) || []).length,
      gsc_pages: ((raw && raw.searchConsole && raw.searchConsole.pages) || []).length,
      ga4_pages: ((raw && raw.analytics4 && raw.analytics4.topPages) || []).length,
      indexing: !!(raw && raw.indexing),
      social: false,
      history: true,
      all_modules: true,
    };
  }

  function feedOk(feeds, data) {
    return feeds.every(function (f) {
      if (f === 'all_modules') return data.gsc || data.ga4;
      if (f === 'site_crawl' || f === 'history') return !!data[f];
      if (f === 'gsc' || f === 'ga4') return !!data[f];
      if (f === 'gbp') return data.gbp;
      if (f === 'google_ads') return data.google_ads;
      if (f === 'social') return data.social;
      if (f === 'gtm') return data.gtm;
      if (f === 'gsc_queries') return data.gsc && data.gsc_queries > 0;
      if (f === 'gsc_pages') return data.gsc && data.gsc_pages > 0;
      if (f === 'ga4_pages') return data.ga4 && data.ga4_pages > 0;
      if (f === 'indexing') return data.indexing;
      return false;
    });
  }

  function buildStatusReport(raw) {
    var conn = (raw && raw.connections) || {};
    var data = resolveDataFeeds(raw);
    var services = [
      { id: 'searchConsole', label: 'Google Search Console', active: !!conn.searchConsole?.ok, pending: conn.searchConsole?.note || PENDING_AUTH },
      { id: 'analytics4', label: 'Google Analytics 4', active: !!conn.analytics4?.ok, pending: conn.analytics4?.note || PENDING_AUTH },
      { id: 'businessProfile', label: 'Google Business Profile', active: !!conn.businessProfile?.ok, pending: conn.businessProfile?.note || PENDING_AUTH },
      { id: 'googleAds', label: 'Google Ads', active: !!conn.googleAds?.ok, pending: conn.googleAds?.note || PENDING_AUTH },
      { id: 'gtm', label: 'Google Tag Manager', active: !!conn.googleTagManager?.ok, pending: conn.googleTagManager?.note || PENDING_AUTH },
      { id: 'site', label: 'נתוני אתר dalia-c.com', active: !!data.site_crawl, pending: PENDING },
      { id: 'clientId', label: 'Client ID + RLS (דליה)', active: true, pending: 'בדיקה ידנית — Edge deployed' },
    ];
    AI_ENGINES.forEach(function (e) {
      services.push({ id: e.id, label: e.label, active: false, pending: e.reason, layer: 'ai', wired: e.wired });
    });
    return { at: new Date().toISOString(), site: 'dalia-c.com', dataFeeds: data, services: services, aiApiEnabled: false };
  }

  function renderAgentsLive(raw) {
    var screen = document.getElementById('screen-agents');
    if (!screen) return;
    document.querySelectorAll('#screen-agents .section .grid.grid-4').forEach(function (g) {
      g.style.display = 'none';
    });
    var root = document.getElementById('coco-live-agents-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'coco-live-agents-root';
      root.style.cssText = 'padding:0 20px 16px;';
      var content = screen.querySelector('.content');
      var header = content && content.querySelector('.page-header');
      if (content && header) content.insertBefore(root, header.nextSibling);
    }
    var data = resolveDataFeeds(raw);
    var connected = ASSISTANTS.filter(function (a) { return feedOk(a.feeds, data); }).length;
    var pending = ASSISTANTS.length - connected;

    root.innerHTML =
      '<div class="alert alert-info" style="margin-bottom:12px;">🔗 עוזרים מחוברים לתשתית · Client ID: <strong>' + esc(window.DaliaSite?.SITE?.clientId || 'dalia-c-official') + '</strong> · AI engines: ' + esc(PENDING_KEY) + '</div>' +
      '<div class="grid grid-4" style="gap:10px;margin-bottom:14px;">' +
      kpi('עוזרים מחוברים לנתונים', connected + ' / ' + ASSISTANTS.length) +
      kpi('ממתינים לנתונים', pending) +
      kpi('מנועי AI', '0 / 3 — ' + PENDING_KEY) +
      kpi('אתר', 'dalia-c.com') +
      '</div>' +
      '<div class="grid grid-3" style="gap:10px;">' +
      ASSISTANTS.map(function (a) {
        var ok = feedOk(a.feeds, data);
        return '<div class="agent-card" style="cursor:pointer;" onclick="goScreen(\'screen-agent-dashboard\');if(typeof openAgentDashboard===\'function\')openAgentDashboard(\'' + a.id + '\')">' +
          '<div class="agent-header"><span class="agent-icon">' + a.icon + '</span><div><div class="agent-name">' + esc(a.label) + '</div>' +
          '<div class="agent-role">' + (ok ? 'נתונים: מחובר' : PENDING) + ' · AI: ' + PENDING_KEY + '</div></div></div>' +
          (ok ? '<span class="badge badge-green">● תשתית פעילה</span>' : '<span class="badge badge-yellow">⏳ ' + esc(PENDING) + '</span>') +
          '</div>';
      }).join('') +
      '</div>' +
      '<div class="section" style="padding:16px 0;"><div class="sec-title">מנועי AI (תשתית מוכנה — API מושהה)</div>' +
      '<div class="grid grid-3" style="gap:10px;">' +
      AI_ENGINES.map(function (e) {
        return '<div class="card" style="padding:14px;"><div class="card-title">' + e.icon + ' ' + esc(e.label) + '</div>' +
          '<div style="font-size:12px;color:var(--white50);margin-top:8px;">תשתית: מחובר · API: ' + esc(e.reason) + '</div>' +
          '<span class="badge badge-yellow" style="margin-top:8px;">⏳ ' + esc(PENDING_KEY) + '</span></div>';
      }).join('') +
      '</div></div>';
  }

  function kpi(title, val) {
    return '<div class="card" style="padding:12px 14px;"><div class="card-title">' + esc(title) + '</div><div class="card-value" style="font-size:18px;">' + esc(String(val)) + '</div></div>';
  }

  function renderFlowStatusBar() {
    var raw = window.DaliaSite && DaliaSite.getDashboard && DaliaSite.getDashboard();
    if (!raw) return;
    var rep = buildStatusReport(raw);
    var active = rep.services.filter(function (s) { return s.active && s.layer !== 'ai'; }).length;
    var bar = document.getElementById('coco-integration-flow-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'coco-integration-flow-bar';
      bar.className = 'coco-integration-flow-bar';
      var hub = document.getElementById('screen-hub');
      var tb = hub && hub.querySelector('.topbar');
      if (tb) tb.parentNode.insertBefore(bar, tb.nextSibling);
    }
    bar.innerHTML = '<div class="coco-ifb-inner">' +
      '<span>🌐 dalia-c.com</span><span>·</span>' +
      '<span>Client: ' + esc(window.DaliaSite?.SITE?.clientId) + '</span><span>·</span>' +
      '<span>נתונים פעילים: ' + active + '</span><span>·</span>' +
      '<span>AI: ' + esc(PENDING_KEY) + '</span>' +
      '<button type="button" class="btn btn-ghost btn-sm" style="margin-right:auto;font-size:11px;" onclick="CocoIntegrationHub.showStatusModal()">סטטוס חיבורים</button>' +
      '</div>';
    window.COCO_INTEGRATION_STATUS = rep;
  }

  function showStatusModal() {
    var rep = window.COCO_INTEGRATION_STATUS;
    if (!rep || typeof openModal !== 'function') return;
    var body = document.getElementById('modal-integration-status-body');
    if (!body) {
      var modal = document.createElement('div');
      modal.className = 'overlay';
      modal.id = 'modal-integration-status';
      modal.innerHTML = '<div class="modal" style="max-width:640px;"><div class="modal-title">סטטוס חיבורים — dalia-c.com</div><div id="modal-integration-status-body"></div><div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal(\'modal-integration-status\')">סגור</button></div></div>';
      document.body.appendChild(modal);
      body = document.getElementById('modal-integration-status-body');
    }
    body.innerHTML = '<table style="width:100%;font-size:13px;"><thead><tr><th>שירות</th><th>סטטוס</th></tr></thead><tbody>' +
      rep.services.map(function (s) {
        return '<tr><td>' + esc(s.label) + '</td><td>' + (s.active ? '<span class="badge badge-green">● פעיל</span>' : '<span class="badge badge-yellow">⏳ ' + esc(s.pending) + '</span>') + '</td></tr>';
      }).join('') + '</tbody></table>';
    openModal('modal-integration-status');
  }

  function wireAll(raw) {
    renderAgentsLive(raw);
    renderFlowStatusBar();
    if (window.CocoClaude && CocoClaude.onScreenChange) {
      var orig = CocoClaude.onScreenChange;
      CocoClaude.onScreenChange = function (id) {
        orig(id);
        if (id === 'screen-agents') renderAgentsLive(raw || (window.DaliaSite && DaliaSite.getDashboard()));
      };
    }
    document.body.classList.add('coco-integration-wired');
  }

  function isAiApiEnabled() {
    return !!(window.COCO_STAGING && window.COCO_STAGING.accessToken);
  }

  function getAiBlockedMessage() {
    if (isAiApiEnabled()) return 'מנועי AI זמינים לאחר התחברות — OpenAI דרך Edge; Claude ממתין למפתח Anthropic.';
    return 'מנועי AI (OpenAI / Claude / Gemini) דורשים התחברות Super Admin בדליה.';
  }

  window.CocoIntegrationHub = {
    ASSISTANTS: ASSISTANTS,
    AI_ENGINES: AI_ENGINES,
    FLOW_SCREENS: FLOW_SCREENS,
    wireAll: wireAll,
    renderAgentsLive: renderAgentsLive,
    buildStatusReport: buildStatusReport,
    showStatusModal: showStatusModal,
    isAiApiEnabled: isAiApiEnabled,
    getAiBlockedMessage: getAiBlockedMessage,
    PENDING: PENDING,
    PENDING_KEY: PENDING_KEY,
    PENDING_AUTH: PENDING_AUTH,
  };
})();
