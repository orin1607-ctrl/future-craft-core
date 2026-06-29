/**
 * Business Strategy Module — Staging · דליה בלבד (Mission: AI Business Strategy)
 * Prefill from live site data, build Business Context, export to עוזרים / מטרות / פעולות.
 */
(function () {
  'use strict';

  var VERSION = '1.0.0';
  var CONTEXT_KEY = 'coco-business-context-v1';
  var ACTIONS_KEY = 'coco-business-strategy-actions-v1';
  var AGENT_BRIEF_KEY = 'coco-business-agent-brief-v1';
  var ENABLED_CLIENT = 'dalia-c-official';

  function official() {
    return (window.ClientIdSsot && ClientIdSsot.OFFICIAL) || {
      clientId: 'dalia-c-official',
      company: 'דליה פתרונות מימון ותחזוקה לרכב',
      domain: 'dalia-c.com',
      url: 'https://dalia-c.com/',
    };
  }

  function isStagingHost() {
    var h = location.hostname || '';
    return h.indexOf('github.io') >= 0 || h === 'localhost' || h === '127.0.0.1';
  }

  function isEnabled() {
    if (!isStagingHost()) return false;
    var ctx = (window.COCO && COCO.flowContext) || {};
    var cid = ctx.clientId || (window.ClientIdSsot && ClientIdSsot.OFFICIAL && ClientIdSsot.OFFICIAL.clientId);
    return !cid || cid === ENABLED_CLIENT;
  }

  function whenDataReady() {
    if (window.DaliaSite && DaliaSite.whenReady) return DaliaSite.whenReady();
    return Promise.resolve();
  }

  function dash() {
    return (window.DaliaSite && DaliaSite.getDashboard && DaliaSite.getDashboard()) || {};
  }

  function crawl() {
    return (window.DaliaSite && DaliaSite.getCrawl && DaliaSite.getCrawl()) || null;
  }

  function workPlan() {
    return (window.DaliaSite && DaliaSite.getWorkPlan && DaliaSite.getWorkPlan()) || null;
  }

  function connectedAssetNames() {
    var names = ['אתר אינטרנט'];
    var raw = dash().connections || {};
    if (raw.searchConsole && raw.searchConsole.ok) names.push('Google Search Console');
    if (raw.analytics4 && raw.analytics4.ok) names.push('Google Analytics 4');
    if (raw.googleTagManager && raw.googleTagManager.ok) names.push('Google Tag Manager');
    if (raw.businessProfile && raw.businessProfile.ok) names.push('Google Business Profile');
    if (raw.googleAds && raw.googleAds.ok) names.push('Google Ads');
    return names;
  }

  function topKeywords(limit) {
    var sc = dash().searchConsole || {};
    var kw = sc.keywords || [];
    return kw.slice(0, limit || 8).map(function (k) { return k.query || k.keyword; }).filter(Boolean);
  }

  function buildSeed() {
    var off = official();
    var wp = workPlan();
    var cr = crawl();
    var pages = (cr && cr.crawl && cr.crawl.pages) || (wp && wp.pages) || [];
    var stats = dash().stats || {};
    var summary = (wp && wp.summary) || {};
    var services = [
      'ניהול צי רכב', 'תפעול רכב לעסקים', 'תחזוקה מונעת', 'מעקב GPS לצי',
      'מימון וליסינג תפעולי', 'שירותי דליה',
    ];
    var competitors = [];
    try {
      fetchCompetitorsSync();
    } catch (e) { /* ignore */ }

    return {
      name: off.company,
      sector: 'תפעול ותחזוקת רכב / ניהול צי',
      site: off.url,
      loc: 'ישראל — כל הארץ',
      size: 'בינוני (21-100)',
      age: 'מעל 20 שנה',
      mainService: 'ניהול צי רכב ותפעול לעסקים',
      services: services.join(', '),
      diff: 'מעל 20 שנות ניסיון, שירות תחת קורת גג אחת, אפליקציה ייעודית, טיפול 24/7',
      pain: 'עלויות צי גבוהות, תקלות בלתי צפויות, חוסר שליטה בניהול רכבים',
      usp: 'פתרון מלא לעסקים — תפעול, תחזוקה, מעקב GPS ומימון',
      ideal: 'מנהל לוגיסטיקה / בעל עסק עם צי של 5+ רכבים',
      bad: 'רכב פרטי יחיד, לקוחות פרטיים ללא צי',
      goal: 'להגדיל לידים איכותיים מ-Google ולשפר נוכחות אורגנית ב-dalia-c.com',
      comp: 'FleetOS — fleetos.co.il\nGett Business — gett.com\nOptibus — optibus.com',
      vs: 'ניסיון מקומי, שירות אישי, מגוון שירותים תחת קורת גג אחת',
      budget: '₪6,000-10,000',
      free: '',
      sectors: ['לוגיסטיקה', 'פיזור ואספקה', 'מסחר'],
      challenges: ['מעט לידים', 'חוסר מודעות', 'אתר ישן', 'אין תוכן שיווקי'],
      files: [],
      urls: [off.url],
      connected: connectedAssetNames(),
      siteScan: {
        pageCount: summary.pageCount || (cr && cr.crawl && cr.crawl.pageCount) || pages.length,
        avgSeoScore: summary.avgSeoScore,
        actionsOpen: summary.actionsOpen,
        goalsCount: summary.goalsCount,
        topKeywords: topKeywords(6),
        gscClicks: stats.totalClicks,
        gscImpressions: stats.totalImpressions,
        ga4Sessions: stats.ga4Sessions,
        scannedAt: (cr && cr.crawl && cr.crawl.crawledAt) || dash().generatedAt || new Date().toISOString(),
      },
    };
  }

  var _competitorsCache = null;
  function fetchCompetitorsSync() {
    return _competitorsCache;
  }

  function loadCompetitors() {
    var base = window.COCO_PAGES_BASE || '/future-craft-core/';
    if (base.charAt(0) !== '/') base = '/' + base.replace(/^\.\//, '');
    return fetch(location.origin + base + 'project-001/competitors.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        _competitorsCache = data;
        return data;
      })
      .catch(function () { return null; });
  }

  function scanSiteInsights() {
    var seed = buildSeed();
    var scan = seed.siteScan || {};
    return {
      ok: true,
      domain: official().domain,
      pageCount: scan.pageCount || 0,
      avgSeoScore: scan.avgSeoScore,
      keywords: scan.topKeywords || [],
      gscClicks: scan.gscClicks,
      ga4Sessions: scan.ga4Sessions,
      actionsOpen: scan.actionsOpen,
      goalsCount: scan.goalsCount,
      log: [
        '📖 נטענו ' + (scan.pageCount || 0) + ' עמודים מ-crawl של ' + official().domain,
        '🔍 GSC: ' + (scan.gscClicks != null ? scan.gscClicks : '—') + ' קליקים · ' + (scan.gscImpressions != null ? scan.gscImpressions : '—') + ' חשיפות',
        '📊 GA4: ' + (scan.ga4Sessions != null ? scan.ga4Sessions : '—') + ' סשנים',
        '🎯 ' + (scan.goalsCount || 0) + ' מטרות · ' + (scan.actionsOpen || 0) + ' פעולות פתוחות ב-work-plan',
        '🔑 מילות מפתח מובילות: ' + ((scan.topKeywords || []).slice(0, 4).join(', ') || '—'),
      ],
    };
  }

  function buildBusinessContext(wizardData) {
    var off = official();
    var d = wizardData || buildSeed();
    var scan = d.siteScan || scanSiteInsights();
    return {
      version: 1,
      moduleVersion: VERSION,
      clientId: off.clientId || ENABLED_CLIENT,
      company: d.name || off.company,
      sector: d.sector,
      site: d.site || off.url,
      location: d.loc,
      mainService: d.mainService,
      differentiator: d.diff,
      usp: d.usp,
      idealClient: d.ideal,
      avoidClient: d.bad,
      businessGoal: d.goal,
      competitors: (d.comp || '').split('\n').filter(Boolean),
      challenges: d.challenges || [],
      sectors: d.sectors || [],
      budget: d.budget,
      connectedAssets: d.connected || [],
      siteScan: scan,
      ai_analysed: true,
      exportedAt: new Date().toISOString(),
      strategy: {
        type: 'SEO+PPC',
        platforms: ['Google Search Console', 'Google Analytics 4', 'SEO אורגני', 'Google Business Profile'],
        budget_tier: parseBudgetTier(d.budget),
        focusKeywords: (scan.topKeywords || scan.keywords || topKeywords(5)),
      },
    };
  }

  function parseBudgetTier(b) {
    if (!b) return 'recommended';
    if (b.indexOf('3,000') >= 0 && b.indexOf('6') < 0) return 'starter';
    if (b.indexOf('6,000') >= 0) return 'recommended';
    if (b.indexOf('10,000') >= 0) return 'growth';
    if (b.indexOf('20,000') >= 0) return 'aggressive';
    return 'recommended';
  }

  function buildStrategyActions(ctx) {
    var off = official();
    var ts = Date.now();
    var wp = workPlan();
    var topPages = ((wp && wp.pages) || []).slice(0, 3);
    var actions = [
      {
        id: 'biz-strat-' + ts + '-1',
        name: 'העברת Business Context לעוזרי AI',
        description: 'פרופיל עסקי: ' + (ctx.company || off.company) + ' · ' + (ctx.mainService || ''),
        status: 'in_progress',
        priority: 'גבוה',
        source: 'business-strategy',
        category: 'strategy',
        clientId: ctx.clientId,
        pagePath: '/',
        created_at: new Date().toISOString(),
      },
      {
        id: 'biz-strat-' + ts + '-2',
        name: 'סנכרון מטרות SEO מ-work-plan',
        description: (ctx.siteScan && ctx.siteScan.goalsCount) ? (ctx.siteScan.goalsCount + ' מטרות עמוד מחוברות') : 'מטרות עמוד מ-dalia-c.com',
        status: 'pending',
        priority: 'גבוה',
        source: 'business-strategy',
        category: 'goals',
        clientId: ctx.clientId,
        created_at: new Date().toISOString(),
      },
    ];
    topPages.forEach(function (p, i) {
      actions.push({
        id: 'biz-strat-' + ts + '-p' + i,
        name: 'אופטימיזציה: ' + (p.path || p.url || 'עמוד'),
        description: (p.missing && p.missing.length) ? p.missing.slice(0, 2).join(' · ') : (p.aiSummary || 'שיפור SEO'),
        status: 'pending_approval',
        priority: p.priority || 'גבוה',
        source: 'business-strategy',
        category: 'seo',
        clientId: ctx.clientId,
        pageId: p.id,
        pagePath: p.path || '/',
        pageUrl: p.url,
        created_at: new Date().toISOString(),
      });
    });
    return actions;
  }

  function buildAgentBrief(ctx) {
    return {
      exportedAt: ctx.exportedAt,
      clientId: ctx.clientId,
      company: ctx.company,
      sector: ctx.sector,
      site: ctx.site,
      mainService: ctx.mainService,
      goal: ctx.businessGoal,
      strategy: ctx.strategy,
      instructions: 'כל העוזרים: השתמשו ב-Business Context זה כבסיס לניתוח, המלצות ופעולות. אתר: dalia-c.com · נתונים חיים מ-GSC/GA4.',
    };
  }

  function saveJson(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
  }

  function getBusinessContext() {
    try {
      var raw = localStorage.getItem(CONTEXT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function getExportedActions() {
    try {
      var raw = localStorage.getItem(ACTIONS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function exportToPlatform(wizardData) {
    if (!isEnabled()) return { ok: false, error: 'module_disabled' };
    var ctx = buildBusinessContext(wizardData);
    var actions = buildStrategyActions(ctx);
    var brief = buildAgentBrief(ctx);

    saveJson(CONTEXT_KEY, ctx);
    saveJson('dalia_biz', wizardData || {});
    saveJson(ACTIONS_KEY, actions);
    saveJson(AGENT_BRIEF_KEY, brief);

    if (window.ClientIdSsot && ClientIdSsot.applyFlowContext) {
      ClientIdSsot.applyFlowContext({
        businessContextAt: ctx.exportedAt,
        businessStrategy: ctx.strategy && ctx.strategy.type,
      });
    }
    if (window.COCO) {
      COCO.businessContext = ctx;
      COCO.agentBrief = brief;
    }

    if (window.DaliaSite && DaliaSite.logWorkProgress) {
      DaliaSite.logWorkProgress('Business Context הועבר', ctx.company + ' · ' + actions.length + ' פעולות אסטרטגיה');
    }

    if (window.CocoData) {
      if (CocoData.onContextChange) CocoData.onContextChange();
      else if (CocoData.bindAll) CocoData.bindAll();
    }
    if (window.CocoUnified && CocoUnified.updateContextBar) CocoUnified.updateContextBar();

    return { ok: true, context: ctx, actions: actions, brief: brief };
  }

  window.BusinessStrategyModule = {
    VERSION: VERSION,
    ENABLED_CLIENT: ENABLED_CLIENT,
    isEnabled: isEnabled,
    isStagingHost: isStagingHost,
    whenDataReady: whenDataReady,
    loadCompetitors: loadCompetitors,
    buildSeed: buildSeed,
    scanSiteInsights: scanSiteInsights,
    buildBusinessContext: buildBusinessContext,
    exportToPlatform: exportToPlatform,
    getBusinessContext: getBusinessContext,
    getExportedActions: getExportedActions,
    getAgentBrief: function () {
      try {
        var raw = localStorage.getItem(AGENT_BRIEF_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    },
  };
})();
