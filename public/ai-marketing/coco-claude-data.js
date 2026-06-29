/**
 * Phase D — חיבור נתונים אמיתיים (דליה / MarketingApi / Client ID) לכל מסכי Claude UI
 */
(function () {
  'use strict';

  var PROVIDER_LABELS = {
    google_analytics: 'Google Analytics 4', google_search_console: 'Search Console',
    google_ads: 'Google Ads', google_business: 'Google Business Profile',
    google_tag_manager: 'Google Tag Manager', gmail: 'Gmail', google_workspace: 'Google Workspace',
    facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', linkedin: 'LinkedIn',
    youtube: 'YouTube', whatsapp_business: 'WhatsApp Business',
  };

  var PROVIDER_ICONS = {
    google_analytics: '📊', google_search_console: '🔍', google_ads: '📢',
    google_business: '📍', facebook: '📘', instagram: '📸', linkedin: '💼',
    youtube: '▶️', tiktok: '🎵', website: '🌐',
  };

  var SERVICE_LABELS = {
    fleet_only: 'ניהול צי בלבד',
    marketing_only: 'שיווק בלבד',
    fleet_and_marketing: 'שיווק + צי',
  };

  var state = {
    bundle: null,
    customers: [],
    metrics: [],
    activity: [],
    meta: { source: 'pending', clientSource: 'pending', kpiSource: 'pending', loadedAt: null },
    loading: false,
  };

  var NO_DATA = '—';
  var PENDING = 'ממתין לחיבור';

  function isRemoteAuth() {
    return window.MarketingApi && MarketingApi.canRemote && MarketingApi.canRemote();
  }

  function emptyStatus(msg) {
    return '<div class="alert alert-info">' + esc(msg || 'אין נתונים — חבר מקורות או סנכרן Google') + '</div>';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function fmt(n) {
    if (n == null || n === '') return '—';
    return Number(n).toLocaleString('he-IL');
  }

  function ctx() {
    return (window.COCO && COCO.flowContext) || {};
  }

  function normList(arr, prefix) {
    if (!Array.isArray(arr)) return [];
    return arr.map(function (item, i) {
      if (typeof item === 'string') {
        return { id: prefix + '-' + i, title: item, status: 'pending', category: 'כללי' };
      }
      return Object.assign({ id: item.id || prefix + '-' + i, title: item.title || item.name || 'פריט', status: item.status || 'pending' }, item);
    });
  }

  function matchFilter(val, filterVal) {
    if (!filterVal) return true;
    if (!val) return false;
    return String(val).toLowerCase().indexOf(String(filterVal).toLowerCase()) !== -1 ||
      String(filterVal).toLowerCase().indexOf(String(val).toLowerCase()) !== -1;
  }

  function isLiveGoalsActionsMode() {
    return !!(window.DaliaSite && DaliaSite.isLiveOnly && DaliaSite.isLiveOnly());
  }

  function applyCtxFilter(items, mapFn) {
    if (window.FilterEngine && FilterEngine.filter) {
      return FilterEngine.filter(items, mapFn);
    }
    var c = ctx();
    var free = (c.freeSearch || '').trim().toLowerCase();
    if (isLiveGoalsActionsMode()) {
      if (!free) return items;
      return items.filter(function (item) {
        return JSON.stringify(item).toLowerCase().indexOf(free) >= 0;
      });
    }
    return items.filter(function (item) {
      var m = mapFn(item);
      if (free) {
        var blob = JSON.stringify(item).toLowerCase();
        if (blob.indexOf(free) === -1) return false;
      }
      if (c.serviceType && m.serviceType && !matchFilter(m.serviceType, c.serviceType)) return false;
      if (c.customerStatus && m.customerStatus && !matchFilter(m.customerStatus, c.customerStatus)) return false;
      if (c.site && m.site && !matchFilter(m.site, c.site)) return false;
      if (c.campaign && m.campaign && !matchFilter(m.campaign, c.campaign)) return false;
      if (c.channel && m.channel && !matchFilter(m.channel, c.channel)) return false;
      if (c.status && m.status && !matchFilter(m.status, c.status)) return false;
      if (c.page && m.page && !matchFilter(m.page, c.page)) return false;
      if (c.goal && m.goal && !matchFilter(m.goal, c.goal)) return false;
      if (c.action && m.action && !matchFilter(m.action, c.action)) return false;
      return true;
    });
  }

  function getDashboard() {
    var d = window.COCO && COCO.data;
    if (!d) return null;
    return d.stats || d.kpis || null;
  }

  function getKeywords() {
    var d = window.COCO && COCO.data;
    if (d && d.keywords && d.keywords.length) return d.keywords;
    if (d && d.searchConsole && d.searchConsole.keywords) {
      return d.searchConsole.keywords.map(function (k) {
        return { keyword: k.query, rank: Math.round(k.position || 0), clicks: k.clicks, volume: k.impressions, ctr: ((k.ctr || 0) * 100).toFixed(1) + '%' };
      });
    }
    return [];
  }

  function ensureLiveMount(id, screenId, tabId) {
    if (document.getElementById(id)) return document.getElementById(id);
    var div = document.createElement('div');
    div.id = id;
    div.className = 'coco-live-section';
    div.style.cssText = 'padding:12px 16px 16px;';
    if (tabId) {
      var tab = document.getElementById(tabId);
      if (tab) {
        var header = tab.querySelector('.page-header');
        if (header) header.insertAdjacentElement('afterend', div);
        else tab.insertBefore(div, tab.firstChild);
        return div;
      }
    }
    var screen = document.getElementById(screenId);
    if (!screen) return null;
    var content = screen.querySelector('.content');
    if (!content) return null;
    content.insertBefore(div, content.firstChild);
    return div;
  }

  function crmCounts() {
    if (!window.DaliaCrm || typeof DaliaCrm.getCounts !== 'function') return null;
    return DaliaCrm.getCounts();
  }

  function deriveKpis(bundle) {
    var dash = getDashboard();
    var k = window.COCO && COCO.data && COCO.data.kpis;
    var gsc = (state.metrics || []).find(function (m) { return m.provider === 'google_search_console'; });
    var ga4 = (state.metrics || []).find(function (m) { return m.provider === 'google_analytics'; });
    var cc = crmCounts();
    var leadsVal = cc ? cc.leads : NO_DATA;
    var tasksVal = cc ? cc.openTasks : NO_DATA;
    if (gsc && gsc.metric_value) {
      var gv = gsc.metric_value;
      state.meta.kpiSource = 'supabase';
      return {
        siteScore: NO_DATA,
        visits: fmt(ga4 && ga4.metric_value && ga4.metric_value.sessions),
        leads: fmt(leadsVal),
        openTasks: fmt(tasksVal),
        clicks: fmt(gv.clicks),
        impressions: fmt(gv.impressions),
        ctr: gv.ctr != null ? (Number(gv.ctr) * 100).toFixed(1) + '%' : NO_DATA,
        position: gv.position != null ? Number(gv.position).toFixed(1) : NO_DATA,
      };
    }
    if (k && k.weeklyClicks) {
      state.meta.kpiSource = 'live';
      return {
        siteScore: NO_DATA,
        visits: (k.weeklyClicks && k.weeklyClicks.value) || NO_DATA,
        leads: fmt(leadsVal !== NO_DATA ? leadsVal : ((k.pendingDrafts && k.pendingDrafts.value) || NO_DATA)),
        openTasks: fmt(tasksVal !== NO_DATA ? tasksVal : ((k.aiOpportunities && k.aiOpportunities.value) || NO_DATA)),
        clicks: (k.weeklyClicks && k.weeklyClicks.value) || NO_DATA,
        impressions: (k.weeklyImpressions && k.weeklyImpressions.value) || NO_DATA,
        ctr: (k.avgCtr && k.avgCtr.value) || NO_DATA,
        position: (k.avgPosition && k.avgPosition.value) || NO_DATA,
      };
    }
    if (dash) {
      state.meta.kpiSource = 'live';
      return {
        siteScore: NO_DATA,
        visits: fmt(dash.ga4Sessions != null ? dash.ga4Sessions : dash.totalClicks),
        leads: fmt(leadsVal !== NO_DATA ? leadsVal : (dash.pendingDrafts != null ? dash.pendingDrafts : NO_DATA)),
        openTasks: fmt(tasksVal !== NO_DATA ? tasksVal : (dash.opportunities != null ? dash.opportunities : (dash.pendingDrafts != null ? dash.pendingDrafts : NO_DATA))),
        clicks: fmt(dash.totalClicks),
        impressions: fmt(dash.totalImpressions),
        ctr: dash.avgCtr != null ? (Number(dash.avgCtr) * (dash.avgCtr < 1 ? 100 : 1)).toFixed(1) + '%' : NO_DATA,
        position: dash.avgPosition != null ? Number(dash.avgPosition).toFixed(1) : NO_DATA,
      };
    }
    state.meta.kpiSource = 'pending';
    return { siteScore: NO_DATA, visits: NO_DATA, leads: NO_DATA, openTasks: NO_DATA, clicks: NO_DATA, impressions: NO_DATA, ctr: NO_DATA, position: NO_DATA };
  }

  var REC_STATUS_LABELS = {
    ok: 'תקין',
    needs_improvement: 'דורש שיפור',
    fail: 'לא תקין',
    pending: 'ממתין',
    na: 'לא רלוונטי',
  };

  function deriveWorkPages(bundle) {
    var wp = (bundle && bundle.workPlan) ||
      (window.DaliaSite && DaliaSite.getWorkPlan && DaliaSite.getWorkPlan());
    var pages = (wp && wp.pages) || (bundle && bundle.pageTasks) || [];
    if (pages.length) {
      state.meta.goalsSource = 'dalia';
      return pages;
    }
    state.meta.goalsSource = 'pending';
    return [];
  }

  function deriveActionsFromBundle(bundle) {
    var wp = (bundle && bundle.workPlan) ||
      (window.DaliaSite && DaliaSite.getWorkPlan && DaliaSite.getWorkPlan());
    var raw = (wp && wp.actions) || (bundle && bundle.ai && bundle.ai.work_plan) || [];
    return raw;
  }

  function fetchWorkPlanFallback() {
    var base = window.COCO_PAGES_BASE || '/future-craft-core/';
    if (base.charAt(0) !== '/') base = '/' + base.replace(/^\.\//, '');
    var url = location.origin + base + 'project-001/site-work-plan.json?t=' + Date.now();
    return fetch(url, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  function resolveLiveBundle(bundle) {
    bundle = bundle || state.bundle;
    if (bundle && deriveWorkPages(bundle).length) return Promise.resolve(bundle);
    if (window.DaliaSite && DaliaSite.getWorkPlan) {
      var wp = DaliaSite.getWorkPlan();
      if (wp && wp.pages && wp.pages.length && DaliaSite.buildLiveBundle) {
        var dash = (DaliaSite.getDashboard && DaliaSite.getDashboard()) || { stats: {}, connections: {} };
        bundle = DaliaSite.buildLiveBundle(dash);
        state.bundle = bundle;
        return Promise.resolve(bundle);
      }
    }
    if (window.DaliaSite && DaliaSite.whenReady) {
      return DaliaSite.whenReady().then(function () {
        if (state.bundle && deriveWorkPages(state.bundle).length) return state.bundle;
        if (DaliaSite.buildLiveBundle) {
          var d = (DaliaSite.getDashboard && DaliaSite.getDashboard()) || { stats: {}, connections: {} };
          state.bundle = DaliaSite.buildLiveBundle(d);
          if (deriveWorkPages(state.bundle).length) return state.bundle;
        }
        return fetchWorkPlanFallback().then(function (wp) {
          if (wp && window.DaliaSite && DaliaSite.hydrateWorkPlan) {
            return DaliaSite.hydrateWorkPlan(wp) || state.bundle;
          }
          return state.bundle;
        });
      });
    }
    return fetchWorkPlanFallback().then(function (wp) {
      if (wp && window.DaliaSite && DaliaSite.hydrateWorkPlan) {
        return DaliaSite.hydrateWorkPlan(wp) || state.bundle;
      }
      return bundle || null;
    });
  }

  var _goalsBindGen = 0;

  function deriveGoals(bundle) {
    var pages = deriveWorkPages(bundle);
    if (pages.length) return pages;
    var ai = bundle && bundle.ai;
    var goals = normList(ai && ai.initial_goals, 'goal');
    if (goals.length) {
      state.meta.goalsSource = 'dalia';
      return goals;
    }
    return [];
  }

  function deriveActions(bundle) {
    var raw = deriveActionsFromBundle(bundle);
    var actions = normList(raw, 'act').map(function (a) {
      a.status = a.status || 'pending';
      a.urgency = a.urgency || a.priority || 'בינוני';
      a.source = a.source || 'checklist';
      return a;
    });
    if (!actions.length) {
      state.meta.actionsSource = 'pending';
      return [];
    }
    state.meta.actionsSource = 'dalia';
    return actions;
  }

  function recStatusBadge(status) {
    var map = {
      ok: 'badge-green',
      needs_improvement: 'badge-yellow',
      fail: 'badge-red',
      pending: 'badge-gray',
      na: 'badge-gray',
    };
    var label = REC_STATUS_LABELS[status] || status || '—';
    return '<span class="badge ' + (map[status] || 'badge-gray') + '">' + esc(label) + '</span>';
  }

  var LEGACY_ACTIONS_TAB_IDS = [
    'tab-act-new', 'tab-act-pending', 'tab-act-progress', 'tab-act-done',
    'tab-act-rejected', 'tab-act-history', 'tab-act-summary', 'actions-legacy-filters',
  ];

  function purgeLegacyActionsDom() {
    if (!isLiveGoalsActionsMode()) return 0;
    var screen = document.getElementById('screen-actions');
    if (!screen) return 0;
    var removed = 0;
    LEGACY_ACTIONS_TAB_IDS.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) { el.remove(); removed++; }
    });
    var tabs = screen.querySelector('.nav-tabs');
    if (tabs) { tabs.remove(); removed++; }
    screen._legacyActionsPurged = true;
    return removed;
  }

  function hideLegacyGoalsActionsUi(screenId) {
    var screen = document.getElementById(screenId);
    if (!screen) return;
    var liveOnly = isLiveGoalsActionsMode();
    var liveId = screenId === 'screen-goals' ? 'coco-live-goals-list' : 'coco-live-actions-pending';
    var live = document.getElementById(liveId);
    var hasLive = live && live.innerHTML.trim().length > 80;
    if (!liveOnly && !hasLive) return;

    if (screenId === 'screen-actions' && liveOnly && !screen._legacyActionsPurged) {
      purgeLegacyActionsDom();
    }

    var tabs = screen.querySelector('.nav-tabs');
    if (tabs) tabs.style.display = 'none';

    screen.querySelectorAll(':scope > div').forEach(function (el) {
      if (el.id === 'coco-unified-context-bar' || el.classList.contains('coco-unified-bar')) return;
      if (el.classList.contains('gfc-slot')) return;
      if (el.classList.contains('topbar') || el.classList.contains('content') || el.classList.contains('fab-ai')) return;
      if (!el.classList.contains('coco-live-section')) el.style.display = 'none';
    });

    screen.querySelectorAll('[style*="border-bottom"]').forEach(function (el) {
      if (el.id === 'coco-unified-context-bar' || el.classList.contains('coco-unified-bar')) return;
      if (el.closest('#coco-unified-context-bar') || el.closest('#coco-gfc-chrome')) return;
      if (el.closest('#' + screenId) && !el.closest('.coco-live-section')) el.style.display = 'none';
    });

    screen.querySelectorAll('.content > *').forEach(function (el) {
      if (el.id === liveId || el.classList.contains('coco-live-section')) {
        el.style.display = 'block';
        return;
      }
      if (live && el.contains && el.contains(live)) {
        el.style.display = 'block';
        el.querySelectorAll(':scope > *').forEach(function (child) {
          if (child.id !== liveId && !child.classList.contains('coco-live-section')) child.style.display = 'none';
        });
        return;
      }
      el.style.display = 'none';
    });

    if (live) {
      live.style.display = 'block';
      live.style.visibility = 'visible';
    }
    if (window.CocoUnified && CocoUnified.ensureGfcVisible) CocoUnified.ensureGfcVisible();
    if (window.CocoUnified && CocoUnified.placeContextBar) CocoUnified.placeContextBar(screenId);
  }

  function renderRecRowsMobile(recs) {
    return recs.map(function (r) {
      return '<div class="coco-rec-row">' +
        '<div class="coco-rec-head"><span class="coco-rec-num">' + r.order + '</span>' +
        '<span class="coco-rec-label">' + esc(r.labelHe) + '</span>' + recStatusBadge(r.status) + '</div>' +
        '<div class="coco-rec-meta">' + esc(r.source) + ' · ' + esc(r.priority || 'בינוני') +
        (r.detail ? (' · ' + esc(r.detail)) : '') + '</div></div>';
    }).join('');
  }

  window.CocoDataTogglePageRecs = function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.style.display = el.style.display === 'none' ? '' : 'none';
  };

  function deriveHistory(bundle) {
    var items = [];
    var campaigns = (bundle && bundle.campaigns) || [];
    campaigns.forEach(function (c) {
      items.push({ type: 'campaign', title: c.name, date: c.start_date || c.created_at, status: c.status, channel: c.channel, detail: 'קמפיין — ' + (c.campaign_type || '') });
    });
    var goals = deriveGoals(bundle).filter(function (g) { return g.status === 'done' || g.status === 'completed'; });
    goals.forEach(function (g) {
      items.push({ type: 'goal', title: g.title, date: g.completed_at || '', status: 'בוצע', detail: g.category || '' });
    });
    var activityRows = (bundle && bundle.activity) || state.activity || [];
    activityRows.forEach(function (a) {
      items.push({
        type: 'activity',
        title: a.title || a.action || 'פעילות',
        date: a.created_at,
        status: a.action || 'logged',
        detail: (a.module || 'מערכת') + (a.detail ? (' — ' + a.detail) : ''),
      });
    });
    if (window.DaliaCrm && typeof DaliaCrm.listActivityForClient === 'function') {
      var cid = ctx().clientId;
      if (cid) {
        (DaliaCrm.listActivityForClient(cid) || []).forEach(function (a) {
          items.push({
            type: 'crm',
            title: a.title || a.action_type || 'CRM',
            date: a.created_at,
            status: a.action_type || 'crm',
            detail: 'CRM — ' + (a.detail || a.title || ''),
          });
        });
      }
    }
    if (!items.length) {
      state.meta.historySource = 'pending';
      return [];
    }
    state.meta.historySource = state.activity.length ? 'unified' : 'dalia';
    return items.sort(function (a, b) {
      return String(b.date || '').localeCompare(String(a.date || ''));
    });
  }

  function deriveAssets(bundle) {
    var assets = [];
    (bundle && bundle.sites || []).forEach(function (s) {
      assets.push({ kind: 'site', icon: '🌐', name: s.name || 'אתר', status: s.status || 'active', detail: s.domain || s.site_url || '', connected: s.status === 'active' });
    });
    (bundle && bundle.connections || []).forEach(function (c) {
      assets.push({
        kind: 'connection', icon: PROVIDER_ICONS[c.provider] || '🔗',
        name: PROVIDER_LABELS[c.provider] || c.provider,
        status: c.status, detail: c.status === 'connected' ? 'מחובר' : 'לא מחובר',
        connected: c.status === 'connected',
      });
    });
    if (!assets.length) {
      state.meta.assetsSource = 'pending';
      if (window.DaliaSite && DaliaSite.SITE) {
        return [{ kind: 'site', icon: '🌐', name: DaliaSite.SITE.domain, status: 'active', detail: DaliaSite.SITE.url, connected: true }];
      }
      return [];
    }
    state.meta.assetsSource = 'dalia';
    return assets;
  }

  function deriveAiDecisions(bundle) {
    var ai = bundle && bundle.ai;
    var recs = normList(ai && ai.recommendations, 'rec');
    var report = (ai && ai.opening_report) || '';
    if (!recs.length && !report) {
      state.meta.aiSource = 'pending';
      return {
        team: [
          { name: 'ChatGPT', text: 'ממתין לנתונים אמיתיים מ-dalia-c.com', status: 'pending' },
          { name: 'Claude', text: 'ממתין לחיבור', status: 'pending' },
          { name: 'Gemini', text: 'ממתין לחיבור', status: 'pending' },
        ],
        summary: 'אין ניתוח AI — נדרשים נתוני GSC/GA4 וחיבור OpenAI.',
        findings: [{ level: 'warn', text: 'המערכת מוגדרת לנתונים אמיתיים בלבד — אין Demo.' }],
      };
    }
    state.meta.aiSource = 'dalia';
    var team = recs.slice(0, 3).map(function (r, i) {
      return { name: ['ChatGPT', 'Claude', 'Gemini'][i] || 'AI', text: r.title, status: 'done' };
    });
    while (team.length < 3) team.push({ name: 'AI Manager', text: 'ממתין לניתוח נוסף', status: 'pending' });
    return {
      team: team,
      summary: report || recs.map(function (r) { return r.title; }).join(' • '),
      findings: recs.slice(0, 4).map(function (r, i) {
        return { level: i === 0 ? 'err' : i < 3 ? 'warn' : 'ok', text: r.title };
      }),
    };
  }

  function statusBadge(status) {
    var s = String(status || '').toLowerCase();
    if (/active|connected|פעיל|בוצע|done|completed/.test(s)) return '<span class="badge badge-green">● פעיל</span>';
    if (/draft|pending|ממתין|review/.test(s)) return '<span class="badge badge-yellow">⏳ ממתין</span>';
    if (/paused|מושהה/.test(s)) return '<span class="badge badge-yellow">⏸ מושהה</span>';
    return '<span class="badge badge-gray">' + esc(status || '—') + '</span>';
  }

  function setHtml(id, html) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }

  function setText(sel, text) {
    var el = typeof sel === 'string' ? document.querySelector(sel) : sel;
    if (el) el.textContent = text;
  }

  function updateSourceBadge() {
    var badge = document.getElementById('coco-live-source-badge');
    if (!badge) return;
    var m = state.meta;
    var parts = [];
    if (m.clientSource === 'dalia' || m.clientSource === 'live') parts.push('dalia-c.com');
    else if (m.clientSource === 'pending') parts.push('ממתין');
    if (m.kpiSource === 'live') parts.push('KPI חי');
    else if (m.kpiSource === 'pending') parts.push('KPI ממתין');
    badge.textContent = parts.join(' · ');
  }

  function bindHub(bundle) {
    if (window.MarketingSsot && MarketingSsot.renderCommandCenter) {
      MarketingSsot.renderCommandCenter();
    } else {
      var kpis = deriveKpis(bundle);
      setHtml('coco-live-hub-kpis', [
        '<div class="card" style="padding:12px 14px;"><div class="card-title">קליקים (GSC)</div><div class="card-value" style="font-size:22px;">' + esc(kpis.clicks) + '</div></div>',
        '<div class="card" style="padding:12px 14px;"><div class="card-title">חשיפות (GSC)</div><div class="card-value" style="font-size:22px;">' + esc(kpis.impressions) + '</div></div>',
        '<div class="card" style="padding:12px 14px;"><div class="card-title">סשנים (GA4)</div><div class="card-value" style="font-size:22px;color:var(--accent2);">' + esc(kpis.visits) + '</div></div>',
        '<div class="card" style="padding:12px 14px;"><div class="card-title">מיקום ממוצע</div><div class="card-value" style="font-size:22px;color:var(--yellow);">' + esc(kpis.position) + '</div></div>',
      ].join(''));
    }
    if (window.DaliaSite && DaliaSite.renderHubAiBox) DaliaSite.renderHubAiBox(bundle);
    var goals = deriveGoals(bundle);
    var actions = deriveActions(bundle);
    var assets = deriveAssets(bundle);
    var aiRecs = (bundle && bundle.ai && bundle.ai.recommendations && bundle.ai.recommendations.length) || 0;
    var pendingAi = aiRecs ? (aiRecs + ' החלטות ממתינות') : '0 החלטות ממתינות';
    var ssotCounts = window.MarketingSsot ? MarketingSsot.getCounts() : null;
    var counts = {
      'screen-status': 'מצב',
      'screen-clients': (ssotCounts ? ssotCounts.clients : state.customers.length) + ' לקוחות',
      'screen-agents': (ssotCounts ? ssotCounts.activeAiAssistants : 0) + ' עוזרים פעילים',
      'screen-goals': (goals.length ? goals.length + ' עמודים' : '0 עמודים'),
      'screen-actions': actions.filter(function (a) { return a.status !== 'done' && a.status !== 'completed'; }).length + ' ממתינות',
      'screen-crm': (function () { var cc = crmCounts(); return cc ? (cc.customers + ' לקוחות פעילים') : PENDING; })(),
      'screen-history': deriveHistory(bundle).length + ' רשומות',
      'screen-assets': (ssotCounts ? ssotCounts.connectedAssets : assets.length) + ' נכסים',
      'screen-ai-center': pendingAi,
      'screen-ai-decisions': aiRecs ? (aiRecs + ' המלצות') : 'ממתין',
      'screen-reports': 'דוחות'
    };
    document.querySelectorAll('#screen-hub .hub-card').forEach(function (card) {
      card.style.display = '';
      var onclick = card.getAttribute('onclick') || '';
      Object.keys(counts).forEach(function (sid) {
        if (onclick.indexOf(sid) !== -1) {
          var cnt = card.querySelector('.hub-count');
          if (cnt) cnt.textContent = counts[sid];
        }
      });
    });
    if (window.DaliaSite && DaliaSite.restoreHubCards) DaliaSite.restoreHubCards();
    var crmCnt = document.getElementById('coco-hub-crm-count');
    if (crmCnt) {
      var cc = crmCounts();
      crmCnt.textContent = cc ? (cc.customers + ' לקוחות · ' + cc.leads + ' לידים') : PENDING;
    }
  }

  function bindStatus(bundle) {
    var dash = (bundle && bundle._dashboard) || (window.DaliaSite && DaliaSite.getDashboard && DaliaSite.getDashboard());
    if (dash && window.DaliaSite && DaliaSite.renderStatusLive) {
      DaliaSite.renderStatusLive(dash, null);
    }
    var kpis = deriveKpis(bundle);
    var c = ctx();
    setText('#tab-status-overview .page-subtitle', (c.clientName || 'לקוח פעיל') + ' • עדכון: ' + (state.meta.loadedAt ? new Date(state.meta.loadedAt).toLocaleString('he-IL') : 'עכשיו'));
    setHtml('coco-live-status-kpis', [
      '<div class="card"><div class="card-title">קליקים</div><div class="card-value">' + esc(kpis.clicks) + '</div></div>',
      '<div class="card"><div class="card-title">חשיפות</div><div class="card-value">' + esc(kpis.impressions) + '</div></div>',
      '<div class="card"><div class="card-title">CTR</div><div class="card-value">' + esc(kpis.ctr) + '</div></div>',
      '<div class="card"><div class="card-title">מיקום ממוצע</div><div class="card-value">' + esc(kpis.position) + '</div></div>',
    ].join(''));
    var keywords = applyCtxFilter(getKeywords(), function (k) { return { page: k.url }; });
    if (keywords.length) {
      setHtml('coco-live-status-keywords', keywords.slice(0, 8).map(function (k) {
        return '<tr><td>' + esc(k.keyword) + '</td><td>' + esc(k.rank) + '</td><td style="color:var(--green)">—</td><td>' + esc(k.clicks) + '</td></tr>';
      }).join(''));
    }
    var campaigns = applyCtxFilter((bundle && bundle.campaigns) || [], function (c) {
      return window.FilterMeta ? FilterMeta.campaign(c) : { campaign: c.name, channel: c.channel, status: c.status };
    });
    if (campaigns.length) {
      setHtml('coco-live-status-campaigns', campaigns.map(function (c) {
        return '<tr><td>' + esc(c.name) + '</td><td>₪' + fmt(c.budget) + '</td><td>—</td><td>—</td><td>' + statusBadge(c.status) + '</td></tr>';
      }).join(''));
    }
  }

  function bindAgents(bundle) {
    var c = ctx();
    var assetDom = c.site || c.domain || (window.AssetFlowSsot && AssetFlowSsot.getActiveAsset ? (AssetFlowSsot.getActiveAsset().domain || '') : '');
    var sub = document.querySelector('#screen-agents .page-subtitle');
    if (sub) {
      sub.textContent = (c.clientName || 'לקוח פעיל') + ' · נכס: ' + (assetDom || '—') + ' · Client ID: ' + (c.clientId ? String(c.clientId).slice(0, 8) + '…' : 'לא נבחר');
    }
    ensureLiveMount('coco-live-agents-context', 'screen-agents');
    setHtml('coco-live-agents-context',
      '<div class="alert alert-info" style="margin-bottom:12px;">AI משותף לכל המודולים · OpenAI · Claude · Gemini · נכס פעיל: <strong>' +
      esc(assetDom || '—') + '</strong>' + (c.campaignName || c.campaign ? (' · קמפיין: ' + esc(c.campaignName || c.campaign)) : '') + '</div>');
    if (window.AssetFlowSsot && AssetFlowSsot.wireActionButtons) AssetFlowSsot.wireActionButtons();
  }

  function bindClients() {
    if (window.DaliaSite && DaliaSite.isLiveOnly && DaliaSite.isLiveOnly()) {
      if (typeof DaliaSite.renderClientsLive === 'function') DaliaSite.renderClientsLive();
      if (typeof DaliaSite.renderClientsAssetsLive === 'function') DaliaSite.renderClientsAssetsLive();
      if (typeof DaliaSite.renderClientsSetupLive === 'function') DaliaSite.renderClientsSetupLive();
      if (window.MarketingSsot && MarketingSsot.renderClientsChannels) MarketingSsot.renderClientsChannels();
      if (window.AssetFlowSsot && AssetFlowSsot.wireActionButtons) AssetFlowSsot.wireActionButtons();
      state.meta.clientSource = 'live';
      return;
    }
    if (window.DaliaSite && typeof DaliaSite.renderClientsLive === 'function') {
      DaliaSite.renderClientsLive();
      state.meta.clientSource = 'live';
    }
    if (window.MarketingSsot && MarketingSsot.renderClientsChannels) {
      MarketingSsot.renderClientsChannels();
    }
    if (window.DaliaSite && typeof DaliaSite.renderClientsLive === 'function') return;
    var rows = state.customers;
    var c = ctx();
    if (c.serviceType) rows = rows.filter(function (x) { return x.service_type === c.serviceType; });
    if (c.customerStatus) rows = rows.filter(function (x) { return (x.status || '').toLowerCase() === c.customerStatus; });
    if (c.freeSearch) {
      var q = c.freeSearch.toLowerCase();
      rows = rows.filter(function (x) {
        return [x.name, x.contact_person, x.phone, x.email, x.id].join(' ').toLowerCase().indexOf(q) >= 0;
      });
    }
    if (!rows.length && isRemoteAuth()) {
      setHtml('coco-live-clients-list', emptyStatus('אין לקוחות שיווק בדליה — צור לקוח עם "ניהול שיווק בלבד" או "צי + שיווק"'));
      state.meta.clientSource = 'none';
      return;
    }
    if (!rows.length) {
      rows = window.DaliaSite ? [{ id: DaliaSite.SITE.clientId, name: DaliaSite.SITE.company, service_type: 'fleet_and_marketing', status: 'active' }] : [];
      state.meta.clientSource = rows.length ? 'live' : 'pending';
    }
    setHtml('coco-live-clients-list', rows.map(function (c) {
      var svc = SERVICE_LABELS[c.service_type] || c.service_type || '';
      var active = ctx().clientId === c.id;
      return '<div class="card" style="cursor:pointer;' + (active ? 'border-color:var(--accent);' : '') + '" data-client-id="' + esc(c.id) + '" onclick="CocoData.selectCustomer(\'' + esc(c.id) + '\')">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">' +
        '<div><div style="font-weight:700;font-size:14px;">🏢 ' + esc(c.name) + '</div>' +
        '<div style="font-size:12px;color:var(--white50);margin-top:2px;">' + esc(svc) + ' • ID: ' + esc(c.id).slice(0, 8) + '…</div>' +
        '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">' + statusBadge(c.status || 'active') +
        (active ? '<span class="badge badge-purple">לקוח פעיל</span>' : '') + '</div></div></div></div>';
    }).join(''));
  }

  function renderGoalsPages(pages, bundle) {
    var wp = bundle && bundle.workPlan;
    var campaignName = (wp && wp.campaign && wp.campaign.name) || 'קמפיין SEO';
    var header = '<div class="alert alert-info" style="margin-bottom:14px;">📌 ' + esc(campaignName) +
      ' · dalia-c.com · <strong>' + pages.length + '</strong> עמודים · <strong>20</strong> המלצות לכל עמוד</div>';
    var html = header + pages.map(function (p, idx) {
      var recs = p.recommendations || [];
      var openN = recs.filter(function (r) { return r.status !== 'ok' && r.status !== 'na'; }).length;
      var panelId = 'coco-page-recs-' + idx;
      var gscLine = p.gsc ? ('GSC: ' + (p.gsc.clicks || 0) + ' קליקים · ' + (p.gsc.impressions || 0) + ' חשיפות') : 'GSC: —';
      var recRowsTable = recs.map(function (r) {
        return '<tr style="border-bottom:1px solid var(--border);">' +
          '<td style="padding:8px 6px;font-size:12px;color:var(--white50);width:28px;">' + r.order + '</td>' +
          '<td style="padding:8px 6px;font-size:12px;font-weight:600;">' + esc(r.labelHe) + '</td>' +
          '<td style="padding:8px 6px;">' + recStatusBadge(r.status) + '</td>' +
          '<td style="padding:8px 6px;font-size:11px;color:var(--white50);">' + esc(r.source) + '</td>' +
          '<td style="padding:8px 6px;font-size:11px;">' + esc(r.priority || 'בינוני') + '</td>' +
          '<td style="padding:8px 6px;font-size:11px;color:var(--white80);">' + esc(r.detail || '') + '</td></tr>';
      }).join('');
      var recRowsMobile = renderRecRowsMobile(recs);
      return '<div class="goal-acc-item card" style="margin-bottom:10px;overflow:hidden;" data-page-id="' + esc(p.id) + '">' +
        '<div onclick="CocoDataTogglePageRecs(\'' + panelId + '\')" style="padding:14px;cursor:pointer;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center;background:var(--bg3);">' +
        '<div style="flex:1;min-width:0;">' +
        '<div style="font-weight:700;font-size:14px;">#' + (p.rank || idx + 1) + ' · ' + esc(p.title || p.path) + '</div>' +
        '<div style="font-size:11px;color:var(--white50);margin-top:4px;">' +
        '<a href="' + esc(p.url) + '" target="_blank" rel="noopener" onclick="event.stopPropagation();" style="color:var(--accent2);">' + esc(p.path) + ' ↗</a>' +
        ' · SEO ' + esc(p.seoScore != null ? p.seoScore + '/10' : '—') + ' · ' + esc(gscLine) +
        ' · <strong>' + recs.length + '/20</strong> המלצות</div></div>' +
        '<div style="display:flex;gap:8px;align-items:center;flex-shrink:0;">' +
        '<span class="badge badge-yellow">' + openN + ' פתוחות</span>' +
        statusBadge(p.executionStatus === 'done' ? 'done' : (p.rank <= 3 ? 'active' : 'pending')) +
        '<span class="coco-acc-chevron" style="font-size:10px;color:var(--white50);">▼</span></div></div>' +
        '<div id="' + panelId + '" class="coco-page-rec-panel" style="display:' + (idx === 0 ? 'block' : 'none') + ';padding:0 14px 14px;">' +
        '<div class="coco-rec-mobile">' + recRowsMobile + '</div>' +
        '<div class="coco-rec-desktop table-wrap" style="overflow-x:auto;margin-top:8px;">' +
        '<table style="width:100%;border-collapse:collapse;min-width:520px;">' +
        '<thead><tr style="font-size:10px;color:var(--white50);text-align:right;">' +
        '<th style="padding:6px;">#</th><th style="padding:6px;">המלצה</th><th style="padding:6px;">סטטוס</th>' +
        '<th style="padding:6px;">מקור</th><th style="padding:6px;">עדיפות</th><th style="padding:6px;">פירוט</th></tr></thead>' +
        '<tbody>' + recRowsTable + '</tbody></table></div></div></div>';
    }).join('');
    setHtml('coco-live-goals-list', html);
    var goalsTab = document.querySelector('#screen-goals .nav-tab.active');
    if (goalsTab && /\(8\)/.test(goalsTab.textContent)) goalsTab.textContent = 'כל העמודים (' + pages.length + ')';
    var sub = document.querySelector('#screen-goals .page-subtitle');
    if (sub && isLiveGoalsActionsMode()) {
      sub.textContent = pages.length + ' עמודים · 20 המלצות לכל עמוד · נתונים מ-site-work-plan.json';
    }
    hideLegacyGoalsActionsUi('screen-goals');
  }

  function bindGoals(bundle) {
    var gen = ++_goalsBindGen;
    ensureLiveMount('coco-live-goals-list', 'screen-goals');

    function tryRender(b) {
      if (gen !== _goalsBindGen) return true;
      var pages = applyCtxFilter(deriveWorkPages(b), function (p) {
        return window.FilterMeta ? FilterMeta.page(p) : { page: p.path, status: p.executionStatus, goal: p.title };
      });
      if (!pages.length) {
        setHtml('coco-live-goals-list', emptyStatus('אין תוצאות לסינון הנוכחי'));
        hideLegacyGoalsActionsUi('screen-goals');
        return true;
      }
      renderGoalsPages(pages, b || state.bundle);
      return true;
    }

    if (tryRender(bundle || state.bundle)) return;

    var existing = document.querySelectorAll('#coco-live-goals-list .goal-acc-item').length;
    if (existing >= 28) {
      tryRender(state.bundle);
      return;
    }

    setHtml('coco-live-goals-list', emptyStatus('טוען 28 עמודים מ-SSOT…'));
    hideLegacyGoalsActionsUi('screen-goals');

    resolveLiveBundle(bundle).then(function (b) {
      if (gen !== _goalsBindGen) return;
      if (tryRender(b)) return;
      setHtml('coco-live-goals-list',
        emptyStatus('לא ניתן לטעון site-work-plan.json — ') +
        '<button type="button" class="btn btn-primary" style="margin-top:10px;font-size:12px;" onclick="CocoData.retryGoals()">🔄 נסה שוב</button>');
      hideLegacyGoalsActionsUi('screen-goals');
    });
  }

  function renderActionsPages(bundle) {
    if (window.ActionsWorkbench && ActionsWorkbench.render) {
      var n = ActionsWorkbench.render(bundle, {
        applyCtxFilter: applyCtxFilter,
        deriveActions: deriveActions,
        setHtml: setHtml,
        statusBadge: statusBadge,
        emptyStatus: emptyStatus,
        isLiveGoalsActionsMode: isLiveGoalsActionsMode,
      });
      hideLegacyGoalsActionsUi('screen-actions');
      return n;
    }
    var actions = applyCtxFilter(deriveActions(bundle), function (a) {
      return window.FilterMeta ? FilterMeta.action(a) : { action: a.category, status: a.status, campaign: a.campaignId };
    });
    var pending = actions.filter(function (a) { return a.status !== 'done' && a.status !== 'completed'; });
    var done = actions.filter(function (a) { return a.status === 'done' || a.status === 'completed'; });
    var byPage = {};
    pending.forEach(function (a) {
      var key = a.pageId || a.pagePath || 'other';
      if (!byPage[key]) byPage[key] = { pagePath: a.pagePath, pageUrl: a.pageUrl, pageId: a.pageId, items: [] };
      byPage[key].items.push(a);
    });
    var pageGroups = Object.keys(byPage).map(function (k) { return byPage[k]; });
    pageGroups.sort(function (a, b) { return String(a.pagePath).localeCompare(String(b.pagePath)); });
    var wp = (bundle && bundle.workPlan) || (window.DaliaSite && DaliaSite.getWorkPlan && DaliaSite.getWorkPlan());
    var pendingHeader = '<div class="alert alert-info" style="margin-bottom:14px;">⚙️ ' +
      pending.length + ' פעולות פתוחות · ' + pageGroups.length + ' עמודים · קמפיין: ' +
      esc((wp && wp.campaign && wp.campaign.name) || 'SEO') + '</div>';
    setHtml('coco-live-actions-pending', pending.length ? pendingHeader + pageGroups.map(function (grp) {
      var pageLink = grp.pageUrl
        ? '<a href="' + esc(grp.pageUrl) + '" target="_blank" rel="noopener" style="color:var(--accent2);font-size:12px;">' + esc(grp.pagePath || '') + ' ↗</a>'
        : esc(grp.pagePath || '');
      var itemsHtml = grp.items.map(function (a) {
        return '<div class="action-card act-item" style="border-color:rgba(139,92,246,0.35);margin:8px 0 0;padding:12px;" data-page-id="' + esc(a.pageId || '') + '" data-rec="' + esc(a.recommendationType || '') + '">' +
          '<div class="action-title" style="font-size:13px;font-weight:700;">' + esc(a.title) + '</div>' +
          '<div style="font-size:11px;color:var(--white50);margin-top:6px;line-height:1.5;">' +
          'מקור: <strong style="color:var(--white80);">' + esc(a.source) + '</strong> · ' + statusBadge(a.urgency || a.priority) +
          ' · ' + statusBadge(a.status === 'in_progress' ? 'active' : 'pending') +
          (a.detail ? '<br>' + esc(a.detail) : '') +
          '</div></div>';
      }).join('');
      return '<div class="card" style="padding:14px;margin-bottom:14px;">' +
        '<div style="font-weight:700;margin-bottom:4px;">📄 ' + pageLink + '</div>' +
        '<div style="font-size:11px;color:var(--white50);margin-bottom:6px;">' + grp.items.length + ' פעולות</div>' +
        itemsHtml + '</div>';
    }).join('') : '<div class="alert alert-ok">אין פעולות ממתינות 🎉</div>');
    setHtml('coco-live-actions-done', done.length ? done.slice(0, 50).map(function (a) {
      return '<tr><td>' + esc(a.title) + '</td><td>' + esc(a.pagePath || '—') + '</td><td>' + esc(a.category) + '</td><td>' + esc(a.source) + '</td><td>' + statusBadge('done') + '</td></tr>';
    }).join('') : '<tr><td colspan="5">אין פעולות שהושלמו עדיין</td></tr>');
    hideLegacyGoalsActionsUi('screen-actions');
    var sub = document.querySelector('#screen-actions .page-subtitle');
    if (sub && isLiveGoalsActionsMode()) {
      sub.textContent = pending.length + ' פעולות · ' + pageGroups.length + ' עמודים · site-work-plan.json';
    }
    return pending.length;
  }

  function bindActions(bundle) {
    if (window.ActionsWorkbench && ActionsWorkbench.isUserScrolling && ActionsWorkbench.isUserScrolling()) {
      if (ActionsWorkbench.deferBind) {
        ActionsWorkbench.deferBind(function () { bindActions(bundle); });
        return;
      }
    }
    ensureLiveMount('coco-live-actions-pending', 'screen-actions');
    ensureLiveMount('coco-live-actions-done', 'screen-actions', 'tab-act-done');
    var count = renderActionsPages(bundle || state.bundle);
    if (count > 0 || !isLiveGoalsActionsMode()) return;
    var existing = document.querySelectorAll('#coco-live-actions-pending .coco-act-page-card, #coco-live-actions-pending .action-card').length;
    if (existing >= 50) return;
    setHtml('coco-live-actions-pending', emptyStatus('טוען פעולות מ-SSOT…'));
    hideLegacyGoalsActionsUi('screen-actions');
    resolveLiveBundle(bundle).then(function (b) {
      renderActionsPages(b || state.bundle);
    });
  }

  function bindHistory(bundle) {
    ensureLiveMount('coco-live-history-empty', 'screen-history');
    ensureLiveMount('coco-live-history-timeline', 'screen-history');
    var items = applyCtxFilter(deriveHistory(bundle), function (h) {
      return window.FilterMeta ? FilterMeta.history(h) : { campaign: h.title, status: h.status, action: h.detail };
    });
    setHtml('coco-live-history-timeline', items.length ? items.slice(0, 12).map(function (h) {
      var color = /בוצע|done|active/.test(h.status) ? 'var(--green)' : 'var(--yellow)';
      return '<div class="tl-item"><div class="tl-dot-wrap"><div class="tl-dot" style="background:' + color + '"></div><div class="tl-line"></div></div>' +
        '<div class="tl-content"><div class="tl-title">' + esc(h.title) + '</div>' +
        '<div class="tl-time">' + esc(h.date || '') + ' | ' + esc(h.detail || h.type) + ' | ' + esc(h.status) + '</div></div></div>';
    }).join('') : '<div class="alert alert-info">אין היסטוריה מתועדת — יופיע לאחר קמפיינים ופעולות בדליה.</div>');
    var sites = (bundle && bundle.sites) || [];
    setHtml('coco-live-history-site', sites.slice(0, 6).map(function (s) {
      return '<tr><td>' + esc((s.updated_at || s.created_at || '').slice(0, 10)) + '</td><td>' + esc(s.name) + '</td><td>אתר ' + esc(s.site_type) + '</td><td>דליה</td><td>' + statusBadge(s.status) + '</td></tr>';
    }).join('') || '<tr><td colspan="5">אין שינויי אתר מתועדים</td></tr>');
    var camps = (bundle && bundle.campaigns) || [];
    setHtml('coco-live-history-campaigns', camps.map(function (c) {
      return '<tr><td>' + esc((c.created_at || '').slice(0, 10)) + '</td><td>' + esc(c.name) + '</td><td>' + esc(c.campaign_type || 'עדכון') + '</td><td>' + statusBadge(c.status) + '</td></tr>';
    }).join('') || '<tr><td colspan="4">אין קמפיינים מתועדים</td></tr>');
  }

  function bindAssets(bundle) {
    var dash = (bundle && bundle._dashboard) || (window.DaliaSite && DaliaSite.getDashboard && DaliaSite.getDashboard());
    if (dash && window.DaliaSite && DaliaSite.renderAssetsLive) {
      DaliaSite.renderAssetsLive(dash);
      return;
    }
    var assets = applyCtxFilter(deriveAssets(bundle), function (a) {
      return window.FilterMeta ? FilterMeta.asset(a) : { site: a.detail, status: a.status };
    });
    setHtml('coco-live-assets-grid', assets.map(function (a) {
      return '<div class="asset-card" style="cursor:pointer;">' +
        '<div class="asset-header"><div class="asset-icon">' + a.icon + '</div><div><div class="asset-name">' + esc(a.name) + '</div>' +
        '<div class="asset-status">' + esc(a.detail) + '</div></div></div>' +
        statusBadge(a.connected ? 'connected' : a.status) + '</div>';
    }).join(''));
    var sub = document.querySelector('#screen-assets .page-subtitle');
    if (sub && bundle && bundle.customer) sub.textContent = 'מרכז שליטה — ' + bundle.customer.name;
  }

  function bindAiCenter(bundle) {
    bindAiDecisions(bundle);
    var data = deriveAiDecisions(bundle);
    var n = (data.findings && data.findings.length) || 0;
    setText('#hub-ai-count', n ? (n + ' החלטות ממתינות') : '0 החלטות ממתינות');
    var tabLabel = document.querySelector('#screen-ai-center .nav-tab[onclick*="tab-ai-decisions"]');
    if (tabLabel) tabLabel.textContent = '📋 החלטות (' + n + ')';
    var tbody = document.getElementById('ai-decisions-tbody');
    if (tbody && data.findings.length) {
      tbody.innerHTML = data.findings.slice(0, 8).map(function (f, i) {
        return '<tr><td>' + (i + 1) + '</td><td>—</td><td>—</td><td>—</td><td>—</td><td>' + esc(f.text) + '</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>';
      }).join('');
    }
  }

  function bindAiDecisions(bundle) {
    var data = deriveAiDecisions(bundle);
    setHtml('coco-live-ai-team', data.team.map(function (t) {
      return '<div class="card" style="padding:14px;"><div class="card-title">' + esc(t.name) + '</div>' +
        '<div style="font-size:12px;color:var(--white80);margin-top:8px;line-height:1.6;">' + esc(t.text) + '</div>' +
        statusBadge(t.status === 'done' ? 'done' : 'pending') + '</div>';
    }).join(''));
    setHtml('coco-live-ai-summary', esc(data.summary));
    setHtml('coco-live-ai-findings', data.findings.map(function (f) {
      var cls = f.level === 'err' ? 'alert-err' : f.level === 'warn' ? 'alert-warn' : f.level === 'ok' ? 'alert-ok' : 'alert-info';
      return '<div class="alert ' + cls + '">' + esc(f.text) + '</div>';
    }).join(''));
  }

  function bindReports(bundle) {
    var kpis = deriveKpis(bundle);
    var pages = deriveWorkPages(bundle);
    var goals = deriveGoals(bundle);
    var actions = deriveActions(bundle);
    var keywords = getKeywords();
    setHtml('coco-live-reports-grid', [
      { title: '📊 דוח מצב נוכחי', rows: [['קליקים GSC', kpis.clicks], ['סשנים GA4', kpis.visits], ['חשיפות', kpis.impressions]] },
      { title: '🔍 דוח SEO', rows: [['מילות מפתח', keywords.length || '—'], ['מיקום ממוצע', kpis.position], ['CTR', kpis.ctr]] },
      { title: '📢 דוח קמפיינים', rows: [['קמפיינים', (bundle && bundle.campaigns && bundle.campaigns.length) || 0], ['פעילים', (bundle && bundle.campaigns && bundle.campaigns.filter(function (c) { return c.status === 'active'; }).length) || 0], ['טיוטה', (bundle && bundle.campaigns && bundle.campaigns.filter(function (c) { return c.status === 'draft'; }).length) || 0]] },
      { title: '⚙️ דוח פעולות', rows: [['ממתינות', actions.filter(function (a) { return a.status !== 'done'; }).length], ['הושלמו', actions.filter(function (a) { return a.status === 'done'; }).length], ['סה״כ', actions.length]] },
      { title: '🎯 דוח מטרות', rows: [['עמודים', pages.length || goals.length], ['המלצות/עמוד', '20'], ['פתוחות (פעולות)', actions.filter(function (a) { return a.status !== 'done' && a.status !== 'completed'; }).length]] },
      { title: '📄 דוח עמודים עסקיים', rows: [['עמודים בתוכנית', (bundle && bundle.workPlan && bundle.workPlan.summary && bundle.workPlan.summary.pageCount) || 0], ['הושלמו', (bundle && bundle.workPlan && bundle.workPlan.summary && bundle.workPlan.summary.pagesCompleted) || 0], ['התקדמות', ((bundle && bundle.workPlan && bundle.workPlan.summary && bundle.workPlan.summary.progressPercent) || 0) + '%']] },
      { title: '✅ Checklist SEO', rows: [['עברו', (bundle && bundle.workPlan && bundle.workPlan.summary && bundle.workPlan.summary.checklistPass) || 0], ['סה"כ בדיקות', (bundle && bundle.workPlan && bundle.workPlan.summary && bundle.workPlan.summary.checklistTotal) || 0], ['בביצוע', (bundle && bundle.workPlan && bundle.workPlan.summary && bundle.workPlan.summary.pagesInProgress) || 0]] },
      { title: '📅 דוח חודשי', rows: [['כניסות', kpis.visits], ['קליקים', kpis.clicks], ['מקור', state.meta.kpiSource === 'live' ? 'חי' : 'ממתין']] },
    ].map(function (box) {
      return '<div class="report-box" style="cursor:pointer;" onclick="openModal(\'modal-report\')"><div class="report-title">' + box.title + '</div>' +
        box.rows.map(function (r) { return '<div class="report-row"><span class="rl">' + r[0] + '</span><span class="rv">' + esc(r[1]) + '</span></div>'; }).join('') + '</div>';
    }).join(''));
  }

  var SCREEN_BINDERS = {
    'screen-hub': bindHub,
    'screen-status': bindStatus,
    'screen-clients': bindClients,
    'screen-agents': bindAgents,
    'screen-goals': bindGoals,
    'screen-actions': bindActions,
    'screen-history': bindHistory,
    'screen-assets': bindAssets,
    'screen-ai-decisions': bindAiDecisions,
    'screen-ai-center': bindAiCenter,
    'screen-reports': bindReports,
  };

  function loadCustomers() {
    var A = window.MarketingApi;
    if (!A) return Promise.resolve([]);
    return A.listMarketingCustomers().then(function (rows) {
      state.customers = rows || [];
      state.meta.clientSource = A.canRemote && A.canRemote() ? 'dalia' : (rows.length ? 'local' : 'pending');
      return rows;
    }).catch(function () { state.customers = []; return []; });
  }

  function load(clientId) {
    if (!clientId) return Promise.resolve(null);
    state.loading = true;
    var A = window.MarketingApi;
    var p;
    if (A && A.loadBundle && String(clientId).indexOf('demo-') !== 0 && clientId !== 'dalia-c-official') {
      p = A.loadBundle(clientId).then(function (bundle) {
        if (bundle && bundle.customer) {
          state.bundle = bundle;
          state.meta.source = A.canRemote && A.canRemote() ? 'dalia' : 'local';
          state.meta.clientSource = state.meta.source;
          state.meta.loadedAt = new Date().toISOString();
          if (A.getMetrics) {
            return A.getMetrics(clientId).then(function (m) {
              state.metrics = m || [];
              var actP = A.listActivity ? A.listActivity(clientId, 50) : Promise.resolve([]);
              return actP.then(function (rows) {
                state.activity = rows || [];
                return bundle;
              });
            });
          }
          if (A.listActivity) {
            return A.listActivity(clientId, 50).then(function (rows) {
              state.activity = rows || [];
              return bundle;
            });
          }
          return bundle;
        }
        return null;
      });
    } else if (clientId === 'dalia-c-official' || (window.DaliaSite && clientId === DaliaSite.SITE.clientId)) {
      var dash = window.DaliaSite && DaliaSite.getDashboard && DaliaSite.getDashboard();
      if (!dash && window.COCO && COCO.data && COCO.data.stats) dash = COCO.data;
      state.bundle = window.DaliaSite ? DaliaSite.buildLiveBundle(dash || { stats: {}, connections: {} }) : null;
      state.activity = (state.bundle && state.bundle.activity) || [];
      state.meta.source = dash ? 'live' : 'pending';
      state.meta.clientSource = 'live';
      p = Promise.resolve(state.bundle);
    } else if (String(clientId).indexOf('demo-') === 0) {
      state.bundle = null;
      state.meta.source = 'pending';
      state.meta.clientSource = 'pending';
      p = Promise.resolve(null);
    } else {
      p = Promise.resolve(null);
    }
    return p.then(function (bundle) {
      if (!bundle && window.CocoClaude) {
        state.meta.source = 'pending';
        state.meta.clientSource = 'pending';
      }
      state.loading = false;
      return loadCustomers().then(function () {
        if (bundle && bundle.customer && window.CocoClaude && CocoClaude.bindClientFromDalia) {
          CocoClaude.bindClientFromDalia(bundle);
        } else {
          bindAll();
        }
        updateSourceBadge();
        return bundle;
      });
    }).catch(function () {
      state.loading = false;
      bindAll();
      return null;
    });
  }

  function bindScreen(screenId) {
    if (screenId === 'screen-actions' && window.ActionsWorkbench && ActionsWorkbench.isUserScrolling && ActionsWorkbench.isUserScrolling()) {
      if (ActionsWorkbench.deferBind) {
        ActionsWorkbench.deferBind(function () { bindScreen(screenId); });
        return;
      }
    }
    var fn = SCREEN_BINDERS[screenId];
    if (fn) fn(state.bundle);
    if ((screenId === 'screen-goals' || screenId === 'screen-actions') && isLiveGoalsActionsMode()) {
      var wp = (state.bundle && state.bundle.workPlan) ||
        (window.DaliaSite && DaliaSite.getWorkPlan && DaliaSite.getWorkPlan());
      var hasWp = wp && wp.pages && wp.pages.length;
      if (!hasWp && window.DaliaSite && DaliaSite.whenReady) {
        DaliaSite.whenReady().then(function () {
          if (fn) fn(state.bundle);
        });
      }
    }
    updateSourceBadge();
  }

  function retryGoals() {
    fetchWorkPlanFallback().then(function (wp) {
      if (wp && window.DaliaSite && DaliaSite.hydrateWorkPlan) DaliaSite.hydrateWorkPlan(wp);
      else bindGoals();
    });
  }

  function bindAll() {
    Object.keys(SCREEN_BINDERS).forEach(function (sid) {
      bindScreen(sid);
    });
    updateSourceBadge();
    if (window.CocoUnified && CocoUnified.updateContextBar) CocoUnified.updateContextBar();
  }

  function selectCustomer(id) {
    if (window.CocoClaude && CocoClaude.setClientId) CocoClaude.setClientId(id);
    return load(id).then(function () {
      bindAll();
      if (window.CocoUnified && CocoUnified.bindCrm) CocoUnified.bindCrm();
      if (typeof showToast === 'function') showToast('🏢 נטען לקוח: ' + (ctx().clientName || id));
    });
  }

  function setBundle(bundle) {
    state.bundle = bundle;
    if (bundle && bundle.customer) {
      state.meta.source = window.MarketingApi && MarketingApi.canRemote && MarketingApi.canRemote() ? 'dalia' : 'local';
      state.meta.clientSource = state.meta.source;
      state.meta.loadedAt = new Date().toISOString();
    }
    bindAll();
    updateSourceBadge();
  }

  function onContextChange() {
    bindAll();
    if (window.CocoUnified && CocoUnified.bindCrm) CocoUnified.bindCrm();
  }

  function pendingAgent(name, icon, source, reason) {
    return {
      name: name, icon: icon, source: source,
      status: 'pending', liveOnly: true, connectionOk: false, scanTime: PENDING,
      findings: 0, issues: 0, opportunities: 0, score: PENDING,
      urgency: '—', readyToTransfer: false,
      kpis: [{ label: 'סטטוס', val: PENDING, delta: reason || PENDING, color: 'var(--white50)' }],
      findings_table: [{ type: 'מידע', desc: reason || PENDING, src: source, importance: '—', impact: '—', status: PENDING, transfer: false }],
      aiSummary: reason || PENDING,
      readyCount: 0, readyIssues: 0, readyOpp: 0, urgencyLabel: '—',
    };
  }

  function getAgentData(agentId) {
    if (window.DaliaSite && DaliaSite.getAgentData) {
      var official = DaliaSite.getAgentData(agentId);
      if (official) return official;
    }
    var id = String(agentId || '').toLowerCase();
    var metrics = state.metrics || [];
    var bundle = state.bundle;
    var gscM = metrics.find(function (m) { return m.provider === 'google_search_console'; });
    var ga4M = metrics.find(function (m) { return m.provider === 'google_analytics'; });
    var conn = {};
    (bundle && bundle.connections || []).forEach(function (c) {
      conn[c.provider] = c.status;
    });
    var gscVal = gscM && gscM.metric_value;
    var ga4Val = ga4M && ga4M.metric_value;

    if (id === 'gsc' || id === 'search_console' || id === 'seo') {
      if (!gscVal && conn.google_search_console !== 'connected') {
        return pendingAgent('Google Search Console AI', '🔎', 'Search Console', PENDING);
      }
      var kw = (gscVal && gscVal.keywords) || getKeywords();
      return {
        name: 'Google Search Console AI', icon: '🔎', source: 'Search Console (Supabase)',
        status: 'live', liveOnly: true, connectionOk: !!gscVal, scanTime: state.meta.loadedAt || PENDING,
        findings: kw.length, issues: 0, opportunities: 0, score: PENDING,
        urgency: '—', readyToTransfer: false,
        kpis: [
          { label: 'קליקים', val: fmt(gscVal && gscVal.clicks), delta: 'GSC', color: 'var(--white)' },
          { label: 'חשיפות', val: fmt(gscVal && gscVal.impressions), delta: 'GSC', color: 'var(--white)' },
          { label: 'CTR', val: gscVal && gscVal.ctr != null ? (Number(gscVal.ctr) * 100).toFixed(1) + '%' : NO_DATA, delta: '', color: 'var(--white)' },
        ],
        findings_table: kw.slice(0, 8).map(function (k) {
          return { type: 'נתון', desc: k.keyword || k.query, src: 'GSC', importance: '—', impact: fmt(k.clicks) + ' קליקים', status: 'חי', transfer: false };
        }),
        aiSummary: gscVal ? 'נתונים אמיתיים מ-Supabase/GSC.' : PENDING,
        readyCount: 0, readyIssues: 0, readyOpp: 0, urgencyLabel: '—',
      };
    }
    if (id === 'ga4' || id === 'analytics') {
      if (!ga4Val && conn.google_analytics !== 'connected') {
        return pendingAgent('Google Analytics AI', '📊', 'GA4', PENDING);
      }
      return {
        name: 'Google Analytics AI', icon: '📊', source: 'GA4 (Supabase)',
        status: 'live', liveOnly: true, connectionOk: !!ga4Val, scanTime: state.meta.loadedAt || PENDING,
        findings: 0, issues: 0, opportunities: 0, score: PENDING,
        urgency: '—', readyToTransfer: false,
        kpis: [
          { label: 'סשנים', val: fmt(ga4Val && ga4Val.sessions), delta: 'GA4', color: 'var(--green)' },
          { label: 'משתמשים', val: fmt(ga4Val && ga4Val.activeUsers), delta: 'GA4', color: 'var(--white)' },
        ],
        findings_table: [{ type: 'מידע', desc: ga4Val ? 'נתוני GA4 מסונכרנים' : PENDING, src: 'GA4', importance: '—', impact: '—', status: ga4Val ? 'חי' : PENDING, transfer: false }],
        aiSummary: ga4Val ? 'נתונים אמיתיים מ-GA4.' : PENDING,
        readyCount: 0, readyIssues: 0, readyOpp: 0, urgencyLabel: '—',
      };
    }
    if (id === 'gbp' || id === 'google_business') return pendingAgent('Google Business AI', '📍', 'Google Business', PENDING);
    if (id === 'ads' || id === 'google_ads' || id === 'campaign') return pendingAgent('Google Ads AI', '🎯', 'Google Ads', PENDING);
    if (id === 'pagespeed') return pendingAgent('PageSpeed AI', '⚡', 'PageSpeed', PENDING);
    if (id === 'meta') return pendingAgent('Meta AI', '👥', 'Meta', PENDING);
    if (id === 'manager' || id === 'project001' || id === 'reports') {
      var active = [gscVal, ga4Val].filter(Boolean).length;
      return {
        name: id === 'manager' ? 'AI Manager' : 'Project AI', icon: '🤖', source: 'מנהל השיווק',
        status: active ? 'live' : 'pending', liveOnly: true, connectionOk: active > 0, scanTime: state.meta.loadedAt || PENDING,
        findings: active, issues: 0, opportunities: 0, score: PENDING,
        urgency: '—', readyToTransfer: false,
        kpis: [
          { label: 'מקורות פעילים', val: String(active), delta: 'Google', color: 'var(--accent2)' },
          { label: 'Client ID', val: (ctx().clientId || '').slice(0, 8) + '…', delta: '', color: 'var(--white)' },
        ],
        findings_table: [
          { type: 'GSC', desc: gscVal ? 'מחובר' : PENDING, src: 'GSC', importance: '—', impact: '—', status: gscVal ? 'חי' : PENDING, transfer: false },
          { type: 'GA4', desc: ga4Val ? 'מחובר' : PENDING, src: 'GA4', importance: '—', impact: '—', status: ga4Val ? 'חי' : PENDING, transfer: false },
        ],
        aiSummary: active ? (active + ' מקורות Google פעילים ללקוח הנוכחי.') : PENDING,
        readyCount: 0, readyIssues: 0, readyOpp: 0, urgencyLabel: '—',
      };
    }
    return pendingAgent('AI Assistant', '🤖', agentId, PENDING);
  }

  window.CocoData = {
    load: load,
    loadCustomers: loadCustomers,
    getCustomers: function () { return state.customers.slice(); },
    setBundle: setBundle,
    bindScreen: bindScreen,
    bindAll: bindAll,
    selectCustomer: selectCustomer,
    onContextChange: onContextChange,
    getMeta: function () { return Object.assign({}, state.meta); },
    getBundle: function () { return state.bundle; },
    getAgentData: getAgentData,
    getMetrics: function () { return (state.metrics || []).slice(); },
    retryGoals: retryGoals,
  };
})();
