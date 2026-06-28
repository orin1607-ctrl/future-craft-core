// ===== COCO CLAUDE INTEGRATION (Phase C — flow context sync) =====
(function () {
  'use strict';

  window.COCO = window.COCO || {};
  if (!COCO.flowContext) {
    COCO.flowContext = {
      clientId: null,
      company: '',
      clientName: '',
      site: '',
      domain: '',
      page: '',
      campaign: '',
      campaignType: '',
      channel: '',
      goal: '',
      action: '',
      status: '',
      dateRange: '30',
      dateFrom: '',
      dateTo: '',
      agent: '',
      project: '',
      selectedCard: null,
      leadStatus: '',
      customerStatus: '',
      taskStatus: '',
      keyword: '',
      source: '',
      tags: '',
      priority: '',
      urgency: '',
      serviceType: '',
      assignee: '',
      freeSearch: '',
    };
  }

  var STORAGE_KEY = 'coco-flow-context-v2';
  var SYNC_GUARD = false;

  var DEMO_CLIENTS = {};

  var FLOW_CHAIN = [
    'screen-hub',
    'screen-status',
    'screen-clients',
    'screen-agents',
    'screen-goals',
    'screen-actions',
    'screen-crm',
    'screen-assets',
    'screen-ai-center',
    'screen-history',
    'screen-reports'
  ];

  var GOTO_MAP = {
    hub: 'screen-hub',
    status: 'screen-status',
    clients: 'screen-clients',
    goals: 'screen-goals',
    actions: 'screen-actions',
    history: 'screen-history',
    assets: 'screen-assets',
    'ai-decisions': 'screen-ai-center',
    'screen-ai-decisions': 'screen-ai-center',
    reports: 'screen-reports',
    agents: 'screen-agents',
    'agent-dashboard': 'screen-agent-dashboard',
    'sc-hub': 'screen-hub',
    'sc-mkt-status': 'screen-status',
    'sc-mkt-clients': 'screen-clients',
    'sc-mkt-goals': 'screen-goals',
    'sc-mkt-actions': 'screen-actions',
    'sc-mkt-history': 'screen-history',
    'sc-mkt-assets': 'screen-assets',
    'sc-mkt-ai-decisions': 'screen-ai-center',
    'sc-mkt-reports': 'screen-reports',
    'sc-mkt-agents': 'screen-agents'
  };

  var FIELD_MAP = [
    { ctx: 'company', ids: ['gf-company', 'ag-company', 'act-company', 'hist-company', 'ai-company', 'rep-company'], displayIds: ['sf-company-display'] },
    { ctx: 'site', ids: ['sf-site', 'gf-site', 'ag-site', 'act-site', 'hist-site', 'ai-site', 'rep-site'] },
    { ctx: 'domain', ids: ['gf-domain', 'ag-domain', 'act-domain'] },
    { ctx: 'page', ids: ['sf-page', 'gf-page', 'act-page', 'hist-page', 'ai-page', 'rep-page'] },
    { ctx: 'campaign', ids: ['sf-campaign', 'gf-campaign', 'act-campaign', 'hist-campaign', 'ai-campaign', 'rep-campaign', 'coco-central-campaign'] },
    { ctx: 'campaignType', ids: ['sf-campaign-type', 'gf-campaign-type', 'act-campaign-type'] },
    { ctx: 'channel', ids: ['sf-channel', 'gf-channel', 'rep-channel'] },
    { ctx: 'status', ids: ['sf-status', 'gf-status', 'ag-status', 'act-status-adv', 'hist-status', 'rep-status'] },
    { ctx: 'dateRange', ids: ['sf-daterange', 'gf-date', 'act-date-range', 'hist-date', 'ai-date', 'rep-date'] },
    { ctx: 'dateFrom', ids: ['sf-date-from'] },
    { ctx: 'dateTo', ids: ['sf-date-to'] },
    { ctx: 'agent', ids: ['gf-agent', 'ag-agent', 'act-source', 'ai-agent', 'rep-ai-agent'] },
    { ctx: 'goal', ids: ['gf-goal-category', 'ai-goal', 'act-cat'] },
    { ctx: 'action', ids: ['act-type', 'hist-action-type'] },
    { ctx: 'project', ids: ['sf-project', 'gf-project', 'ag-project', 'act-project'] }
  ];

  var CTX_ID_INDEX = {};
  FIELD_MAP.forEach(function (row) {
    row.ids.forEach(function (id) { CTX_ID_INDEX[id] = row.ctx; });
  });

  function loadContext() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('coco-flow-context-v1');
      if (raw) Object.assign(COCO.flowContext, JSON.parse(raw));
    } catch (e) { /* ignore */ }
    if (window.GlobalFilterContext) {
      if (GlobalFilterContext.init) {
        GlobalFilterContext.init();
      } else {
        GlobalFilterContext.syncFromFlowContext();
        GlobalFilterContext.syncToFlowContext();
      }
    }
    var m = location.search.match(/[?&]customer=([^&]+)/);
    if (m) COCO.flowContext.clientId = decodeURIComponent(m[1]);
  }

  function saveContext() {
    if (window.GlobalFilterContext) {
      GlobalFilterContext.syncFromFlowContext();
      try {
        localStorage.setItem(GlobalFilterContext.STORAGE_KEY, JSON.stringify(GlobalFilterContext.get()));
      } catch (e) { /* ignore */ }
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(COCO.flowContext));
    } catch (e) { /* ignore */ }
  }

  function normalizeDomain(val) {
    if (!val) return '';
    return String(val).replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();
  }

  function resolveCompanySlug(name) {
    if (!name) return '';
    if (window.DaliaSite && DaliaSite.SITE) return DaliaSite.SITE.domain.replace(/\./g, '-');
    for (var key in DEMO_CLIENTS) {
      if (DEMO_CLIENTS[key].name === name || name.indexOf(key) !== -1) return DEMO_CLIENTS[key].company;
    }
    if (/דליה|dalia/i.test(name)) return 'dalia-c';
    return '';
  }

  function setFieldValue(el, val) {
    if (!el || val == null || val === '') return false;
    if (el.tagName === 'SELECT') {
      if (el.value === val) return false;
      var opts = el.options;
      for (var i = 0; i < opts.length; i++) {
        if (opts[i].value === val || opts[i].text === val) {
          el.value = opts[i].value || opts[i].text;
          return true;
        }
      }
      for (var j = 0; j < opts.length; j++) {
        if (opts[j].text.indexOf(val) !== -1 || String(val).indexOf(opts[j].text) !== -1) {
          el.value = opts[j].value || opts[j].text;
          return true;
        }
      }
      return false;
    }
    if (el.tagName === 'INPUT' && el.type !== 'checkbox') {
      if (el.value === val) return false;
      el.value = val;
      return true;
    }
    if (el.id === 'sf-company-display' || el.id === 'coco-hub-client-name') {
      var text = String(val).indexOf('🏢') === 0 ? val : ('🏢 ' + val);
      if (el.textContent !== text) { el.textContent = text; return true; }
    }
    return false;
  }

  function propagateField(ctxKey, val, skipId) {
    if (SYNC_GUARD || val == null || val === '') return;
    var row = FIELD_MAP.find(function (r) { return r.ctx === ctxKey; });
    if (!row) return;
    SYNC_GUARD = true;
    row.ids.forEach(function (id) {
      if (id === skipId) return;
      var el = document.getElementById(id);
      if (el) setFieldValue(el, val);
    });
    (row.displayIds || []).forEach(function (id) {
      if (id === skipId) return;
      var el = document.getElementById(id);
      if (el) setFieldValue(el, ctxKey === 'company' ? (COCO.flowContext.clientName || val) : val);
    });
    if (ctxKey === 'site' && val) {
      var dom = normalizeDomain(val);
      COCO.flowContext.domain = dom;
      propagateField('domain', dom, skipId);
    }
    SYNC_GUARD = false;
  }

  function syncFromElement(el) {
    if (SYNC_GUARD || !el || !el.id) return;
    var ctxKey = CTX_ID_INDEX[el.id];
    if (!ctxKey) return;
    var val = (el.tagName === 'SELECT' || el.tagName === 'INPUT') ? el.value : (el.textContent || '').trim();
    if (!val && ctxKey !== 'dateRange') return;
    COCO.flowContext[ctxKey] = val;
    if (ctxKey === 'company' && el.tagName === 'SELECT' && el.selectedIndex >= 0) {
      var optText = el.options[el.selectedIndex].text;
      if (optText && optText !== 'כל החברות') COCO.flowContext.clientName = optText;
    }
    saveContext();
    propagateField(ctxKey, val, el.id);
    updateHubClientHeader();
    refreshScreenFilters();
    if (window.CocoData && CocoData.onContextChange) CocoData.onContextChange();
  }

  function applyContextGlobally() {
    SYNC_GUARD = true;
    var ctx = COCO.flowContext;
    FIELD_MAP.forEach(function (row) {
      var val = ctx[row.ctx];
      if (val == null || val === '') return;
      row.ids.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) setFieldValue(el, val);
      });
      (row.displayIds || []).forEach(function (id) {
        var el = document.getElementById(id);
        if (el) setFieldValue(el, row.ctx === 'company' ? (ctx.clientName || val) : val);
      });
    });
    if (ctx.dateRange === 'custom') {
      var panel = document.getElementById('sf-date-custom');
      if (panel) panel.style.display = 'flex';
    }
    SYNC_GUARD = false;
    updateHubClientHeader();
    refreshScreenFilters();
    if (window.CocoData && CocoData.onContextChange) CocoData.onContextChange();
  }

  function captureContextFromScreen(screenId) {
    var screen = document.getElementById(screenId);
    if (!screen) return;
    screen.querySelectorAll('select[id], input[id].filter-input, input[id][type="date"]').forEach(function (el) {
      if (!CTX_ID_INDEX[el.id]) return;
      var val = el.value;
      if (val) COCO.flowContext[CTX_ID_INDEX[el.id]] = val;
    });
    var disp = document.getElementById('sf-company-display');
    if (disp && disp.textContent) COCO.flowContext.clientName = disp.textContent.replace(/^🏢\s*/, '').trim();
    saveContext();
  }

  function topActiveScreen() {
    var root = document.getElementById('coco-claude-root');
    return root ? root.querySelector(':scope > .screen.active') : document.querySelector('.screen.active');
  }

  function refreshScreenFilters() {
    var active = topActiveScreen();
    if (!active) return;
    var id = active.id;
    if (id === 'screen-status' && typeof applyStatusFilter === 'function') applyStatusFilter();
    if (id === 'screen-goals' && typeof applyGoalsAgentFilter === 'function') applyGoalsAgentFilter();
    if (id === 'screen-actions' && typeof applyActFilter === 'function') applyActFilter();
    if (id === 'screen-agents' && typeof applyAgentFilter === 'function') applyAgentFilter();
  }

  function updateHubClientHeader() {
    var ctx = COCO.flowContext;
    var nameEl = document.getElementById('coco-hub-client-name');
    var subEl = document.getElementById('coco-hub-client-sub');
    if (nameEl && ctx.clientName) nameEl.textContent = '🏢 ' + ctx.clientName;
    if (subEl && ctx.site) subEl.textContent = (ctx.site) + (ctx.clientId ? (' • ID: ' + ctx.clientId) : '');
  }

  function updateUrlClientId() {
    var id = COCO.flowContext.clientId;
    if (!id || String(id).indexOf('demo-') === 0) return;
    try {
      var u = new URL(location.href);
      u.searchParams.set('customer', id);
      try {
        if (sessionStorage.getItem('coco-mkt-fullscreen') === '1') u.searchParams.set('fullscreen', '1');
      } catch (e) { /* ignore */ }
      var ver = u.searchParams.get('v') || (document.querySelector('meta[name="ui-version"]') || {}).content;
      if (ver) u.searchParams.set('v', ver);
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch (e) { /* ignore */ }
  }

  function populateSelectOptions(selectIds, items, valueKey, labelKey) {
    selectIds.forEach(function (sid) {
      var sel = document.getElementById(sid);
      if (!sel) return;
      items.forEach(function (item) {
        var val = typeof item === 'string' ? item : (item[valueKey] || item.name || '');
        var label = typeof item === 'string' ? item : (item[labelKey] || item.name || val);
        if (!val) return;
        var exists = Array.prototype.some.call(sel.options, function (o) {
          return o.value === val || o.text === label;
        });
        if (!exists) {
          var o = document.createElement('option');
          o.value = val;
          o.textContent = label;
          sel.appendChild(o);
        }
      });
    });
  }

  function populateSiteOptions(sites) {
    var siteIds = (FIELD_MAP.find(function (r) { return r.ctx === 'site'; }) || {}).ids || [];
    var domains = (sites || []).map(function (s) { return s.domain || s.site_url; }).filter(Boolean).map(normalizeDomain);
    populateSelectOptions(siteIds, domains);
  }

  function populateCampaignOptions(campaigns) {
    var campIds = (FIELD_MAP.find(function (r) { return r.ctx === 'campaign'; }) || {}).ids || [];
    populateSelectOptions(campIds, campaigns || [], 'name', 'name');
  }

  function applyClientContext(patch) {
    Object.assign(COCO.flowContext, patch);
    if (patch.site) COCO.flowContext.domain = normalizeDomain(patch.site);
    saveContext();
    applyContextGlobally();
    updateUrlClientId();
    if (typeof showToast === 'function' && patch.clientName) {
      showToast('🏢 לקוח פעיל: ' + patch.clientName);
    }
  }

  var _goScreen = window.goScreen;
  window.goScreen = function (id) {
    if (id === 'screen-ai-decisions') id = 'screen-ai-center';
    var active = topActiveScreen();
    if (active) captureContextFromScreen(active.id);
    if (typeof _goScreen === 'function') _goScreen(id);
    else {
      document.querySelectorAll('#coco-claude-root .screen').forEach(function (s) {
        s.classList.toggle('active', s.id === id);
      });
    }
    document.body.classList.add('coco-claude-layout');
    applyContextGlobally();
    if (window.CocoClaude) CocoClaude.onScreenChange(id);
  };

  window.gotoSc = function (id) {
    var key = (id || '').replace(/^sc-/, '');
    var mapped = GOTO_MAP[id] || GOTO_MAP[key];
    if (mapped) {
      goScreen(mapped);
      return;
    }
    document.body.classList.remove('coco-claude-layout');
    if (typeof window._gotoScLegacy === 'function') window._gotoScLegacy(id);
  };

  window.CocoClaude = {
    FLOW_CHAIN: FLOW_CHAIN,
    init: function () {
      if (!document.getElementById('screen-hub')) {
        console.warn('CocoClaude.init: screen-hub missing');
        return;
      }
      if (window.ClientIdSsot && ClientIdSsot.applyFlowContext) ClientIdSsot.applyFlowContext();
      loadContext();
      applyContextGlobally();
      goScreen('screen-hub');
      this.wireContextListeners();
      this.applyPermissions();
      var cid = COCO.flowContext.clientId;
      if (window.DaliaSite && DaliaSite.SITE) {
        if (window.CocoData && CocoData.load) CocoData.load(DaliaSite.SITE.clientId);
        return;
      }
      if (cid && window.CocoData && CocoData.load) {
        CocoData.load(cid);
      } else if (!cid && !COCO.flowContext.clientName) {
        if (window.MarketingApi && MarketingApi.canRemote && MarketingApi.canRemote()) {
          MarketingApi.listMarketingCustomers().then(function (rows) {
            if (rows && rows[0] && window.CocoData && CocoData.selectCustomer) {
              CocoData.selectCustomer(rows[0].id);
            } else if (typeof showToast === 'function') {
              showToast('אין לקוחות שיווק — צור לקוח בדליה עם סוג שירות שיווק');
            }
          });
        }
      }
    },
    onScreenChange: function (id) {
      applyContextGlobally();
      if (window.CocoData && CocoData.bindScreen) CocoData.bindScreen(id);
    },
    wireFlowNav: function () { /* 1:1 Claude UI */ },
    wireContextListeners: function () {
      var root = document.getElementById('coco-claude-root');
      if (!root) return;
      root.addEventListener('change', function (e) {
        var t = e.target;
        if (t && t.id && CTX_ID_INDEX[t.id]) syncFromElement(t);
      });
      root.addEventListener('input', function (e) {
        var t = e.target;
        if (t && t.id && CTX_ID_INDEX[t.id] && t.tagName === 'INPUT') syncFromElement(t);
      });
    },
    setClientId: function (id) {
      COCO.flowContext.clientId = id;
      saveContext();
      updateUrlClientId();
    },
    bindDemoClient: function (nameKey) {
      var demo = DEMO_CLIENTS[nameKey];
      if (!demo) {
        COCO.flowContext.clientName = nameKey;
        COCO.flowContext.company = nameKey;
        saveContext();
        applyContextGlobally();
        return;
      }
      applyClientContext({
        clientId: demo.id,
        clientName: demo.name,
        company: demo.company,
        site: demo.site,
        domain: demo.site
      });
      if (demo.sub) {
        var subEl = document.getElementById('coco-hub-client-sub');
        if (subEl) subEl.textContent = demo.sub;
      }
    },
    bindClientFromDalia: function (bundle) {
      if (!bundle || !bundle.customer) return;
      var c = bundle.customer;
      var p = bundle.profile || {};
      var sites = bundle.sites || [];
      var campaigns = bundle.campaigns || [];
      var primary = sites.find(function (s) { return s.site_type !== 'landing'; }) || sites[0];
      var siteVal = primary ? normalizeDomain(primary.domain || primary.site_url || '') : normalizeDomain(p.website || '');
      populateSiteOptions(sites);
      populateCampaignOptions(campaigns);
      applyClientContext({
        clientId: c.id,
        clientName: c.name || '',
        company: resolveCompanySlug(c.name) || COCO.flowContext.company,
        site: siteVal,
        domain: siteVal
      });
      if (window.CocoData && CocoData.setBundle) CocoData.setBundle(bundle);
    },
    bindClientData: function (data) {
      if (!data) return;
      var c = data.client || data.customer || data;
      if (c.id) COCO.flowContext.clientId = c.id;
      if (c.name) {
        COCO.flowContext.clientName = c.name;
        COCO.flowContext.company = c.name;
      }
      saveContext();
      applyContextGlobally();
    },
    applyContextGlobally: applyContextGlobally,
    applyPermissions: function () {
      var role = (window.COCO_AUTH && COCO_AUTH.role) || 'super_admin';
      var canAct = role === 'super_admin' || role === 'admin';
      COCO.permissions = COCO.permissions || {};
      COCO.permissions.canAct = canAct;
      if (!canAct) {
        document.querySelectorAll('#coco-claude-root .btn-green, #coco-claude-root .btn-red').forEach(function (btn) {
          if (/אשר|דחה|בצע/.test(btn.textContent)) {
            btn.disabled = true;
            btn.style.opacity = '0.45';
            btn.title = 'צפייה בלבד';
          }
        });
      }
    }
  };

  loadContext();
})();
