/**
 * Pre-Build Work Report — full downloadable report gate before website build.
 * Staging only · no design changes to platform chrome.
 */
(function () {
  'use strict';

  var VERSION = '1.2.0';
  var REPORT_KEY = 'coco-pre-build-work-report-v1';
  var APPROVAL_KEY = 'coco-pre-build-report-approved-v1';
  var APPROVAL_AT_KEY = 'coco-pre-build-report-approved-at-v1';

  var FLEET_PAGE = {
    title: 'תוכנת ניהול צי רכב לעסקים',
    slug: 'fleet-management-software',
    purpose: 'עמוד מרכזי לתוכנת FleetOS — ניהול תפעול, תחזוקה, נהגים, תקלות, דוחות והתראות לעסקים עם מספר רכבים.',
    keywords: ['תוכנה לניהול צי רכב', 'אפליקציה לניהול צי רכב', 'מערכת תפעול ותחזוקה לרכבים', 'ניהול טיפולים', 'ניהול נהגים', 'ניהול תקלות'],
    headlines: ['מערכת מתקדמת לניהול צי רכב', 'שליטה מלאה בתפעול ותחזוקה', 'FleetOS — הפתרון לעסקים עם מספר רכבים'],
    cta: 'קבלו הדגמה לתוכנה',
    sections: [
      'ניהול רכבים מרובים במקום אחד',
      'תחזוקה מונעת, טיפולים ותקלות',
      'ניהול נהגים והרשאות',
      'דוחות, התראות ומעקב בזמן אמת',
      'מתאים לעסקים עם צי של מספר רכבים',
    ],
  };

  function parseLs(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function dash() {
    return (window.DaliaSite && DaliaSite.getDashboard && DaliaSite.getDashboard()) || {};
  }

  function workPlan() {
    return (window.DaliaSite && DaliaSite.getWorkPlan && DaliaSite.getWorkPlan()) || null;
  }

  function crawl() {
    return (window.DaliaSite && DaliaSite.getCrawl && DaliaSite.getCrawl()) || null;
  }

  function topKeywords(limit) {
    var sc = dash().searchConsole || {};
    var kw = sc.keywords || [];
    return kw.slice(0, limit || 12).map(function (k) {
      return { query: k.query || k.keyword, clicks: k.clicks, impressions: k.impressions };
    }).filter(function (k) { return k.query; });
  }

  function collectPreBuildInputs() {
    var biz = parseLs('dalia_biz') || {};
    var ctx = parseLs('coco-business-context-v1') || {};
    var actions = parseLs('coco-business-strategy-actions-v1') || [];
    var brief = parseLs('coco-business-agent-brief-v1') || {};
    var wp = workPlan();
    var cr = crawl();
    var pages = (cr && cr.crawl && cr.crawl.pages) || (wp && wp.pages) || [];
    var campaigns = parseLs('coco-campaigns-v1') || (window.COCO && COCO.campaigns) || [];
    var activity = parseLs('coco-activity-v1') || [];

    return {
      collectedAt: new Date().toISOString(),
      clientId: ctx.clientId || 'dalia-c-official',
      company: ctx.company || biz.name || 'דליה',
      sector: ctx.sector || biz.sector || '',
      site: ctx.site || biz.site || 'https://dalia-c.com/',
      biz: biz,
      context: ctx,
      actions: Array.isArray(actions) ? actions : [],
      agentBrief: brief,
      workPlan: wp,
      crawl: cr,
      pages: pages,
      keywords: topKeywords(15).concat((ctx.strategy && ctx.strategy.focusKeywords) || []).map(function (k) {
        return typeof k === 'string' ? { query: k } : k;
      }),
      campaigns: campaigns,
      activity: activity,
      competitors: ctx.competitors || (biz.comp ? String(biz.comp).split('\n').filter(Boolean) : []),
    };
  }

  function scorePage(p) {
    var score = 50;
    if (p.seoScore != null) score = Number(p.seoScore) || score;
    if (p.missing && p.missing.length) score -= p.missing.length * 5;
    if (p.aiSummary) score += 5;
    return score;
  }

  function buildNewSitePages(inputs) {
    var kw = inputs.keywords.map(function (k) { return k.query || k; }).filter(Boolean);
    var uniqKw = [];
    kw.forEach(function (k) { if (uniqKw.indexOf(k) < 0) uniqKw.push(k); });

    var pages = [
      {
        order: 1,
        title: 'בית',
        slug: 'index',
        purpose: 'דף נחיתה ראשי — הצגת הערך, שירותים מרכזיים והמרה.',
        keywords: uniqKw.slice(0, 4),
        headlines: ['פתרונות מקצועיים לניהול ותפעול צי רכב', inputs.company, 'שירות מקצועי בכל הארץ'],
        cta: 'צרו קשר לייעוץ חינם',
        sections: ['Hero', 'יתרונות', 'שירותים', 'הוכחות', 'CTA'],
      },
      Object.assign({ order: 2 }, FLEET_PAGE),
      {
        order: 3,
        title: 'שירותים',
        slug: 'services',
        purpose: 'פירוט שירותי התפעול, תחזוקה, GPS, מימון וליסינג.',
        keywords: uniqKw.slice(2, 8),
        headlines: ['שירותי דליה לעסקים', 'תפעול צי מקצה לקצה'],
        cta: 'קבלו הצעת מחיר',
        sections: ['ניהול צי', 'תחזוקה', 'GPS', 'מימון', 'CTA'],
      },
      {
        order: 4,
        title: 'אודות',
        slug: 'about',
        purpose: 'אמון, ניסיון, היסטוריה ויתרון תחרותי.',
        keywords: uniqKw.slice(4, 7),
        headlines: ['מעל 20 שנות ניסיון', 'שותף אמין לעסקים'],
        cta: 'הכירו את הצוות',
        sections: ['סיפור החברה', 'ערכים', 'ניסיון', 'CTA'],
      },
      {
        order: 5,
        title: 'צור קשר',
        slug: 'contact',
        purpose: 'המרה לליד — טופס, טלפון, WhatsApp.',
        keywords: ['צור קשר דליה', 'ייעוץ ניהול צי'],
        headlines: ['דברו איתנו', 'נחזור אליכם בהקדם'],
        cta: 'שלחו פנייה',
        sections: ['טופס', 'פרטי קשר', 'CTA'],
      },
    ];

    if (uniqKw.length >= 6) {
      pages.push({
        order: 6,
        title: 'פתרונות SEO',
        slug: 'seo-solutions',
        purpose: 'עמודי תמיכה למילות מפתח ארוכות זנב.',
        keywords: uniqKw.slice(6, 12),
        headlines: uniqKw.slice(6, 9),
        cta: 'למידע נוסף',
        sections: ['מילות מפתח', 'תוכן', 'CTA'],
      });
    }

    return pages;
  }

  function buildPreBuildReportModel(inputs) {
    inputs = inputs || collectPreBuildInputs();
    var existingPages = (inputs.pages || []).map(function (p) {
      return {
        path: p.path || p.url || '/',
        title: p.title || p.path || 'עמוד',
        score: scorePage(p),
        missing: p.missing || [],
        aiSummary: p.aiSummary || '',
        useAsSource: scorePage(p) >= 45 || !!(p.aiSummary),
        worthContinuing: scorePage(p) >= 60 && !(p.missing && p.missing.length > 4),
      };
    });

    var goodPages = existingPages.filter(function (p) { return p.useAsSource && p.score >= 55; });
    var weakPages = existingPages.filter(function (p) { return p.score < 50 || (p.missing && p.missing.length > 2); });
    var discardPages = existingPages.filter(function (p) { return !p.worthContinuing; });

    var promoteKeywords = inputs.keywords.map(function (k) { return k.query || k; }).filter(Boolean);
    var newPages = buildNewSitePages(inputs);

    var keywordPageMap = newPages.map(function (p) {
      return { page: p.title, keywords: p.keywords || [], primary: (p.keywords && p.keywords[0]) || '—' };
    });

    var goals = [];
    if (inputs.context && inputs.context.businessGoal) goals.push(inputs.context.businessGoal);
    if (inputs.workPlan && inputs.workPlan.summary && inputs.workPlan.summary.goalsCount) {
      goals.push('מטרות work-plan: ' + inputs.workPlan.summary.goalsCount + ' עמודים');
    }
    goals.push('בניית אתר חדש נפרד — לא תיקון האתר הישן');
    goals.push('הצגת FleetOS / תוכנת ניהול צי כעמוד מרכזי');

    var platforms = (inputs.context && inputs.context.strategy && inputs.context.strategy.platforms) ||
      ['Google Search Console', 'Google Analytics 4', 'SEO אורגני', 'Google Business Profile'];

    var seoModel = (window.SeoStrategy && SeoStrategy.get && SeoStrategy.get()) || null;
    if (!seoModel && window.SeoStrategy && SeoStrategy.buildStrategyModel) {
      seoModel = SeoStrategy.isApproved && SeoStrategy.isApproved() ? SeoStrategy.buildStrategyModel() : null;
    }

    var workOrder = [
      '1. איסוף נתונים ותחקיר (הושלם)',
      '2. שער חומרים — אישור (הושלם)',
      '3. אסטרטגיית SEO — מחקר ואישור (הושלם)',
      '4. מתחרים ומילות מפתח (הושלם)',
      '5. מטרות ופעולות (הושלם)',
      '6. דוח עבודה מלא — הורדה ואישור',
      '7. בניית אתר חדש על Template קבוע',
      '8. Preview מלא + הערות לקוח',
      '9. אישור סופי',
      '10. Deploy לריפו/דומיין נפרד של הלקוח (לא דליה)',
    ];

    var workOrderPostLaunch = [
      '1. אישור Preview סופי מול הלקוח',
      '2. תיקוני תוכן/SEO לפי הערות',
      '3. יצירת ריפו Git זמני נפרד ללקוח',
      '4. QA ביצועים ומהירות',
      '5. חיבור Analytics + Search Console לאתר החדש',
      '6. Deploy לדומיין/אחסון הלקוח (לא דליה)',
      '7. מעקב שוטף: SEO, תוכן, Ads, GBP',
    ];

    var improvements = [
      'מבנה אתר חדש עם ' + newPages.length + ' עמודים',
      'SEO מותאם למילות מפתח מ-GSC ואסטרטגיה',
      'עמוד FleetOS מרכזי לתוכנה',
      'מהירות ו-UX — אתר נקי על Template קבוע',
      'חיבור Analytics, GSC, GBP, Ads לאחר עלייה',
    ];

    var businessProfile = {
      name: inputs.company,
      sector: inputs.sector || (inputs.biz && inputs.biz.sector) || '',
      mainService: (inputs.context && inputs.context.mainService) || (inputs.biz && inputs.biz.mainService) || '',
      services: (inputs.biz && inputs.biz.services) || '',
      competitors: inputs.competitors || [],
      keywords: promoteKeywords,
      site: inputs.site,
      goal: (inputs.context && inputs.context.businessGoal) || (inputs.biz && inputs.biz.goal) || '',
      differentiator: (inputs.context && inputs.context.differentiator) || (inputs.biz && inputs.biz.diff) || '',
      recommendations: [
        'בניית אתר חדש נפרד — לא תיקון האתר הישן',
        'הדגשת FleetOS / תוכנת ניהול צי',
        'מיפוי SEO לכל עמוד',
        'Preview מלא לפני Deploy',
      ],
    };

    return {
      version: VERSION,
      reportId: 'PBWR-' + Date.now(),
      generatedAt: new Date().toISOString(),
      clientId: inputs.clientId,
      company: inputs.company,
      site: inputs.site,
      principle: 'האתר הקיים (' + inputs.site + ') — מקור מידע בלבד. בונים אתר חדש נפרד בשליטה מלאה.',
      sections: {
        currentSiteStatus: {
          site: inputs.site,
          pageCount: existingPages.length,
          avgScore: existingPages.length ? Math.round(existingPages.reduce(function (s, p) { return s + p.score; }, 0) / existingPages.length) : 0,
          connectedAssets: (inputs.context && inputs.context.connectedAssets) || [],
        },
        siteStrengths: goodPages.slice(0, 8).map(function (p) { return p.path + ' (ציון ' + p.score + ')'; }),
        siteWeaknesses: weakPages.slice(0, 8).map(function (p) {
          return p.path + ' — ' + ((p.missing && p.missing.slice(0, 2).join(', ')) || 'ציון נמוך');
        }),
        sourcePages: goodPages.map(function (p) { return { path: p.path, reason: 'מקור מידע — תוכן/מבנה ללמידה בלבד' }; }),
        discardPages: discardPages.map(function (p) { return { path: p.path, reason: 'לא שווה המשך — ייבנה מחדש באתר החדש' }; }),
        promoteKeywords: promoteKeywords,
        keywordPageMap: keywordPageMap,
        firstNewPage: newPages[0] ? newPages[0].title : 'בית',
        secondNewPage: newPages[1] ? newPages[1].title : FLEET_PAGE.title,
        pageDetails: newPages,
        services: (inputs.biz && inputs.biz.services) ? String(inputs.biz.services).split(',').map(function (s) { return s.trim(); }).filter(Boolean) : ((inputs.context && inputs.context.mainService) ? [inputs.context.mainService] : []),
        goals: goals,
        actions: inputs.actions,
        toFix: weakPages.slice(0, 6).map(function (p) { return 'לא לתקן ישיר — ללמוד מ-' + p.path; }),
        toRebuild: newPages.map(function (p) { return p.title; }),
        targets: [
          inputs.context && inputs.context.businessGoal,
          'אתר חדש מהיר, SEO-ready, עם FleetOS בולט',
          'Preview ללקוח לפני Deploy',
        ].filter(Boolean),
        platforms: platforms,
        workOrder: workOrder,
        workOrderPostLaunch: workOrderPostLaunch,
        improvements: improvements,
        opportunities: [
          'עמוד FleetOS מרכזי — לא קיים מספיק באתר הישן',
          'מיפוי SEO לכל עמוד חדש',
          'אתר מהיר על Template קבוע',
          'Preview ללקוח לפני Deploy',
        ],
        competitorAnalysis: (inputs.competitors || []).map(function (c) {
          return { name: c, note: 'מקור מידע לאסטרטגיה' };
        }),
        changesVsOld: improvements,
        fleetSoftwarePage: FLEET_PAGE,
      },
      businessProfile: businessProfile,
      newSiteSitemap: newPages.map(function (p) { return { order: p.order, title: p.title, slug: p.slug }; }),
      rawInputsSummary: {
        actionsCount: inputs.actions.length,
        keywordsCount: promoteKeywords.length,
        competitorsCount: (inputs.competitors || []).length,
      },
      seoStrategy: seoModel ? {
        strategyId: seoModel.strategyId,
        keywordCount: (seoModel.keywords || []).length,
        competitors: (seoModel.competitors || []).map(function (c) { return c.name; }),
        roadmap: seoModel.roadmap,
        pageSeoMapping: seoModel.pageSeoMapping,
        keywordGoals: seoModel.keywordGoals,
        missingNote: seoModel.missingNote,
        agentContributions: seoModel.agentContributions,
      } : { note: 'חסר מידע — אסטרטגיית SEO לא אושרה' },
    };
  }

  function renderSectionHtml(title, body) {
    return '<section style="margin-bottom:24px;page-break-inside:avoid;"><h2 style="font-size:18px;border-bottom:2px solid #0b1735;padding-bottom:6px;">' + esc(title) + '</h2>' + body + '</section>';
  }

  function renderPreBuildReportHtml(model) {
    var s = model.sections;
    var html = '<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>דוח עבודה לפני בניית אתר — ' + esc(model.company) + '</title>' +
      '<style>body{font-family:Heebo,Arial,sans-serif;max-width:920px;margin:0 auto;padding:24px;color:#111;line-height:1.7}table{width:100%;border-collapse:collapse;margin:10px 0}th,td{border:1px solid #ddd;padding:8px;text-align:right;font-size:13px}th{background:#f1f5f9}.meta{color:#64748b;font-size:12px}</style></head><body>' +
      '<h1>דוח עבודה מלא לפני בניית אתר</h1>' +
      '<p class="meta">' + esc(model.company) + ' · ' + esc(model.site) + ' · ' + esc(model.generatedAt) + ' · ' + esc(model.reportId) + '</p>' +
      '<p><strong>עיקרון:</strong> ' + esc(model.principle) + '</p>';

    if (model.businessProfile) {
      var bp = model.businessProfile;
      html += renderSectionHtml('פרופיל עסק (מחברות ועסקים)', '<table><tr><th>שדה</th><th>ערך</th></tr>' +
        '<tr><td>שם עסק</td><td>' + esc(bp.name) + '</td></tr>' +
        '<tr><td>תחום</td><td>' + esc(bp.sector) + '</td></tr>' +
        '<tr><td>שירות מרכזי</td><td>' + esc(bp.mainService) + '</td></tr>' +
        '<tr><td>שירותים</td><td>' + esc(bp.services) + '</td></tr>' +
        '<tr><td>מתחרים</td><td>' + esc((bp.competitors || []).join(' · ')) + '</td></tr>' +
        '<tr><td>יעד</td><td>' + esc(bp.goal) + '</td></tr>' +
        '<tr><td>בידול</td><td>' + esc(bp.differentiator) + '</td></tr></table>');
    }
    if (s.improvements && s.improvements.length) {
      html += renderSectionHtml('מה נשפר באתר החדש', '<ul>' + s.improvements.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>');
    }

    html += renderSectionHtml('1. מצב האתר הקיים היום', '<p>עמודים: ' + s.currentSiteStatus.pageCount + ' · ציון ממוצע: ' + s.currentSiteStatus.avgScore + '</p><p>נכסים: ' + esc((s.currentSiteStatus.connectedAssets || []).join(', ')) + '</p>');
    html += renderSectionHtml('2. מה טוב באתר הקיים', '<ul>' + s.siteStrengths.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>');
    html += renderSectionHtml('3. מה חלש', '<ul>' + s.siteWeaknesses.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>');
    html += renderSectionHtml('4. עמודים כמקור מידע', '<ul>' + s.sourcePages.map(function (x) { return '<li>' + esc(x.path) + ' — ' + esc(x.reason) + '</li>'; }).join('') + '</ul>');
    html += renderSectionHtml('5. עמודים שלא שווים המשך', '<ul>' + s.discardPages.map(function (x) { return '<li>' + esc(x.path) + ' — ' + esc(x.reason) + '</li>'; }).join('') + '</ul>');
    html += renderSectionHtml('6. מילות מפתח לקידום', '<p>' + esc(s.promoteKeywords.join(' · ')) + '</p>');
    html += renderSectionHtml('7. מיפוי מילת מפתח → עמוד', '<table><tr><th>עמוד</th><th>מילה ראשית</th><th>מילות תמיכה</th></tr>' +
      s.keywordPageMap.map(function (r) { return '<tr><td>' + esc(r.page) + '</td><td>' + esc(r.primary) + '</td><td>' + esc((r.keywords || []).join(', ')) + '</td></tr>'; }).join('') + '</table>');
    html += renderSectionHtml('8–9. עמוד ראשון ושני באתר החדש', '<p>ראשון: <strong>' + esc(s.firstNewPage) + '</strong></p><p>שני: <strong>' + esc(s.secondNewPage) + '</strong> (FleetOS / תוכנה)</p>');
    html += renderSectionHtml('10–12. תוכן, כותרות ו-CTA לכל עמוד', s.pageDetails.map(function (p) {
      return '<div style="margin-bottom:12px;padding:10px;border:1px solid #e2e8f0;border-radius:8px;"><strong>' + p.order + '. ' + esc(p.title) + '</strong><br>מטרה: ' + esc(p.purpose) +
        '<br>כותרות: ' + esc((p.headlines || []).join(' | ')) + '<br>CTA: ' + esc(p.cta) + '<br>תוכן: ' + esc((p.sections || []).join(', ')) + '</div>';
    }).join(''));
    html += renderSectionHtml('13. שירותים', '<p>' + esc(s.services.join(' · ')) + '</p>');
    html += renderSectionHtml('14. מטרות', '<ul>' + s.goals.map(function (g) { return '<li>' + esc(g) + '</li>'; }).join('') + '</ul>');
    html += renderSectionHtml('15. פעולות', '<table><tr><th>שם</th><th>תיאור</th><th>סטטוס</th></tr>' +
      (s.actions || []).slice(0, 20).map(function (a) {
        return '<tr><td>' + esc(a.name) + '</td><td>' + esc(a.description) + '</td><td>' + esc(a.status) + '</td></tr>';
      }).join('') + '</table>');
    html += renderSectionHtml('16–17. מה לתקן / מה לבנות מחדש', '<p><strong>לא מתקנים אתר ישן.</strong></p><ul>' + s.toRebuild.map(function (x) { return '<li>בנייה מחדש: ' + esc(x) + '</li>'; }).join('') + '</ul>');
    html += renderSectionHtml('18. יעדים', '<ul>' + s.targets.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>');
    html += renderSectionHtml('19. פלטפורמות', '<p>' + esc(s.platforms.join(' · ')) + '</p>');
    html += renderSectionHtml('20. סדר עבודה (לפני build)', '<ol>' + s.workOrder.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ol>');
    if (s.workOrderPostLaunch) {
      html += renderSectionHtml('סדר עבודה לאחר עליית האתר', '<ol>' + s.workOrderPostLaunch.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ol>');
    }
    html += renderSectionHtml('תוכנת FleetOS — עמוד מרכזי', '<p><strong>' + esc(FLEET_PAGE.title) + '</strong></p><ul>' + FLEET_PAGE.sections.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>');
    if (model.seoStrategy && model.seoStrategy.strategyId) {
      var seo = model.seoStrategy;
      html += renderSectionHtml('אסטרטגיית SEO', '<p>מילות מפתח: ' + (seo.keywordCount || 0) + ' · מתחרים: ' + esc((seo.competitors || []).join(' · ')) + '</p>' +
        (seo.missingNote ? '<p style="color:#b45309;">' + esc(seo.missingNote) + '</p>' : '') +
        '<h3>מפת דרכים</h3><ul>' + (seo.roadmap || []).map(function (m) { return '<li><strong>' + esc(m.label) + ':</strong> ' + esc((m.actions || []).join(', ')) + '</li>'; }).join('') + '</ul>' +
        '<h3>יעדי דירוג</h3><table><tr><th>מילה</th><th>יעד</th><th>זמן משוער</th></tr>' +
        (seo.keywordGoals || []).slice(0, 10).map(function (kg) {
          return '<tr><td>' + esc(kg.keyword) + '</td><td>' + esc(kg.goal) + '</td><td>' + esc(kg.estimatedMonths) + ' חודשים</td></tr>';
        }).join('') + '</table>');
    }
    html += '<p class="meta">Staging · TEMP · אין Deploy לפרודקשן · אתר לקוח יושב בנפרד ממערכת דליה</p></body></html>';
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

  function exportPreBuildReportArtifacts(model) {
    model = model || buildPreBuildReportModel();
    var html = renderPreBuildReportHtml(model);
    try {
      localStorage.setItem(REPORT_KEY, JSON.stringify(model));
    } catch (e) { /* ignore */ }
    downloadBlob('pre-build-work-report-' + (model.clientId || 'client') + '.html', html, 'text/html;charset=utf-8');
    downloadBlob('pre-build-work-report-' + (model.clientId || 'client') + '.json', JSON.stringify(model, null, 2), 'application/json;charset=utf-8');
    return { ok: true, model: model, html: html };
  }

  function isApproved() {
    try { return localStorage.getItem(APPROVAL_KEY) === 'true'; } catch (e) { return false; }
  }

  function approveReport(model) {
    if (window.MaterialsReadinessGate && !MaterialsReadinessGate.isReady()) {
      if (typeof showToast === 'function') showToast('⚠️ יש לאשר שער חומרים לפני דוח Pre-Build');
      return { ok: false, reason: 'materials_not_ready' };
    }
    if (window.SeoStrategy && !SeoStrategy.isApproved()) {
      if (typeof showToast === 'function') showToast('⚠️ יש לאשר אסטרטגיית SEO לפני דוח Pre-Build');
      return { ok: false, reason: 'seo_not_approved' };
    }
    model = model || buildPreBuildReportModel();
    try {
      localStorage.setItem(REPORT_KEY, JSON.stringify(model));
      localStorage.setItem(APPROVAL_KEY, 'true');
      localStorage.setItem(APPROVAL_AT_KEY, new Date().toISOString());
      localStorage.setItem('coco-build-gate-v1', JSON.stringify({ approved: true, at: new Date().toISOString(), reportId: model.reportId }));
    } catch (e) { return { ok: false }; }
    syncReportToPlatform(model);
    if (window.SiteBlueprint && SiteBlueprint.buildFromReport) SiteBlueprint.buildFromReport(model);
    if (window.MarketingLifecycle) MarketingLifecycle.advance('report', 'completed');
    if (window.AiStageAdvisor) AiStageAdvisor.advise('report');
    return { ok: true };
  }

  function revokeApproval() {
    try {
      localStorage.removeItem(APPROVAL_KEY);
      localStorage.removeItem(APPROVAL_AT_KEY);
      localStorage.setItem('coco-build-gate-v1', JSON.stringify({ approved: false }));
    } catch (e) { /* ignore */ }
  }

  function syncReportToPlatform(model) {
    model = model || buildPreBuildReportModel();
    var brief = parseLs('coco-business-agent-brief-v1') || {};
    brief.preBuildReport = {
      reportId: model.reportId,
      approvedAt: new Date().toISOString(),
      sitemap: model.newSiteSitemap,
      fleetPage: FLEET_PAGE.title,
    };
    brief.instructions = (brief.instructions || '') + ' · דוח Pre-Build מאושר — בניית אתר חדש מותרת.';
    try {
      localStorage.setItem('coco-business-agent-brief-v1', JSON.stringify(brief));
      localStorage.setItem('coco-pre-build-sitemap-v1', JSON.stringify(model.newSiteSitemap));
    } catch (e) { /* ignore */ }

    var actions = parseLs('coco-business-strategy-actions-v1') || [];
    actions.push({
      id: 'pre-build-report-' + Date.now(),
      name: 'דוח Pre-Build מאושר — מוכן לבניית אתר',
      description: model.newSiteSitemap.map(function (p) { return p.title; }).join(' → '),
      status: 'report_defined',
      priority: 'גבוה',
      source: 'pre-build-report',
      category: 'website-build',
      created_at: new Date().toISOString(),
    });
    try { localStorage.setItem('coco-business-strategy-actions-v1', JSON.stringify(actions)); } catch (e) { /* ignore */ }

    if (window.COCO) {
      COCO.preBuildReport = model;
      COCO.buildGateApproved = true;
    }
    if (window.CocoData && CocoData.bindAll) CocoData.bindAll();
    if (window.DaliaSite && DaliaSite.logWorkProgress) {
      DaliaSite.logWorkProgress('דוח Pre-Build מאושר', model.company + ' · ' + model.newSiteSitemap.length + ' עמודים');
    }
  }

  function syncPreviewToPlatform(output) {
    if (!output) return;
    try {
      localStorage.setItem('coco-site-preview-meta-v1', JSON.stringify({
        slug: output.summaryPlan && output.summaryPlan.slug,
        previewPath: output.previewSite && output.previewSite.previewPath,
        pagesCount: output.previewSite && output.previewSite.pagesCount,
        builtAt: output.previewBuiltAt,
        approved: output.previewSite && output.previewSite.approved,
      }));
    } catch (e) { /* ignore */ }
    if (window.CocoData && CocoData.bindAll) CocoData.bindAll();
  }

  function renderInlinePanel(container) {
    if (!container) return;
    var model = buildPreBuildReportModel();
    var materialsOk = !window.MaterialsReadinessGate || MaterialsReadinessGate.isReady();
    var seoOk = !window.SeoStrategy || SeoStrategy.isApproved();
    if (!materialsOk || !seoOk) {
      container.innerHTML = '<div class="card" style="margin-top:12px;"><div class="ph-t">📋 דוח עבודה מלא לפני בניית אתר</div>' +
        '<div class="alt alt-warn">' + (!materialsOk ? 'יש להשלים שער חומרים לפני דוח Pre-Build' : 'יש לאשר אסטרטגיית SEO לפני דוח Pre-Build') + '</div></div>';
      return;
    }
    var approved = isApproved();
    container.innerHTML =
      '<div class="card" style="margin-top:12px;">' +
      '<div class="ph-t">📋 דוח עבודה מלא לפני בניית אתר (כולל SEO)</div>' +
      '<div class="s">20 סעיפים · הורדה למחשב · אישור חובה לפני 🌐 צור אתר AI</div>' +
      '<div id="pbr-summary" style="font-size:12px;color:var(--w80);line-height:1.8;margin-top:10px;"></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">' +
      '<button type="button" class="btn btn-p" id="pbr-download">⬇️ הורד דוח (HTML + JSON)</button>' +
      '<button type="button" class="btn btn-p" id="pbr-preview">👁️ תצוגה מקדימה</button>' +
      '<button type="button" class="btn btn-p" id="pbr-blueprint">📐 הורד Blueprint</button>' +
      '<button type="button" class="btn btn-g" id="pbr-pdf">🖨️ PDF (הדפסה)</button>' +
      '<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--w80);"><input type="checkbox" id="pbr-approve-check" ' + (approved ? 'checked' : '') + ' /> אני מאשר/ת את הדוח לבניית אתר חדש</label>' +
      '<button type="button" class="btn btn-go" id="pbr-approve-btn" ' + (approved ? 'disabled' : '') + '>✅ אשר דוח והפעל בנייה</button>' +
      '</div>' +
      '<div id="pbr-status" class="alt ' + (approved ? 'alt-ok' : 'alt-warn') + '" style="margin-top:10px;">' +
      (approved ? '✅ הדוח מאושר — ניתן לפתוח Website Builder' : '⚠️ יש להוריד, לעבור על הדוח ולאשר לפני בניית אתר') +
      '</div></div>';

    var sum = container.querySelector('#pbr-summary');
    if (sum) {
      sum.innerHTML = '<div>עמודים באתר החדש: <strong>' + model.newSiteSitemap.length + '</strong></div>' +
        '<div>סדר: ' + model.newSiteSitemap.map(function (p) { return esc(p.title); }).join(' → ') + '</div>' +
        '<div>עמוד FleetOS: <strong>' + esc(FLEET_PAGE.title) + '</strong></div>';
    }

    var dl = container.querySelector('#pbr-download');
    if (dl) dl.addEventListener('click', function () {
      exportPreBuildReportArtifacts(model);
      if (typeof showToast === 'function') showToast('⬇️ הדוח הורד (HTML + JSON)');
    });

    var pv = container.querySelector('#pbr-preview');
    if (pv) pv.addEventListener('click', function () {
      var w = window.open('', '_blank');
      if (w) { w.document.write(renderPreBuildReportHtml(model)); w.document.close(); }
    });

    var bp = container.querySelector('#pbr-blueprint');
    if (bp) bp.addEventListener('click', function () {
      if (window.SiteBlueprint) {
        SiteBlueprint.buildFromReport(model);
        SiteBlueprint.downloadBlueprint();
        if (typeof showToast === 'function') showToast('📐 Blueprint הורד');
      }
    });

    var pdf = container.querySelector('#pbr-pdf');
    if (pdf) pdf.addEventListener('click', function () {
      var w = window.open('', '_blank');
      if (w) {
        w.document.write(renderPreBuildReportHtml(model));
        w.document.close();
        w.onload = function () { w.print(); };
      }
    });

    var chk = container.querySelector('#pbr-approve-check');
    var ab = container.querySelector('#pbr-approve-btn');
    if (ab) ab.addEventListener('click', function () {
      if (chk && !chk.checked) {
        if (typeof showToast === 'function') showToast('⚠️ סמן/י אישור דוח');
        return;
      }
      approveReport(model);
      if (typeof showToast === 'function') showToast('✅ הדוח מאושר — ניתן לפתוח Website Builder');
      renderInlinePanel(container);
      updateBuildButtonsGate();
    });
  }

  function allGatesReady() {
    var materialsOk = !window.MaterialsReadinessGate || MaterialsReadinessGate.isReady();
    var seoOk = !window.SeoStrategy || SeoStrategy.isApproved();
    return materialsOk && seoOk && isApproved();
  }

  function updateBuildButtonsGate() {
    var ready = allGatesReady();
    var materialsOk = !window.MaterialsReadinessGate || MaterialsReadinessGate.isReady();
    var seoOk = !window.SeoStrategy || SeoStrategy.isApproved();
    var reportOk = isApproved();
    var hint = !materialsOk ? 'יש לאשר שער חומרים' : !seoOk ? 'יש לאשר אסטרטגיית SEO' : !reportOk ? 'יש לאשר דוח Pre-Build' : '';
    document.querySelectorAll('[data-pbr-gated="true"]').forEach(function (btn) {
      btn.disabled = !ready;
      btn.title = ready ? '' : hint;
    });
  }

  function mountReportPanel(rootId) {
    var root = document.getElementById(rootId || 'pre-build-report-root');
    if (!root) return;
    renderInlinePanel(root);
    updateBuildButtonsGate();
  }

  function assertBuildGate() {
    if (window.MaterialsReadinessGate && !MaterialsReadinessGate.assertGate()) return false;
    if (window.SeoStrategy && !SeoStrategy.assertGate()) return false;
    if (!isApproved()) {
      if (typeof showToast === 'function') showToast('⚠️ יש להוריד ולאשר דוח Pre-Build לפני בניית אתר');
      return false;
    }
    return true;
  }

  window.PreBuildWorkReport = {
    VERSION: VERSION,
    collectPreBuildInputs: collectPreBuildInputs,
    buildPreBuildReportModel: buildPreBuildReportModel,
    renderPreBuildReportHtml: renderPreBuildReportHtml,
    exportPreBuildReportArtifacts: exportPreBuildReportArtifacts,
    approveReport: approveReport,
    revokeApproval: revokeApproval,
    isApproved: isApproved,
    syncReportToPlatform: syncReportToPlatform,
    syncPreviewToPlatform: syncPreviewToPlatform,
    mountReportPanel: mountReportPanel,
    updateBuildButtonsGate: updateBuildButtonsGate,
    allGatesReady: allGatesReady,
    assertBuildGate: assertBuildGate,
    FLEET_PAGE: FLEET_PAGE,
  };
})();
