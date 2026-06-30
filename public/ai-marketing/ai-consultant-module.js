/**
 * AI Consultant — multi-agent ideas aggregator (rule-based v1, offline-capable).
 * Staging only · no design changes — uses existing panel CSS classes.
 */
(function () {
  'use strict';

  var VERSION = '1.0.0';
  var CONSULTANT_KEY = 'coco-ai-consultant-v1';
  var HISTORY_KEY = 'coco-ai-consultant-history-v1';
  var MISSING = 'חסר מידע';
  var FORECAST_DISCLAIMER = 'הערכות מבוססות על הנתונים הזמינים בלבד — אינן ערבות לתוצאות.';

  var STAGE_IDS = {
    briefing: 'briefing',
    materials: 'materials',
    seo: 'seo',
    report: 'report',
    blueprint: 'blueprint',
    preview: 'preview',
    hub: 'hub',
  };

  var AGENTS = [
    'SEO Agent', 'Marketing Agent', 'Business Advisor', 'GSC', 'Analytics',
    'GBP', 'Ads', 'PageSpeed', 'Lighthouse', 'AI Stage Advisor', 'Site Comparison',
  ];

  var KEYWORD_TIERS = {
    core: [
      'FleetOS', 'Fleet Management', 'תוכנה לניהול צי רכב', 'מערכת לניהול צי רכב',
      'ניהול צי רכב לעסקים', 'תוכנת FleetOS', 'fleet management software',
    ],
    service: [
      'GPS לצי', 'טלמטיקה', 'מעקב רכבים בזמן אמת', 'תחזוקת צי רכב', 'ניהול נהגים',
      'התראות תחזוקה', 'דוחות צי רכב', 'CANBUS', 'מצלמות לרכב', 'ניהול רישיונות',
    ],
    longTail: [
      'איך לנהל צי רכב לעסק קטן', 'חיסכון בעלויות תחזוקת צי', 'בחירת תוכנת ניהול צי',
      'יתרונות טלמטיקה לעסק', 'ניהול צי הובלות', 'תוכנה לחברת ליסינג',
    ],
  };

  var AUDIENCE_SEGMENTS = [
    { segment: 'חברות הובלה ותובלה', why: 'צי גדול, צורך בתפעול ותחזוקה', fit: 'גבוה' },
    { segment: 'חברות משלוחים ולוגיסטיקה', why: 'מעקב GPS ונהגים בזמן אמת', fit: 'גבוה' },
    { segment: 'חברות ליסינג והשכרה', why: 'ניהול רכבים מרובים ותחזוקה מונעת', fit: 'גבוה' },
    { segment: 'קבלני בנייה', why: 'רכבי עבודה, ציוד ותחזוקה שטח', fit: 'בינוני' },
    { segment: 'רשויות מקומיות', why: 'שקיפות, דוחות והתראות', fit: 'בינוני' },
    { segment: 'ארגוני שירות שטח', why: 'ניהול נהגים והקצאת משימות', fit: 'בינוני' },
    { segment: 'סטארט-אפים בתחום Mobility', why: 'FleetOS כמוצר SaaS', fit: 'גבוה' },
    { segment: 'מוסכים ומרכזי שירות', why: 'שילוב תחזוקה ומעקב', fit: 'בינוני' },
  ];

  var PLATFORM_MATRIX = [
    { platform: 'Google Search / SEO', why: 'תנועה אורגנית למילות FleetOS וניהול צי', whoFits: 'B2B עם מחזור מכירה ארוך', pros: 'עלות נמוכה לטווח ארוך, אמון', cons: 'לוקח זמן', whenToUse: 'מיידי — בסיס לכל אסטרטגיה' },
    { platform: 'Google Business Profile', why: 'נוכחות מקומית וחיפוש "לידי"', whoFits: 'עסקים עם אזור שירות', pros: 'ביקורות, מפות, חינם', cons: 'תלוי באזור', whenToUse: 'שלב 1 אם יש נוכחות פיזית' },
    { platform: 'Google Ads', why: 'לידים מהירים למילות מסחריות', whoFits: 'תקציב פרסום ומטרת לידים', pros: 'מדיד, מהיר', cons: 'עלות לקליק', whenToUse: 'לאחר דף נחיתה מוכן' },
    { platform: 'Facebook', why: 'הגעה לבעלי עסקים קטנים-בינוניים', whoFits: 'קהל רחב, מודעות', pros: 'טארגוט מפורט', cons: 'פחות B2B ממוקד', whenToUse: 'קמפיין מודעות + ריטרגטינג' },
    { platform: 'Instagram', why: 'תוכן ויזואלי — צי, טכנולוגיה', whoFits: 'מותג ואמון', pros: 'Engagement', cons: 'פחות המרות ישירות B2B', whenToUse: 'תוכן מותגי' },
    { platform: 'LinkedIn', why: 'מנהלי צי, קבלנים, ארגונים', whoFits: 'B2B enterprise', pros: 'קהל מקצועי', cons: 'CPC גבוה', whenToUse: 'לידים איכותיים + ABM' },
    { platform: 'YouTube', why: 'הדגמות FleetOS, tutorials', whoFits: 'חינוך שוק', pros: 'SEO וידאו, אמון', cons: 'הפקה', whenToUse: 'לאחר עמוד תוכנה' },
    { platform: 'TikTok', why: 'חשיפה לקהל צעיר בתחום לוגיסטיקה', whoFits: 'מותג חדשני', pros: 'ויראליות', cons: 'פחות רלוונטי ל-B2B מסורתי', whenToUse: 'אופציונלי — מותג' },
    { platform: 'WhatsApp Business', why: 'שיחות לידים מהירות', whoFits: 'שוק ישראלי', pros: 'המרה גבוהה', cons: 'לא אוטומטי לחלוטין', whenToUse: 'CTA בכל עמוד' },
    { platform: 'Waze', why: 'פרסום מיקומי לנהגים ועסקים', whoFits: 'אזורי שירות', pros: 'הקשר מיקום', cons: 'מוגבל', whenToUse: 'קמפיין מקומי' },
    { platform: 'Microsoft Ads', why: 'חיפוש Bing — פחות תחרות', whoFits: 'השלמה ל-Google', pros: 'CPC נמוך יותר', cons: 'נפח נמוך', whenToUse: 'הרחבה בשלב 2' },
  ];

  var SERVICE_IDEAS = [
    { name: 'עמוד FleetOS / תוכנת ניהול צי', type: 'page', priority: 'גבוה', why: 'מילת מפתח מרכזית — Intent גבוה לרכישת תוכנה' },
    { name: 'חבילת הדגמה + POC', type: 'package', priority: 'גבוה', why: 'מקצר מחזור מכירה B2B' },
    { name: 'שירות GPS וטלמטיקה', type: 'service', priority: 'גבוה', why: 'השלמה ל-FleetOS — ערך מיידי ללקוח' },
    { name: 'תחזוקה מונעת לצי', type: 'service', priority: 'בינוני', why: 'כאב מוכר — חיסכון בעלויות' },
    { name: 'ייעוץ דיגיטציה לצי', type: 'consulting', priority: 'בינוני', why: 'Lead magnet לעסקים בתחילת דרך' },
    { name: 'אינטגרציה CANBUS / חיישנים', type: 'product', priority: 'בינוני', why: 'בידול טכנולוגי מול מתחרים' },
    { name: 'דוחות והתראות בזמן אמת', type: 'feature', priority: 'גבוה', why: 'USP — ערך תפעולי יומיומי' },
    { name: 'מחירון / הצעת מחיר אונליין', type: 'page', priority: 'בינוני', why: 'מסנן לידים איכותיים' },
    { name: 'בלוג מומחיות — ניהול צי', type: 'content', priority: 'בינוני', why: 'SEO long-tail + אמון' },
    { name: 'מקרי בוחן לקוחות', type: 'content', priority: 'בינוני', why: 'Social proof ל-B2B' },
  ];

  var REGION_IDEAS = [
    { region: 'מרכז (תל אביב, גוש דן)', why: 'ריכוז עסקים עם צי גדול — ביקוש גבוה' },
    { region: 'השרון (רעננה, הרצליה, נתניה)', why: 'Hi-Tech + לוגיסטיקה — FleetOS SaaS' },
    { region: 'חיפה והצפון', why: 'תעשייה, נמל, הובלות — צי רכב גדול' },
    { region: 'באר שבע והדרום', why: 'התרחבות שוק — פחות תחרות מקומית' },
    { region: 'ירושלים והסביבה', why: 'רשויות, ממשל, קבלנים' },
    { region: 'כל הארץ', why: 'מוצר SaaS — אין הגבלה גיאוגרפית' },
    { region: 'בינלאומי (EU/US)', why: 'Fleet Management — שוק גלובלי' },
  ];

  function parseLs(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function dash() {
    return (window.DaliaSite && DaliaSite.getDashboard && DaliaSite.getDashboard()) || {};
  }

  function hasGsc() {
    var sc = dash().searchConsole || {};
    return !!(sc.keywords && sc.keywords.length);
  }

  function hasAnalytics() {
    var ga = dash().analytics || dash().ga4 || {};
    return !!(ga.sessions || ga.users || ga.pageviews);
  }

  function collectContext() {
    var briefing = parseLs('coco-strategic-briefing-v1') || {};
    var seo = parseLs('coco-seo-strategy-v1') || {};
    var competitors = parseLs('coco-competitors-v1') || {};
    var biz = parseLs('dalia_biz') || {};
    var ctx = parseLs('coco-business-context-v1') || {};
    var report = parseLs('coco-pre-build-work-report-v1') || {};
    var blueprint = parseLs('coco-site-blueprint-v1') || {};
    var comparison = parseLs('coco-site-comparison-v1') || {};
    var hub = parseLs('coco-site-marketing-hub-v1') || {};

    var existingKw = [];
    if (window.StrategicBriefing && StrategicBriefing.allKeywords) {
      existingKw = StrategicBriefing.allKeywords(briefing);
    } else {
      existingKw = (briefing.keywordsApproved || []).concat(briefing.keywordsManual || []);
    }
    if (seo.keywords) {
      seo.keywords.forEach(function (k) {
        var s = typeof k === 'string' ? k : (k.keyword || k.query);
        if (s && existingKw.indexOf(s) < 0) existingKw.push(s);
      });
    }

    var compList = [];
    if (competitors.list) compList = competitors.list.map(function (c) { return c.name || c; });
    else if (briefing.competitorsManual) compList = compList.concat(briefing.competitorsManual);
    if (briefing.competitorsAuto) compList = compList.concat(briefing.competitorsAuto);
    compList = compList.filter(function (v, i, a) { return v && a.indexOf(v) === i; });

    var audience = briefing.audience || [];
    if (biz.ideal && audience.indexOf(biz.ideal) < 0) audience = audience.concat([biz.ideal]);

    var readiness = null;
    if (window.StrategicBriefing && StrategicBriefing.computeReadinessScore) {
      readiness = StrategicBriefing.computeReadinessScore();
    } else if (window.PreBuildWorkReport && PreBuildWorkReport.computeReadinessScores) {
      readiness = PreBuildWorkReport.computeReadinessScores();
    }

    return {
      briefing: briefing,
      seo: seo,
      competitors: compList,
      biz: biz,
      ctx: ctx,
      report: report,
      blueprint: blueprint,
      comparison: comparison,
      hub: hub,
      existingKeywords: existingKw,
      audience: audience,
      readiness: readiness,
      gscConnected: hasGsc(),
      analyticsConnected: hasAnalytics(),
      company: ctx.company || biz.name || report.company || 'דליה',
      site: ctx.site || biz.site || report.site || '',
    };
  }

  function agentContributions(ctx) {
    return AGENTS.map(function (name) {
      var status = 'heuristic';
      var note = 'המלצות מבוססות כללים ונתוני localStorage';
      if (name === 'GSC' && !ctx.gscConnected) { status = 'missing'; note = MISSING; }
      if (name === 'Analytics' && !ctx.analyticsConnected) { status = 'missing'; note = MISSING; }
      if (name === 'PageSpeed' || name === 'Lighthouse') { status = 'partial'; note = 'חסר מידע — אין מדידה חיה; הערכה היוריסטית'; }
      if (name === 'Site Comparison' && !ctx.comparison) { status = 'partial'; note = 'השוואה תיבנה מהנתונים השמורים'; }
      return { agent: name, status: status, note: note };
    });
  }

  function buildKeywordIdeas(ctx) {
    var all = KEYWORD_TIERS.core.concat(KEYWORD_TIERS.service, KEYWORD_TIERS.longTail);
    var suggestions = all.filter(function (k) {
      return ctx.existingKeywords.every(function (e) {
        return String(e).toLowerCase() !== String(k).toLowerCase();
      });
    }).slice(0, 15);
    return {
      existing: ctx.existingKeywords.length ? ctx.existingKeywords : MISSING,
      suggested: suggestions.length ? suggestions : MISSING,
      tiers: {
        core: KEYWORD_TIERS.core.filter(function (k) { return ctx.existingKeywords.indexOf(k) < 0; }).slice(0, 5),
        service: KEYWORD_TIERS.service.filter(function (k) { return ctx.existingKeywords.indexOf(k) < 0; }).slice(0, 5),
        longTail: KEYWORD_TIERS.longTail.filter(function (k) { return ctx.existingKeywords.indexOf(k) < 0; }).slice(0, 5),
      },
      source: ctx.gscConnected ? 'GSC + heuristics' : 'heuristics — ' + MISSING + ' (GSC לא מחובר)',
      originalNote: 'המלצות מקוריות — לא מועתקות ממתחרים',
    };
  }

  function buildAudienceIdeas(ctx) {
    var existing = ctx.audience.length ? ctx.audience : [];
    var suggested = AUDIENCE_SEGMENTS.filter(function (seg) {
      return !existing.some(function (e) { return String(e).indexOf(seg.segment) >= 0 || seg.segment.indexOf(e) >= 0; });
    });
    return {
      existing: existing.length ? existing : MISSING,
      suggested: suggested.length ? suggested : MISSING,
      originalNote: 'סגמנטים מוצעים מניתוח תחום Fleet — לא מועתקים',
    };
  }

  function buildRegionIdeas(ctx) {
    var existing = (ctx.briefing.regions || []).slice();
    if (ctx.briefing.regionDetail) existing.push(ctx.briefing.regionDetail);
    var suggested = REGION_IDEAS.filter(function (r) {
      return !existing.some(function (e) {
        return String(e).indexOf(r.region) >= 0 || r.region.indexOf(e) >= 0;
      });
    });
    return {
      existing: existing.length ? existing : MISSING,
      suggested: suggested.length ? suggested : MISSING,
      originalNote: 'המלצות אזור מבוססות פרופיל עסק ושוק Fleet',
    };
  }

  function buildPageIdeas(ctx) {
    var pages = SERVICE_IDEAS.filter(function (s) { return s.type === 'page' || s.type === 'landing'; });
    var existing = [];
    if (ctx.blueprint && ctx.blueprint.pages) {
      existing = ctx.blueprint.pages.map(function (p) { return p.title || p.slug; });
    }
    var suggested = pages.filter(function (p) {
      return !existing.some(function (e) { return String(e).indexOf(p.name) >= 0 || p.name.indexOf(e) >= 0; });
    });
    return {
      existing: existing.length ? existing : MISSING,
      suggested: suggested.length ? suggested : MISSING,
      originalNote: 'עמודים מומלצים לפי אסטרטגיית FleetOS',
    };
  }

  function buildPlatformIdeas(ctx) {
    var selected = (ctx.briefing.platforms || []).slice();
    return {
      selected: selected.length ? selected : MISSING,
      recommendations: PLATFORM_MATRIX.map(function (p) {
        var inBrief = selected.some(function (s) { return String(s).toLowerCase().indexOf(p.platform.split(' ')[0].toLowerCase()) >= 0; });
        return Object.assign({}, p, { alreadySelected: inBrief });
      }),
      originalNote: 'מטריצת פלטפורמות מקורית לפי פרופיל עסק',
    };
  }

  function buildServiceIdeas(ctx) {
    var existing = (ctx.briefing.services || []).concat(
      ctx.report.sections && ctx.report.sections.services ? ctx.report.sections.services : []
    );
    var suggested = SERVICE_IDEAS.filter(function (s) {
      return !existing.some(function (e) { return String(e).indexOf(s.name) >= 0 || s.name.indexOf(e) >= 0; });
    });
    return {
      existing: existing.length ? existing : MISSING,
      suggested: suggested.length ? suggested : MISSING,
      originalNote: 'רעיונות שירות/עמוד מקוריים — לא העתקה',
    };
  }

  function buildCompetitorResearch(ctx) {
    var comps = ctx.competitors;
    if (!comps.length) {
      return { competitors: MISSING, note: 'הוסף מתחרים בשאלון או ב-SEO לניתוח מעמיק' };
    }
    return {
      competitors: comps.map(function (name, i) {
        var gscKw = ctx.gscConnected ? (dash().searchConsole.keywords || []).slice(0, 3).map(function (k) { return k.query; }) : MISSING;
        return {
          name: name,
          likelyKeywords: gscKw,
          likelyPages: ['בית', 'שירותים', 'תוכנה/מוצר', 'צור קשר'],
          strengths: i === 0 ? 'נוכחות אורגנית — ' + (ctx.gscConnected ? 'מבוסס GSC' : MISSING) : 'מותג מוכר בתחום',
          weaknesses: 'חסר FleetOS ייעודי / תוכן עומק — הערכה מקורית',
          ourAdvantage: 'FleetOS + שילוב תפעול, תחזוקה וטכנולוגיה',
          howToOutrank: [
            'עמוד ייעודי FleetOS עם Schema SoftwareApplication',
            'תוכן FAQ + מדריכים למילות long-tail',
            'קישורים פנימיים מעמוד שירותים',
            'מהירות אתר — Lighthouse',
          ],
          dataGaps: ctx.gscConnected ? [] : ['דירוגי מתחרה ב-GSC — ' + MISSING],
        };
      }),
      originalNote: 'ניתוח מקצועי מקורי — לא העתקת תוכן מתחרים',
    };
  }

  function buildCompetitorInspiration(ctx) {
    return {
      concepts: [
        { idea: 'מבנה תפריט: בית → תוכנה → שירותים → משאבים → צור קשר', type: 'structure', original: true },
        { idea: 'דף השוואת תוכנות / "למה FleetOS"', type: 'page', original: true },
        { idea: 'CTA כפול: הדגמה + WhatsApp', type: 'cta', original: true },
        { idea: 'אזור לוגואי לקוחות + מספרים (צי, חיסכון)', type: 'trust', original: true },
        { idea: 'מרכז משאבים: מדריכים, וידאו, מחשבונים', type: 'content-hub', original: true },
        { idea: 'עמודי שירות לפי תעשייה (הובלות, ליסינג, קבלנים)', type: 'landing', original: true },
      ],
      missingTopics: [
        'ניהול צי לעיריות', 'אינטגרציית ERP', 'AI בחיזוי תחזוקה',
        'מחירון שקוף', 'מקרי בוחן מספריים',
      ].filter(function (t) {
        return !(ctx.existingKeywords || []).some(function (k) { return String(k).indexOf(t) >= 0; });
      }),
      disclaimer: 'השראה מקורית בלבד — אין העתקת תוכן או עיצוב מתחרים',
    };
  }

  function buildMarketComparison(ctx) {
    var overall = (ctx.readiness && ctx.readiness.overall) || 0;
    var compCount = ctx.competitors.length || 0;
    var level = compCount >= 4 ? 'גבוה' : compCount >= 2 ? 'בינוני' : 'נמוך';
    return {
      whereWeAreToday: overall >= 70 ? 'מוכנות טובה לבנייה ושיווק' : overall >= 50 ? 'בסיס קיים — חסרים פערים' : 'שלב מוקדם — נדרש מידע נוסף',
      readinessScore: overall || MISSING,
      topPlayers: compCount ? ctx.competitors.slice(0, 2) : MISSING,
      competitorCount: compCount || MISSING,
      competitionLevel: level,
      gap: compCount ? 'פער בתוכן FleetOS ייעודי ודירוגים אורגניים — ' + (ctx.gscConnected ? 'מבוסס נתונים חלקיים' : MISSING) : MISSING,
      actionsToOvertake: [
        'פרסום עמוד FleetOS מלא', 'מיפוי 15+ מילות מפתח', 'תוכן שבועי (בלוג/וידאו)',
        'GBP + ביקורות', 'קמפיין Ads למילות מסחריות', 'שיפור Core Web Vitals',
      ],
      originalNote: 'השוואת שוק מקורית — לא נתוני מתחרה מועתקים',
    };
  }

  function buildActionPlan(stageId, ctx) {
    var base = [
      { priority: 1, area: 'SEO', action: 'אישור ומיפוי מילות מפתח לעמודים', stage: 'seo' },
      { priority: 2, area: 'תוכן', action: 'עמוד FleetOS + FAQ', stage: 'report' },
      { priority: 3, area: 'עמודי שירות', action: 'הובלות, ליסינג, GPS', stage: 'blueprint' },
      { priority: 4, area: 'קישורים פנימיים', action: 'מהבית לתוכנה ולשירותים', stage: 'blueprint' },
      { priority: 5, area: 'מהירות', action: 'אופטימיזציית תמונות ו-LCP', stage: 'preview' },
      { priority: 6, area: 'UX', action: 'CTA ברור בכל עמוד', stage: 'preview' },
      { priority: 7, area: 'GBP', action: 'עדכון פרופיל + פוסטים', stage: 'hub' },
      { priority: 8, area: 'Ads', action: 'קמפיין חיפוש — מילות ליד', stage: 'hub' },
      { priority: 9, area: 'מאמרים', action: '3 מאמרי long-tail ראשונים', stage: 'hub' },
      { priority: 10, area: 'וידאו', action: 'הדגמת FleetOS ב-YouTube', stage: 'hub' },
    ];
    var filtered = base;
    if (stageId === 'briefing') filtered = base.slice(0, 4);
    else if (stageId === 'materials') filtered = base.slice(0, 5);
    else if (stageId === 'seo') filtered = base.filter(function (x) { return x.area === 'SEO' || x.area === 'תוכן'; });
    return { items: filtered, stageFocus: stageId, prioritized: true };
  }

  function buildForecast(ctx) {
    var compCount = ctx.competitors.length || 0;
    var level = compCount >= 4 ? 'high' : compCount >= 2 ? 'medium' : 'low';
    var months = { low: { t10: '3-6', t3: '6-12', t1: '12-18' }, medium: { t10: '6-9', t3: '12-18', t1: '18-24' }, high: { t10: '9-12', t3: '18-24', t1: '24-36' } };
    var m = months[level];
    return {
      difficulty: level === 'high' ? 'גבוהה' : level === 'medium' ? 'בינונית' : 'נמוכה-בינונית',
      competitorCount: compCount || MISSING,
      competitionLevel: level,
      estimatedTimeTop10: ctx.existingKeywords.length ? m.t10 + ' חודשים' : MISSING,
      estimatedTimeTop3: ctx.existingKeywords.length ? m.t3 + ' חודשים' : MISSING,
      estimatedTimeNumber1: ctx.existingKeywords.length && level !== 'high' ? m.t1 + ' חודשים' : (level === 'high' ? '24-36+ חודשים (תלוי מילה)' : MISSING),
      disclaimer: FORECAST_DISCLAIMER,
      dataBasis: ctx.gscConnected ? 'GSC + מתחרים + מילות מאושרות' : 'heuristics בלבד — ' + MISSING + ' (GSC)',
    };
  }

  function buildStrategicReportSummary(ctx, all) {
    return {
      executiveSummary: [
        'עסק: ' + ctx.company + ' · תחום: ניהול צי / FleetOS',
        'מילות מפתח פעילות: ' + (ctx.existingKeywords.length || MISSING),
        'מתחרים במעקב: ' + (ctx.competitors.length || MISSING),
        'מוכנות כללית: ' + ((ctx.readiness && ctx.readiness.overall) ? ctx.readiness.overall + '%' : MISSING),
        'פעולה מיידית: ' + (all.actionPlan.items[0] ? all.actionPlan.items[0].action : MISSING),
      ],
      sectionsIncluded: [
        'business', 'services', 'software', 'app', 'competitors', 'keywords', 'audience',
        'seo', 'marketing', 'content', 'platforms', 'blueprint', 'roadmap', 'tasks', 'goals',
        'aiRecommendations', 'workOrder', 'readinessScore',
      ],
      pageEquivalent: '10-20 עמודים (ייצוא HTML מלא)',
      originalNote: 'דוח אסטרטגי מקורי — לא תוכן מתחרים',
    };
  }

  function generateIdeas(stageId) {
    stageId = stageId || 'briefing';
    var ctx = collectContext();
    var ideas = {
      version: VERSION,
      stageId: stageId,
      generatedAt: new Date().toISOString(),
      company: ctx.company,
      agentContributions: agentContributions(ctx),
      keywordIdeas: buildKeywordIdeas(ctx),
      targetAudienceIdeas: buildAudienceIdeas(ctx),
      regionIdeas: buildRegionIdeas(ctx),
      pageIdeas: buildPageIdeas(ctx),
      advertisingPlatformIdeas: buildPlatformIdeas(ctx),
      serviceIdeas: buildServiceIdeas(ctx),
      competitorResearch: buildCompetitorResearch(ctx),
      competitorInspiration: buildCompetitorInspiration(ctx),
      marketComparison: buildMarketComparison(ctx),
      actionPlan: buildActionPlan(stageId, ctx),
      forecast: buildForecast(ctx),
      strategicReport: null,
    };
    ideas.strategicReport = buildStrategicReportSummary(ctx, ideas);

    try {
      localStorage.setItem(CONSULTANT_KEY, JSON.stringify({ latest: ideas, stageId: stageId, at: ideas.generatedAt }));
      var hist = parseLs(HISTORY_KEY) || [];
      if (!Array.isArray(hist)) hist = [];
      hist.unshift({ stageId: stageId, at: ideas.generatedAt, id: 'ac-' + Date.now() });
      if (hist.length > 50) hist.length = 50;
      localStorage.setItem(HISTORY_KEY, JSON.stringify(hist));
    } catch (e) { /* ignore */ }

    if (window.MarketingActivityLog) {
      MarketingActivityLog.log('ai_consultant_ideas', { stageId: stageId, keywords: (ideas.keywordIdeas.suggested || []).length || 0 });
    }

    return ideas;
  }

  function mapStageToAdvisor(stageId) {
    var map = { briefing: 'strategy', materials: 'materials', seo: 'seo', report: 'report', blueprint: 'blueprint', preview: 'build', hub: 'manage' };
    return map[stageId] || 'manage';
  }

  function getLatest() {
    var stored = parseLs(CONSULTANT_KEY);
    return stored && stored.latest ? stored.latest : null;
  }

  function buildExecutiveSummary(ideas) {
    ideas = ideas || getLatest();
    if (!ideas || !ideas.strategicReport) return MISSING;
    return ideas.strategicReport.executiveSummary.join(' · ');
  }

  function renderList(items, mapFn) {
    if (!items || items === MISSING) return '<div class="s">' + esc(MISSING) + '</div>';
    if (!Array.isArray(items)) return '<div class="s">' + esc(String(items)) + '</div>';
    return '<ul style="margin:4px 0;padding-right:18px;font-size:11px;color:var(--w80);line-height:1.7;">' +
      items.map(mapFn || function (x) { return '<li>' + esc(typeof x === 'string' ? x : JSON.stringify(x)) + '</li>'; }).join('') +
      '</ul>';
  }

  function renderIdeasPanel(stageId, containerEl) {
    if (!containerEl) return;
    var ideas = generateIdeas(stageId);

    var kwHtml = '';
    if (Array.isArray(ideas.keywordIdeas.suggested)) {
      kwHtml = ideas.keywordIdeas.suggested.map(function (k) {
        return '<div style="font-size:11px;color:var(--w80);margin:2px 0;">• ' + esc(k) + ' — <span style="color:var(--w50);">למה: הרחבת כיסוי SEO</span></div>';
      }).join('');
    } else kwHtml = '<span class="s">' + esc(MISSING) + '</span>';

    var audHtml = '';
    if (Array.isArray(ideas.targetAudienceIdeas.suggested)) {
      audHtml = ideas.targetAudienceIdeas.suggested.map(function (a) {
        return '<div style="font-size:11px;color:var(--w80);margin:2px 0;">• ' + esc(a.segment) + ' — <strong>למה:</strong> ' + esc(a.why) + '</div>';
      }).join('');
    } else audHtml = '<span class="s">' + esc(MISSING) + '</span>';

    var regHtml = '';
    if (Array.isArray(ideas.regionIdeas.suggested)) {
      regHtml = ideas.regionIdeas.suggested.map(function (r) {
        return '<div style="font-size:11px;color:var(--w80);margin:2px 0;">• ' + esc(r.region) + ' — <strong>למה:</strong> ' + esc(r.why) + '</div>';
      }).join('');
    } else regHtml = '<span class="s">' + esc(MISSING) + '</span>';

    var pageHtml = '';
    if (Array.isArray(ideas.pageIdeas.suggested)) {
      pageHtml = ideas.pageIdeas.suggested.map(function (p) {
        return '<div style="font-size:11px;color:var(--w80);margin:2px 0;">• ' + esc(p.name) + ' — <strong>למה:</strong> ' + esc(p.why || 'עמוד אסטרטגי') + '</div>';
      }).join('');
    } else pageHtml = '<span class="s">' + esc(MISSING) + '</span>';

    var svcHtml = '';
    if (Array.isArray(ideas.serviceIdeas.suggested)) {
      svcHtml = ideas.serviceIdeas.suggested.map(function (s) {
        return '<div style="font-size:11px;color:var(--w80);margin:2px 0;">• ' + esc(s.name) + ' (' + esc(s.type) + ') — <strong>למה:</strong> ' + esc(s.why || 'הרחבת הצעת ערך') + '</div>';
      }).join('');
    } else svcHtml = '<span class="s">' + esc(MISSING) + '</span>';

    var platHtml = (ideas.advertisingPlatformIdeas.recommendations || []).slice(0, 5).map(function (p) {
      return '<div style="font-size:11px;color:var(--w80);margin:4px 0;"><strong>' + esc(p.platform) + '</strong>: ' + esc(p.why) + '</div>';
    }).join('');

    var actionHtml = (ideas.actionPlan.items || []).slice(0, 6).map(function (a) {
      return '<div style="font-size:11px;color:var(--w80);">#' + a.priority + ' ' + esc(a.area) + ': ' + esc(a.action) + '</div>';
    }).join('');

    var agentsHtml = (ideas.agentContributions || []).map(function (a) {
      return '<span style="font-size:10px;color:var(--w50);margin-left:6px;">' + esc(a.agent) + (a.status === 'missing' ? ' (' + MISSING + ')' : '') + '</span>';
    }).join('');

    containerEl.style.display = '';
    containerEl.innerHTML =
      '<div class="card" style="margin-top:10px;border:1px solid var(--w10);">' +
      '<div class="ph-t">💡 רעיונות AI — יועצים וירטואליים</div>' +
      '<div class="s">שלב: ' + esc(stageId) + ' · ' + esc(ideas.generatedAt) + '</div>' +
      '<div style="margin-top:6px;flex-wrap:wrap;">' + agentsHtml + '</div>' +

      '<div style="margin-top:12px;"><div class="st">1. מילות מפתח נוספות</div>' + kwHtml +
      (stageId === 'briefing' ? '<button type="button" class="btn btn-p" id="ac-apply-kw" style="padding:4px 10px;font-size:11px;margin-top:6px;">החל מילות מוצעות לשאלון</button>' : '') +
      '</div>' +

      '<div style="margin-top:10px;"><div class="st">2. קהלי יעד נוספים</div>' + audHtml +
      (stageId === 'briefing' ? '<button type="button" class="btn btn-p" id="ac-apply-aud" style="padding:4px 10px;font-size:11px;margin-top:6px;">החל קהלים לשאלון</button>' : '') +
      '</div>' +

      '<div style="margin-top:10px;"><div class="st">3. אזורי פרסום מומלצים</div>' + regHtml + '</div>' +

      '<div style="margin-top:10px;"><div class="st">4. פלטפורמות פרסום</div>' + platHtml + '<div class="s" style="margin-top:4px;">+' + ((ideas.advertisingPlatformIdeas.recommendations || []).length - 5) + ' נוספות בייצוא</div></div>' +

      '<div style="margin-top:10px;"><div class="st">5. עמודים מומלצים</div>' + pageHtml + '</div>' +

      '<div style="margin-top:10px;"><div class="st">6. רעיונות שירותים/מוצרים</div>' + svcHtml + '</div>' +

      '<div style="margin-top:10px;"><div class="st">7. מחקר מתחרים</div>' +
      (ideas.competitorResearch.competitors === MISSING ? '<div class="s">' + esc(MISSING) + '</div>' :
        renderList(ideas.competitorResearch.competitors, function (c) {
          return '<li><strong>' + esc(c.name) + '</strong> · יתרון שלנו: ' + esc(c.ourAdvantage) + '</li>';
        })) +
      '</div>' +

      '<div style="margin-top:10px;"><div class="st">8. השראה מקורית (לא העתקה)</div>' +
      renderList(ideas.competitorInspiration.concepts, function (c) {
        return '<li>' + esc(c.idea) + ' [' + esc(c.type) + ']</li>';
      }) +
      '<div class="s" style="margin-top:4px;">' + esc(ideas.competitorInspiration.disclaimer) + '</div></div>' +

      '<div style="margin-top:10px;"><div class="st">9. השוואת שוק</div>' +
      '<div style="font-size:11px;color:var(--w80);">מיקום: ' + esc(ideas.marketComparison.whereWeAreToday) + ' · פער: ' + esc(ideas.marketComparison.gap) + '</div></div>' +

      '<div style="margin-top:10px;"><div class="st">10. תוכנית פעולה</div>' + actionHtml + '</div>' +

      '<div style="margin-top:10px;"><div class="st">11. תחזית</div>' +
      '<div style="font-size:11px;color:var(--w80);">קושי: ' + esc(ideas.forecast.difficulty) + ' · Top 10: ' + esc(ideas.forecast.estimatedTimeTop10) +
      ' · Top 3: ' + esc(ideas.forecast.estimatedTimeTop3) + ' · #1: ' + esc(ideas.forecast.estimatedTimeNumber1) + '</div>' +
      '<div class="alt alt-warn" style="margin-top:6px;font-size:11px;">' + esc(ideas.forecast.disclaimer) + '</div></div>' +

      '<div style="margin-top:10px;"><div class="st">12. דוח אסטרטגי</div>' +
      '<div style="font-size:11px;color:var(--w80);">' + esc((ideas.strategicReport.executiveSummary || []).join(' · ')) + '</div></div>' +

      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">' +
      '<button type="button" class="btn btn-p" id="ac-export-html">⬇️ ייצוא דוח אסטרטגי (HTML)</button>' +
      '<button type="button" class="btn btn-p" id="ac-export-json">⬇️ ייצוא JSON</button>' +
      '<button type="button" class="btn btn-g" id="ac-close-panel">סגור</button>' +
      '</div></div>';

    var applyKw = containerEl.querySelector('#ac-apply-kw');
    if (applyKw) applyKw.addEventListener('click', function () {
      applyBriefingSuggestions(['keywords']);
      if (typeof showToast === 'function') showToast('✅ מילות מפתח נוספו לשאלון');
    });
    var applyAud = containerEl.querySelector('#ac-apply-aud');
    if (applyAud) applyAud.addEventListener('click', function () {
      applyBriefingSuggestions(['audience']);
      if (typeof showToast === 'function') showToast('✅ קהלי יעד נוספו לשאלון');
    });
    var exHtml = containerEl.querySelector('#ac-export-html');
    if (exHtml) exHtml.addEventListener('click', function () { exportStrategicReport('html'); });
    var exJson = containerEl.querySelector('#ac-export-json');
    if (exJson) exJson.addEventListener('click', function () { exportStrategicReport('json'); });
    var closeBtn = containerEl.querySelector('#ac-close-panel');
    if (closeBtn) closeBtn.addEventListener('click', function () { containerEl.style.display = 'none'; });
  }

  function applyBriefingSuggestions(types) {
    if (!window.StrategicBriefing) return false;
    var ideas = getLatest() || generateIdeas('briefing');
    var st = StrategicBriefing.get();
    types = types || ['keywords', 'audience'];

    if (types.indexOf('keywords') >= 0 && Array.isArray(ideas.keywordIdeas.suggested)) {
      if (!st.keywordsSuggested) st.keywordsSuggested = [];
      ideas.keywordIdeas.suggested.forEach(function (k) {
        if (st.keywordsSuggested.indexOf(k) < 0) st.keywordsSuggested.push(k);
      });
    }
    if (types.indexOf('audience') >= 0 && Array.isArray(ideas.targetAudienceIdeas.suggested)) {
      if (!st.audience) st.audience = [];
      ideas.targetAudienceIdeas.suggested.forEach(function (a) {
        var seg = a.segment || a;
        if (st.audience.indexOf(seg) < 0) st.audience.push(seg);
      });
    }
    st.updatedAt = new Date().toISOString();
    try { localStorage.setItem('coco-strategic-briefing-v1', JSON.stringify(st)); } catch (e) { return false; }
    if (window.MarketingActivityLog) MarketingActivityLog.log('ai_consultant_applied_briefing', { types: types });
    return true;
  }

  function renderStrategicReportHtml(ideas) {
    ideas = ideas || getLatest() || generateIdeas('report');
    var ctx = collectContext();
    var section = function (title, body) {
      return '<section style="margin-bottom:20px;page-break-inside:avoid;"><h2 style="font-size:16px;border-bottom:2px solid #0b1735;padding-bottom:4px;">' + esc(title) + '</h2>' + body + '</section>';
    };

    var html = '<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>דוח אסטרטגי AI — ' + esc(ctx.company) + '</title>' +
      '<style>body{font-family:Heebo,Arial,sans-serif;max-width:920px;margin:0 auto;padding:24px;color:#111;line-height:1.7}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:right;font-size:12px}th{background:#f1f5f9}.warn{background:#fef3c7;padding:8px;border-radius:6px;font-size:12px}</style></head><body>' +
      '<h1>דוח אסטרטגי AI — יועצים מרובי סוכנים</h1>' +
      '<p style="color:#64748b;font-size:12px;">' + esc(ctx.company) + ' · ' + esc(ideas.generatedAt) + ' · Staging</p>' +
      '<div class="warn">' + esc(FORECAST_DISCLAIMER) + ' · המלצות מקוריות — לא העתקת תוכן מתחרים</div>';

    html += section('סיכום מנהלים', '<ul>' + (ideas.strategicReport.executiveSummary || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>');
    html += section('עסק ושירותים', '<p>שם: ' + esc(ctx.company) + '</p><p>אתר: ' + esc(ctx.site || MISSING) + '</p><p>שירותים: ' + esc((ctx.briefing.services || []).join(' · ') || MISSING) + '</p>');
    html += section('תוכנה ואפליקציה (FleetOS)', '<p>FleetOS — מערכת ניהול צי, תפעול, תחזוקה, נהגים, התראות ודוחות.</p>');
    html += section('מתחרים', renderList(ideas.competitorResearch.competitors === MISSING ? [MISSING] : ideas.competitorResearch.competitors.map(function (c) { return c.name + ' — ' + c.ourAdvantage; })));
    html += section('מילות מפתח', '<p>קיימות: ' + esc((ideas.keywordIdeas.existing || []).join ? ideas.keywordIdeas.existing.join(' · ') : ideas.keywordIdeas.existing) + '</p><p>מוצעות: ' + esc(Array.isArray(ideas.keywordIdeas.suggested) ? ideas.keywordIdeas.suggested.join(' · ') : ideas.keywordIdeas.suggested) + '</p>');
    html += section('קהל יעד', renderList(Array.isArray(ideas.targetAudienceIdeas.suggested) ? ideas.targetAudienceIdeas.suggested.map(function (a) { return a.segment + ' — ' + a.why; }) : ideas.targetAudienceIdeas.suggested));
    html += section('SEO', '<p>אסטרטגיה: ' + esc(ctx.seo.strategyId || MISSING) + '</p>');
    html += section('שיווק ותוכן', renderList(ideas.actionPlan.items, function (a) { return '<li>#' + a.priority + ' ' + esc(a.area) + ': ' + esc(a.action) + '</li>'; }));
    html += section('פלטפורמות', '<table><tr><th>פלטפורמה</th><th>למה</th><th>מתי</th></tr>' +
      (ideas.advertisingPlatformIdeas.recommendations || []).map(function (p) {
        return '<tr><td>' + esc(p.platform) + '</td><td>' + esc(p.why) + '</td><td>' + esc(p.whenToUse) + '</td></tr>';
      }).join('') + '</table>');
    html += section('Blueprint', '<p>עמודים: ' + esc((ctx.blueprint && ctx.blueprint.pageCount) || MISSING) + '</p>');
    html += section('מפת דרכים', renderList(ideas.actionPlan.items.map(function (a) { return a.action; })));
    html += section('משימות ויעדים', '<p>יעד: לידים + מכירת FleetOS · דירוג אורגני</p>');
    html += section('המלצות AI', '<p>כל 10 הקטגוריות כלולות בדוח JSON המצורף.</p>');
    html += section('סדר עבודה', renderList(ideas.actionPlan.items, function (a) { return '<li>' + esc(a.action) + '</li>'; }));
    html += section('ציון מוכנות', '<p>' + esc((ctx.readiness && ctx.readiness.overall) ? ctx.readiness.overall + '%' : MISSING) + '</p>');
    html += section('תחזית', '<p>קושי: ' + esc(ideas.forecast.difficulty) + ' · Top 10: ' + esc(ideas.forecast.estimatedTimeTop10) + ' · Top 3: ' + esc(ideas.forecast.estimatedTimeTop3) + '</p><div class="warn">' + esc(ideas.forecast.disclaimer) + '</div>');
    html += section('השראה מקורית', renderList(ideas.competitorInspiration.concepts, function (c) { return '<li>' + esc(c.idea) + '</li>'; }));
    html += '<p style="font-size:11px;color:#64748b;">Staging · Orin Core · אין Deploy לפרודקשן</p></body></html>';
    return html;
  }

  function downloadBlob(filename, content, mime) {
    var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 500);
  }

  function exportStrategicReport(format) {
    var ideas = getLatest() || generateIdeas('report');
    var html = renderStrategicReportHtml(ideas);
    var clientId = (collectContext().ctx && collectContext().ctx.clientId) || 'client';
    if (format === 'json') {
      downloadBlob('ai-strategic-report-' + clientId + '.json', JSON.stringify(ideas, null, 2), 'application/json;charset=utf-8');
    } else {
      downloadBlob('ai-strategic-report-' + clientId + '.html', html, 'text/html;charset=utf-8');
      downloadBlob('ai-strategic-report-' + clientId + '.json', JSON.stringify(ideas, null, 2), 'application/json;charset=utf-8');
    }
    if (window.MarketingActivityLog) MarketingActivityLog.log('ai_consultant_export', { format: format || 'html' });
    return { ok: true, html: html, ideas: ideas };
  }

  function buttonHtml(stageId, btnId) {
    btnId = btnId || 'ac-btn-' + stageId;
    return '<button type="button" class="btn btn-p" id="' + esc(btnId) + '" data-ac-stage="' + esc(stageId) + '">💡 קבל רעיונות מה-AI</button>';
  }

  function panelHtml(stageId, panelId) {
    panelId = panelId || 'ac-panel-' + stageId;
    return '<div id="' + esc(panelId) + '" style="display:none;margin-top:10px;"></div>';
  }

  function wireStage(container, stageId, btnId, panelId) {
    if (!container) return;
    btnId = btnId || 'ac-btn-' + stageId;
    panelId = panelId || 'ac-panel-' + stageId;
    var btn = container.querySelector('#' + btnId);
    var panel = container.querySelector('#' + panelId);
    if (!btn || !panel) return;
    btn.addEventListener('click', function () {
      if (panel.style.display === 'none') {
        renderIdeasPanel(stageId, panel);
      } else {
        panel.style.display = panel.style.display === 'none' ? '' : 'none';
        if (panel.style.display !== 'none') renderIdeasPanel(stageId, panel);
      }
    });
  }

  function mergeIntoPreBuildReport(model) {
    if (!model) return model;
    var ideas = generateIdeas('report');
    model.aiConsultant = ideas;
    model.executiveSummary = {
      text: buildExecutiveSummary(ideas),
      bullets: ideas.strategicReport && ideas.strategicReport.executiveSummary,
      generatedAt: ideas.generatedAt,
      disclaimer: FORECAST_DISCLAIMER,
    };
    return model;
  }

  window.AiConsultant = {
    VERSION: VERSION,
    MISSING: MISSING,
    FORECAST_DISCLAIMER: FORECAST_DISCLAIMER,
    STAGE_IDS: STAGE_IDS,
    generateIdeas: generateIdeas,
    getLatest: getLatest,
    buildRegionIdeas: buildRegionIdeas,
    buildPageIdeas: buildPageIdeas,
    renderIdeasPanel: renderIdeasPanel,
    exportStrategicReport: exportStrategicReport,
    renderStrategicReportHtml: renderStrategicReportHtml,
    buildExecutiveSummary: buildExecutiveSummary,
    applyBriefingSuggestions: applyBriefingSuggestions,
    buttonHtml: buttonHtml,
    panelHtml: panelHtml,
    wireStage: wireStage,
    mergeIntoPreBuildReport: mergeIntoPreBuildReport,
    collectContext: collectContext,
  };
})();
