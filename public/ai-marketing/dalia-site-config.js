/**
 * Project 001 — אתר רשמי dalia-c.com בלבד (ללא Demo)
 */
(function () {
  'use strict';

  var SITE = window.ClientIdSsot ? Object.assign({}, ClientIdSsot.OFFICIAL, {
    name: 'דליה — dalia-c.com',
    ga4Property: 'properties/545246030',
    measurementId: 'G-73K6EDC6LV',
    gtm: 'GTM-P5BWSBR',
    superAdmin: 'orin1607@gmail.com',
  }) : {
    url: 'https://dalia-c.com/',
    domain: 'dalia-c.com',
    name: 'דליה — dalia-c.com',
    company: 'דליה פתרונות תפעול ותחזוקה לרכב',
    clientId: 'dalia-c-official',
    account: 'orin1607@gmail.com',
    superAdmin: 'orin1607@gmail.com',
    ga4Property: 'properties/545246030',
    measurementId: 'G-73K6EDC6LV',
    gtm: 'GTM-P5BWSBR',
  };

  /** Multi-Asset sites map — prefer AssetRegistry when present */
  var SITES = {
    'dalia-c.com': {
      domain: 'dalia-c.com',
      url: 'https://dalia-c.com/',
      ga4Property: 'properties/545246030',
      measurementId: 'G-73K6EDC6LV',
      gtm: 'GTM-P5BWSBR',
      status: 'live',
      label: 'dalia-c.com — האתר הישן',
      assetId: 'dalia-c-com',
    },
    'dalia-car.online': {
      domain: 'dalia-car.online',
      url: 'https://dalia-car.online/',
      ga4Property: 'properties/545217370',
      measurementId: 'G-KGTK4YCD8F',
      gtm: 'GTM-KFMHS49G',
      status: 'live',
      label: 'אפליקציית דליה',
      assetId: 'dalia-car-app',
    },
    'dalia-car.online/site': {
      domain: 'dalia-car.online/site',
      url: 'https://dalia-car.online/site/',
      ga4Property: 'properties/545281140',
      measurementId: 'G-KYDLXY9C39',
      gtm: 'GTM-KH38DZ6J',
      status: 'live',
      label: 'אתר התדמית החדש',
      assetId: 'dalia-brand-site',
    },
  };

  function sitesFromRegistry() {
    if (!window.AssetRegistry || !AssetRegistry.list) return SITES;
    var map = {};
    AssetRegistry.list().forEach(function (a) {
      if (a.isMock) return;
      map[a.domain || a.id] = {
        domain: a.domain,
        url: a.url,
        ga4Property: a.ga4,
        measurementId: a.measurementId,
        gtm: a.gtm,
        status: a.status || 'pending',
        label: a.label,
        assetId: a.id,
      };
    });
    return Object.keys(map).length ? map : SITES;
  }

  var PENDING = 'Pending';
  var NO_DATA = 'Pending — מחובר, ממתין לצבירת נתונים';

  var state = { dashboard: null, crawl: null, pagesIndex: null, workPlan: null, loadedAt: null };

  function primaryCampaign() {
    var c = (state.pagesIndex && state.pagesIndex.campaign) ||
      (window.ClientIdSsot && ClientIdSsot.PRIMARY_CAMPAIGN) || {
        id: 'campaign-dalia-seo-primary',
        name: 'דליה — קידום dalia-c.com',
        owner: SITE.superAdmin,
        projectId: 'project001aimarketing',
        projectName: 'Project 001 — AI Marketing',
        site: SITE.domain,
        channel: 'seo',
        status: 'active',
        type: 'organic_seo',
      };
    return {
      id: c.id,
      name: c.name,
      status: c.status || 'active',
      channel: c.channel || 'seo',
      campaign_type: c.type || 'organic_seo',
      site: c.site || SITE.domain,
      owner: c.owner || SITE.superAdmin,
      project_id: c.projectId || 'project001aimarketing',
      start_date: state.loadedAt,
    };
  }

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
    var path = rel;
    if (window.ClientIdSsot && ClientIdSsot.DATA_PATHS) {
      if (rel === 'project-001/dashboard.json') path = ClientIdSsot.DATA_PATHS.dashboard;
      if (rel === 'project-001/site-crawl.json' || rel === 'project-001/site-crawl-lite.json') {
        path = ClientIdSsot.DATA_PATHS.siteCrawl;
      }
      if (rel === 'project-001/site-pages-index.json') path = ClientIdSsot.DATA_PATHS.sitePagesIndex;
      if (rel === 'project-001/site-work-plan.json') path = ClientIdSsot.DATA_PATHS.siteWorkPlan;
    }
    return fetch(assetUrl(path) + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  function fetchJsonWithRetry(rel, attempts) {
    var max = attempts || 3;
    function attempt(n) {
      return fetchJson(rel).then(function (data) {
        if (data || n >= max) return data;
        return new Promise(function (resolve) { setTimeout(resolve, 350 * n); }).then(function () {
          return attempt(n + 1);
        });
      });
    }
    return attempt(1);
  }

  var _readyPromise = null;

  function hydrateWorkPlan(wp) {
    if (!wp || !wp.pages || !wp.pages.length) return null;
    state.workPlan = wp;
    var bundle = buildLiveBundle(state.dashboard || { stats: {}, connections: {} });
    if (window.CocoData && CocoData.setBundle) CocoData.setBundle(bundle);
    return bundle;
  }

  function whenReady() {
    return _readyPromise || initOfficial();
  }

  function connectionBadge(key, raw) {
    if (window.MarketingSsot && MarketingSsot.resolveConn) {
      var c = (raw && raw.connections && raw.connections[key]) || {};
      var st = MarketingSsot.resolveConn(c);
      return MarketingSsot.statusBadgeHtml(st);
    }
    var c = (raw && raw.connections && raw.connections[key]) || {};
    if (c.ok || c.status === 'connected') return '<span class="badge badge-green">● פעיל</span>';
    if (/pending.*approval/i.test(c.status || '') || /approval/i.test(c.note || '')) {
      return '<span class="badge badge-yellow">⏳ ממתין לאישור</span>';
    }
    if (/pending|planned|infrastructure/.test(c.status || '')) {
      return '<span class="badge badge-yellow">⏳ ' + esc(PENDING) + '</span>';
    }
    return '<span class="badge badge-gray">○ לא מחובר</span>';
  }

  function buildLiveBundle(raw) {
    if (!raw) return null;
    var stats = raw.stats || {};
    var conn = raw.connections || {};
    var wp = state.workPlan || {};
    var wpPages = wp.pages || [];
    var wpGoals = wp.goals || [];
    var wpActions = wp.actions || [];
    var wpActivity = (wp.activity || []).concat(loadProgressFromStorage());
    var pageGoals = wpPages.length ? wpPages : [];
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
      campaigns: [primaryCampaign()],
      sitePages: (state.pagesIndex && state.pagesIndex.pages && state.pagesIndex.pages.business) ||
        (state.crawl && state.crawl.crawl && state.crawl.crawl.pages) || [],
      pageTasks: wpPages,
      workPlan: wp,
      activity: wpActivity,
      connections: connections,
      ai: {
        initial_goals: pageGoals.length ? pageGoals : wpGoals,
        work_plan: wpActions.length ? wpActions : (raw.aiSeoSuggestions || []).slice(0, 3).map(function (s, i) {
          return { id: 'act-' + i, title: s.title || s.suggestion || String(s), status: 'pending', source: 'GSC/GA4', category: 'SEO' };
        }),
        recommendations: pageGoals.length
          ? pageGoals.map(function (p) {
            var open = (p.recommendations || []).filter(function (r) { return r.status !== 'ok' && r.status !== 'na'; }).length;
            return '#' + p.rank + ' ' + (p.path || p.url) + ': ' + open + ' המלצות פתוחות';
          })
          : wpPages.slice(0, 10).map(function (p) {
            return '#' + p.rank + ' ' + (p.path || p.url) + ': ' + (p.missing && p.missing.length ? p.missing.join(', ') : 'אופטימיזציה');
          }),
        opening_report: wp.summary
          ? (wp.summary.pageCount || 0) + ' עמודים · ' + (wp.summary.actionsOpen || 0) + ' פעולות פתוחות · Checklist ' + (wp.summary.checklistPass || 0) + '/' + (wp.summary.checklistTotal || 0)
          : 'ניתוח dalia-c.com — ' + fmt(stats.totalClicks) + ' קליקים GSC · ' + fmt(stats.ga4Sessions) + ' סשנים GA4',
      },
      _dashboard: raw,
    };
  }

  function loadProgressFromStorage() {
    try {
      var raw = localStorage.getItem('dalia-work-progress-log');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function logWorkProgress(event, detail) {
    var entry = {
      id: 'log-' + Date.now(),
      title: event,
      action: 'progress',
      module: 'SEO',
      detail: detail || '',
      created_at: new Date().toISOString(),
    };
    var rows = loadProgressFromStorage();
    rows.unshift(entry);
    try {
      localStorage.setItem('dalia-work-progress-log', JSON.stringify(rows.slice(0, 100)));
    } catch (e) { /* ignore */ }
    if (state.dashboard) {
      var bundle = buildLiveBundle(state.dashboard);
      if (window.CocoData && CocoData.setBundle) CocoData.setBundle(bundle);
    }
    return entry;
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

    var camp = primaryCampaign();
    var campSelectIds = ['sf-campaign', 'gf-campaign', 'act-campaign', 'hist-campaign', 'ai-campaign', 'rep-campaign', 'coco-central-campaign'];
    campSelectIds.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || el.tagName !== 'SELECT') return;
      el.innerHTML = '<option value="">כל הקמפיינים</option>' +
        '<option value="' + esc(camp.id) + '" selected>' + esc(camp.name) + '</option>';
    });

    var projSelectIds = ['sf-project', 'gf-project', 'ag-project', 'act-project'];
    projSelectIds.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || el.tagName !== 'SELECT') return;
      el.innerHTML = '<option value="">כל הפרויקטים</option>' +
        '<option value="' + esc(camp.project_id) + '" selected>' + esc(camp.project_id === 'project001aimarketing' ? 'Project 001 — AI Marketing' : camp.project_id) + '</option>';
    });

    var pages = (state.pagesIndex && state.pagesIndex.pages && state.pagesIndex.pages.business) ||
      (state.crawl && state.crawl.crawl && state.crawl.crawl.pages) || [];
    var pageSelectIds = ['sf-page', 'gf-page', 'act-page', 'hist-page', 'ai-page', 'rep-page'];
    pageSelectIds.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || el.tagName !== 'SELECT') return;
      var opts = '<option value="">כל העמודים</option>';
      pages.slice(0, 40).forEach(function (p) {
        var path = p.path || p.url || '';
        try { path = path.replace(/^https?:\/\/dalia-c\.com/i, '') || '/'; } catch (e) { /* ignore */ }
        var val = path.replace(/^\//, '') || 'home';
        var label = (p.title || path || val).slice(0, 48);
        opts += '<option value="' + esc(val) + '">' + esc(label) + '</option>';
      });
      el.innerHTML = opts;
    });

    var chEl = document.getElementById('sf-channel');
    if (chEl && chEl.tagName === 'SELECT') {
      chEl.value = 'seo';
    }
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
        }),         keywords.length ? '' : '<tr><td colspan="4">Pending — GSC מחובר, ממתין לצבירת שאילתות בטווח</td></tr>') +
      tableBox('📄 Top Pages (GA4)', ['עמוד', 'סשנים', 'צפיות'],
        topGa4.slice(0, 12).map(function (p) {
          return [p.pagePath, fmt(p.sessions), fmt(p.screenPageViews)];
        }), topGa4.length ? '' : '<tr><td colspan="3">Pending — GA4 מחובר (COCO), ממתין לצבירת sessions</td></tr>') +
      tableBox('📄 דפים (Search Console)', ['URL', 'קליקים', 'חשיפות', 'CTR'],
        pages.slice(0, 12).map(function (p) {
          return [shortUrl(p.page), fmt(p.clicks), fmt(p.impressions), p.ctr != null ? (p.ctr * 100).toFixed(1) + '%' : NO_DATA];
        }), pages.length ? '' : '<tr><td colspan="4">Pending — GSC מחובר, ממתין לדפים בטווח</td></tr>') +
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
    var channels = window.MarketingSsot
      ? MarketingSsot.getMarketingChannels(true)
      : null;
    if (channels) {
      var rows = channels.map(function (c) {
        return '<tr><td>' + esc(c.nameHe) + '</td><td>' + MarketingSsot.statusBadgeHtml(c.status) + '</td><td style="font-size:12px;color:var(--white50);">' + esc(c.detail || c.status.labelHe) + '</td></tr>';
      }).join('');
      return '<div class="card" style="padding:14px;grid-column:1/-1;"><div class="card-title" style="margin-bottom:10px;">🔗 ערוצי שיווק וחיבורים</div><div class="table-wrap"><table><thead><tr><th>ערוץ</th><th>סטטוס</th><th>פרטים</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
    }
    var items = [
      ['Google Search Console', 'searchConsole'],
      ['Google Analytics 4', 'analytics4'],
      ['Google Business Profile', 'businessProfile'],
      ['Google Ads', 'googleAds'],
      ['Google Tag Manager', 'googleTagManager'],
    ];
    var rows = items.map(function (pair) {
      var c = (raw.connections && raw.connections[pair[1]]) || {};
      var status = c.ok ? 'פעיל' : (c.note || PENDING);
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
    if (!grid) {
      var screen = document.getElementById('screen-assets');
      if (!screen) return;
      var content = screen.querySelector('.content');
      if (!content) return;
      grid = document.createElement('div');
      grid.id = 'coco-live-assets-grid';
      grid.className = 'coco-live-section grid grid-3';
      grid.style.cssText = 'gap:10px;padding:16px 20px 0;';
      content.insertBefore(grid, content.firstChild);
    }
    var assets = window.MarketingSsot ? MarketingSsot.getConnectedAssets() : [{ icon: '🌐', name: SITE.domain, url: SITE.url, status: 'active' }];
    var channels = window.MarketingSsot ? MarketingSsot.getMarketingChannels(true) : [];
    var cards = assets.map(function (a) {
      return '<div class="asset-card"><div class="asset-header"><div class="asset-icon">' + a.icon + '</div><div><div class="asset-name">' + esc(a.name) + '</div><div class="asset-status">' + esc(a.url) + '</div></div></div>' +
        '<span class="badge badge-green">● פעיל</span></div>';
    }).concat(channels.map(function (c) {
      return '<div class="asset-card"><div class="asset-header"><div class="asset-icon">' + c.icon + '</div><div><div class="asset-name">' + esc(c.nameHe) + '</div><div class="asset-status">' + esc(c.detail || c.status.labelHe) + '</div></div></div>' +
        (window.MarketingSsot ? MarketingSsot.statusBadgeHtml(c.status) : connectionBadge('', { connections: {} })) + '</div>';
    }));
    grid.innerHTML = cards.join('');
    var sub = document.querySelector('#screen-assets .page-subtitle');
    if (sub) sub.textContent = 'מרכז שליטה — ' + SITE.company + ' · ' + SITE.domain;
    hideStaticDemoBlocks();
  }

  function renderHubAiBox(bundle) {
    var hdr = document.querySelector('#screen-hub .ai-box-header');
    var txt = document.querySelector('#screen-hub .ai-box-text');
    if (!hdr || !txt) return;
    hdr.textContent = 'המלצת AI — ' + SITE.domain + ' (ממתין למפתח)';
    var suggestions = (bundle && bundle.ai && bundle.ai.recommendations) || [];
    var raw = state.dashboard;
    var seo = (raw && raw.aiSeoSuggestions) || [];
    if (seo.length) {
      txt.innerHTML = seo.slice(0, 3).map(function (s) {
        return '• ' + esc(s.title || s.suggestion || String(s));
      }).join('<br>') + '<br><span style="color:var(--white50);font-size:12px;">מקור: GSC/GA4 · AI מנועים: ממתין למפתח</span>';
    } else if (suggestions.length) {
      txt.textContent = suggestions.slice(0, 2).join(' · ') + ' — AI: ממתין למפתח';
    } else {
      txt.textContent = 'נתוני GSC/GA4 פעילים ל-' + SITE.domain + '. מנועי AI (OpenAI/Claude/Gemini) ממתינים למפתח — שלב נתונים קודם.';
    }
  }

  function badgeForStatus(st) {
    if (!st) return '<span class="badge badge-gray">לא מחובר</span>';
    if (window.MarketingSsot && MarketingSsot.statusBadgeHtml) return MarketingSsot.statusBadgeHtml(st);
    var cls = st.badgeClass || 'badge-gray';
    return '<span class="badge ' + cls + '">' + esc(st.labelHe || st.code || '—') + '</span>';
  }

  function ensureClientsListMount() {
    var list = document.getElementById('coco-live-clients-list');
    if (list) return list;
    var tabList = document.getElementById('tab-clients-list');
    if (tabList) {
      var section = tabList.querySelector('.section');
      if (section) {
        var listWrap = section.querySelector('div[style*="flex-direction:column"]');
        if (listWrap) {
          listWrap.innerHTML = '';
          listWrap.id = 'coco-live-clients-list';
          listWrap.className = 'coco-live-section';
          listWrap.style.cssText = 'display:flex;flex-direction:column;gap:10px;';
          return listWrap;
        }
      }
    }
    var clientsScreen = document.getElementById('screen-clients');
    if (!clientsScreen) return null;
    var content = clientsScreen.querySelector('.content');
    if (!content) return null;
    list = document.createElement('div');
    list.id = 'coco-live-clients-list';
    list.className = 'coco-live-section';
    list.style.cssText = 'padding:16px 20px;display:flex;flex-direction:column;gap:10px;';
    content.insertBefore(list, content.firstChild);
    return list;
  }

  function clientsChannelRows(includeInfra) {
    if (window.MarketingSsot && MarketingSsot.getMarketingChannels) {
      return MarketingSsot.getMarketingChannels(!!includeInfra);
    }
    return [];
  }

  function renderClientChannelTable(channels, filterIds) {
    var rows = channels.filter(function (c) {
      return !filterIds || filterIds.indexOf(c.id) >= 0;
    });
    if (!rows.length) return '';
    return '<div style="display:flex;flex-direction:column;gap:8px;margin-top:4px;">' +
      rows.map(function (c) {
        var detail = c.detail ? '<div style="font-size:11px;color:var(--white50);margin-top:2px;">' + esc(c.detail) + '</div>' : '';
        return '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;background:var(--bg3);border-radius:8px;border:1px solid var(--border);">' +
          '<div style="display:flex;align-items:center;gap:8px;min-width:0;">' +
          '<span style="font-size:20px;flex-shrink:0;">' + c.icon + '</span>' +
          '<div style="min-width:0;"><div style="font-weight:600;font-size:12px;">' + esc(c.nameHe) + '</div>' + detail + '</div></div>' +
          badgeForStatus(c.status) +
          '</div>';
      }).join('') +
      '</div>';
  }

  function activeAssetInfo() {
    if (window.AssetFlowSsot && AssetFlowSsot.getActiveAsset) return AssetFlowSsot.getActiveAsset();
    return { id: 'asset-dalia-c-com', domain: SITE.domain, url: SITE.url, label: SITE.domain, live: true };
  }

  function renderAssetPickerHtml() {
    if (!window.AssetFlowSsot || !AssetFlowSsot.getAssets) return '';
    var assets = AssetFlowSsot.getAssets();
    var activeId = AssetFlowSsot.getActiveAssetId();
    return '<div style="margin-top:12px;"><div style="font-size:11px;color:var(--white50);margin-bottom:6px;">בחר נכס פעיל — כל המערכת מסתנכרנת לנכס שנבחר</div>' +
      '<div style="display:flex;flex-direction:column;gap:6px;">' +
      assets.map(function (a) {
        var isActive = a.id === activeId;
        var isDraft = a.status === 'draft' || a.live === false;
        var border = isActive ? 'var(--accent)' : 'var(--border)';
        var badge = isDraft
          ? '<span class="badge badge-yellow" style="font-size:10px;">ממתין</span>'
          : (isActive ? '<span class="badge badge-purple" style="font-size:10px;">● נכס פעיל</span>' : '<span class="badge badge-gray" style="font-size:10px;">לחץ לבחירה</span>');
        return '<div class="card" style="padding:10px 12px;cursor:pointer;border-color:' + border + ';" data-asset-id="' + esc(a.id) + '" onclick="AssetFlowSsot.selectActiveAsset(\'' + esc(a.id) + '\')">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
          '<div style="display:flex;align-items:center;gap:8px;min-width:0;">' +
          '<span style="font-size:20px;">' + (a.icon || '🌐') + '</span>' +
          '<div style="min-width:0;"><div style="font-weight:700;font-size:13px;">' + esc(a.label || a.domain) + '</div>' +
          (a.url ? '<div style="font-size:11px;color:var(--white50);">' + esc(a.url) + '</div>' : '') +
          '</div></div>' + badge + '</div></div>';
      }).join('') +
      '</div></div>';
  }

  function renderClientsSetupLive() {
    var tab = document.getElementById('tab-clients-setup');
    if (!tab) return;
    tab.querySelectorAll('.section > .sec-title, .section > .grid, .section > div[style*="flex"], .section > .alert:not(.coco-live-section *)').forEach(function (el) {
      if (!el.closest('.coco-live-section') && !el.closest('#coco-live-setup-panel')) el.style.display = 'none';
    });
    var mount = document.getElementById('coco-live-setup-panel');
    if (!mount) {
      mount = document.createElement('div');
      mount.id = 'coco-live-setup-panel';
      mount.className = 'coco-live-section section';
      mount.style.cssText = 'padding:0 20px 20px;';
      var header = tab.querySelector('.page-header');
      if (header) header.insertAdjacentElement('afterend', mount);
      else tab.appendChild(mount);
    }
    var asset = activeAssetInfo();
    mount.innerHTML =
      '<div class="alert alert-info" style="margin:14px 0;">ℹ️ פרטי הלקוח מגיעים אוטומטית ממערכת דליה. כאן מגדירים נכסים וסביבת שיווק בלבד — <strong>לא</strong> פותחים לקוח חדש.</div>' +
      '<div class="card" style="padding:14px;margin-bottom:12px;">' +
      '<div style="font-size:11px;color:var(--white50);">נכס פעיל כרגע</div>' +
      '<div style="font-weight:700;font-size:14px;margin-top:4px;">' + esc(asset.icon || '🌐') + ' ' + esc(asset.domain || asset.label) + '</div>' +
      '<div style="font-size:12px;color:var(--white50);margin-top:4px;">קמפיין: ' + esc(primaryCampaign().name) + '</div></div>' +
      renderAssetPickerHtml();
    if (window.AssetFlowSsot && AssetFlowSsot.wireActionButtons) AssetFlowSsot.wireActionButtons();
  }

  function renderClientsLive() {
    var list = ensureClientsListMount();
    if (!list) return;

    var asset = activeAssetInfo();
    var camp = primaryCampaign();
    var domain = asset.domain || asset.label || SITE.domain;
    var url = asset.url || SITE.url;
    var channels = clientsChannelRows(true);
    var marketing = clientsChannelRows(false);
    var activeMarketing = marketing.filter(function (c) { return c.status && c.status.code === 'active'; });
    var gtm = channels.find(function (c) { return c.id === 'googleTagManager'; });
    var pendingIds = ['googleAds', 'businessProfile', 'meta'];
    var pendingRows = marketing.filter(function (c) { return pendingIds.indexOf(c.id) >= 0; });

    list.innerHTML =
      '<div class="card" style="border-color:var(--accent);padding:16px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">' +
      '<div style="min-width:0;flex:1;">' +
      '<div style="font-weight:800;font-size:16px;">🏢 דליה · ' + esc(SITE.superAdmin) + '</div>' +
      '<div style="font-size:12px;color:var(--white50);margin-top:4px;">לקוח פעיל · Client ID: ' + esc(SITE.clientId) + '</div>' +
      '<div style="margin-top:10px;"><span class="badge badge-green">● פעיל</span> <span class="badge badge-purple">אתר רשמי</span></div>' +
      '</div></div>' +

      '<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);">' +
      '<div style="font-size:11px;color:var(--white50);margin-bottom:4px;">נכס פעיל</div>' +
      '<div style="font-weight:700;font-size:15px;">🌐 <a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" style="color:var(--accent2);text-decoration:underline;">' + esc(domain) + '</a></div>' +
      '<div style="font-size:11px;color:var(--white50);margin-top:4px;">קישור ישיר לאתר · נפתח בטאב חדש</div>' +
      renderAssetPickerHtml() +
      '</div>' +

      '<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);">' +
      '<div style="font-size:11px;color:var(--white50);margin-bottom:4px;">קמפיין פעיל</div>' +
      '<div style="font-weight:700;font-size:14px;">📈 ' + esc(camp.name) + '</div>' +
      '<div style="font-size:12px;color:var(--white50);margin-top:4px;">SEO · קידום אורגני · ' + esc(camp.id) + '</div>' +
      '</div>' +

      '<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);">' +
      '<div style="font-size:11px;color:var(--white50);margin-bottom:6px;">ערוצים פעילים (' + activeMarketing.length + ') — לנכס ' + esc(domain) + '</div>' +
      renderClientChannelTable(activeMarketing) +
      '</div>' +

      (gtm ? ('<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);">' +
        '<div style="font-size:11px;color:var(--white50);margin-bottom:6px;">סטטוס GTM</div>' +
        renderClientChannelTable([gtm]) +
        '</div>') : '') +

      '<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);">' +
      '<div style="font-size:11px;color:var(--white50);margin-bottom:6px;">Google Ads · GBP · Meta</div>' +
      renderClientChannelTable(pendingRows) +
      '</div>' +

      '<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);">' +
      '<button type="button" class="btn btn-primary" style="width:100%;font-size:13px;padding:11px" onclick="BusinessStrategyWizard.open()">🧠 פתח אסטרטגיית שיווק AI</button>' +
      '<div style="font-size:11px;color:var(--white50);margin-top:6px;text-align:center">למידת אתר · Business Context · העברה לעוזרים ומטרות</div>' +
      '</div>' +
      '</div>';

    var filterBar = document.querySelector('#tab-clients-list .filter-bar');
    if (filterBar) filterBar.style.display = 'none';
    var sub = document.querySelector('#tab-clients-list .page-subtitle');
    if (sub) sub.textContent = 'דליה · ' + SITE.domain + ' · ' + SITE.superAdmin;
    var setupSub = document.querySelector('#tab-clients-setup .page-subtitle');
    if (setupSub) setupSub.textContent = SITE.company + ' · ' + SITE.domain + ' — נבחר מדליה';
  }

  function renderClientsAssetsLive() {
    var tab = document.getElementById('tab-clients-assets');
    if (!tab) return;

    tab.querySelectorAll('.filter-bar, #ca-grid, .grid.grid-4').forEach(function (el) {
      if (!el.closest('.coco-live-section')) el.style.display = 'none';
    });

    var mount = document.getElementById('coco-live-clients-assets');
    if (!mount) {
      mount = document.createElement('div');
      mount.id = 'coco-live-clients-assets';
      mount.className = 'coco-live-section';
      mount.style.cssText = 'padding:0 20px 20px;';
      var header = tab.querySelector('.page-header');
      if (header) header.insertAdjacentElement('afterend', mount);
      else tab.appendChild(mount);
    }

    var asset = activeAssetInfo();
    var domain = asset.domain || asset.label || SITE.domain;
    var url = asset.url || SITE.url;

    var channels = clientsChannelRows(false);
    var gtm = clientsChannelRows(true).find(function (c) { return c.id === 'googleTagManager'; });
    var siteCard =
      '<div class="ca-card" style="background:var(--bg3);border:2px solid var(--accent);border-radius:var(--card-r);padding:14px;cursor:pointer;" onclick="AssetFlowSsot.selectActiveAsset(\'' + esc(asset.id || 'asset-dalia-c-com') + '\')">' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
      '<span style="font-size:24px;">🌐</span>' +
      '<div><div style="font-size:12px;font-weight:700;">אתר אינטרנט · נכס פעיל</div>' +
      '<div style="font-size:10px;color:var(--white50);"><a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" style="color:var(--accent2);">' + esc(domain) + '</a></div></div></div>' +
      '<span class="badge badge-green" style="font-size:10px;">● פעיל</span></div>';

    var pendingAssets = (window.AssetFlowSsot && AssetFlowSsot.getAssets)
      ? AssetFlowSsot.getAssets().filter(function (a) { return a.status === 'draft' || a.live === false; })
      : [];
    var pendingCards = pendingAssets.map(function (a) {
      return '<div class="ca-card" style="background:var(--bg3);border:1px dashed var(--border);border-radius:var(--card-r);padding:14px;opacity:0.85;">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
        '<span style="font-size:24px;">' + (a.icon || '🔗') + '</span>' +
        '<div><div style="font-size:12px;font-weight:700;">' + esc(a.label) + '</div>' +
        '<div style="font-size:10px;color:var(--white50);">ממתין לחיבור</div></div></div>' +
        '<span class="badge badge-yellow" style="font-size:10px;">⏳ ממתין</span></div>';
    }).join('');

    var channelCards = channels.map(function (c) {
      var border = c.status && c.status.code === 'active' ? 'rgba(34,197,94,0.3)' : 'var(--border)';
      return '<div class="ca-card" style="background:var(--bg3);border:1px solid ' + border + ';border-radius:var(--card-r);padding:14px;">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
        '<span style="font-size:24px;">' + c.icon + '</span>' +
        '<div><div style="font-size:12px;font-weight:700;">' + esc(c.nameHe) + '</div>' +
        (c.detail ? '<div style="font-size:10px;color:var(--white50);">' + esc(c.detail) + '</div>' : '') +
        '</div></div>' + badgeForStatus(c.status) + '</div>';
    }).join('');

    var gtmCard = gtm ?
      ('<div class="ca-card" style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--card-r);padding:14px;">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
        '<span style="font-size:24px;">' + gtm.icon + '</span>' +
        '<div><div style="font-size:12px;font-weight:700;">' + esc(gtm.nameHe) + '</div>' +
        (gtm.detail ? '<div style="font-size:10px;color:var(--white50);">' + esc(gtm.detail) + '</div>' : '') +
        '</div></div>' + badgeForStatus(gtm.status) + '</div>') : '';

    mount.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin:12px 0 10px;">' +
      '<div class="sec-title" style="margin:0;">נכסים — ' + esc(domain) + '</div>' +
      '<button type="button" class="btn btn-primary" style="font-size:12px;padding:5px 12px;" onclick="AssetFlowSsot.openAddAssetModal()">➕ הוספת נכס חדש</button></div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;">' +
      siteCard + pendingCards + channelCards + gtmCard +
      '</div>';

    var sub = tab.querySelector('.page-subtitle');
    if (sub) sub.textContent = SITE.company + ' · ' + domain;
    if (window.AssetFlowSsot && AssetFlowSsot.wireActionButtons) AssetFlowSsot.wireActionButtons();
  }

  function bindOfficialContext() {
    if (window.ClientIdSsot && ClientIdSsot.applyFlowContext) {
      ClientIdSsot.applyFlowContext();
    }
    if (!window.COCO) window.COCO = {};
    var camp = primaryCampaign();
    COCO.flowContext = Object.assign(COCO.flowContext || {}, {
      clientId: SITE.clientId,
      clientName: SITE.company,
      company: SITE.company,
      site: SITE.domain,
      domain: SITE.domain,
      project: camp.project_id,
      projectName: camp.project_id === 'project001aimarketing' ? 'Project 001 — AI Marketing' : camp.project_id,
      campaign: camp.id,
      campaignName: camp.name,
      channel: 'seo',
    });
    if (window.CocoClaude && CocoClaude.setClientId) CocoClaude.setClientId(SITE.clientId);
    applySiteLabels();
  }

  function restoreHubCards() {
    var grid = document.querySelector('#screen-hub .hub-grid');
    if (grid) grid.style.display = '';
    document.querySelectorAll('#screen-hub .hub-card').forEach(function (card) {
      card.style.display = '';
    });
  }

  function scrubDemoUi() {
    document.querySelectorAll('#screen-clients .card[onclick*="selectClient"]').forEach(function (el) {
      el.style.display = 'none';
    });
    document.querySelectorAll('#screen-clients .btn, #screen-clients button').forEach(function (btn) {
      if (/לקוח חדש/i.test(btn.textContent || '')) btn.style.display = 'none';
    });
    if (window.AssetFlowSsot && AssetFlowSsot.hideNewClientButtons) AssetFlowSsot.hideNewClientButtons();
    restoreHubCards();
    var aiBox = document.querySelector('#screen-hub .ai-box');
    if (aiBox && /גרין-טק/i.test(aiBox.textContent || '')) aiBox.style.display = 'none';
    document.querySelectorAll('#coco-claude-root .page-subtitle, #coco-claude-root .page-title').forEach(function (el) {
      if (/גרין-טק|greentech|FleetOS|דלתא/i.test(el.textContent)) {
        el.textContent = SITE.company + ' • ' + SITE.domain;
      }
    });
    document.querySelectorAll('#screen-hub .section').forEach(function (sec) {
      if (/התראות אחרונות|PageSpeed|404|Meta Description/i.test(sec.textContent || '')) sec.style.display = 'none';
    });
    document.querySelectorAll('#screen-agents .content > div').forEach(function (el) {
      if (/גרין-טק|greentech|CLT-001|Brand Search|ציון כללי|72/i.test(el.textContent || '')) {
        if (!el.closest('#coco-live-agents-root') && !el.closest('#coco-live-agents-context')) el.style.display = 'none';
      }
    });
    ['tab-clients-assets', 'tab-clients-integrations'].forEach(function (tid) {
      var tab = document.getElementById(tid);
      if (!tab) return;
      tab.querySelectorAll('.card, .ca-card, .grid.grid-4').forEach(function (el) {
        if (!el.closest('.coco-live-section') && !el.id) el.style.display = 'none';
      });
    });
    hideStaticDemoBlocks();
    document.querySelectorAll('#screen-hub .section .alert').forEach(function (el) {
      if (/PageSpeed|404|Meta Description|61 בנייד/i.test(el.textContent || '')) el.style.display = 'none';
    });
    ensureLiveMounts();
  }

  function hideStaticDemoBlocks() {
    var demoRx = /גרין|greentech|8,420|14,320|184,000|342|77%|42 ליד|FleetOS|דלתא לוגיסטיקה|9 עמודים חלשים|23 ממצא|12 משימות/i;
    ['screen-goals', 'screen-actions', 'screen-history', 'screen-assets', 'screen-hub', 'screen-ai-center', 'screen-ai-decisions', 'screen-agents', 'screen-crm', 'screen-reports'].forEach(function (sid) {
      var screen = document.getElementById(sid);
      if (!screen) return;
      screen.querySelectorAll('.section, .grid.grid-4, .act-item, .action-card, .timeline .tl-item').forEach(function (el) {
        if (el.closest('.coco-live-section') || (el.id && el.id.indexOf('coco-live') === 0)) return;
        if (demoRx.test(el.textContent || '')) el.style.display = 'none';
      });
    });
    document.querySelectorAll('#screen-assets .asset-card').forEach(function (el) {
      if (!el.closest('#coco-live-assets-grid')) el.style.display = 'none';
    });
    document.querySelectorAll('#screen-agents .section .grid.grid-4').forEach(function (g) {
      if (!g.closest('#coco-live-agents-root')) g.style.display = 'none';
    });
  }

  function ensureLiveMounts() {
    [
      ['coco-live-goals-list', 'screen-goals'],
      ['coco-live-actions-pending', 'screen-actions'],
      ['coco-live-actions-done', 'screen-actions'],
    ].forEach(function (pair) {
      if (document.getElementById(pair[0])) return;
      var screen = document.getElementById(pair[1]);
      if (!screen) return;
      var content = screen.querySelector('.content');
      if (!content) return;
      var div = document.createElement('div');
      div.id = pair[0];
      div.className = 'coco-live-section';
      div.style.cssText = 'padding:16px 20px 0;';
      content.insertBefore(div, content.firstChild);
    });
  }

  function syncLabel() {
    return state.dashboard && (state.dashboard.generatedAt || state.dashboard.lastSync?.timestamp)
      ? new Date(state.dashboard.generatedAt || state.dashboard.lastSync.timestamp).toLocaleString('he-IL')
      : '—';
  }

  function pendingAgent(name, icon, source, reason) {
    var aiMsg = window.CocoIntegrationHub ? CocoIntegrationHub.getAiBlockedMessage() : 'ממתין למפתח AI';
    return {
      name: name, icon: icon, source: source + ' — ' + SITE.domain,
      status: 'pending', liveOnly: true, connectionOk: false,
      scanTime: PENDING, findings: 0, issues: 0, opportunities: 0, score: NO_DATA,
      urgency: '—', readyToTransfer: false,
      kpis: [{ label: 'סטטוס', val: reason, delta: '', color: 'var(--yellow)' }],
      findings_table: [{ type: 'ממתין', desc: reason, src: source, importance: '—', impact: '—', status: 'ממתין', transfer: false }],
      aiSummary: aiMsg,
      readyCount: 0, readyIssues: 0, readyOpp: 0, urgencyLabel: '—',
    };
  }

  function getAgentData(agentId) {
    var raw = state.dashboard;
    if (!raw) return null;
    var stats = raw.stats || {};
    var conn = raw.connections || {};
    var sc = raw.searchConsole || {};
    var ga4 = raw.analytics4 || {};
    var keywords = sc.keywords || [];
    var pages = sc.pages || [];
    var ga4Pages = ga4.topPages || [];
    var crawlN = (state.crawl && state.crawl.crawl && state.crawl.crawl.pageCount) || raw.lastSync?.counts?.gsc_pages || pages.length;
    var aiPending = window.CocoIntegrationHub ? CocoIntegrationHub.PENDING_KEY : 'ממתין למפתח';
    var id = String(agentId || '').toLowerCase();

    if (id === 'gsc' || id === 'search_console' || id === 'seo') {
      if (!conn.searchConsole?.ok) return pendingAgent('Google Search Console AI', '🔎', 'Search Console', PENDING);
      return {
        name: 'Google Search Console AI', icon: '🔎', source: 'Google Search Console',
        status: 'live', liveOnly: true, connectionOk: true, scanTime: syncLabel(),
        findings: keywords.length + pages.length, issues: stats.weakPages || 0, opportunities: stats.opportunities || 0,
        score: NO_DATA, urgency: '—', readyToTransfer: false,
        kpis: [
          { label: 'קליקים', val: fmt(stats.totalClicks), delta: 'GSC', color: 'var(--white)' },
          { label: 'חשיפות', val: fmt(stats.totalImpressions), delta: 'GSC', color: 'var(--white)' },
          { label: 'CTR', val: stats.avgCtr != null ? stats.avgCtr + '%' : NO_DATA, delta: '', color: 'var(--white)' },
          { label: 'מיקום ממוצע', val: stats.avgPosition != null ? Number(stats.avgPosition).toFixed(1) : NO_DATA, delta: '', color: 'var(--accent2)' },
          { label: 'מילות מפתח', val: fmt(stats.activeKeywords), delta: '', color: 'var(--white)' },
          { label: 'דפים (GSC)', val: fmt(pages.length), delta: '', color: 'var(--white)' },
        ],
        findings_table: keywords.slice(0, 8).map(function (k) {
          return { type: 'נתון', desc: k.query, src: 'GSC', importance: '—', impact: fmt(k.clicks) + ' קליקים', status: 'חי', transfer: false };
        }).concat(pages.length ? [] : [{ type: 'מידע', desc: 'אין דפים בטווח — האתר מחובר', src: 'GSC', importance: '—', impact: '—', status: 'חי', transfer: false }]),
        aiSummary: 'נתונים אמיתיים מ-GSC ל-' + SITE.domain + '. AI: ' + aiPending + '.',
        readyCount: stats.opportunities || 0, readyIssues: stats.weakPages || 0, readyOpp: stats.opportunities || 0, urgencyLabel: '—',
      };
    }
    if (id === 'ga4' || id === 'analytics') {
      if (!conn.analytics4?.ok) return pendingAgent('Google Analytics AI', '📊', 'GA4', PENDING);
      return {
        name: 'Google Analytics AI', icon: '📊', source: 'Google Analytics 4',
        status: 'live', liveOnly: true, connectionOk: true, scanTime: syncLabel(),
        findings: ga4Pages.length, issues: 0, opportunities: 0, score: NO_DATA,
        urgency: '—', readyToTransfer: false,
        kpis: [
          { label: 'סשנים', val: fmt(stats.ga4Sessions), delta: 'GA4', color: 'var(--green)' },
          { label: 'צפיות', val: fmt(stats.ga4PageViews), delta: 'GA4', color: 'var(--white)' },
          { label: 'עמודים מובילים', val: fmt(ga4Pages.length), delta: '', color: 'var(--white)' },
        ],
        findings_table: ga4Pages.slice(0, 8).map(function (p) {
          return { type: 'עמוד', desc: p.pagePath || p.page, src: 'GA4', importance: '—', impact: fmt(p.sessions) + ' סשנים', status: 'חי', transfer: false };
        }),
        aiSummary: 'נתונים אמיתיים מ-GA4. AI: ' + aiPending + '.',
        readyCount: 0, readyIssues: 0, readyOpp: 0, urgencyLabel: '—',
      };
    }
    if (id === 'gbp' || id === 'google_business') {
      return pendingAgent('Google Business AI', '📍', 'Google Business', conn.businessProfile?.note || PENDING);
    }
    if (id === 'ads' || id === 'google_ads' || id === 'campaign') {
      return pendingAgent('Google Ads AI', '🎯', 'Google Ads', conn.googleAds?.note || PENDING);
    }
    if (id === 'meta') return pendingAgent('Meta AI', '👥', 'Meta', PENDING);
    if (id === 'pagespeed') return pendingAgent('PageSpeed AI', '⚡', 'PageSpeed', PENDING);
    if (id === 'cms' || id === 'website') {
      return {
        name: 'Website / CMS AI', icon: '🌐', source: SITE.domain,
        status: 'live', liveOnly: true, connectionOk: true, scanTime: syncLabel(),
        findings: crawlN, issues: 0, opportunities: 0, score: NO_DATA,
        urgency: '—', readyToTransfer: false,
        kpis: [{ label: 'עמודים באתר', val: fmt(crawlN), delta: 'crawl', color: 'var(--white)' }],
        findings_table: [{ type: 'אתר', desc: SITE.url, src: 'site-crawl', importance: '—', impact: fmt(crawlN) + ' עמודים', status: 'חי', transfer: false }],
        aiSummary: 'נתוני אתר אמיתיים. AI: ' + aiPending + '.',
        readyCount: 0, readyIssues: 0, readyOpp: 0, urgencyLabel: '—',
      };
    }
    if (id === 'project001' || id === 'manager' || id === 'reports') {
      var activeConn = ['searchConsole', 'analytics4'].filter(function (k) { return conn[k]?.ok; }).length;
      return {
        name: id === 'manager' ? 'AI Manager' : 'Project 001 AI', icon: id === 'manager' ? '🤖' : '🚀',
        source: 'dalia-c.com dashboard',
        status: 'live', liveOnly: true, connectionOk: activeConn > 0, scanTime: syncLabel(),
        findings: activeConn, issues: 0, opportunities: stats.opportunities || 0, score: NO_DATA,
        urgency: '—', readyToTransfer: false,
        kpis: [
          { label: 'GSC קליקים', val: fmt(stats.totalClicks), delta: '', color: 'var(--white)' },
          { label: 'GA4 סשנים', val: fmt(stats.ga4Sessions), delta: '', color: 'var(--white)' },
          { label: 'חיבורים פעילים', val: String(activeConn), delta: 'מתוך Google', color: 'var(--accent2)' },
        ],
        findings_table: [
          { type: 'GSC', desc: conn.searchConsole?.ok ? 'מחובר' : PENDING, src: 'Search Console', importance: '—', impact: '—', status: conn.searchConsole?.ok ? 'חי' : 'ממתין', transfer: false },
          { type: 'GA4', desc: conn.analytics4?.ok ? 'מחובר' : PENDING, src: 'Analytics', importance: '—', impact: '—', status: conn.analytics4?.ok ? 'חי' : 'ממתין', transfer: false },
          { type: 'GBP', desc: conn.businessProfile?.note || PENDING, src: 'Business', importance: '—', impact: '—', status: 'ממתין', transfer: false },
          { type: 'Ads', desc: conn.googleAds?.note || PENDING, src: 'Google Ads', importance: '—', impact: '—', status: 'ממתין', transfer: false },
        ],
        aiSummary: 'סיכום מודולים — ' + activeConn + ' מקורות Google פעילים. AI: ' + aiPending + '.',
        readyCount: 0, readyIssues: 0, readyOpp: stats.opportunities || 0, urgencyLabel: '—',
      };
    }
    return null;
  }

  function initOfficial() {
    if (_readyPromise) return _readyPromise;
    _readyPromise = Promise.all([
      fetchJson('project-001/dashboard.json'),
      fetchJson('project-001/site-crawl-lite.json'),
      fetchJson('project-001/site-pages-index.json'),
      fetchJsonWithRetry('project-001/site-work-plan.json', 3),
    ]).then(function (res) {
      state.dashboard = res[0];
      state.crawl = res[1] || res[2] ? { crawl: { pageCount: (res[2] && res[2].summary && res[2].summary.businessAndContent) || 0, pages: (res[2] && res[2].pages && res[2].pages.business) || [] } } : null;
      state.pagesIndex = res[2];
      state.workPlan = res[3];
      if (res[1] && res[1].crawl) state.crawl = res[1];
      state.loadedAt = new Date().toISOString();

      if (!state.workPlan || !state.workPlan.pages || !state.workPlan.pages.length) {
        return fetchJsonWithRetry('project-001/site-work-plan.json', 2).then(function (wp) {
          if (wp) state.workPlan = wp;
          return finishInitOfficial();
        });
      }
      return finishInitOfficial();
    });
    return _readyPromise;
  }

  function finishInitOfficial() {
      bindOfficialContext();
      applySiteLabels();

      if (state.dashboard && window.COCO && typeof window.mapDashboardRaw === 'function') {
        COCO.data = window.mapDashboardRaw(state.dashboard);
      } else if (state.dashboard && window.COCO) {
        COCO.data = state.dashboard;
        if (COCO.data.meta) COCO.data.meta = Object.assign(COCO.data.meta || {}, { source: 'live', liveOnly: true });
      }

      var bundle = buildLiveBundle(state.dashboard);
      if (window.CocoData && CocoData.setBundle && bundle && bundle.workPlan && bundle.workPlan.pages) {
        CocoData.setBundle(bundle);
      }
      if (window.CocoClaude && CocoClaude.bindClientFromDalia) {
        CocoClaude.bindClientFromDalia(bundle);
      }
      if (state.dashboard) {
        renderStatusLive(state.dashboard, state.crawl);
        renderAssetsLive(state.dashboard);
      }
      renderClientsLive();
      renderClientsAssetsLive();
      renderClientsSetupLive();
      renderHubAiBox(bundle);
      scrubDemoUi();
      if (window.CocoIntegrationHub && CocoIntegrationHub.wireAll) {
        CocoIntegrationHub.wireAll(state.dashboard);
      }
      if (window.MarketingSsot && MarketingSsot.hydrate) {
        MarketingSsot.hydrate({
          dashboard: state.dashboard,
          bundle: bundle,
          workPlan: state.workPlan,
          site: SITE,
        });
        MarketingSsot.refreshUi();
      }
      if (window.CocoData) {
        if (CocoData.setBundle) CocoData.setBundle(bundle);
        if (CocoData.bindAll) CocoData.bindAll();
      }
      if (window.AssetFlowSsot && AssetFlowSsot.init) AssetFlowSsot.init();
      if (window.CocoUnified && CocoUnified.updateContextBar) CocoUnified.updateContextBar();
      document.body.classList.add('dalia-live-only');
      document.body.classList.remove('demo-mode');
      return { dashboard: state.dashboard, bundle: bundle };
  }

  window.DaliaSite = {
    SITE: SITE,
    SITES: SITES,
    sitesFromRegistry: sitesFromRegistry,
    PENDING: PENDING,
    NO_DATA: NO_DATA,
    initOfficial: initOfficial,
    whenReady: whenReady,
    hydrateWorkPlan: hydrateWorkPlan,
    buildLiveBundle: buildLiveBundle,
    applySiteLabels: applySiteLabels,
    scrubDemoUi: scrubDemoUi,
    restoreHubCards: restoreHubCards,
    renderStatusLive: renderStatusLive,
    renderHubAiBox: renderHubAiBox,
    renderAssetsLive: renderAssetsLive,
    renderClientsLive: renderClientsLive,
    renderClientsAssetsLive: renderClientsAssetsLive,
    renderClientsSetupLive: renderClientsSetupLive,
    getDashboard: function () { return state.dashboard; },
    getWorkPlan: function () { return state.workPlan; },
    getCrawl: function () { return state.crawl; },
    getPagesIndex: function () { return state.pagesIndex; },
    logWorkProgress: logWorkProgress,
    getAgentData: getAgentData,
    isLiveOnly: function () { return true; },
  };
})();
