/**
 * Marketing SSOT — מקור נתונים יחיד ל-Staging (dalia-c-official)
 * כל המסכים קוראים מכאן: ספירות, ערוצי שיווק, Command Center
 */
(function () {
  'use strict';

  var state = {
    dashboard: null,
    bundle: null,
    workPlan: null,
    site: null,
    hydratedAt: null,
  };

  /** ערוצי שיווק בלבד (לא Drive/Sheets/Gmail) */
  var MARKETING_CHANNELS = [
    { id: 'searchConsole', icon: '🔍', nameHe: 'Google Search Console (SEO)', connKey: 'searchConsole' },
    { id: 'analytics4', icon: '📊', nameHe: 'Google Analytics 4', connKey: 'analytics4' },
    { id: 'googleTagManager', icon: '🏷️', nameHe: 'Google Tag Manager', connKey: 'googleTagManager', infra: true },
    { id: 'businessProfile', icon: '📍', nameHe: 'Google Business Profile', connKey: 'businessProfile' },
    { id: 'googleAds', icon: '📢', nameHe: 'Google Ads', connKey: 'googleAds' },
    { id: 'meta', icon: '📘', nameHe: 'Facebook / Meta', staticDisconnected: true },
    { id: 'instagram', icon: '📸', nameHe: 'Instagram', staticDisconnected: true },
    { id: 'linkedin', icon: '💼', nameHe: 'LinkedIn', staticDisconnected: true },
    { id: 'tiktok', icon: '🎵', nameHe: 'TikTok Business', staticDisconnected: true },
    { id: 'youtube', icon: '▶️', nameHe: 'YouTube', staticDisconnected: true },
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function resolveConn(conn) {
    if (!conn) return { code: 'disconnected', labelHe: 'לא מחובר', badgeClass: 'badge-gray' };
    if (conn.ok || conn.status === 'connected') {
      return { code: 'active', labelHe: 'פעיל', badgeClass: 'badge-green' };
    }
    var status = String(conn.status || '');
    var note = String(conn.note || '');
    if (/pending_google_api_approval|pending.*approval/i.test(status) || /approval|אישור/i.test(note)) {
      return { code: 'pending_approval', labelHe: 'ממתין לאישור', badgeClass: 'badge-yellow' };
    }
    if (/pending|planned|infrastructure|test|production_access/i.test(status)) {
      return { code: 'pending', labelHe: 'ממתין לחיבור', badgeClass: 'badge-yellow' };
    }
    return { code: 'disconnected', labelHe: 'לא מחובר', badgeClass: 'badge-gray' };
  }

  function channelDetail(def, conn, status) {
    if (status.code !== 'active') {
      if (status.code === 'pending_approval' || status.code === 'pending') return conn.note || '';
      return '';
    }
    if (def.connKey === 'searchConsole') return (state.site && state.site.domain) || 'dalia-c.com';
    if (def.connKey === 'analytics4') {
      var ga4 = (state.dashboard && state.dashboard.project && state.dashboard.project.ga4Property) || '';
      return ga4 ? ga4.replace('properties/', 'Property: ') : '';
    }
    if (def.connKey === 'googleTagManager' && conn.note) return conn.note.split('—')[0].trim();
    if (def.connKey === 'googleAds' && state.dashboard && state.dashboard.googleAds) {
      return 'Customer ID: ' + (state.dashboard.googleAds.customerId || '—');
    }
    return conn.note || '';
  }

  function getMarketingChannels(includeInfra) {
    var connMap = (state.dashboard && state.dashboard.connections) || {};
    return MARKETING_CHANNELS.filter(function (c) {
      return includeInfra || !c.infra;
    }).map(function (def) {
      if (def.staticDisconnected) {
        return {
          id: def.id,
          icon: def.icon,
          nameHe: def.nameHe,
          status: resolveConn(null),
          detail: '',
          marketing: !def.infra,
        };
      }
      var raw = connMap[def.connKey] || {};
      var status = resolveConn(raw);
      return {
        id: def.id,
        icon: def.icon,
        nameHe: def.nameHe,
        status: status,
        detail: channelDetail(def, raw, status),
        marketing: !def.infra,
        raw: raw,
      };
    });
  }

  function getActiveMarketingChannels() {
    return getMarketingChannels(false).filter(function (c) { return c.status.code === 'active'; });
  }

  function getActiveCampaigns() {
    var camps = (state.bundle && state.bundle.campaigns) || [];
    if (!camps.length && window.ClientIdSsot && ClientIdSsot.PRIMARY_CAMPAIGN) {
      camps = [ClientIdSsot.PRIMARY_CAMPAIGN];
    }
    return camps.filter(function (c) {
      var s = (c.status || 'active').toLowerCase();
      return s === 'active' || s === 'live';
    });
  }

  function getConnectedAssets() {
    if (window.AssetFlowSsot && AssetFlowSsot.getActiveAsset) {
      var a = AssetFlowSsot.getActiveAsset();
      if (a && a.live !== false) {
        return [{
          id: a.id || 'site-primary',
          icon: a.icon || '🌐',
          name: a.domain || a.label || 'dalia-c.com',
          url: a.url || ('https://' + (a.domain || 'dalia-c.com') + '/'),
          status: 'active',
        }];
      }
    }
    return [{
      id: 'site-primary',
      icon: '🌐',
      name: (state.site && state.site.domain) || 'dalia-c.com',
      url: (state.site && state.site.url) || 'https://dalia-c.com/',
      status: 'active',
    }];
  }

  function countActiveAiAssistants() {
    if (!state.dashboard || !window.CocoIntegrationHub) return 0;
    if (typeof CocoIntegrationHub.countActiveAssistants === 'function') {
      return CocoIntegrationHub.countActiveAssistants(state.dashboard);
    }
    return 0;
  }

  function getCounts() {
    return {
      clients: 1,
      connectedAssets: getConnectedAssets().length,
      activeCampaigns: getActiveCampaigns().length,
      activeMarketingChannels: getActiveMarketingChannels().length,
      activeAiAssistants: countActiveAiAssistants(),
    };
  }

  function getSnapshot() {
    var counts = getCounts();
    return {
      version: 1,
      hydratedAt: state.hydratedAt,
      clientId: (state.site && state.site.clientId) || 'dalia-c-official',
      domain: (state.site && state.site.domain) || 'dalia-c.com',
      counts: counts,
      campaigns: getActiveCampaigns().map(function (c) {
        return { id: c.id, name: c.name, status: c.status, channel: c.channel || c.campaign_type };
      }),
      assets: getConnectedAssets(),
      marketingChannels: getMarketingChannels(false).map(function (c) {
        return { id: c.id, nameHe: c.nameHe, status: c.status.labelHe, detail: c.detail };
      }),
      activeAiAssistantIds: (window.CocoIntegrationHub && CocoIntegrationHub.listActiveAssistantIds)
        ? CocoIntegrationHub.listActiveAssistantIds(state.dashboard)
        : [],
    };
  }

  function activateTab(screenId, tabId) {
    var screen = document.getElementById(screenId);
    if (!screen) return;
    var targetBtn = null;
    screen.querySelectorAll('.nav-tabs .nav-tab').forEach(function (t) {
      var oc = t.getAttribute('onclick') || '';
      if (oc.indexOf("'" + tabId + "'") !== -1 || oc.indexOf('"' + tabId + '"') !== -1) targetBtn = t;
    });
    if (targetBtn && typeof setTab === 'function') setTab(targetBtn, tabId);
  }

  function navigate(target) {
    if (typeof goScreen !== 'function') return;
    if (target === 'assets') {
      goScreen('screen-assets');
      return;
    }
    if (target === 'campaigns') {
      goScreen('screen-status');
      activateTab('screen-status', 'tab-status-campaigns');
      return;
    }
    if (target === 'channels') {
      goScreen('screen-clients');
      activateTab('screen-clients', 'tab-clients-integrations');
      return;
    }
    if (target === 'agents') {
      goScreen('screen-agents');
    }
  }

  function statusBadgeHtml(status) {
    var icon = status.code === 'active' ? '●' : (status.code === 'pending_approval' ? '⏳' : (status.code === 'pending' ? '⏳' : '○'));
    return '<span class="badge ' + esc(status.badgeClass) + '">' + icon + ' ' + esc(status.labelHe) + '</span>';
  }

  function renderCommandCenter() {
    var el = document.getElementById('coco-live-hub-kpis') || document.getElementById('coco-live-command-center');
    if (!el) return;
    el.id = 'coco-live-command-center';
    el.className = 'grid grid-4 coco-command-center';
    var counts = getCounts();
    var metrics = [
      { key: 'assets', label: 'נכסים מחוברים', value: counts.connectedAssets },
      { key: 'campaigns', label: 'קמפיינים פעילים', value: counts.activeCampaigns },
      { key: 'channels', label: 'ערוצי שיווק פעילים', value: counts.activeMarketingChannels },
      { key: 'agents', label: 'עוזרי AI פעילים', value: counts.activeAiAssistants },
    ];
    el.innerHTML = metrics.map(function (m) {
      return '<div class="card coco-cmd-metric" role="button" tabindex="0" aria-label="' + esc(m.label) + ': ' + m.value + '" data-nav="' + m.key + '" style="padding:14px 16px;cursor:pointer;">' +
        '<div class="card-title">' + esc(m.label) + '</div>' +
        '<div class="card-value coco-cmd-value" style="font-size:28px;font-weight:800;color:var(--accent2);">' + esc(String(m.value)) + '</div>' +
        '</div>';
    }).join('');
    el.querySelectorAll('.coco-cmd-metric').forEach(function (card) {
      card.addEventListener('click', function () { navigate(card.getAttribute('data-nav')); });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate(card.getAttribute('data-nav'));
        }
      });
    });
  }

  function renderChannelsList(containerId, title) {
    var host = document.getElementById(containerId);
    if (!host) return;
    var channels = getMarketingChannels(false);
    host.innerHTML =
      (title ? '<div class="sec-title" style="margin-bottom:10px;">' + esc(title) + '</div>' : '') +
      '<div style="display:flex;flex-direction:column;gap:10px;">' +
      channels.map(function (c) {
        var detail = c.detail ? '<div style="font-size:12px;color:var(--white50);">' + esc(c.detail) + '</div>' : '';
        return '<div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:10px;">' +
          '<div style="display:flex;align-items:center;gap:10px;">' +
          '<span style="font-size:24px;">' + c.icon + '</span>' +
          '<div><div style="font-weight:700;font-size:13px;">' + esc(c.nameHe) + '</div>' + detail + '</div></div>' +
          statusBadgeHtml(c.status) +
          '</div>';
      }).join('') +
      '</div>';
  }

  function ensureClientsChannelMounts() {
    var integrationsTab = document.getElementById('tab-clients-integrations');
    if (integrationsTab) {
      integrationsTab.querySelectorAll('.section > div:not(#coco-live-channels-integrations)').forEach(function (el) {
        el.style.display = 'none';
      });
      var section = integrationsTab.querySelector('.section');
      if (section && !document.getElementById('coco-live-channels-integrations')) {
        var mount = document.createElement('div');
        mount.id = 'coco-live-channels-integrations';
        mount.className = 'coco-live-section';
        section.appendChild(mount);
      }
    }

    var setupTab = document.getElementById('tab-clients-setup');
    if (setupTab) {
      setupTab.querySelectorAll('.sec-title').forEach(function (el) {
        if (/ערוצי שיווק/i.test(el.textContent)) {
          var grid = el.nextElementSibling;
          if (grid) grid.style.display = 'none';
          if (!document.getElementById('coco-live-channels-setup')) {
            var mount = document.createElement('div');
            mount.id = 'coco-live-channels-setup';
            mount.className = 'coco-live-section';
            mount.style.marginBottom = '20px';
            el.parentNode.insertBefore(mount, grid || el.nextSibling);
          }
        }
        if (/תקציב ויעדים/i.test(el.textContent)) {
          var budgetGrid = el.nextElementSibling;
          if (budgetGrid) budgetGrid.style.display = 'none';
          var budgetActions = budgetGrid && budgetGrid.nextElementSibling;
          if (budgetActions && budgetActions.querySelector('.btn-primary')) budgetActions.style.display = 'none';
        }
      });
      var subtitle = setupTab.querySelector('.page-subtitle');
      if (subtitle && /גרין|greentech/i.test(subtitle.textContent)) {
        subtitle.textContent = (state.site && state.site.company ? state.site.company : 'דליה') + ' — נבחר מדליה';
      }
    }
  }

  function renderClientsChannels() {
    ensureClientsChannelMounts();
    renderChannelsList('coco-live-channels-integrations', '');
    renderChannelsList('coco-live-channels-setup', 'ערוצי שיווק — מצב אמיתי');
  }

  function hydrate(payload) {
    state.dashboard = payload && payload.dashboard;
    state.bundle = payload && payload.bundle;
    state.workPlan = payload && payload.workPlan;
    state.site = payload && payload.site;
    state.hydratedAt = new Date().toISOString();
    if (window.COCO) {
      COCO.marketingSsot = getSnapshot();
    }
    return getSnapshot();
  }

  function refreshUi() {
    renderCommandCenter();
    renderClientsChannels();
  }

  window.MarketingSsot = {
    hydrate: hydrate,
    refreshUi: refreshUi,
    getCounts: getCounts,
    getSnapshot: getSnapshot,
    getMarketingChannels: getMarketingChannels,
    getActiveMarketingChannels: getActiveMarketingChannels,
    getActiveCampaigns: getActiveCampaigns,
    getConnectedAssets: getConnectedAssets,
    renderCommandCenter: renderCommandCenter,
    renderClientsChannels: renderClientsChannels,
    navigate: navigate,
    resolveConn: resolveConn,
    statusBadgeHtml: statusBadgeHtml,
  };
})();
