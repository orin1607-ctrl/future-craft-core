/**
 * Project 001 — אתר רשמי dalia-c.com בלבד (ללא Demo)
 */
(function () {
  'use strict';

  var SITE = {
    url: 'https://dalia-c.com/',
    domain: 'dalia-c.com',
    name: 'דליה — dalia-c.com',
    company: 'דליה פתרונות מימון ותחזוקה לרכב',
    clientId: 'dalia-c-official',
    account: 'orin1607@gmail.com',
    superAdmin: 'יוני אטיאס',
    ga4Property: 'properties/427711798',
  };

  var PENDING = 'ממתין לחיבור';
  var NO_DATA = '—';

  var state = { dashboard: null, crawl: null, loadedAt: null };

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function fmt(n) {
    if (n == null || n === '') return NO_DATA;
    return Number(n).toLocaleString('he-IL');
  }

  function pagesBase() {
    if (window.COCO_PAGES_BASE) return window.COCO_PAGES_BASE;
    var path = location.pathname || '/';
    var i = path.indexOf('ai-marketing-platform');
    if (i > 0) return path.substring(0, i);
    return '/future-craft-core/';
  }

  function assetUrl(rel) {
    var base = pagesBase();
    if (base.charAt(0) !== '/') base = '/' + base.replace(/^\.\//, '');
    return location.origin + base + rel;
  }

  function fetchJson(rel) {
    return fetch(assetUrl(rel) + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  function connectionBadge(key, raw) {
    var c = (raw && raw.connections && raw.connections[key]) || {};
    if (c.ok || c.status === 'connected') return '<span class="badge badge-green">● מחובר</span>';
    if (/pending|planned|infrastructure/.test(c.status || '')) {
      return '<span class="badge badge-yellow">⏳ ' + esc(PENDING) + '</span>';
    }
    return '<span class="badge badge-gray">⏳ ' + esc(PENDING) + '</span>';
  }

  function buildLiveBundle(raw) {
    if (!raw) return null;
    var stats = raw.stats || {};
    var conn = raw.connections || {};
    var connections = Object.keys(conn).map(function (k) {
      var c = conn[k];
      return {
        provider: k.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, ''),
        status: c.ok ? 'connected' : 'pending',
        note: c.note || c.connectionNote || PENDING,
      };
    });
    return {
      customer: { id: SITE.clientId, name: SITE.company, service_type: 'fleet_and_marketing', status: 'active' },
      profile: { website: SITE.url, setup_status: 'live' },
      sites: [{ name: SITE.domain, domain: SITE.domain, site_url: SITE.url, site_type: 'primary', status: 'active' }],
      campaigns: [],
      connections: connections,
      ai: {
        initial_goals: (raw.aiSeoSuggestions || []).slice(0, 5).map(function (s, i) {
          return { id: 'goal-' + i, title: s.title || s.suggestion || String(s), status: 'active', category: 'SEO', priority: s.priority || 'גבוה' };
        }),
        work_plan: (raw.aiSeoSuggestions || []).slice(0, 3).map(function (s, i) {
          return { id: 'act-' + i, title: s.title || s.suggestion || String(s), status: 'pending', source: 'GSC/GA4', category: 'SEO' };
        }),
        recommendations: (raw.aiSeoSuggestions || []).map(function (s) { return s.title || s.suggestion || String(s); }),
        opening_report: 'ניתוח dalia-c.com — ' + fmt(stats.totalClicks) + ' קליקים GSC · ' + fmt(stats.ga4Sessions) + ' סשנים GA4',
      },
      _dashboard: raw,
    };
  }

  function applySiteLabels() {
    var set = function (id, text) {
      var el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    set('coco-hub-client-name', '🏢 ' + SITE.company);
    set('coco-hub-client-sub', SITE.domain + ' • נתונים אמיתיים · Super Admin: ' + SITE.superAdmin);
    set('sf-company-display', SITE.company);

    var siteSel = document.getElementById('sf-site');
    if (siteSel) {
      siteSel.innerHTML = '<option value="' + esc(SITE.domain) + '" selected>' + esc(SITE.domain) + '</option>';
    }
    ['gf-site', 'ag-site', 'act-site', 'hist-site', 'ai-site', 'rep-site'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.tagName === 'SELECT') {
        el.innerHTML = '<option value="' + esc(SITE.domain) + '" selected>' + esc(SITE.domain) + '</option>';
      }
    });
    ['gf-domain', 'ag-domain', 'act-domain'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = SITE.domain;
    });

    document.querySelectorAll('#coco-claude-root .page-subtitle').forEach(function (el) {
      if (/גרין-טק|greentech/i.test(el.textContent)) {
        el.textContent = SITE.company + ' • ' + SITE.domain;
      }
    });
  }

  function renderStatusLive(raw, crawl) {
    var root = document.getElementById('coco-live-status-root');
    if (!root) {
      var tab = document.getElementById('tab-status-overview');
      if (!tab) return;
      root = document.createElement('div');
      root.id = 'coco-live-status-root';
      root.style.cssText = 'padding:16px 20px 0;';
      tab.insertBefore(root, tab.firstChild);
    }
    var stats = raw.stats || {};
    var sc = raw.searchConsole || {};
    var ga4 = raw.analytics4 || {};
    var pages = sc.pages || [];
    var keywords = sc.keywords || [];
    var topGa4 = ga4.topPages || [];
    var pageCount = (crawl && crawl.crawl && crawl.crawl.pageCount) || raw.lastSync?.counts?.gsc_pages || pages.length;
    var updated = raw.generatedAt || raw.lastSync?.timestamp || state.loadedAt;

    root.innerHTML =
      '<div class="alert alert-info" style="margin-bottom:12px;">🌐 <strong>אתר פעיל:</strong> ' + esc(SITE.url) +
      ' · מקור: GSC + GA4 + Sheets · עודכן: ' + esc(updated ? new Date(updated).toLocaleString('he-IL') : '—') + '</div>' +
      '<div class="grid grid-4" style="gap:10px;margin-bottom:16px;">' +
      kpiCard('עמודים באתר', fmt(pageCount)) +
      kpiCard('קליקים (GSC)', fmt(stats.totalClicks)) +
      kpiCard('חשיפות (GSC)', fmt(stats.totalImpressions)) +
      kpiCard('CTR', stats.avgCtr != null ? stats.avgCtr + '%' : NO_DATA) +
      kpiCard('מיקום ממוצע', stats.avgPosition != null ? Number(stats.avgPosition).toFixed(1) : NO_DATA) +
      kpiCard('סשנים (GA4)', fmt(stats.ga4Sessions)) +
      kpiCard('צפיות (GA4)', fmt(stats.ga4PageViews)) +
      kpiCard('מילות מפתח', fmt(stats.activeKeywords)) +
      '</div>' +
      '<div class="grid grid-2" style="gap:12px;">' +
      tableBox('🔍 Top Queries (GSC)', ['מילה', 'קליקים', 'חשיפות', 'מיקום'],
        keywords.slice(0, 15).map(function (k) {
          return [k.query, fmt(k.clicks), fmt(k.impressions), k.position != null ? Number(k.position).toFixed(1) : NO_DATA];
        }), keywords.length ? '' : '<tr><td colspan="4">אין נתוני GSC בטווח — האתר מחובר</td></tr>') +
      tableBox('📄 Top Pages (GA4)', ['עמוד', 'סשנים', 'צפיות'],
        topGa4.slice(0, 12).map(function (p) {
          return [p.pagePath, fmt(p.sessions), fmt(p.screenPageViews)];
        }), topGa4.length ? '' : '<tr><td colspan="3">אין נתוני GA4</td></tr>') +
      tableBox('📄 דפים (Search Console)', ['URL', 'קליקים', 'חשיפות', 'CTR'],
        pages.slice(0, 12).map(function (p) {
          return [shortUrl(p.page), fmt(p.clicks), fmt(p.impressions), p.ctr != null ? (p.ctr * 100).toFixed(1) + '%' : NO_DATA];
        }), pages.length ? '' : '<tr><td colspan="4">אין דפים ב-GSC בטווח</td></tr>') +
      connectionsBox(raw) +
      '</div>';
  }

  function kpiCard(title, value) {
    return '<div class="card" style="padding:12px 14px;"><div class="card-title">' + esc(title) + '</div><div class="card-value" style="font-size:20px;">' + esc(value) + '</div></div>';
  }

  function tableBox(title, headers, rows, emptyRow) {
    var head = headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('');
    var body = rows.length
      ? rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('')
      : emptyRow;
    return '<div class="card" style="padding:14px;"><div class="card-title" style="margin-bottom:10px;">' + esc(title) + '</div><div class="table-wrap"><table><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div></div>';
  }

  function connectionsBox(raw) {
    var items = [
      ['Google Search Console', 'searchConsole'],
      ['Google Analytics 4', 'analytics4'],
      ['Google Business Profile', 'businessProfile'],
      ['Google Ads', 'googleAds'],
      ['Google Tag Manager', 'googleTagManager'],
      ['Google Drive', 'drive'],
      ['Google Sheets', 'sheets'],
      ['Google Docs', 'docs'],
      ['Gmail', 'gmail'],
      ['OpenAI', 'openai'],
      ['Claude', 'claude'],
      ['Gemini', 'gemini'],
    ];
    var rows = items.map(function (pair) {
      var c = (raw.connections && raw.connections[pair[1]]) || {};
      var status = c.ok ? 'מחובר — נתונים אמיתיים' : (c.note || c.connectionNote || PENDING);
      return '<tr><td>' + esc(pair[0]) + '</td><td>' + connectionBadge(pair[1], raw) + '</td><td style="font-size:12px;color:var(--white50);">' + esc(status) + '</td></tr>';
    }).join('');
    return '<div class="card" style="padding:14px;grid-column:1/-1;"><div class="card-title" style="margin-bottom:10px;">🔗 חיבורים</div><div class="table-wrap"><table><thead><tr><th>שירות</th><th>סטטוס</th><th>פרטים</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }

  function shortUrl(u) {
    if (!u) return NO_DATA;
    try { return u.replace(/^https?:\/\/dalia-c\.com/, '') || '/'; } catch (e) { return u; }
  }

  function renderAssetsLive(raw) {
    var grid = document.getElementById('coco-live-assets-grid');
    if (!grid) return;
    var conn = raw.connections || {};
    var assets = [
      { icon: '🌐', name: SITE.domain, detail: SITE.url, ok: true },
      { icon: '🔍', name: 'Search Console', detail: conn.searchConsole?.ok ? 'מחובר' : PENDING, ok: !!conn.searchConsole?.ok },
      { icon: '📊', name: 'Google Analytics', detail: conn.analytics4?.ok ? 'מחובר' : PENDING, ok: !!conn.analytics4?.ok },
      { icon: '📍', name: 'Google Business', detail: conn.businessProfile?.ok ? 'מחובר' : PENDING, ok: !!conn.businessProfile?.ok },
      { icon: '📢', name: 'Google Ads', detail: conn.googleAds?.ok ? 'מחובר' : PENDING, ok: !!conn.googleAds?.ok },
      { icon: '🏷️', name: 'Tag Manager', detail: PENDING, ok: false },
      { icon: '📘', name: 'Facebook', detail: PENDING, ok: false },
      { icon: '📸', name: 'Instagram', detail: PENDING, ok: false },
      { icon: '💼', name: 'LinkedIn', detail: PENDING, ok: false },
      { icon: '▶️', name: 'YouTube', detail: PENDING, ok: false },
      { icon: '💬', name: 'WhatsApp', detail: PENDING, ok: false },
    ];
    grid.innerHTML = assets.map(function (a) {
      return '<div class="asset-card"><div class="asset-header"><div class="asset-icon">' + a.icon + '</div><div><div class="asset-name">' + esc(a.name) + '</div><div class="asset-status">' + esc(a.detail) + '</div></div></div>' +
        (a.ok ? '<span class="badge badge-green">● פעיל</span>' : '<span class="badge badge-yellow">⏳ ' + esc(PENDING) + '</span>') + '</div>';
    }).join('');
  }

  function renderClientsLive() {
    var list = document.getElementById('coco-live-clients-list');
    if (!list) {
      var clientsScreen = document.getElementById('screen-clients');
      if (!clientsScreen) return;
      var content = clientsScreen.querySelector('.content');
      if (!content) return;
      list = document.createElement('div');
      list.id = 'coco-live-clients-list';
      list.style.cssText = 'padding:16px 20px;display:flex;flex-direction:column;gap:10px;';
      content.insertBefore(list, content.firstChild);
    }
    list.innerHTML =
      '<div class="card" style="border-color:var(--accent);"><div style="font-weight:700;font-size:14px;">🏢 ' + esc(SITE.company) + '</div>' +
      '<div style="font-size:12px;color:var(--white50);margin-top:4px;">' + esc(SITE.domain) + ' · Client ID: ' + esc(SITE.clientId) + '</div>' +
      '<div style="margin-top:8px;"><span class="badge badge-green">● פעיל</span> <span class="badge badge-purple">אתר רשמי</span></div></div>' +
      '<div class="alert alert-info">עובדים כרגע על <strong>dalia-c.com</strong> בלבד. לקוחות נוספים יופיעו מדליה (SSOT).</div>';
  }

  function bindOfficialContext() {
    if (!window.COCO) window.COCO = {};
    COCO.flowContext = Object.assign(COCO.flowContext || {}, {
      clientId: SITE.clientId,
      clientName: SITE.company,
      company: SITE.company,
      site: SITE.domain,
      domain: SITE.domain,
    });
    if (window.CocoClaude && CocoClaude.setClientId) CocoClaude.setClientId(SITE.clientId);
    applySiteLabels();
  }

  function scrubDemoUi() {
    document.querySelectorAll('#screen-clients .card[onclick*="selectClient"]').forEach(function (el) {
      el.style.display = 'none';
    });
    document.querySelectorAll('#coco-claude-root .hub-card').forEach(function (card) {
      var t = card.textContent || '';
      if (/גרין-טק|greentech|דלתא|פתרונות טק/i.test(t)) card.style.display = 'none';
    });
    var aiBox = document.querySelector('#screen-hub .ai-box-header');
    if (aiBox && /גרין-טק/i.test(aiBox.textContent)) {
      aiBox.textContent = 'המלצת AI יומית — ' + SITE.domain;
    }
  }

  function initOfficial() {
    return Promise.all([
      fetchJson('project-001/dashboard.json'),
      fetchJson('project-001/site-crawl.json'),
    ]).then(function (res) {
      state.dashboard = res[0];
      state.crawl = res[1];
      state.loadedAt = new Date().toISOString();
      bindOfficialContext();
      applySiteLabels();

      if (state.dashboard && window.COCO && typeof window.mapDashboardRaw === 'function') {
        COCO.data = window.mapDashboardRaw(state.dashboard);
      } else if (state.dashboard && window.COCO) {
        COCO.data = state.dashboard;
        if (COCO.data.meta) COCO.data.meta = Object.assign(COCO.data.meta || {}, { source: 'live', liveOnly: true });
      }

      var bundle = buildLiveBundle(state.dashboard);
      if (window.CocoData) {
        if (CocoData.setBundle) CocoData.setBundle(bundle);
        if (CocoData.bindAll) CocoData.bindAll();
      }
      if (state.dashboard) {
        renderStatusLive(state.dashboard, state.crawl);
        renderAssetsLive(state.dashboard);
      }
      renderClientsLive();
      scrubDemoUi();
      if (window.CocoIntegrationHub && CocoIntegrationHub.wireAll) {
        CocoIntegrationHub.wireAll(state.dashboard);
      }
      document.body.classList.add('dalia-live-only');
      document.body.classList.remove('demo-mode');
      return { dashboard: state.dashboard, bundle: bundle };
    });
  }

  window.DaliaSite = {
    SITE: SITE,
    PENDING: PENDING,
    NO_DATA: NO_DATA,
    initOfficial: initOfficial,
    buildLiveBundle: buildLiveBundle,
    applySiteLabels: applySiteLabels,
    renderStatusLive: renderStatusLive,
    getDashboard: function () { return state.dashboard; },
    isLiveOnly: function () { return true; },
  };
})();
