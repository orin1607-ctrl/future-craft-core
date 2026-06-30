/**
 * SEO Strategy Module — competitor analysis, keyword tiers, roadmap, page mapping.
 * Aggregates data from existing modules; missing data → "חסר מידע".
 */
(function () {
  'use strict';

  var VERSION = '1.0.0';
  var STRATEGY_KEY = 'coco-seo-strategy-v1';
  var COMPETITORS_KEY = 'coco-competitors-v1';
  var APPROVAL_KEY = 'coco-seo-strategy-approved-v1';
  var MISSING = 'חסר מידע';

  var CORE_KEYWORD_SEEDS = [
    'תוכנה לניהול צי רכב', 'מערכת לניהול צי רכב', 'FleetOS', 'Fleet Management',
    'ניהול צי רכב לעסקים', 'תוכנת FleetOS', 'מערכת תפעול צי',
  ];
  var SERVICE_KEYWORD_SEEDS = [
    'תחזוקת צי רכב', 'ניהול נהגים', 'GPS לצי', 'טלמטיקה', 'מעקב רכבים בזמן אמת',
    'מצלמות לרכב', 'חיישנים לרכב', 'CANBUS', 'התראות תחזוקה', 'דוחות צי רכב',
    'ניהול רישיונות', 'ביטוח רכב', 'טיפולים לרכב', 'קריאות שירות',
  ];
  var ARTICLE_KEYWORD_SEEDS = [
    'איך לנהל צי רכב', 'חיסכון בתחזוקת צי', 'בחירת תוכנת ניהול צי',
    'יתרונות טלמטיקה לעסק', 'ניהול נהגים מרחוק', 'AI בניהול צי רכב',
  ];

  var GOAL_RANKS = ['Top 10', 'Top 5', 'Top 3', '#1'];
  var COMPETITION_LEVELS = ['נמוכה', 'בינונית', 'גבוהה', 'מאוד גבוהה'];

  function parseLs(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function dash() {
    return (window.DaliaSite && DaliaSite.getDashboard && DaliaSite.getDashboard()) || {};
  }

  function safeVal(v, fieldName) {
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) return MISSING;
    return v;
  }

  function getCompetitors() {
    var stored = parseLs(COMPETITORS_KEY);
    if (stored && stored.list) return stored;
    var ctx = parseLs('coco-business-context-v1') || {};
    var biz = parseLs('dalia_biz') || {};
    var auto = ctx.competitors || (biz.comp ? String(biz.comp).split('\n').filter(Boolean) : []);
    return { version: VERSION, list: auto.map(function (name, i) {
      return { id: 'comp-auto-' + i, name: name, source: 'auto', manual: false };
    }), updatedAt: new Date().toISOString() };
  }

  function saveCompetitors(data) {
    try { localStorage.setItem(COMPETITORS_KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
  }

  function addCompetitor(name) {
    name = String(name || '').trim();
    if (!name) return { ok: false };
    var data = getCompetitors();
    if (!data.list) data.list = [];
    data.list.push({ id: 'comp-' + Date.now(), name: name, source: 'manual', manual: true, addedAt: new Date().toISOString() });
    data.updatedAt = new Date().toISOString();
    saveCompetitors(data);
    if (window.MarketingActivityLog) MarketingActivityLog.log('seo_competitor_added', { name: name });
    return { ok: true, competitors: data };
  }

  function buildKeywordEntry(kw, tier, idx) {
    var competition = COMPETITION_LEVELS[idx % COMPETITION_LEVELS.length];
    var isLongTail = String(kw).split(' ').length >= 4;
    return {
      keyword: kw,
      tier: tier,
      competitionLevel: competition,
      priority: tier === 'core' ? 'גבוה' : tier === 'service' ? 'בינוני' : 'נמוך',
      targetPage: tier === 'core' ? 'תוכנת ניהול צי רכב' : tier === 'service' ? 'שירותים' : 'בלוג/מאמרים',
      promote: tier !== 'article' || idx < 3,
      promotionPhase: tier === 'core' ? 'חודש 1' : tier === 'service' ? 'חודש 2' : 'חודש 3-4',
      tailType: isLongTail ? 'long' : 'short',
      dataSource: 'seed',
    };
  }

  function aggregateAgentData() {
    var d = dash();
    var sc = d.searchConsole || {};
    var ga = d.analytics || {};
    var gbp = d.gbp || {};
    var ads = d.ads || {};
    var ps = d.pageSpeed || d.lighthouse || {};

    return {
      gsc: {
        keywords: safeVal((sc.keywords || []).slice(0, 10).map(function (k) { return k.query; }), 'GSC keywords'),
        clicks: safeVal(sc.totalClicks, 'GSC clicks'),
        impressions: safeVal(sc.totalImpressions, 'GSC impressions'),
      },
      analytics: {
        sessions: safeVal(ga.sessions, 'GA sessions'),
        conversions: safeVal(ga.conversions, 'GA conversions'),
        bounceRate: safeVal(ga.bounceRate, 'GA bounce rate'),
      },
      gbp: {
        views: safeVal(gbp.views, 'GBP views'),
        reviews: safeVal(gbp.reviews, 'GBP reviews'),
        rating: safeVal(gbp.rating, 'GBP rating'),
      },
      ads: {
        campaigns: safeVal(ads.campaigns, 'Ads campaigns'),
        spend: safeVal(ads.spend, 'Ads spend'),
        roas: safeVal(ads.roas, 'Ads ROAS'),
      },
      pageSpeed: {
        score: safeVal(ps.score || ps.performance, 'PageSpeed score'),
        lcp: safeVal(ps.lcp, 'LCP'),
        cls: safeVal(ps.cls, 'CLS'),
      },
      seo: {
        indexedPages: safeVal(sc.indexedPages, 'indexed pages'),
        errors: safeVal(sc.errors, 'index errors'),
      },
      ai: {
        recommendations: safeVal((parseLs('coco-ai-stage-advice-v1') || [])[0] && parseLs('coco-ai-stage-advice-v1')[0].recommendedNow, 'AI advice'),
      },
    };
  }

  function analyzeCompetitor(comp) {
    var name = comp.name || comp;
    return {
      id: comp.id || 'comp-' + name,
      name: name,
      source: comp.manual ? 'ידני' : 'אוטומטי',
      services: MISSING,
      pages: MISSING,
      keywords: MISSING,
      strengths: MISSING,
      weaknesses: MISSING,
      opportunities: 'FleetOS, טלמטיקה, AI ואינטגרציות — יתרון פוטנציאלי מול ' + name,
      note: 'נדרש מידע נוסף מהמשתמש לניתוח מלא',
    };
  }

  function buildRoadmap() {
    return [
      { month: 1, label: 'חודש 1', actions: ['מיפוי מילות מפתח Core', 'אופטימיזציית עמוד FleetOS', 'תיקוני טכני בסיסיים', 'חיבור GSC + Analytics'] },
      { month: 2, label: 'חודש 2', actions: ['עמודי שירות (GPS, תחזוקה, טלמטיקה)', 'Schema markup', 'קישורים פנימיים', 'תוכן FAQ'] },
      { month: 3, label: 'חודש 3', actions: ['מאמרי בלוג לתנועה', 'שיפור Core Web Vitals', 'GBP אופטימיזציה', 'מעקב מתחרים'] },
      { month: 4, label: 'חודש 4', actions: ['הרחבת מילות Long-tail', 'A/B לדפי המרה', 'דוח ביצועים מלא', 'תכנון קמפיינים ממומנים'] },
    ];
  }

  function buildKeywordGoals(keywords) {
    return keywords.slice(0, 12).map(function (kw, i) {
      var comp = kw.competitionLevel || 'בינונית';
      var months = comp === 'נמוכה' ? '2-4' : comp === 'בינונית' ? '4-8' : comp === 'גבוהה' ? '8-12' : '12-18';
      return {
        keyword: kw.keyword,
        goal: GOAL_RANKS[Math.min(i % GOAL_RANKS.length, GOAL_RANKS.length - 1)],
        estimatedMonths: months,
        competitionLevel: comp,
      };
    });
  }

  function buildPageSeoMapping(reportPages) {
    var pages = reportPages || [];
    if (!pages.length) {
      var report = parseLs('coco-pre-build-work-report-v1');
      pages = (report && report.sections && report.sections.pageDetails) || [];
    }
    return pages.map(function (p) {
      var kws = p.keywords || [];
      return {
        page: p.title,
        slug: p.slug,
        keywords: kws,
        competingPages: MISSING,
        outrankReason: kws.length ? 'FleetOS + תוכן ממוקד + ביצועים' : MISSING,
        requiredActions: kws.length
          ? ['אופטימיזציית Title/H1', 'תוכן ייחודי', 'Schema', 'קישורים פנימיים']
          : [MISSING + ' — הזן מילות מפתח'],
      };
    });
  }

  function buildStrategyModel() {
    var ctx = parseLs('coco-business-context-v1') || {};
    var biz = parseLs('dalia_biz') || {};
    var briefing = (window.StrategicBriefing && StrategicBriefing.get && StrategicBriefing.get()) || parseLs('coco-strategic-briefing-v1') || {};
    var competitors = getCompetitors();
    var compAnalysis = (competitors.list || []).map(analyzeCompetitor);

    var coreKw = CORE_KEYWORD_SEEDS.slice();
    var serviceKw = SERVICE_KEYWORD_SEEDS.slice();
    var articleKw = ARTICLE_KEYWORD_SEEDS.slice();

    if (window.StrategicBriefing && StrategicBriefing.allKeywords) {
      StrategicBriefing.allKeywords(briefing).forEach(function (k) {
        if (k && coreKw.indexOf(k) < 0) coreKw.unshift(k);
      });
    }
    if (ctx.strategy && ctx.strategy.focusKeywords) {
      ctx.strategy.focusKeywords.forEach(function (k) {
        var s = typeof k === 'string' ? k : (k.query || k.keyword);
        if (s && coreKw.indexOf(s) < 0) coreKw.push(s);
      });
    }

    var keywords = []
      .concat(coreKw.map(function (k, i) { return buildKeywordEntry(k, 'core', i); }))
      .concat(serviceKw.map(function (k, i) { return buildKeywordEntry(k, 'service', i); }))
      .concat(articleKw.map(function (k, i) { return buildKeywordEntry(k, 'article', i); }));

    var agentData = aggregateAgentData();
    var roadmap = buildRoadmap();
    var keywordGoals = buildKeywordGoals(keywords);
    var pageMapping = buildPageSeoMapping();

    var missingFields = [];
    Object.keys(agentData).forEach(function (src) {
      Object.keys(agentData[src]).forEach(function (field) {
        if (agentData[src][field] === MISSING) missingFields.push(src + '.' + field);
      });
    });
    compAnalysis.forEach(function (c) {
      ['services', 'pages', 'keywords', 'strengths', 'weaknesses'].forEach(function (f) {
        if (c[f] === MISSING) missingFields.push('competitor.' + c.name + '.' + f);
      });
    });

    return {
      version: VERSION,
      strategyId: 'SEO-' + Date.now(),
      generatedAt: new Date().toISOString(),
      clientId: ctx.clientId || 'dalia-c-official',
      company: ctx.company || biz.name || 'דליה',
      productVision: {
        focus: 'FleetOS, fleet management, driver app, operations, maintenance, alerts, reports, GPS, telematics, cameras, sensors, CANBUS, AI',
        note: 'תוכן האתר החדש מבוסס על חזון המוצר — לא העתקה מהאתר הישן',
      },
      competitors: compAnalysis,
      keywordTiers: {
        core: keywords.filter(function (k) { return k.tier === 'core'; }),
        service: keywords.filter(function (k) { return k.tier === 'service'; }),
        article: keywords.filter(function (k) { return k.tier === 'article'; }),
      },
      keywords: keywords,
      keywordGoals: keywordGoals,
      keywordChapters: buildKeywordChapter(keywords, compAnalysis),
      roadmap: roadmap,
      pageSeoMapping: pageMapping,
      agentContributions: agentData,
      missingFields: missingFields,
      missingNote: missingFields.length ? 'חסר מידע — נדרש קלט משתמש לשדות: ' + missingFields.slice(0, 8).join(', ') : null,
    };
  }

  function saveStrategy(model) {
    try { localStorage.setItem(STRATEGY_KEY, JSON.stringify(model)); return true; } catch (e) { return false; }
  }

  function get() {
    return parseLs(STRATEGY_KEY);
  }

  function isApproved() {
    try { return localStorage.getItem(APPROVAL_KEY) === 'true'; } catch (e) { return false; }
  }

  function buildKeywordChapter(keywords, competitors) {
    var GOAL_RANKS = ['Top 10', 'Top 5', 'Top 3', '#1'];
    return keywords.slice(0, 15).map(function (kw, i) {
      var entry = typeof kw === 'string' ? { keyword: kw } : kw;
      var comp = entry.competitionLevel || COMPETITION_LEVELS[i % COMPETITION_LEVELS.length];
      var months = comp === 'נמוכה' ? '2-4' : comp === 'בינונית' ? '4-8' : comp === 'גבוהה' ? '8-12' : '12-18';
      return {
        keyword: entry.keyword,
        competition: comp,
        businessImportance: entry.tier === 'core' ? 'גבוהה' : entry.tier === 'service' ? 'בינונית' : 'נמוכה',
        fit: entry.tier === 'core' ? 'מצוין — FleetOS / ניהול צי' : 'טוב',
        searchVolume: MISSING,
        targetPage: entry.targetPage || MISSING,
        competitors: (competitors || []).slice(0, 3).map(function (c) { return c.name || c; }),
        goal: GOAL_RANKS[Math.min(i % GOAL_RANKS.length, GOAL_RANKS.length - 1)],
        estimatedTime: months + ' חודשים',
        requiredActions: entry.tier === 'core'
          ? ['אופטימיזציית Title/H1', 'תוכן FleetOS', 'Schema', 'קישורים פנימיים']
          : ['תוכן ייעודי', 'FAQ', 'קישורים פנימיים'],
      };
    });
  }

  function approveStrategy(model) {
    if (window.StrategicBriefing && !StrategicBriefing.isReady()) {
      return { ok: false, reason: 'briefing_not_ready' };
    }
    if (window.MaterialsReadinessGate && !MaterialsReadinessGate.isReady()) {
      return { ok: false, reason: 'materials_not_ready' };
    }
    model = model || buildStrategyModel();
    saveStrategy(model);
    try {
      localStorage.setItem(APPROVAL_KEY, 'true');
      localStorage.setItem('coco-seo-strategy-approved-at-v1', new Date().toISOString());
    } catch (e) { return { ok: false }; }

    if (window.MarketingActivityLog) MarketingActivityLog.log('seo_strategy_approved', { strategyId: model.strategyId, keywords: model.keywords.length });
    if (window.MarketingLifecycle) MarketingLifecycle.advance('seo', 'completed');
    if (window.AiStageAdvisor) AiStageAdvisor.advise('seo');
    syncSeoTasksToHub(model);
    if (window.PreBuildWorkReport && PreBuildWorkReport.mountReportPanel) {
      PreBuildWorkReport.mountReportPanel('pre-build-report-root');
    }
  return { ok: true, model: model };
  }

  function syncSeoTasksToHub(model) {
    model = model || get() || buildStrategyModel();
    var tasks = [];
    var ts = Date.now();
    (model.roadmap || []).forEach(function (month, mi) {
      month.actions.forEach(function (action, ai) {
        tasks.push({
          id: 'seo-roadmap-' + ts + '-' + mi + '-' + ai,
          name: 'SEO ' + month.label + ': ' + action,
          description: 'משימה ממפת דרכים SEO',
          category: 'seo',
          status: 'pending',
          priority: mi === 0 ? 'גבוה' : 'בינוני',
          source: 'seo-strategy',
          created_at: new Date().toISOString(),
        });
      });
    });
    (model.keywordGoals || []).slice(0, 5).forEach(function (kg, i) {
      tasks.push({
        id: 'seo-kw-goal-' + ts + '-' + i,
        name: 'יעד ' + kg.goal + ': ' + kg.keyword,
        description: 'זמן משוער: ' + kg.estimatedMonths + ' חודשים · תחרות: ' + kg.competitionLevel,
        category: 'seo',
        status: 'pending',
        priority: 'גבוה',
        source: 'seo-strategy',
        created_at: new Date().toISOString(),
      });
    });
    if (window.SiteMarketingHub && SiteMarketingHub.mergeTasks) {
      SiteMarketingHub.mergeTasks(tasks);
    } else {
      var existing = parseLs('coco-business-strategy-actions-v1') || [];
      tasks.forEach(function (t) { existing.push(t); });
      try { localStorage.setItem('coco-business-strategy-actions-v1', JSON.stringify(existing)); } catch (e) { /* ignore */ }
    }
  }

  function assertGate() {
    if (window.StrategicBriefing && !StrategicBriefing.assertGate()) return false;
    if (window.MaterialsReadinessGate && !MaterialsReadinessGate.assertGate()) return false;
    if (!isApproved()) {
      if (typeof showToast === 'function') showToast('⚠️ יש לאשר אסטרטגיית SEO לפני המשך');
      return false;
    }
    return true;
  }

  function renderStrategySummary(model) {
    model = model || buildStrategyModel();
    var kw = model.keywords || [];
    return '<div>מילות מפתח: <strong>' + kw.length + '</strong> (Core: ' + (model.keywordTiers.core || []).length +
      ', שירות: ' + (model.keywordTiers.service || []).length + ', מאמרים: ' + (model.keywordTiers.article || []).length + ')</div>' +
      '<div>מתחרים: <strong>' + (model.competitors || []).length + '</strong></div>' +
      '<div>מיפוי עמודים: <strong>' + (model.pageSeoMapping || []).length + '</strong></div>' +
      (model.missingNote ? '<div style="color:var(--yel);margin-top:4px;">⚠️ ' + esc(model.missingNote) + '</div>' : '');
  }

  function renderInlinePanel(container) {
    if (!container) return;
    var briefingReady = !window.StrategicBriefing || StrategicBriefing.isReady();
    if (!briefingReady) {
      container.innerHTML = '<div class="card" style="margin-top:12px;"><div class="ph-t">🔎 אסטרטגיית SEO</div><div class="alt alt-warn">יש להשלים ולאשר את השאלון האסטרטגי לפני מודול SEO</div></div>';
      return;
    }
    var materialsReady = !window.MaterialsReadinessGate || MaterialsReadinessGate.isReady();
    if (!materialsReady) {
      container.innerHTML = '<div class="card" style="margin-top:12px;"><div class="ph-t">🔎 אסטרטגיית SEO</div><div class="alt alt-warn">יש להשלים שער חומרים לפני מודול SEO</div></div>';
      return;
    }

    var model = buildStrategyModel();
    var approved = isApproved();
    var competitors = getCompetitors();

    var compListHtml = (competitors.list || []).map(function (c) {
      return '<div style="font-size:11px;color:var(--w80);">• ' + esc(c.name) + (c.manual ? ' (ידני)' : '') + '</div>';
    }).join('') || '<div style="font-size:11px;color:var(--w50);">אין מתחרים</div>';

    var roadmapHtml = (model.roadmap || []).map(function (m) {
      return '<div style="margin:6px 0;font-size:11px;"><strong>' + esc(m.label) + ':</strong> ' + esc(m.actions.join(' · ')) + '</div>';
    }).join('');

    container.innerHTML =
      '<div class="card" style="margin-top:12px;">' +
      '<div class="ph-t">🔎 אסטרטגיית SEO — מחקר מלא לפני בניית אתר</div>' +
      '<div class="s">מתחרים · מילות מפתח · מפת דרכים · מיפוי עמודים · אגרגציה מ-GSC/Analytics/GBP/Ads</div>' +
      '<div id="seo-summary" style="font-size:12px;color:var(--w80);line-height:1.8;margin-top:10px;">' + renderStrategySummary(model) + '</div>' +
      '<div style="margin-top:12px;"><div class="st">מתחרים</div>' + compListHtml +
      '<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">' +
      '<input type="text" id="seo-comp-name" placeholder="שם מתחרה" style="flex:1;min-width:100px;font-size:12px;padding:6px 8px;border-radius:6px;border:1px solid var(--w10);background:var(--bg4);color:var(--w);" />' +
      '<button type="button" class="btn btn-p" id="seo-add-comp" style="padding:4px 10px;font-size:11px;">+ הוסף מתחרה</button>' +
      '</div></div>' +
      '<div style="margin-top:12px;"><div class="st">מפת דרכים (חודש 1-4)</div>' + roadmapHtml + '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">' +
      (window.AiConsultant ? AiConsultant.buttonHtml('seo', 'ac-btn-seo') : '') +
      '<button type="button" class="btn btn-p" id="seo-refresh">🔄 רענן אסטרטגיה</button>' +
      '<button type="button" class="btn btn-p" id="seo-download">⬇️ הורד דוח SEO (JSON)</button>' +
      '<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--w80);"><input type="checkbox" id="seo-approve-check" ' + (approved ? 'checked' : '') + ' /> אני מאשר/ת את אסטרטגיית ה-SEO</label>' +
      '<button type="button" class="btn btn-go" id="seo-approve-btn" ' + (approved ? 'disabled' : '') + '>✅ אשר SEO והמשך לדוח Pre-Build</button>' +
      '</div>' +
      '<div id="seo-status" class="alt ' + (approved ? 'alt-ok' : 'alt-warn') + '" style="margin-top:10px;">' +
      (approved ? '✅ אסטרטגיית SEO מאושרת — ניתן להמשיך לדוח Pre-Build' : '⚠️ יש לרענן, לעבור על האסטרטגיה ולאשר') +
      '</div>' +
      (window.AiConsultant ? AiConsultant.panelHtml('seo', 'ac-panel-seo') : '') +
      '</div>';

    if (window.AiConsultant) AiConsultant.wireStage(container, 'seo', 'ac-btn-seo', 'ac-panel-seo');

    var addComp = container.querySelector('#seo-add-comp');
    if (addComp) addComp.addEventListener('click', function () {
      var inp = container.querySelector('#seo-comp-name');
      var name = inp && inp.value.trim();
      if (!name) { if (typeof showToast === 'function') showToast('⚠️ הזן/י שם מתחרה'); return; }
      addCompetitor(name);
      if (inp) inp.value = '';
      renderInlinePanel(container);
    });

    var refresh = container.querySelector('#seo-refresh');
    if (refresh) refresh.addEventListener('click', function () {
      model = buildStrategyModel();
      saveStrategy(model);
      if (window.MarketingActivityLog) MarketingActivityLog.log('seo_strategy_refreshed', { strategyId: model.strategyId });
      renderInlinePanel(container);
      if (typeof showToast === 'function') showToast('🔄 אסטרטגיית SEO עודכנה');
    });

    var dl = container.querySelector('#seo-download');
    if (dl) dl.addEventListener('click', function () {
      model = buildStrategyModel();
      var blob = new Blob([JSON.stringify(model, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'seo-strategy-' + (model.clientId || 'client') + '.json';
      a.click();
    });

    var approveBtn = container.querySelector('#seo-approve-btn');
    if (approveBtn) approveBtn.addEventListener('click', function () {
      var chk = container.querySelector('#seo-approve-check');
      if (chk && !chk.checked) { if (typeof showToast === 'function') showToast('⚠️ סמן/י אישור SEO'); return; }
      var res = approveStrategy(buildStrategyModel());
      if (!res.ok) { if (typeof showToast === 'function') showToast('⚠️ ' + (res.reason || 'שגיאה')); return; }
      if (typeof showToast === 'function') showToast('✅ אסטרטגיית SEO מאושרת');
      renderInlinePanel(container);
      if (window.PreBuildWorkReport) {
        PreBuildWorkReport.updateBuildButtonsGate();
        PreBuildWorkReport.mountReportPanel('pre-build-report-root');
      }
    });
  }

  function mountPanel(rootId) {
    var root = document.getElementById(rootId || 'seo-strategy-root');
    if (!root) return;
    renderInlinePanel(root);
  }

  window.SeoStrategy = {
    VERSION: VERSION,
    MISSING: MISSING,
    CORE_KEYWORD_SEEDS: CORE_KEYWORD_SEEDS,
    SERVICE_KEYWORD_SEEDS: SERVICE_KEYWORD_SEEDS,
    buildKeywordChapter: buildKeywordChapter,
    buildStrategyModel: buildStrategyModel,
    get: get,
    getCompetitors: getCompetitors,
    addCompetitor: addCompetitor,
    approveStrategy: approveStrategy,
    isApproved: isApproved,
    assertGate: assertGate,
    mountPanel: mountPanel,
    syncSeoTasksToHub: syncSeoTasksToHub,
    aggregateAgentData: aggregateAgentData,
  };
})();
