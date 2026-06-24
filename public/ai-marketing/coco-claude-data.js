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

  function applyCtxFilter(items, mapFn) {
    var c = ctx();
    var free = (c.freeSearch || '').trim().toLowerCase();
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

  function ensureLiveMount(id, screenId) {
    if (document.getElementById(id)) return;
    var screen = document.getElementById(screenId);
    if (!screen) return;
    var content = screen.querySelector('.content');
    if (!content) return;
    var div = document.createElement('div');
    div.id = id;
    div.className = 'coco-live-section';
    div.style.cssText = 'padding:16px 20px 0;';
    content.insertBefore(div, content.firstChild);
  }

  function deriveKpis(bundle) {
    var dash = getDashboard();
    var k = window.COCO && COCO.data && COCO.data.kpis;
    var gsc = (state.metrics || []).find(function (m) { return m.provider === 'google_search_console'; });
    var ga4 = (state.metrics || []).find(function (m) { return m.provider === 'google_analytics'; });
    if (gsc && gsc.metric_value) {
      var gv = gsc.metric_value;
      state.meta.kpiSource = 'supabase';
      return {
        siteScore: 82,
        visits: fmt(ga4 && ga4.metric_value && ga4.metric_value.sessions),
        leads: '—',
        openTasks: '—',
        clicks: fmt(gv.clicks),
        impressions: fmt(gv.impressions),
        ctr: gv.ctr != null ? (Number(gv.ctr) * 100).toFixed(1) + '%' : '—',
        position: '—',
      };
    }
    if (k && k.weeklyClicks) {
      state.meta.kpiSource = 'live';
      return {
        siteScore: NO_DATA,
        visits: (k.weeklyClicks && k.weeklyClicks.value) || NO_DATA,
        leads: (k.pendingDrafts && k.pendingDrafts.value) || NO_DATA,
        openTasks: (k.aiOpportunities && k.aiOpportunities.value) || NO_DATA,
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
        leads: fmt(dash.pendingDrafts != null ? dash.pendingDrafts : NO_DATA),
        openTasks: fmt(dash.opportunities != null ? dash.opportunities : (dash.pendingDrafts != null ? dash.pendingDrafts : NO_DATA)),
        clicks: fmt(dash.totalClicks),
        impressions: fmt(dash.totalImpressions),
        ctr: dash.avgCtr != null ? (Number(dash.avgCtr) * (dash.avgCtr < 1 ? 100 : 1)).toFixed(1) + '%' : NO_DATA,
        position: dash.avgPosition != null ? Number(dash.avgPosition).toFixed(1) : NO_DATA,
      };
    }
    state.meta.kpiSource = 'pending';
    return { siteScore: NO_DATA, visits: NO_DATA, leads: NO_DATA, openTasks: NO_DATA, clicks: NO_DATA, impressions: NO_DATA, ctr: NO_DATA, position: NO_DATA };
  }

  function deriveGoals(bundle) {
    var ai = bundle && bundle.ai;
    var goals = normList(ai && ai.initial_goals, 'goal');
    if (!goals.length && ai && ai.work_plan) {
      goals = normList(ai.work_plan, 'goal').map(function (g) {
        g.category = 'תכנון AI';
        return g;
      });
    }
    if (!goals.length) {
      state.meta.goalsSource = 'pending';
      return [];
    }
    state.meta.goalsSource = 'dalia';
    return goals;
  }

  function deriveActions(bundle) {
    var ai = bundle && bundle.ai;
    var actions = normList(ai && ai.work_plan, 'act').map(function (a, i) {
      a.status = a.status || (i === 0 ? 'pending' : 'review');
      a.urgency = a.urgency || a.priority || 'בינוני';
      a.source = a.source || 'AI Setup';
      return a;
    });
    var approvals = (window.COCO && COCO.data && COCO.data.approvals) || [];
    approvals.forEach(function (ap, i) {
      actions.push({ id: 'appr-' + i, title: ap.title, status: 'pending', urgency: 'גבוה', source: 'אישורים', category: ap.type || 'תוכן' });
    });
    if (!actions.length) {
      state.meta.actionsSource = 'pending';
      return [];
    }
    state.meta.actionsSource = ai && ai.work_plan && ai.work_plan.length ? 'dalia' : 'live';
    return actions;
  }

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
    (state.activity || []).forEach(function (a) {
      items.push({
        type: 'activity',
        title: a.title || a.action || 'פעילות',
        date: a.created_at,
        status: a.action || 'logged',
        detail: (a.module || 'מערכת') + (a.detail ? (' — ' + a.detail) : ''),
      });
    });
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
    var kpis = deriveKpis(bundle);
    setHtml('coco-live-hub-kpis', [
      '<div class="card" style="padding:12px 14px;"><div class="card-title">קליקים (GSC)</div><div class="card-value" style="font-size:22px;">' + esc(kpis.clicks) + '</div></div>',
      '<div class="card" style="padding:12px 14px;"><div class="card-title">חשיפות (GSC)</div><div class="card-value" style="font-size:22px;">' + esc(kpis.impressions) + '</div></div>',
      '<div class="card" style="padding:12px 14px;"><div class="card-title">סשנים (GA4)</div><div class="card-value" style="font-size:22px;color:var(--accent2);">' + esc(kpis.visits) + '</div></div>',
      '<div class="card" style="padding:12px 14px;"><div class="card-title">מיקום ממוצע</div><div class="card-value" style="font-size:22px;color:var(--yellow);">' + esc(kpis.position) + '</div></div>',
    ].join(''));
    if (window.DaliaSite && DaliaSite.renderHubAiBox) DaliaSite.renderHubAiBox(bundle);
    var goals = deriveGoals(bundle);
    var actions = deriveActions(bundle);
    var assets = deriveAssets(bundle);
    var aiRecs = (bundle && bundle.ai && bundle.ai.recommendations && bundle.ai.recommendations.length) || 0;
    var counts = { 'screen-status': 'מצב', 'screen-clients': state.customers.length + ' לקוחות', 'screen-goals': goals.length + ' מטרות', 'screen-actions': actions.filter(function (a) { return a.status !== 'done'; }).length + ' ממתינות', 'screen-history': deriveHistory(bundle).length + ' רשומות', 'screen-assets': assets.length + ' נכסים', 'screen-ai-decisions': aiRecs ? (aiRecs + ' המלצות') : 'ממתין', 'screen-reports': 'דוחות' };
    document.querySelectorAll('.hub-card').forEach(function (card) {
      var onclick = card.getAttribute('onclick') || '';
      Object.keys(counts).forEach(function (sid) {
        if (onclick.indexOf(sid) !== -1) {
          var cnt = card.querySelector('.hub-count');
          if (cnt) cnt.textContent = counts[sid];
        }
      });
    });
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
      return { campaign: c.name, channel: c.channel, status: c.status };
    });
    if (campaigns.length) {
      setHtml('coco-live-status-campaigns', campaigns.map(function (c) {
        return '<tr><td>' + esc(c.name) + '</td><td>₪' + fmt(c.budget) + '</td><td>—</td><td>—</td><td>' + statusBadge(c.status) + '</td></tr>';
      }).join(''));
    }
  }

  function bindAgents(bundle) {
    var c = ctx();
    var sub = document.querySelector('#screen-agents .page-subtitle');
    if (sub) {
      sub.textContent = (c.clientName || 'לקוח פעיל') + ' · Client ID: ' + (c.clientId ? String(c.clientId).slice(0, 8) + '…' : 'לא נבחר');
    }
    ensureLiveMount('coco-live-agents-context', 'screen-agents');
    setHtml('coco-live-agents-context',
      '<div class="alert alert-info" style="margin-bottom:12px;">AI משותף לכל המודולים · OpenAI · Claude · Gemini · הקשר: ' +
      esc(c.clientName || '—') + (c.campaign ? (' · קמפיין: ' + esc(c.campaign)) : '') + '</div>');
  }

  function bindClients() {
    if (window.DaliaSite && typeof DaliaSite.renderClientsLive === 'function') {
      DaliaSite.renderClientsLive();
      state.meta.clientSource = 'live';
      return;
    }
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

  function bindGoals(bundle) {
    ensureLiveMount('coco-live-goals-list', 'screen-goals');
    var goals = applyCtxFilter(deriveGoals(bundle), function (g) {
      return { goal: g.category || g.title, status: g.status };
    });
    setHtml('coco-live-goals-list', goals.map(function (g) {
      return '<div class="goal-acc-item card" style="padding:14px;margin-bottom:10px;" data-agent="' + esc(g.agent || '') + '">' +
        '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;">' +
        '<div style="font-weight:700;">🎯 ' + esc(g.title) + '</div>' + statusBadge(g.status) + '</div>' +
        '<div style="font-size:12px;color:var(--white50);margin-top:6px;">קטגוריה: ' + esc(g.category || 'כללי') + ' • עדיפות: ' + esc(g.priority || 'בינוני') + '</div></div>';
    }).join('') || emptyStatus('אין מטרות — הוסף ב-AI Setup או סנכרן מדליה'));
  }

  function bindActions(bundle) {
    ensureLiveMount('coco-live-actions-pending', 'screen-actions');
    ensureLiveMount('coco-live-actions-done', 'screen-actions');
    var actions = applyCtxFilter(deriveActions(bundle), function (a) {
      return { action: a.category, status: a.status, campaign: a.campaign };
    });
    var pending = actions.filter(function (a) { return a.status !== 'done' && a.status !== 'completed'; });
    var done = actions.filter(function (a) { return a.status === 'done' || a.status === 'completed'; });
    setHtml('coco-live-actions-pending', pending.map(function (a) {
      return '<div class="action-card act-item" style="border-color:rgba(139,92,246,0.4);margin-bottom:12px;">' +
        '<div class="action-title">' + esc(a.title) + '</div>' +
        '<div style="font-size:12px;color:var(--white50);margin-top:6px;">מקור: ' + esc(a.source) + ' • ' + statusBadge(a.urgency) + '</div></div>';
    }).join('') || '<div class="alert alert-ok">אין פעולות ממתינות 🎉</div>');
    setHtml('coco-live-actions-done', done.map(function (a) {
      return '<tr><td>' + esc(a.title) + '</td><td>' + esc(a.category) + '</td><td>—</td><td>' + esc(a.source) + '</td><td>—</td><td>' + statusBadge('done') + '</td></tr>';
    }).join('') || '<tr><td colspan="6">אין פעולות שהושלמו עדיין</td></tr>');
  }

  function bindHistory(bundle) {
    ensureLiveMount('coco-live-history-empty', 'screen-history');
    var items = applyCtxFilter(deriveHistory(bundle), function (h) {
      return { campaign: h.title, status: h.status, action: h.detail };
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
      return { site: a.detail, status: a.status };
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
    var goals = deriveGoals(bundle);
    var actions = deriveActions(bundle);
    var keywords = getKeywords();
    setHtml('coco-live-reports-grid', [
      { title: '📊 דוח מצב נוכחי', rows: [['קליקים GSC', kpis.clicks], ['סשנים GA4', kpis.visits], ['חשיפות', kpis.impressions]] },
      { title: '🔍 דוח SEO', rows: [['מילות מפתח', keywords.length || '—'], ['מיקום ממוצע', kpis.position], ['CTR', kpis.ctr]] },
      { title: '📢 דוח קמפיינים', rows: [['קמפיינים', (bundle && bundle.campaigns && bundle.campaigns.length) || 0], ['פעילים', (bundle && bundle.campaigns && bundle.campaigns.filter(function (c) { return c.status === 'active'; }).length) || 0], ['טיוטה', (bundle && bundle.campaigns && bundle.campaigns.filter(function (c) { return c.status === 'draft'; }).length) || 0]] },
      { title: '⚙️ דוח פעולות', rows: [['ממתינות', actions.filter(function (a) { return a.status !== 'done'; }).length], ['הושלמו', actions.filter(function (a) { return a.status === 'done'; }).length], ['סה״כ', actions.length]] },
      { title: '🎯 דוח מטרות', rows: [['פעילות', goals.filter(function (g) { return g.status === 'active'; }).length], ['ממתינות', goals.filter(function (g) { return g.status === 'pending'; }).length], ['סה״כ', goals.length]] },
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
    var fn = SCREEN_BINDERS[screenId];
    if (fn) fn(state.bundle);
    updateSourceBadge();
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
  };
})();
