/**
 * Project 001 — אתר רשמי dalia-c.com בלבד (ללא Demo)
 */
(function () {
  'use strict';

  var SITE = window.ClientIdSsot ? Object.assign({}, ClientIdSsot.OFFICIAL, {
    name: 'דליה — dalia-c.com',
    ga4Property: 'properties/427711798',
    superAdmin: 'יוני אטיאס',
  }) : {
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
    var path = rel;
    if (window.ClientIdSsot && ClientIdSsot.DATA_PATHS) {
      if (rel === 'project-001/dashboard.json') path = ClientIdSsot.DATA_PATHS.dashboard;
      if (rel === 'project-001/site-crawl.json') path = ClientIdSsot.DATA_PATHS.siteCrawl;
    }
    return fetch(assetUrl(path) + '?t=' + Date.now(), { cache: 'no-store' })
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
    if (window.ClientIdSsot && ClientIdSsot.applyFlowContext) {
      ClientIdSsot.applyFlowContext();
    }
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
      if (/גרין-טק|greentech|דלתא|פתרונות טק|FleetOS/i.test(t)) card.style.display = 'none';
    });
    var aiBox = document.querySelector('#screen-hub .ai-box-header');
    if (aiBox && /גרין-טק/i.test(aiBox.textContent)) {
      aiBox.textContent = 'המלצת AI יומית — ' + SITE.domain + ' (ממתין למפתח)';
    }
    document.querySelectorAll('#coco-claude-root .page-subtitle, #coco-claude-root .page-title').forEach(function (el) {
      if (/גרין-טק|greentech|FleetOS|דלתא/i.test(el.textContent)) {
        el.textContent = SITE.company + ' • ' + SITE.domain;
      }
    });
    hideStaticDemoBlocks();
    ensureLiveMounts();
  }

  function hideStaticDemoBlocks() {
    var demoRx = /גרין|greentech|8,420|14,320|184,000|342|77%|42 ליד|FleetOS|דלתא לוגיסטיקה|9 עמודים חלשים|23 ממצא|12 משימות/i;
    ['screen-goals', 'screen-actions', 'screen-history', 'screen-assets', 'screen-hub', 'screen-ai-decisions', 'screen-reports'].forEach(function (sid) {
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
      renderHubAiBox(bundle);
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
    renderHubAiBox: renderHubAiBox,
    renderAssetsLive: renderAssetsLive,
    getDashboard: function () { return state.dashboard; },
    getAgentData: getAgentData,
    isLiveOnly: function () { return true; },
  };
})();
