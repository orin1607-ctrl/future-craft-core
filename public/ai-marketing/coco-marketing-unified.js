/**
 * CO.CO Marketing OS — unified context, CRM, filters, connections, AI routing
 * Single Client ID + shared filters across all 10 hub modules
 */
(function () {
  'use strict';

  var VERSION = 'v3-unified-3f';
  var SEARCH_KEY = 'coco-mkt-global-search';
  var FILTER_KEY = 'coco-mkt-filter-persist';

  function isAuth() {
    return window.MarketingApi && MarketingApi.canRemote && MarketingApi.canRemote();
  }

  function ctx() {
    return (window.COCO && COCO.flowContext) || {};
  }

  function staging() {
    return window.COCO_STAGING || {};
  }

  function edgeUrl(name) {
    var s = staging();
    if (!s.supabaseUrl) return null;
    return s.supabaseUrl + '/functions/v1/' + name;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function logActivity(module, action, title, detail) {
    var cid = ctx().clientId;
    if (!cid || String(cid).indexOf('demo-') === 0 || !window.MarketingApi || !MarketingApi.logActivity) return;
    MarketingApi.logActivity({ customer_id: cid, module: module, action: action, title: title, detail: detail || '' });
  }

  function ensureEl(parent, id, tag, className) {
    var el = document.getElementById(id);
    if (el) return el;
    if (!parent) return null;
    el = document.createElement(tag || 'div');
    el.id = id;
    if (className) el.className = className;
    parent.appendChild(el);
    return el;
  }

  function ensureLiveMounts() {
    var clientsSection = document.querySelector('#tab-clients-list .section');
    if (clientsSection) {
      var listWrap = clientsSection.querySelector('div[style*="flex-direction:column"]');
      if (listWrap && !document.getElementById('coco-live-clients-list')) {
        listWrap.innerHTML = '';
        listWrap.id = 'coco-live-clients-list';
        listWrap.style.display = 'flex';
        listWrap.style.flexDirection = 'column';
        listWrap.style.gap = '10px';
      }
    }

    var overview = document.getElementById('tab-status-overview');
    if (overview) {
      var grid4 = overview.querySelector('.grid-4, .grid.grid-4');
      if (grid4 && !document.getElementById('coco-live-status-kpis')) {
        grid4.id = 'coco-live-status-kpis';
      }
    }

    var goalsTab = document.getElementById('tab-goals-active');
    if (goalsTab && !document.getElementById('coco-live-goals-list')) {
      var gAcc = goalsTab.querySelector('.goal-acc, .section');
      var mount = ensureEl(goalsTab, 'coco-live-goals-list', 'div');
      if (mount && gAcc && mount !== gAcc) {
        mount.style.marginTop = '12px';
      }
    }

    var actPending = document.getElementById('tab-actions-pending');
    if (actPending && !document.getElementById('coco-live-actions-pending')) {
      ensureEl(actPending, 'coco-live-actions-pending', 'div');
    }
    var actDone = document.querySelector('#tab-actions-history tbody, #tab-act-history tbody');
    if (actDone && !document.getElementById('coco-live-actions-done')) {
      actDone.id = 'coco-live-actions-done';
    }

    var assetsTab = document.querySelector('#screen-assets .section, #tab-assets-all');
    if (assetsTab && !document.getElementById('coco-live-assets-grid')) {
      var grid = assetsTab.querySelector('.grid-3, .grid.grid-3');
      if (grid) grid.id = 'coco-live-assets-grid';
      else ensureEl(assetsTab, 'coco-live-assets-grid', 'div', 'grid grid-3');
    }

    ensureCrmScreen();
    ensureConnectionsPanel();
    ensureUnifiedContextBar();
    placeContextBar(getActiveScreenId());
    removeStrayCrmUi();
  }

  function getActiveScreenId() {
    var active = document.querySelector('#coco-claude-root > .screen.active');
    return active ? active.id : 'screen-hub';
  }

  function placeContextBar(screenId) {
    var bar = document.getElementById('coco-unified-context-bar');
    var sc = document.getElementById(screenId || getActiveScreenId());
    if (!bar || !sc) return;
    var topbar = sc.querySelector('.topbar');
    if (!topbar) return;
    var flow = sc.querySelector('#coco-integration-flow-bar');
    var anchor = flow || topbar;
    if (bar.parentElement !== sc || anchor.nextElementSibling !== bar) {
      anchor.insertAdjacentElement('afterend', bar);
    }
  }

  function removeStrayCrmUi() {
    document.querySelectorAll('.coco-topbar-crm-btn, #coco-open-crm-btn').forEach(function (el) {
      el.remove();
    });
    document.querySelectorAll('.hub-card.coco-hub-crm-card').forEach(function (card) {
      card.classList.remove('coco-hub-crm-card');
    });
    document.querySelectorAll('.bnav-btn.coco-bnav-crm').forEach(function (btn) {
      btn.classList.remove('coco-bnav-crm');
    });
    document.querySelectorAll('.prd-dalia-bar, .topbar .prd-dalia-exit, .prd-dalia-exit-inline').forEach(function (el) {
      el.remove();
    });
  }

  function openCrm() {
    ensureCrmScreen();
    document.body.classList.add('coco-crm-active');
    if (typeof goScreen === 'function') goScreen('screen-crm');
    if (window.CocoMarketingCrm) {
      if (CocoMarketingCrm.init) CocoMarketingCrm.init();
      if (CocoMarketingCrm.ensureVisible) CocoMarketingCrm.ensureVisible();
    }
    logActivity('crm', 'open', 'נפתח CRM ממנהל השיווק');
  }

  function ensureCrmScreen() {
    if (document.getElementById('screen-crm')) return;
    var root = document.getElementById('coco-claude-root');
    if (!root) return;
    var screen = document.createElement('div');
    screen.className = 'screen';
    screen.id = 'screen-crm';
    screen.innerHTML =
      '<div class="content coco-crm-screen-content">' +
      '<div id="coco-marketing-crm-mount-screen"></div>' +
      '</div>';
    root.appendChild(screen);
    if (!window.screenLabels) window.screenLabels = {};
    window.screenLabels['screen-crm'] = 'CRM';
  }

  function ensureUnifiedContextBar() {
    if (document.getElementById('coco-unified-context-bar')) return;
    var root = document.getElementById('coco-claude-root');
    if (!root) return;
    var bar = document.createElement('div');
    bar.id = 'coco-unified-context-bar';
    bar.className = 'coco-flow-context-bar coco-unified-bar';
    bar.innerHTML =
      '<div class="cfc-inner">' +
      '<div class="cfc-row cfc-row-main">' +
      '<button type="button" id="coco-cfc-toggle" class="btn btn-ghost coco-cfc-toggle" title="הצג/הסתר סינון">⚙️</button>' +
      '<span id="coco-unified-client-chip" class="cfc-chip cfc-client-chip" title="לחץ לפתיחת לקוחות">לקוח: —</span>' +
      '<span id="coco-live-source-badge" class="cfc-chip cfc-source-badge"></span>' +
      '</div>' +
      '<div class="cfc-row cfc-row-filters" id="coco-cfc-filters">' +
      '<span id="coco-unified-filter-chip" class="cfc-chip">סינון: כללי</span>' +
      '<input id="coco-central-search" class="filter-input cfc-search" placeholder="🔍 חיפוש">' +
      '<select id="coco-central-service" class="filter-select" title="סוג שירות"><option value="">כל השירותים</option><option value="marketing_only">שיווק</option><option value="fleet_and_marketing">שיווק+צי</option></select>' +
      '<select id="coco-central-status" class="filter-select" title="סטטוס לקוח"><option value="">סטטוס לקוח</option><option value="active">פעיל</option><option value="inactive">לא פעיל</option></select>' +
      '<select id="coco-central-campaign" class="filter-select" title="קמפיין"><option value="">קמפיין</option></select>' +
      '<button type="button" id="coco-sync-google-btn" class="btn btn-ghost cfc-sync-btn">🔄 Google</button>' +
      '</div></div>';
    root.appendChild(bar);
    placeContextBar(getActiveScreenId());

    document.getElementById('coco-cfc-toggle')?.addEventListener('click', function () {
      bar.classList.toggle('is-expanded');
    });

    document.getElementById('coco-sync-google-btn')?.addEventListener('click', syncGoogle);
    document.getElementById('coco-unified-client-chip')?.addEventListener('click', function () {
      if (typeof goScreen === 'function') goScreen('screen-clients');
    });
    document.getElementById('coco-central-search')?.addEventListener('input', onCentralFilter);
    document.getElementById('coco-central-service')?.addEventListener('change', onCentralFilter);
    document.getElementById('coco-central-status')?.addEventListener('change', onCentralFilter);
    document.getElementById('coco-central-campaign')?.addEventListener('change', onCentralFilter);
    try {
      var saved = localStorage.getItem(SEARCH_KEY);
      if (saved) {
        var inp = document.getElementById('coco-central-search');
        if (inp) { inp.value = saved; onCentralFilter({ target: inp }); }
      }
    } catch (err) { /* ignore */ }
  }

  function onCentralFilter(e) {
    var c = ctx();
    var search = document.getElementById('coco-central-search');
    var svc = document.getElementById('coco-central-service');
    var st = document.getElementById('coco-central-status');
    var camp = document.getElementById('coco-central-campaign');
    if (search) c.freeSearch = search.value;
    if (svc) c.serviceType = svc.value;
    if (st) c.customerStatus = st.value;
    if (camp) c.campaign = camp.value;
    try {
      localStorage.setItem(SEARCH_KEY, c.freeSearch || '');
      if (window.COCO && COCO.flowContext) {
        localStorage.setItem('coco-flow-context-v2', JSON.stringify(COCO.flowContext));
      }
    } catch (err) { /* ignore */ }
    if (window.CocoClaude && CocoClaude.applyContextGlobally) CocoClaude.applyContextGlobally();
    if (window.CocoMarketingCrm && CocoMarketingCrm.syncFilters) CocoMarketingCrm.syncFilters();
    refreshAllModules();
  }

  function updateContextBar() {
    var c = ctx();
    var chip = document.getElementById('coco-unified-client-chip');
    if (chip) {
      var name = (c.clientName || c.clientId || '').toString();
      chip.textContent = c.clientId
        ? ('לקוח: ' + name.slice(0, 32))
        : 'לקוח: לא נבחר';
    }
    var fchip = document.getElementById('coco-unified-filter-chip');
    if (fchip) {
      var parts = [];
      if (c.site) parts.push(c.site);
      if (c.campaign) parts.push(c.campaign);
      if (c.dateRange) parts.push(c.dateRange + ' ימים');
      fchip.textContent = 'סינון: ' + (parts.length ? parts.join(' · ') : 'כללי');
    }
  }

  function ensureCrmTab() {
    var tabs = document.querySelector('#screen-clients .nav-tabs');
    if (!tabs || document.getElementById('tab-clients-crm')) return;

    var listTab = tabs.querySelector('.nav-tab');
    var tab = document.createElement('div');
    tab.className = 'nav-tab';
    tab.setAttribute('data-crm-tab', '1');
    tab.textContent = '📇 CRM';
    tab.onclick = function () {
      openCrm();
    };
    if (listTab && listTab.nextSibling) {
      tabs.insertBefore(tab, listTab.nextSibling);
    } else {
      tabs.appendChild(tab);
    }

    var content = document.querySelector('#screen-clients .content');
    if (!content) return;
    var panel = document.createElement('div');
    panel.id = 'tab-clients-crm';
    panel.style.display = 'none';
    panel.innerHTML =
      '<div class="page-header"><div class="page-title">📇 CRM — חלק ממנהל השיווק</div>' +
      '<div class="page-subtitle">לקוחות · לידים · משימות · Pipeline · מסונכרן עם כל המודולים</div><hr class="page-rule"></div>' +
      '<div id="coco-marketing-crm-mount"></div>';
    content.appendChild(panel);

    ensureCrmEntryBanner();
  }

  function ensureCrmEntryBanner() {
    var list = document.getElementById('tab-clients-list');
    if (!list || document.getElementById('coco-crm-entry-banner')) return;
    var header = list.querySelector('.page-header');
    if (!header) return;
    var banner = document.createElement('div');
    banner.id = 'coco-crm-entry-banner';
    banner.className = 'coco-crm-entry-banner';
    banner.innerHTML =
      '<span style="font-size:13px;font-weight:600;">📇 CRM משולב במנהל השיווק — לידים, משימות, Pipeline</span>' +
      '<button type="button" class="btn btn-primary" style="font-size:12px;padding:6px 14px;" id="coco-crm-entry-open">פתח CRM</button>';
    header.insertAdjacentElement('afterend', banner);
    document.getElementById('coco-crm-entry-open')?.addEventListener('click', function () {
      openCrm();
    });
  }

  function bindCrm() {
    if (window.CocoMarketingCrm && CocoMarketingCrm.init) CocoMarketingCrm.init();
  }

  function ensureConnectionsPanel() {
    var panel = document.getElementById('tab-clients-integrations');
    if (!panel || document.getElementById('coco-live-connections')) return;
    var mount = document.createElement('div');
    mount.id = 'coco-live-connections';
    mount.style.marginTop = '14px';
    panel.appendChild(mount);
  }

  function hideStaticDemo() {
    if (!isAuth()) return;
    document.querySelectorAll('#tab-clients-list .card[onclick*="selectClient"]').forEach(function (el) {
      el.style.display = 'none';
    });
    document.querySelectorAll('#screen-hub .hub-card').forEach(function (card) {
      var cnt = card.querySelector('.hub-count');
      if (cnt && /^\d+$/.test(cnt.textContent.trim()) && cnt.textContent === '23') {
        cnt.textContent = '—';
      }
    });
  }

  function bindConnections() {
    var mount = document.getElementById('coco-live-connections');
    if (!mount) return;
    var url = edgeUrl('marketing-google-sync');
    var token = staging().accessToken;
    if (!url || !token) {
      mount.innerHTML = '<div class="alert alert-info">התחבר דרך דליה (Super Admin) לבדיקת חיבורים.</div>';
      return;
    }
    mount.innerHTML = '<div class="alert alert-info">בודק חיבורי API…</div>';
    fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', apikey: staging().anonKey || '' },
      body: JSON.stringify({ action: 'status', customerId: ctx().clientId }),
    }).then(function (r) { return r.json(); }).then(function (data) {
      if (!data.ok) {
        mount.innerHTML = '<div class="alert alert-warn">' + esc(data.error || 'שגיאה') + '</div>';
        return;
      }
      var rows = Object.keys(data.providers || {}).map(function (k) {
        var p = data.providers[k];
        var st = p.status || 'unknown';
        var cls = /connected|ready/.test(st) ? 'badge-green' : /pending|missing/.test(st) ? 'badge-yellow' : 'badge-gray';
        return '<div class="card" style="padding:10px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">' +
          '<span>' + esc(k) + '</span><span class="badge ' + cls + '">' + esc(st) + '</span></div>' +
          (p.note ? '<div style="font-size:11px;color:var(--white50);margin:-4px 0 8px 8px;">' + esc(p.note) + '</div>' : '');
      });
      mount.innerHTML = '<div class="sec-title">סטטוס חיבורים (Staging)</div>' + rows.join('');
    }).catch(function () {
      mount.innerHTML = '<div class="alert alert-warn">לא ניתן לבדוק חיבורים — Edge function marketing-google-sync</div>';
    });
  }

  function syncGoogle() {
    var cid = ctx().clientId;
    var url = edgeUrl('marketing-google-sync');
    var token = staging().accessToken;
    if (!cid || String(cid).indexOf('demo-') === 0) {
      if (typeof showToast === 'function') showToast('בחר לקוח אמיתי לפני סנכרון');
      return;
    }
    if (!url || !token) {
      if (typeof showToast === 'function') showToast('נדרשת התחברות דליה');
      return;
    }
    if (typeof showToast === 'function') showToast('🔄 מסנכרן Google…');
    fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', apikey: staging().anonKey || '' },
      body: JSON.stringify({ action: 'sync', customerId: cid }),
    }).then(function (r) { return r.json(); }).then(function (data) {
      if (!data.ok) {
        if (typeof showToast === 'function') showToast('סנכרון נכשל: ' + (data.error || ''));
        return;
      }
      if (typeof showToast === 'function') showToast('✅ סנכרון Google הושלם');
      if (window.CocoData && CocoData.load) CocoData.load(cid);
      bindConnections();
    }).catch(function (e) {
      if (typeof showToast === 'function') showToast('שגיאת רשת: ' + e.message);
    });
  }

  function refreshAllModules() {
    updateContextBar();
    if (window.CocoData && CocoData.bindAll) CocoData.bindAll();
    bindCrm();
    bindConnections();
  }

  function onGlobalSearch(e) {
    var q = (e.target.value || '').trim().toLowerCase();
    try { localStorage.setItem(SEARCH_KEY, q); } catch (err) { /* ignore */ }
    if (!q) return;
    document.querySelectorAll('#coco-live-clients-list .card, #coco-live-crm-list .card, #coco-live-goals-list .goal-acc-item').forEach(function (el) {
      var text = (el.textContent || '').toLowerCase();
      el.style.display = text.indexOf(q) !== -1 ? '' : 'none';
    });
  }

  function wireClientListFilters() {
    var listTab = document.getElementById('tab-clients-list');
    if (!listTab) return;
    listTab.querySelectorAll('.filter-input, .filter-select').forEach(function (el) {
      el.addEventListener('input', filterClientList);
      el.addEventListener('change', filterClientList);
    });
  }

  function filterClientList() {
    var q = (listTabQuery() || '').toLowerCase();
    document.querySelectorAll('#coco-live-clients-list .card').forEach(function (card) {
      var text = (card.textContent || '').toLowerCase();
      card.style.display = !q || text.indexOf(q) !== -1 ? '' : 'none';
    });
  }

  function listTabQuery() {
    var inp = document.querySelector('#tab-clients-list .filter-input');
    return inp ? inp.value : '';
  }

  function selectByName(name) {
    if (!name || !window.CocoData) return;
    var rows = (window.CocoData.getCustomers && CocoData.getCustomers()) || [];
    var match = rows.find(function (c) {
      return c.name && (c.name.indexOf(name) !== -1 || name.indexOf(c.name) !== -1);
    });
    if (match) return CocoData.selectCustomer(match.id);
    if (window.CocoClaude && CocoClaude.bindDemoClient) CocoClaude.bindDemoClient(name);
  }

  function buildClientContext() {
    var c = ctx();
    var bundle = window.CocoData && CocoData.getBundle ? CocoData.getBundle() : null;
    return {
      clientId: c.clientId,
      clientName: c.clientName,
      company: c.company,
      site: c.site,
      campaign: c.campaign,
      dateRange: c.dateRange,
      customer: bundle && bundle.customer,
      profile: bundle && bundle.profile,
      campaigns: bundle && bundle.campaigns,
      connections: bundle && bundle.connections,
    };
  }

  function marketingAiChat(opts) {
    var s = staging();
    var clientContext = buildClientContext();
    var body = Object.assign({}, opts, { clientContext: clientContext });

    if (opts.provider === 'gemini') {
      var gUrl = edgeUrl('marketing-gemini-chat');
      if (gUrl && s.accessToken) {
        return fetch(gUrl, {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + s.accessToken, 'Content-Type': 'application/json', apikey: s.anonKey || '' },
          body: JSON.stringify(body),
        }).then(function (r) { return r.json(); });
      }
    }

    if (window.marketingApiChat) return window.marketingApiChat(body);
    return Promise.resolve({ ok: false, message: 'AI לא זמין' });
  }

  function onAuthReady() {
    hideStaticDemo();
    ensureLiveMounts();
    bindConnections();
    if (window.CocoData && CocoData.loadCustomers) {
      CocoData.loadCustomers().then(function () {
        var cid = ctx().clientId;
        if (cid && String(cid).indexOf('demo-') !== 0) CocoData.load(cid);
        else if (window.CocoData.getCustomers) {
          var rows = CocoData.getCustomers();
          if (rows[0]) CocoData.selectCustomer(rows[0].id);
        }
        updateContextBar();
      });
    }
  }

  function hookInit() {
    if (!window.CocoClaude) return;
    var orig = CocoClaude.init;
    CocoClaude.init = function () {
      ensureLiveMounts();
      hideStaticDemo();
      wireClientListFilters();
      if (typeof orig === 'function') orig.call(this);
      updateContextBar();
      if (isAuth()) onAuthReady();
    };
    var origScreen = CocoClaude.onScreenChange;
    CocoClaude.onScreenChange = function (id) {
      if (typeof origScreen === 'function') origScreen.call(this, id);
      placeContextBar(id);
      removeStrayCrmUi();
      updateContextBar();
      if (window.CocoData && CocoData.bindScreen) CocoData.bindScreen(id);
      if (id === 'screen-crm' || id === 'screen-clients') {
        bindCrm();
        if (id === 'screen-clients') bindConnections();
      }
    };
    var origApply = CocoClaude.applyContextGlobally;
    if (origApply) {
      CocoClaude.applyContextGlobally = function () {
        origApply();
        updateContextBar();
        refreshAllModules();
      };
    }
  }

  function hookNavigation() {
    if (window.goScreen && window.goScreen._cocoUnifiedHooked) return;
    var _go = window.goScreen;
    if (!_go) return;
    window.goScreen = function (id) {
      _go(id);
      if (id === 'screen-crm') document.body.classList.add('coco-crm-active');
      else document.body.classList.remove('coco-crm-active');
      placeContextBar(id);
      removeStrayCrmUi();
      updateContextBar();
      if (id === 'screen-crm' && window.CocoMarketingCrm && CocoMarketingCrm.init) CocoMarketingCrm.init();
    };
    window.goScreen._cocoUnifiedHooked = true;
  }

  function hookContext() {
    if (!window.CocoData) return;
    var orig = CocoData.onContextChange;
    CocoData.onContextChange = function () {
      if (typeof orig === 'function') orig();
      updateContextBar();
      bindCrm();
    };
    var origSelect = CocoData.selectCustomer;
    if (origSelect) {
      CocoData.selectCustomer = function (id) {
        return origSelect(id).then(function () {
          logActivity('clients', 'client_selected', 'נבחר לקוח', id);
          refreshAllModules();
        });
      };
    }
  }

  function hookBridgeContext() {
    if (!window.COCO) return;
    var root = document.getElementById('coco-claude-root');
    if (!root || root._cocoUnifiedCtx) return;
    root._cocoUnifiedCtx = true;
    root.addEventListener('change', function (e) {
      var t = e.target;
      if (t && t.id && /^(sf-|gf-|act-|hist-|ai-|rep-|ag-)/.test(t.id)) {
        setTimeout(refreshAllModules, 50);
      }
    });
  }

  window.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'dalia-coco-auth') {
      setTimeout(onAuthReady, 400);
    }
    if (e.data && e.data.type === 'dalia-coco-open-customer' && e.data.customerId) {
      if (window.CocoData && CocoData.selectCustomer) {
        CocoData.selectCustomer(e.data.customerId);
      }
    }
  });

  window.selectClient = function (name) {
    return selectByName(name);
  };

  window.CocoUnified = {
    version: VERSION,
    isAuth: isAuth,
    openCrm: openCrm,
    ensureCrmScreen: ensureCrmScreen,
    syncGoogle: syncGoogle,
    bindCrm: bindCrm,
    bindConnections: bindConnections,
    selectByName: selectByName,
    buildClientContext: buildClientContext,
    marketingAiChat: marketingAiChat,
    logActivity: logActivity,
    onAuthReady: onAuthReady,
    updateContextBar: updateContextBar,
    refreshAllModules: refreshAllModules,
    init: function () {
      ensureLiveMounts();
      hookInit();
      hookNavigation();
      hookContext();
      hookBridgeContext();
      updateContextBar();
      if (isAuth()) onAuthReady();
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { CocoUnified.init(); });
  } else {
    setTimeout(function () { CocoUnified.init(); }, 0);
  }
})();
