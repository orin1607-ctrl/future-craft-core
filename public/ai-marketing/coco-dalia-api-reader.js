/**
 * CO.CO דליה — Read-Only API Reader (Phase 2)
 * Fetches public JSON + optional Supabase read (when auth present). No writes.
 */
(function () {
  'use strict';

  var VERSION = '4.0.0-readonly';
  var CACHE_KEY = 'coco-dalia-api-cache-v1';
  var CACHE_TTL_MS = 5 * 60 * 1000;

  var PATHS = {
    dashboard: 'project-001/dashboard.json',
    workPlan: 'project-001/site-work-plan.json',
  };

  var OFFICIAL_CLIENT = {
    id: 'dalia-c-official',
    name: 'דליה פתרונות תפעול ותחזוקה לרכב',
    domain: 'dalia-c.com',
    site: 'https://dalia-c.com/',
    contact: 'יוני אטיאס',
  };

  function getBasePath() {
    if (window.COCO_PAGES_BASE) {
      var b = window.COCO_PAGES_BASE;
      return b.charAt(0) === '/' ? b : (b.endsWith('/') ? b : b + '/');
    }
    return '/future-craft-core/';
  }

  function assetUrl(rel) {
    var base = getBasePath();
    if (base.charAt(0) === '/') return location.origin + base + rel;
    try {
      return new URL(rel, base).href;
    } catch (e) {
      return rel;
    }
  }

  function parseLs(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveLs(key, obj) {
    try {
      localStorage.setItem(key, JSON.stringify(obj));
      return true;
    } catch (e) {
      return false;
    }
  }

  function fetchJson(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function loadCache() {
    var c = parseLs(CACHE_KEY);
    if (!c || !c.fetchedAt) return null;
    if (Date.now() - new Date(c.fetchedAt).getTime() > CACHE_TTL_MS) return null;
    return c;
  }

  function saveCache(payload) {
    payload.fetchedAt = new Date().toISOString();
    saveLs(CACHE_KEY, payload);
    return payload;
  }

  function connToStatus(conn) {
    if (!conn) return 'ממתין';
    if (conn.ok || conn.status === 'connected') return 'מחובר';
    if (/pending|approval|production_access/i.test(String(conn.status || ''))) return 'דורש התחברות';
    if (/error|fail|403|denied/i.test(String(conn.lastError || conn.note || ''))) return 'שגיאה';
    return 'ממתין';
  }

  function mapIntegrations(dashboard) {
    var conn = (dashboard && dashboard.connections) || {};
    var list = [
      { key: 'googleAds', name: 'Google Ads', conn: conn.googleAds, extra: dashboard && dashboard.googleAds },
      { key: 'analytics4', name: 'Google Analytics 4', conn: conn.analytics4 },
      { key: 'searchConsole', name: 'Google Search Console', conn: conn.searchConsole },
      { key: 'businessProfile', name: 'Google Business Profile', conn: conn.businessProfile },
      { key: 'googleTagManager', name: 'Google Tag Manager', conn: conn.googleTagManager },
      { key: 'drive', name: 'Google Drive', conn: conn.drive },
      { key: 'gmail', name: 'Gmail', conn: conn.gmail },
      { key: 'sheets', name: 'Google Sheets', conn: conn.sheets },
    ];
    return list.map(function (item) {
      var st = connToStatus(item.conn);
      var note = (item.conn && item.conn.note) || (item.extra && item.extra.lastError) || '';
      return { name: item.name, status: st, source: 'dashboard.json', note: note };
    });
  }

  function mapAssets(dashboard, workPlan) {
    var assets = [];
    var site = (dashboard && dashboard.project && dashboard.project.site) || OFFICIAL_CLIENT.site;
    var domain = site.replace(/^https?:\/\//, '').replace(/\/$/, '');
    assets.push({ icon: '🌐', name: domain, type: 'אתר ראשי', status: 'תקין', source: 'api' });
    var conn = (dashboard && dashboard.connections) || {};
    if (conn.searchConsole && conn.searchConsole.ok) {
      assets.push({ icon: '🔍', name: 'Search Console', type: 'SEO', status: 'מחובר', source: 'api' });
    }
    if (conn.analytics4 && conn.analytics4.ok) {
      assets.push({ icon: '📊', name: 'Google Analytics GA4', type: 'אנליטיקס', status: 'מחובר', source: 'api' });
    }
    if (conn.googleTagManager && conn.googleTagManager.ok) {
      var gtm = (dashboard.googleTagManagerData && dashboard.googleTagManagerData.summary) || {};
      assets.push({ icon: '🏷️', name: gtm.publicId || 'GTM', type: 'Tag Manager', status: 'מחובר', source: 'api' });
    }
    if (dashboard && dashboard.googleAds && dashboard.googleAds.customerId) {
      assets.push({
        icon: '📢',
        name: 'Google Ads (' + dashboard.googleAds.customerId + ')',
        type: 'קמפיין ממומן',
        status: dashboard.googleAds.ok ? 'פעיל' : 'דורש התחברות',
        source: 'api',
      });
    }
    if (workPlan && workPlan.campaign) {
      assets.push({
        icon: '📈',
        name: workPlan.campaign.name,
        type: 'קמפיין SEO',
        status: workPlan.campaign.status === 'active' ? 'פעיל' : 'ממתין',
        source: 'api',
      });
    }
    return assets;
  }

  function mapKeywords(dashboard, limit) {
    limit = limit || 12;
    var kws = (dashboard && dashboard.searchConsole && dashboard.searchConsole.keywords) || [];
    return kws.slice(0, limit).map(function (k, i) {
      return {
        kw: k.query || k.keyword || ('מילה ' + (i + 1)),
        position: Math.round((k.position || k.avgPosition || 0) * 10) / 10 || '—',
        change: k.change || '0',
        volume: (k.impressions != null ? k.impressions + ' חשיפות' : '—'),
        priority: (k.clicks > 0 || (k.position && k.position <= 10)) ? 'גבוהה' : 'בינונית',
        cpc: '—',
        page: k.page || '—',
        status: 'פעיל',
        ai_rec: 'נתון אמיתי מ-Search Console (קריאה בלבד)',
        source: 'api',
      };
    });
  }

  function mapSeoAccordion(dashboard, workPlan) {
    var stats = (dashboard && dashboard.stats) || {};
    var sum = (workPlan && workPlan.summary) || {};
    var sync = (dashboard && dashboard.lastSync) || {};
    return [
      { t: 'מיקום האתר', body: 'מיקום ממוצע בגוגל: #' + (stats.avgPosition || '—') + '. ' + (stats.activeKeywords || 0) + ' מילות מפתח פעילות.' },
      { t: 'מילות מפתח', body: (stats.activeKeywords || 0) + ' מילות מפתח פעילות · ' + (stats.opportunities || 0) + ' הזדמנויות.' },
      { t: 'עמודים', body: (sum.pageCount || 0) + ' עמודים · ' + (sum.pagesInProgress || 0) + ' בתהליך · ' + (sum.progressPercent || 0) + '% התקדמות.' },
      { t: 'Analytics', body: 'GA4: ' + (stats.ga4Sessions || 0) + ' סשנים · ' + (stats.ga4PageViews || 0) + ' צפיות בעמוד.' },
      { t: 'סנכרון אחרון', body: sync.timestamp ? ('עודכן ' + new Date(sync.timestamp).toLocaleDateString('he-IL')) : '—' },
      { t: 'פעולות פתוחות', body: (sum.actionsOpen || 0) + ' פעולות פתוחות מתוך ' + (sum.actionsTotal || 0) + ' (work-plan).' },
    ];
  }

  function mapGoogleAdsReadOnly(dashboard) {
    var ads = (dashboard && dashboard.googleAdsData) || {};
    var meta = (dashboard && dashboard.googleAds) || {};
    var kpis = ads.kpis || meta.summary || {};
    var conn = (dashboard && dashboard.connections && dashboard.connections.googleAds) || {};
    var needsUser = /pending|403|permission|production_access|developer_token/i.test(
      String(conn.status || '') + String(ads.lastError || meta.lastError || conn.note || '')
    );
    return {
      connected: !!(conn.ok || meta.ok),
      customerId: ads.customerId || meta.customerId || null,
      status: conn.status || meta.status || 'unknown',
      statusHe: connToStatus(conn),
      needsUserApproval: needsUser,
      userAction: needsUser
        ? 'אישור Google Ads API / Developer Token Production — המערכת תמשיך לבד אחרי האישור'
        : null,
      kpis: {
        impressions: kpis.impressions || 0,
        clicks: kpis.clicks || 0,
        conversions: kpis.conversions || 0,
        campaignCount: kpis.campaignCount || 0,
        cpc: kpis.cpc || 0,
        currency: kpis.currency || 'ILS',
      },
      campaigns: ads.campaigns || [],
      readOnly: true,
      lastError: ads.lastError || meta.lastError || null,
    };
  }

  function mapAdsAccordion(dashboard) {
    var g = mapGoogleAdsReadOnly(dashboard);
    var lines = [
      { t: 'סטטוס חיבור', body: g.statusHe + (g.lastError ? ' — ' + g.lastError : '') },
      { t: 'Customer ID', body: g.customerId || '—' },
      { t: 'קמפיינים', body: g.kpis.campaignCount + ' קמפיינים (קריאה בלבד — ללא שליחה).' },
      { t: 'ביצועים', body: 'חשיפות: ' + g.kpis.impressions + ' · קליקים: ' + g.kpis.clicks + ' · המרות: ' + g.kpis.conversions },
      { t: 'מדיניות', body: 'קריאה בלבד · אין שליחת קמפיינים מהממשק החדש.' },
    ];
    if (g.needsUserApproval) {
      lines.push({ t: 'נדרש ממך', body: g.userAction });
    }
    return lines;
  }

  function mapSupabaseIntegrations(bundle) {
    if (!bundle || !bundle.connections) return [];
    var label = {
      google_analytics: 'Google Analytics 4',
      google_search_console: 'Google Search Console',
      google_ads: 'Google Ads',
      google_business: 'Google Business Profile',
      google_tag_manager: 'Google Tag Manager',
      facebook: 'Meta / Facebook',
      instagram: 'Instagram',
      supabase: 'Supabase',
    };
    return (bundle.connections || []).map(function (c) {
      var prov = c.provider || c.name || 'unknown';
      var st = /connected|active|ok/i.test(String(c.status || '')) ? 'מחובר' : 'דורש התחברות';
      return { name: label[prov] || prov, status: st, source: 'supabase-readonly', note: c.note || '' };
    });
  }

  function mapWorkPlanProgress(workPlan) {
    var sum = (workPlan && workPlan.summary) || {};
    var total = sum.actionsTotal || 0;
    var open = sum.actionsOpen || 0;
    var done = sum.actionsDone || (total - open);
    var pct = total ? Math.round((done / total) * 100) : 0;
    return {
      pageCount: sum.pageCount || 0,
      actionsTotal: total,
      actionsOpen: open,
      actionsDone: done,
      progressPercent: sum.progressPercent || pct,
      pagesInProgress: sum.pagesInProgress || 0,
      avgSeoScore: sum.avgSeoScore || null,
      assistantsCompletedEstimate: Math.min(50, Math.round((pct / 100) * 50)),
      consultantsCompletedEstimate: Math.min(10, Math.round((pct / 100) * 10)),
    };
  }

  function mapPages(workPlan, limit) {
    limit = limit || 10;
    var pages = (workPlan && workPlan.pages) || [];
    return pages.slice(0, limit).map(function (p) {
      var st = p.contentStatus || 'בבדיקה';
      var status = /טוב|מאושר/i.test(st) ? 'מאושר' : (/חסר|missing/i.test((p.missing || []).join(' ')) ? 'ממתין לתמונה' : 'בבדיקה');
      return {
        name: p.title || p.path || p.url,
        status: status,
        assistant: 'מומחה SEO',
        consultant: 'יועץ SEO',
        engine: 'קריאה מ-work-plan',
        source: 'api',
      };
    });
  }

  function getActiveCustomerId() {
    if (window.CocoDaliaTenantHub && CocoDaliaTenantHub.getActiveCustomerId) {
      return CocoDaliaTenantHub.getActiveCustomerId();
    }
    return OFFICIAL_CLIENT.id;
  }

  function fetchSupabaseReadOnly() {
    var api = window.MarketingApi;
    if (!api || !api.canRemote || !api.canRemote()) {
      return Promise.resolve({ customers: [], bundle: null, source: 'no-auth' });
    }
    var activeId = getActiveCustomerId();
    return api.listMarketingCustomers().then(function (rows) {
      var target = (rows || []).find(function (r) { return r.id === activeId; }) || (rows && rows[0]);
      if (!target) return { customers: rows || [], bundle: null, source: 'supabase' };
      return api.loadBundle(target.id).then(function (bundle) {
        return { customers: rows, bundle: bundle, source: 'supabase', customerId: target.id };
      });
    }).catch(function () {
      return { customers: [], bundle: null, source: 'supabase-error' };
    });
  }

  function fetchAll(opts) {
    opts = opts || {};
    if (!opts.force) {
      var cached = loadCache();
      if (cached) return Promise.resolve(cached);
    }

    var dashUrl = assetUrl(PATHS.dashboard);
    var planUrl = assetUrl(PATHS.workPlan);

    return Promise.all([
      fetchJson(dashUrl).catch(function (e) { return { _error: e.message }; }),
      fetchJson(planUrl).catch(function (e) { return { _error: e.message, summary: {} }; }),
      fetchSupabaseReadOnly(),
    ]).then(function (parts) {
      var dashboard = parts[0] && !parts[0]._error ? parts[0] : null;
      var workPlan = parts[1] && !parts[1]._error ? parts[1] : null;
      var supa = parts[2] || {};

      var payload = {
        version: VERSION,
        fetchedAt: new Date().toISOString(),
        officialClient: OFFICIAL_CLIENT,
        dashboard: dashboard,
        workPlan: workPlan,
        supabase: supa,
        integrations: dashboard ? mapIntegrations(dashboard) : [],
        assets: mapAssets(dashboard, workPlan),
        keywords: dashboard ? mapKeywords(dashboard) : [],
        seo_accordion: mapSeoAccordion(dashboard, workPlan),
        ads_accordion: mapAdsAccordion(dashboard),
        pages: mapPages(workPlan),
        stats: (dashboard && dashboard.stats) || {},
        connections: (dashboard && dashboard.connections) || {},
        errors: {
          dashboard: parts[0] && parts[0]._error ? parts[0]._error : null,
          workPlan: parts[1] && parts[1]._error ? parts[1]._error : null,
        },
      };

      if (supa.bundle && supa.bundle.customer) {
        payload.clientFromDb = {
          id: supa.customerId,
          name: supa.bundle.customer.name,
          contact: supa.bundle.customer.contact_person,
          sites: (supa.bundle.sites || []).map(function (s) { return s.url || s.domain; }),
          connections: (supa.bundle.connections || []).length,
          source: 'supabase-readonly',
        };
        var sbInt = mapSupabaseIntegrations(supa.bundle);
        if (sbInt.length) payload.integrations = sbInt.concat(payload.integrations);
      }

      payload.googleAds = dashboard ? mapGoogleAdsReadOnly(dashboard) : null;
      payload.workPlanProgress = mapWorkPlanProgress(workPlan);

      return saveCache(payload);
    });
  }

  window.CocoDaliaApiReader = {
    VERSION: VERSION,
    CACHE_KEY: CACHE_KEY,
    OFFICIAL_CLIENT: OFFICIAL_CLIENT,
    fetchAll: fetchAll,
    loadCache: loadCache,
    connToStatus: connToStatus,
    mapIntegrations: mapIntegrations,
    mapGoogleAdsReadOnly: mapGoogleAdsReadOnly,
    mapSupabaseIntegrations: mapSupabaseIntegrations,
    mapWorkPlanProgress: mapWorkPlanProgress,
    assetUrl: assetUrl,
  };
})();
