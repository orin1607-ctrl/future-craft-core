/**
 * CO.CO דליה — Assistants & Consultants Engine (Phase 4 E2E)
 * 50 rule-based assistants + 10 consultants from real Brief/WorkPlan/Dashboard data.
 */
(function () {
  'use strict';

  var VERSION = '4.0.0-assistants';
  var REPORTS_KEY = 'coco-dalia-assistant-reports-v1';

  var GROUPS = [
    { id: 'group-business-market', name: 'הבנת העסק והשוק', cat: 'עסק ושוק', count: 7 },
    { id: 'group-keywords', name: 'מילות החיפוש', cat: 'חיפוש בגוגל', count: 5 },
    { id: 'group-content', name: 'כתיבת התוכן', cat: 'תוכן ומסרים', count: 8 },
    { id: 'group-tech', name: 'בדיקה טכנית', cat: 'תשתית טכנית', count: 7 },
    { id: 'group-ux', name: 'עיצוב ו-UX', cat: 'עיצוב ושימושיות', count: 8 },
    { id: 'group-assets', name: 'תמונות וקבצים', cat: 'נכסים חזותיים', count: 6 },
    { id: 'group-seo-local', name: 'SEO מקומי', cat: 'SEO מקומי', count: 5 },
    { id: 'group-ads', name: 'קמפיין ממומן', cat: 'Google Ads', count: 4 },
  ];

  var CONSULTANTS = [
    { id: 'b1', specId: 'consultant-0', name: 'יועץ SEO', domain: 'SEO ומבנה', groups: ['group-keywords', 'group-tech'] },
    { id: 'b2', specId: 'consultant-1', name: 'יועץ תוכן', domain: 'תוכן איכותי', groups: ['group-content'] },
    { id: 'b3', specId: 'consultant-2', name: 'יועץ E-E-A-T', domain: 'אמינות ומומחיות', groups: ['group-business-market', 'group-content'] },
    { id: 'b4', specId: 'consultant-3', name: 'יועץ טכנולוגיה', domain: 'Core Web Vitals', groups: ['group-tech'] },
    { id: 'b5', specId: 'consultant-4', name: 'יועץ UX/UI', domain: 'חוויית משתמש', groups: ['group-ux', 'group-assets'] },
    { id: 'b6', specId: 'consultant-5', name: 'יועץ CRO', domain: 'המרות', groups: ['group-ux', 'group-ads'] },
    { id: 'b7', specId: 'consultant-6', name: 'יועץ שיווק דיגיטלי', domain: 'ערוצי שיווק', groups: ['group-keywords', 'group-ads'] },
    { id: 'b8', specId: 'consultant-7', name: 'יועץ מיתוג', domain: 'מיתוג ויזואלי', groups: ['group-ux', 'group-assets'] },
    { id: 'b9', specId: 'consultant-8', name: 'יועץ QA', domain: 'בקרת איכות', groups: ['*'] },
    { id: 'b10', specId: 'consultant-9', name: 'Chief AI Architect', domain: 'סיכום ואישור', groups: ['*'] },
  ];

  var ASSISTANT_NAMES = [
    'מומחה פרופיל עסקי', 'מומחה ניתוח שוק', 'מומחה מיפוי מתחרים', 'מומחה קהלי יעד', 'מומחה יתרון תחרותי', 'מומחה נוכחות בגוגל', 'מומחה יעדים עסקיים',
    'מומחה מילות חיפוש', 'מומחה כוונת חיפוש', 'מומחה נושאי תוכן', 'מומחה השוואה למתחרים', 'מומחה חיפוש מקומי',
    'מומחה מבנה תוכן', 'מומחה עמודי שירות', 'מומחה עמוד הבית', 'מומחה E-E-A-T תוכן', 'מומחה שאלות נפוצות', 'מומחה כותרות SEO', 'מומחה תוכן מקצועי', 'מומחה טון כתיבה',
    'מומחה מהירות', 'מומחה מפת אתר', 'מומחה כפילויות', 'מומחה Schema', 'מומחה קישורים פנימיים', 'מומחה קישורים שבורים', 'מומחה אבטחה',
    'מומחה מבנה עמוד', 'מומחה CTA', 'מומחה טפסים', 'מומחה ניווט', 'מומחה נגישות', 'מומחה מובייל', 'מומחה זרימת משתמש', 'מומחה CRO רעיונות',
    'מומחה תמונות ראשיות', 'מומחה גלריה', 'מומחה לוגו', 'מומחה alt text', 'מומחה וידאו', 'מומחה קבצים להורדה',
    'מומחה GBP', 'מומחה NAP', 'מומחה ביקורות', 'מומחה מפות', 'מומחה Local SEO',
    'מומחה דפי נחיתה', 'מומחה יעדי המרה', 'מומחה תקציב/CPA', 'מומחה דוח מאוחד',
  ];

  function parseLs(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }

  function saveLs(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); return true; } catch (e) { return false; }
  }

  function buildRegistry() {
    var list = [];
    var idx = 0;
    GROUPS.forEach(function (g) {
      for (var i = 0; i < g.count; i++) {
        idx++;
        list.push({
          id: 'a' + idx,
          specId: 'assistant-' + g.id.replace('group-', '') + '-' + (i + 1),
          name: ASSISTANT_NAMES[idx - 1] || ('מומחה ' + g.name + ' ' + (i + 1)),
          domain: g.name,
          groupId: g.id,
          cat: g.cat,
        });
      }
    });
    return list;
  }

  var REGISTRY = buildRegistry();

  function gatherContext(apiSnap) {
    var brief = parseLs('dalia_project_brief') || {};
    var partA = parseLs('dalia_part_a') || {};
    var partB = parseLs('dalia_part_b');
    var biz = brief.biz || {};
    var pb = (window.ProjectBrief && ProjectBrief.get) ? ProjectBrief.get() : parseLs('coco-project-brief-v1');
    var dash = (apiSnap && apiSnap.dashboard) || (parseLs('coco-dalia-api-cache-v1') || {}).dashboard || {};
    var wp = (apiSnap && apiSnap.workPlan) || (parseLs('coco-dalia-api-cache-v1') || {}).workPlan || {};
    var stats = dash.stats || {};
    var conn = dash.connections || {};
    var keywords = (dash.searchConsole && dash.searchConsole.keywords) || [];
    return {
      brief: brief,
      biz: biz,
      partA: partA,
      partB: partB,
      pb: pb,
      dash: dash,
      workPlan: wp,
      stats: stats,
      conn: conn,
      keywords: keywords,
      competitors: brief.competitors || [],
      hasBrief: !!(brief.biz && (brief.biz.companyName || brief.biz.bizName)),
      hasSite: !!(biz.site || partA.site),
      hasCompetitors: (brief.competitors || []).length > 0,
      hasKeywords: keywords.length > 0 || (partB && partB.kw_count > 0),
      seoApproved: !!(partB && partB.approved),
      gadsReady: !!partA.gads_ready,
      pages: (wp.pages || []).length,
      actionsOpen: (wp.summary && wp.summary.actionsOpen) || 0,
    };
  }

  function analyzeAssistant(asst, ctx) {
    var gaps = [];
    var found = [];
    var recs = [];
    var status = 'ממתין';
    var n = parseInt(asst.id.replace('a', ''), 10);

    if (n <= 7) {
      if (ctx.hasBrief) found.push('Brief עסקי קיים');
      else gaps.push('חסר Brief עסקי');
      if (ctx.hasSite) found.push('אתר מוגדר: ' + (ctx.biz.site || ctx.partA.site));
      else gaps.push('חסר URL אתר');
      if (n === 3 && ctx.hasCompetitors) found.push(ctx.competitors.length + ' מתחרים ממופים');
      if (n === 3 && !ctx.hasCompetitors) gaps.push('חסר מיפוי מתחרים');
      if (n === 6 && ctx.conn.searchConsole && ctx.conn.searchConsole.ok) found.push('Search Console מחובר');
      if (n === 6 && !(ctx.conn.businessProfile && ctx.conn.businessProfile.ok)) gaps.push('GBP לא מחובר');
    } else if (n <= 12) {
      if (ctx.hasKeywords) found.push((ctx.keywords.length || ctx.partB.kw_count || 0) + ' מילות מפתח');
      else gaps.push('חסרות מילות מפתח מאושרות');
      if (ctx.seoApproved) found.push('SEO מאושר בחלק ב׳');
    } else if (n <= 20) {
      if (ctx.pages > 0) found.push(ctx.pages + ' עמודים בתוכנית');
      else gaps.push('חסרה תוכנית עמודים');
      if (ctx.hasBrief) found.push('נתוני תוכן זמינים מ-Brief');
    } else if (n <= 27) {
      if (ctx.conn.analytics4 && ctx.conn.analytics4.ok) found.push('GA4 מחובר');
      if (ctx.stats.avgPosition) found.push('מיקום ממוצע: #' + ctx.stats.avgPosition);
      if (ctx.hasSite) found.push('אתר לבדיקה טכנית: ' + (ctx.biz.site || ctx.partA.site));
      else gaps.push('אין אתר לסריקה');
    } else if (n <= 35) {
      if (ctx.pages > 0) found.push('מבנה UX מתוכנן');
      else gaps.push('חסר Blueprint');
    } else if (n <= 41) {
      if (ctx.pb && ctx.pb.files && ctx.pb.files.logo) found.push('לוגו הוגדר');
      else gaps.push('חסר לוגו / נכסים חזותיים');
    } else if (n <= 46) {
      if (ctx.conn.businessProfile && ctx.conn.businessProfile.ok) found.push('GBP מחובר');
      else gaps.push('נדרש חיבור GBP');
    } else if (n <= 50) {
      if (ctx.gadsReady) found.push('Google Ads מוכן (CID)');
      else if (ctx.partA.campaignType && /ads|ממומן/i.test(ctx.partA.campaignType)) gaps.push('קמפיין Ads — CID חסר');
      else { status = 'דולג'; found.push('קמפיין לא כולל Ads'); }
      if (ctx.conn.googleAds && ctx.conn.googleAds.ok) found.push('Google Ads API מחובר');
    }

    if (found.length && !gaps.length) status = 'הושלם';
    else if (found.length && gaps.length) status = 'בתהליך';
    else if (!found.length && gaps.length) status = 'ממתין';

    if (gaps.length) recs.push('לטפל: ' + gaps.slice(0, 2).join('; '));
    else recs.push('מצב תקין — להמשיך לשלב הבא');

    return {
      id: asst.id,
      specId: asst.specId,
      name: asst.name,
      domain: asst.domain,
      status: status,
      checked: 'בדיקת ' + asst.domain + ' מול נתוני הפרויקט',
      found: found.length ? found.join(' · ') : 'אין ממצאים עדיין',
      recommended: recs.join(' · '),
      gaps: gaps,
      actions: gaps.length ? ['לעדכן במרכז עבודה', 'להעביר ליועץ'] : ['להמשיך'],
      confidence: found.length / Math.max(1, found.length + gaps.length),
      updatedAt: new Date().toISOString(),
      source: 'rule-engine-v4',
    };
  }

  function analyzeConsultant(cons, assistantReports) {
    var related = assistantReports.filter(function (r) {
      if (cons.groups.indexOf('*') >= 0) return true;
      var asst = REGISTRY.find(function (a) { return a.id === r.id; });
      return asst && cons.groups.indexOf(asst.groupId) >= 0;
    });
    var done = related.filter(function (r) { return r.status === 'הושלם'; }).length;
    var gaps = related.reduce(function (acc, r) { return acc.concat(r.gaps || []); }, []);
    var uniqueGaps = gaps.filter(function (g, i) { return gaps.indexOf(g) === i; });
    var score = related.length ? Math.round((done / related.length) * 100) : 0;
    var status = score >= 80 ? 'אושר' : (score >= 40 ? 'אושר עם תיקון' : 'ממתין');

    return {
      id: cons.id,
      specId: cons.specId,
      name: cons.name,
      domain: cons.domain,
      status: status,
      checked: 'סקירת ' + related.length + ' עוזרים רלוונטיים',
      found: done + '/' + related.length + ' עוזרים הושלמו',
      recommended: uniqueGaps.length
        ? ('חובה לתקן: ' + uniqueGaps.slice(0, 3).join('; '))
        : 'אין חסמים — מומלץ להמשיך',
      principle: cons.domain,
      score: score,
      mustFix: uniqueGaps.slice(0, 3).join(' · ') || '—',
      updatedAt: new Date().toISOString(),
      source: 'rule-engine-v4',
    };
  }

  function runAll(apiSnap) {
    var ctx = gatherContext(apiSnap);
    var assistants = REGISTRY.map(function (a) { return analyzeAssistant(a, ctx); });
    var consultants = CONSULTANTS.map(function (c) { return analyzeConsultant(c, assistants); });
    var store = { assistants: assistants, consultants: consultants, ranAt: new Date().toISOString(), version: VERSION };
    saveLs(REPORTS_KEY, store);
    assistants.forEach(function (r) {
      if (window.ProjectBrief && ProjectBrief.applyAssistantReport) {
        ProjectBrief.applyAssistantReport(r);
      }
    });
    return store;
  }

  function loadReports() {
    return parseLs(REPORTS_KEY);
  }

  function overlayToV5Data(data, apiSnap) {
    if (!data) return data;
    var store = loadReports();
    if (!store || !store.ranAt) store = runAll(apiSnap);
    var age = Date.now() - new Date(store.ranAt).getTime();
    if (age > 10 * 60 * 1000) store = runAll(apiSnap);

    if (data.assistants && store.assistants) {
      store.assistants.forEach(function (r) {
        var item = data.assistants.find(function (a) { return a.id === r.id; });
        if (item) {
          item.status = r.status;
          item.checked = r.checked;
          item.found = r.found;
          item.recommended = r.recommended;
          item.actions = r.actions;
          item._engine = r.source;
        }
      });
    }
    if (data.consultants && store.consultants) {
      store.consultants.forEach(function (r) {
        var item = data.consultants.find(function (c) { return c.id === r.id; });
        if (item) {
          item.status = r.status;
          item.checked = r.checked;
          item.found = r.found;
          item.recommended = r.recommended;
          item._engine = r.source;
        }
      });
    }
    data._assistantsEngine = { version: VERSION, ranAt: store.ranAt, count: store.assistants.length };
    return data;
  }

  function getActiveCounts() {
    var store = loadReports() || runAll();
    var aDone = (store.assistants || []).filter(function (a) { return a.status === 'הושלם'; }).length;
    var aProc = (store.assistants || []).filter(function (a) { return a.status === 'בתהליך'; }).length;
    var cDone = (store.consultants || []).filter(function (c) { return /אושר/.test(c.status); }).length;
    return { assistantsActive: aDone + aProc, assistantsDone: aDone, consultantsActive: cDone, total: { assistants: 50, consultants: 10 } };
  }

  window.CocoDaliaAssistantsEngine = {
    VERSION: VERSION,
    REGISTRY: REGISTRY,
    CONSULTANTS: CONSULTANTS,
    gatherContext: gatherContext,
    runAll: runAll,
    loadReports: loadReports,
    overlayToV5Data: overlayToV5Data,
    getActiveCounts: getActiveCounts,
  };
})();
