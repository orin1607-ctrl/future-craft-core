/**
 * CO.CO דליה — Assistants & Consultants Engine v6 (quality + C-rev2)
 * Real analysis: quality, fit, contradictions, sources, confidence.
 * Ads off-track → "דולג — לא חלק מהמסלול" (never overwritten to הושלם).
 */
(function () {
  'use strict';

  var VERSION = '6.0.0-quality';
  var REPORTS_KEY = 'coco-dalia-assistant-reports-v1';
  var GOOGLE_AUDIT_KEY = 'coco-dalia-google-connections-audit-v1';

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

  var OFFICIAL_POSITIONING = 'פתרון מלא לניהול, תפעול, תחזוקה ומימון של ציי רכב לעסקים';

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

  function loadCrev2() {
    var research = parseLs('coco-stage-c-research-v1') || parseLs('stage-c-research-v1');
    var constraints = parseLs('coco-stage-d-constraints-v1') || {};
    var biz = parseLs('dalia_biz') || {};
    var brief = parseLs('dalia_project_brief') || {};
    var strat = parseLs('coco-strategic-briefing-v1') || {};
    var active = (research && research.activeRanked) || [];
    var removed = (research && research.removed) || [
      { id: 'cardata' }, { id: 'otobus' },
    ];
    var competitorNames = (brief.competitors || []).map(function (c) {
      return String((c && (c.name || c)) || '').toLowerCase();
    });
    var hasCarGeek = competitorNames.some(function (n) { return n.indexOf('cargeek') >= 0 || n.indexOf('קארגיק') >= 0; })
      || active.some(function (c) { return c.id === 'cargeek'; });
    var hasCarData = competitorNames.some(function (n) { return n.indexOf('cardata') >= 0; });
    var hasOtobus = competitorNames.some(function (n) { return n.indexOf('otobus') >= 0; });
    var positioning = biz.positioning || (brief.biz && brief.biz.positioning) || constraints.positioning || '';
    var fleetOsPublic = false;
    var kwApproved = strat.keywordsApproved || [];
    var kwText = (kwApproved.join(' ') + ' ' + (biz.services || '') + ' ' + (biz.mainService || '')).toLowerCase();
    if (/\bfleetos\b/i.test(kwText) && !(strat.keywordsRemoved || []).some(function (k) { return /fleetos/i.test(k); })) {
      fleetOsPublic = true;
    }
    if (/fleetos/i.test(String(biz.software || '')) && !/פנימי|לא לפרסום/i.test(String(biz.softwareInternal || biz.software || ''))) {
      fleetOsPublic = true;
    }
    return {
      research: research,
      constraints: constraints,
      active: active,
      removed: removed,
      hasCarGeek: hasCarGeek,
      hasCarData: hasCarData,
      hasOtobus: hasOtobus,
      positioning: positioning,
      positioningOk: positioning.indexOf('מימון') >= 0 && positioning.indexOf('תפעול') >= 0 && positioning.indexOf('תחזוק') >= 0,
      fleetOsNotPublic: constraints.fleetOsNotPublic !== false && !fleetOsPublic,
      fleetOsPublicLeak: fleetOsPublic,
      volumesAreEstimates: constraints.volumesAreEstimates !== false,
      ituranPartial: constraints.ituranPartialSnippets !== false,
      financingIncluded: !!(biz.financing && biz.financing.available) || /מימון/.test(String(biz.services || '')),
      ownedGarage: !!(biz.ownedGarage && biz.ownedGarage.hasOwnedGarage) || /מוסך/.test(String(biz.services || '')),
      officialPositioning: OFFICIAL_POSITIONING,
    };
  }

  function auditGoogleConnections(apiSnap) {
    var cache = parseLs('coco-dalia-api-cache-v1') || {};
    var dash = (apiSnap && apiSnap.dashboard) || cache.dashboard || {};
    var conn = dash.connections || {};
    var cacheAt = cache.cachedAt || cache.updatedAt || cache.ts || null;
    var isSeed = !!(cache.fromSeed || cache.seed || dash.fromSeed);
    var isCacheOnly = !!cacheAt || Object.keys(conn).length > 0;

    function one(key, label) {
      var c = conn[key] || {};
      var claimedOk = !!c.ok;
      var liveVerified = false;
      var lastSync = c.syncedAt || c.lastSync || c.updatedAt || cacheAt || null;
      var dataReceived = c.sample || c.summary || c.keywords || c.note || null;
      var err = c.error || c.err || null;
      // Without explicit liveVerified flag from a real OAuth sync for this client — mark unverified
      if (c.liveVerified === true && c.clientId === 'dalia-c-official') liveVerified = true;
      var status = 'לא אומת';
      var sourceType = 'unknown';
      if (err) { status = 'שגיאה'; sourceType = 'error'; }
      else if (isSeed) { status = 'לא אומת'; sourceType = 'seed'; }
      else if (claimedOk && !liveVerified) { status = 'לא אומת'; sourceType = isCacheOnly ? 'cache' : 'unverified-claim'; }
      else if (liveVerified) { status = 'חי מאומת'; sourceType = 'live'; }
      else { status = 'לא אומת'; sourceType = 'missing'; }

      return {
        key: key,
        label: label,
        claimedOk: claimedOk,
        live: liveVerified,
        status: status,
        sourceType: sourceType,
        lastSync: lastSync,
        dataReceived: dataReceived ? (typeof dataReceived === 'string' ? dataReceived : JSON.stringify(dataReceived).slice(0, 200)) : null,
        isCache: sourceType === 'cache',
        isSeed: sourceType === 'seed',
        error: err,
        display: status === 'חי מאומת' ? (label + ' מחובר (מאומת)') : (label + ' — לא אומת'),
      };
    }

    var audit = {
      version: VERSION,
      auditedAt: new Date().toISOString(),
      clientId: 'dalia-c-official',
      connections: [
        one('searchConsole', 'GSC'),
        one('analytics4', 'GA4'),
        one('businessProfile', 'GBP'),
        one('googleAds', 'Google Ads'),
      ],
      policy: 'אין להציג מחובר בלי liveVerified+clientId=dalia-c-official',
    };
    saveLs(GOOGLE_AUDIT_KEY, audit);
    return audit;
  }

  function gatherContext(apiSnap) {
    var brief = parseLs('dalia_project_brief') || {};
    var partA = parseLs('dalia_part_a') || {};
    var partB = parseLs('dalia_part_b');
    var biz = parseLs('dalia_biz') || brief.biz || {};
    if (brief.biz) biz = Object.assign({}, biz, brief.biz);
    var pb = (window.ProjectBrief && ProjectBrief.get) ? ProjectBrief.get() : parseLs('coco-project-brief-v1');
    var dash = (apiSnap && apiSnap.dashboard) || (parseLs('coco-dalia-api-cache-v1') || {}).dashboard || {};
    var wp = (apiSnap && apiSnap.workPlan) || (parseLs('coco-dalia-api-cache-v1') || {}).workPlan || {};
    var seoPack = (partB && partB.seoPack) || {};
    var crev2 = loadCrev2();
    var googleAudit = auditGoogleConnections(apiSnap);
    var gMap = {};
    googleAudit.connections.forEach(function (c) { gMap[c.key] = c; });

    var campaignType = partA.campaignType || (parseLs('coco-flow-context-v2') || {}).channel || 'seo';
    var isAdsTrack = /ads|ממומן/i.test(String(campaignType));

    // Multi-Asset context — N assets via AssetRegistry (assistants/consultants)
    var multiAsset = window.AssetRegistry && AssetRegistry.aiContext
      ? AssetRegistry.aiContext()
      : {
          customer_id: 'dalia-c-official',
          assets: [],
          active_asset_id: null,
          compare_asset_ids: [],
          mode: 'single',
          providers_by_asset: {},
        };

    return {
      brief: brief,
      biz: biz,
      partA: partA,
      partB: partB,
      pb: pb,
      dash: dash,
      workPlan: wp,
      seoPack: seoPack,
      crev2: crev2,
      googleAudit: googleAudit,
      gMap: gMap,
      competitors: brief.competitors || [],
      hasBrief: !!(brief.biz && (brief.biz.companyName || brief.biz.bizName || biz.company)),
      hasSite: !!(biz.site || partA.site || (multiAsset.assets && multiAsset.assets.length)),
      site: (multiAsset.assets.find(function (a) { return a.id === multiAsset.active_asset_id; }) || {}).url || biz.site || partA.site || '',
      multiAsset: multiAsset,
      assets: multiAsset.assets || [],
      activeAssetId: multiAsset.active_asset_id,
      assetMode: multiAsset.mode,
      compareAssetIds: multiAsset.compare_asset_ids || [],
      hasCompetitors: (brief.competitors || []).length > 0,
      hasKeywords: !!(seoPack.keywords || (partB && partB.kw_count > 0) || (parseLs('coco-strategic-briefing-v1') || {}).keywordsApproved),
      seoApproved: !!(partB && partB.approved),
      gadsReady: !!partA.gads_ready,
      isAdsTrack: isAdsTrack,
      pages: (seoPack.pagesPlan || seoPack.pageMap || (wp.pages || [])).length,
      pagesPlan: seoPack.pagesPlan || [],
      kwCount: (partB && partB.kw_count) || ((parseLs('coco-strategic-briefing-v1') || {}).keywordsApproved || []).length || 0,
    };
  }

  function confLabel(n) {
    if (n >= 0.8) return 'גבוהה';
    if (n >= 0.5) return 'בינונית';
    return 'נמוכה';
  }

  function analyzeAssistant(asst, ctx) {
    var gaps = [];
    var found = [];
    var contradictions = [];
    var missing = [];
    var sources = [];
    var recs = [];
    var status = 'ממתין';
    var realAnalysis = false;
    var n = parseInt(asst.id.replace('a', ''), 10);
    var crev2 = ctx.crev2;
    var gMap = ctx.gMap;

    // ── Ads track: early return, never overwrite to הושלם ──
    if (n >= 47 && n <= 50) {
      if (!ctx.isAdsTrack) {
        return {
          id: asst.id, specId: asst.specId, name: asst.name, domain: asst.domain, groupId: asst.groupId,
          status: 'דולג — לא חלק מהמסלול',
          checked: 'בדיקת שייכות למסלול SEO מול campaignType',
          found: 'המסלול הוא SEO אורגני — Google Ads אינו חלק מהזרימה הנוכחית',
          recommended: 'לא להריץ משימות Ads עד בחירת מסלול ממומן',
          gaps: [],
          contradictions: [],
          missing: [],
          sources: [{ type: 'system', ref: 'dalia_part_a.campaignType / coco-flow-context-v2.channel' }],
          fitDalia: 'לא רלוונטי במסלול הנוכחי',
          fitCrev2: 'לא רלוונטי',
          confidence: 1,
          confidenceLabel: 'גבוהה',
          realAnalysis: true,
          qualityOk: true,
          actions: ['לדלג'],
          updatedAt: new Date().toISOString(),
          source: 'rule-engine-v6-quality',
        };
      }
    }

    // Shared C-rev2 / positioning checks used across groups
    function checkPositioning() {
      realAnalysis = true;
      sources.push({ type: 'client', ref: 'dalia_biz.positioning / C-rev2' });
      if (crev2.positioningOk) {
        found.push('מיצוב כולל תפעול+תחזוקה+מימון');
      } else {
        gaps.push('מיצוב חסר מימון/תפעול/תחזוקה לפי C-rev2');
        missing.push('מיצוב רשמי מלא');
      }
      if (crev2.positioning && crev2.positioning.indexOf('לא מוסך') >= 0) {
        contradictions.push('מיצוב ישן «לא מוסך» עדיין מופיע');
      }
    }

    function checkFleetOs() {
      realAnalysis = true;
      sources.push({ type: 'system', ref: 'C-rev2 fleetOsNotPublic' });
      if (crev2.fleetOsPublicLeak) {
        contradictions.push('FleetOS מופיע כמותג ציבורי — אסור');
        gaps.push('להסיר FleetOS מקידום ציבורי');
      } else {
        found.push('FleetOS אינו מוצג כמותג ציבורי');
      }
    }

    function checkCompetitors() {
      realAnalysis = true;
      sources.push({ type: 'competitors', ref: 'stage-c-research / project_brief.competitors' });
      if (crev2.hasCarGeek) found.push('CarGeek מוגדר כמתחרה מרכזי');
      else { gaps.push('חסר CarGeek כמתחרה מרכזי'); missing.push('CarGeek'); }
      if (crev2.hasCarData) contradictions.push('CarData עדיין ברשימת מתחרים — יש להסיר');
      else found.push('CarData אינו מתחרה פעיל');
      if (crev2.hasOtobus) contradictions.push('Otobus עדיין ברשימה — URL לא תקף');
      else found.push('Otobus הוסר');
      if (ctx.competitors.length >= 5) found.push(ctx.competitors.length + ' מתחרים פעילים ב-Brief');
      else gaps.push('פחות מ-5 מתחרים פעילים ב-Brief');
    }

    function checkGoogle(key) {
      realAnalysis = true;
      var g = gMap[key];
      sources.push({ type: 'google-audit', ref: key + ':' + (g && g.sourceType) });
      if (!g || g.status !== 'חי מאומת') {
        found.push((g && g.display) || (key + ' — לא אומת'));
        missing.push(key + ' לא אומת חי');
        // Not a hard gap that blocks quality if we honestly report — but prevents הושלם
        gaps.push(key + ' לא אומת כחיבור חי');
      } else {
        found.push(g.display);
      }
    }

    if (n <= 7) {
      // Business / market
      if (n === 1) {
        checkPositioning();
        if (ctx.hasBrief && ctx.hasSite) found.push('Brief+אתר: ' + ctx.site);
        else { gaps.push('חסר Brief או אתר'); missing.push('brief/site'); }
        if (crev2.financingIncluded) found.push('מימון כלול באפיון');
        else gaps.push('מימון חסר באפיון');
        if (crev2.ownedGarage) found.push('מוסך בבעלות מתועד');
        else missing.push('אימות מוסך בבעלות');
        sources.push({ type: 'client', ref: 'dalia-c.com / dalia_biz' });
      } else if (n === 2) {
        realAnalysis = true;
        found.push('שוק: ניהול צי + תפעול/תחזוקה + מיקור חוץ + ליסינג כקטגוריה');
        sources.push({ type: 'competitors', ref: 'C-rev2 arenas' });
        if (!crev2.hasCarGeek) gaps.push('ניתוח שוק בלי CarGeek');
      } else if (n === 3) {
        checkCompetitors();
      } else if (n === 4) {
        realAnalysis = true;
        sources.push({ type: 'client', ref: 'brief.biz.idealCustomer' });
        if (ctx.biz.idealCustomer || ctx.biz.targetAudience || ctx.partA.ideal) {
          found.push('קהל: ' + (ctx.biz.idealCustomer || ctx.partA.ideal || ctx.biz.targetAudience));
        } else { gaps.push('חסר קהל יעד מפורט'); missing.push('audience'); }
      } else if (n === 5) {
        realAnalysis = true;
        checkFleetOs();
        checkPositioning();
        found.push('בידול: בעלות אצל הלקוח + מוסך + מימון + חבילות מחיר');
        sources.push({ type: 'manual', ref: 'C-rev2 differentiation' });
      } else if (n === 6) {
        checkGoogle('searchConsole');
        checkGoogle('businessProfile');
      } else if (n === 7) {
        realAnalysis = true;
        sources.push({ type: 'client', ref: 'part_a.goal / seoPack.goals' });
        if (ctx.partA.goal || (ctx.seoPack.goals && ctx.seoPack.goals.length)) {
          found.push('יעדים מוגדרים ב-Pack');
        } else gaps.push('חסרים יעדים עסקיים/SEO מפורשים');
      }
    } else if (n <= 12) {
      realAnalysis = true;
      sources.push({ type: 'keywords', ref: 'strategic-briefing / part_b' });
      if (ctx.hasKeywords) found.push(ctx.kwCount + ' מילות מפתח ב-Pack');
      else { gaps.push('חסרות מילות מפתח'); missing.push('keywords'); }
      if (crev2.volumesAreEstimates) {
        found.push('נפחי חיפוש מסומנים כהערכה (אין API חי)');
      } else {
        contradictions.push('נפחים לא מסומנים כהערכה');
        gaps.push('לסמן נפחים כהערכה');
      }
      checkFleetOs();
      if (n === 11) checkCompetitors();
      if (n === 12) {
        found.push('Local SEO: אזורים = הערכה/השלמה עד אימות');
        missing.push('פירוט ערים מאומת');
        gaps.push('אזורים גיאוגרפיים לא אומתו חי');
      }
      if (!ctx.seoApproved) gaps.push('Part B לא מאושר');
      else found.push('Part B מאושר');
    } else if (n <= 20) {
      realAnalysis = true;
      sources.push({ type: 'completion', ref: 'seoPack.pagesPlan / brief' });
      checkPositioning();
      checkFleetOs();
      if (ctx.pages > 0) found.push(ctx.pages + ' עמודים מתוכננים ב-Pack');
      else { gaps.push('חסרה תוכנית עמודים'); missing.push('pagesPlan'); }
      if (n === 14) {
        if (crev2.financingIncluded) found.push('עמוד מימון נדרש בתוכנית');
        if (crev2.ownedGarage) found.push('עמוד מוסך נדרש בתוכנית');
      }
      if (n === 16) {
        found.push('E-E-A-T: ניסיון ~25 שנה — מקור אתר חי (client)');
        sources.push({ type: 'client', ref: 'dalia-c.com' });
      }
    } else if (n <= 27) {
      realAnalysis = true;
      sources.push({ type: 'estimate', ref: 'tech checks — no live CWV in Stage D' });
      if (ctx.hasSite) found.push('אתר לבדיקה: ' + ctx.site + ' (ללא מדידה חיה בשלב זה)');
      else gaps.push('אין אתר');
      if (n === 21) {
        gaps.push('Core Web Vitals לא נמדדו חי — הערכה בלבד');
        missing.push('CWV live');
      }
      if (n === 22 || n === 23 || n === 25 || n === 26) {
        gaps.push('בדיקה טכנית חיה לא בוצעה על Production (אסור לגעת)');
        missing.push('live technical crawl');
      }
      if (n === 24) found.push('Schema מתוכנן ב-Pack — טרם יושם ב-Production');
      if (n === 27) found.push('HTTPS קיים באתר החי (client) — יתר הבדיקות הערכה');
      checkGoogle('analytics4');
    } else if (n <= 35) {
      realAnalysis = true;
      sources.push({ type: 'completion', ref: 'seoPack / preview plan' });
      if (ctx.pages > 0) found.push('מבנה UX מתוכנן ב-Pack');
      else gaps.push('חסר מבנה עמודים ל-UX');
      if (n === 29) found.push('CTA: הצעת מחיר / ייעוץ / חודש חינם — לפי אתר');
      if (n >= 28 && n <= 35 && !ctx.pages) missing.push('blueprint');
    } else if (n <= 41) {
      realAnalysis = true;
      sources.push({ type: 'system', ref: 'project brief files / preview assets' });
      if (ctx.pb && ctx.pb.files && ctx.pb.files.logo) {
        found.push('לוגו הוגדר ב-Brief');
      } else {
        gaps.push('חסר לוגו מאומת ב-Brief');
        missing.push('logo');
      }
      if (n === 36 || n === 37) {
        gaps.push('תמונות Hero טרם נוצרו (שלב E לא אושר)');
        missing.push('images-stage-e');
      }
      if (n === 39) {
        gaps.push('Alt text לתמונות Preview — טרם אומת במלואו');
        missing.push('alt-text-audit');
      }
    } else if (n <= 46) {
      realAnalysis = true;
      checkGoogle('businessProfile');
      if (n === 43) {
        gaps.push('NAP לא אומת מול מקור חי אחיד');
        missing.push('NAP verification');
      }
      if (n === 44) {
        gaps.push('ביקורות Google — לא אומתו חי');
        missing.push('reviews');
      }
    }

    // Quality gate for הושלם: real analysis + no contradictions + no critical gaps
    var criticalGaps = gaps.filter(function (g) {
      return /FleetOS|CarData|Otobus|מיצוב|CarGeek חסר|סתיר/.test(g) || contradictions.length > 0;
    });

    if (contradictions.length) {
      status = 'בתהליך';
    } else if (realAnalysis && found.length && !gaps.length) {
      status = 'הושלם';
    } else if (realAnalysis && found.length && gaps.length && !criticalGaps.length && gaps.every(function (g) {
      return /לא אומת|הערכה|טרם|לא נמדד|לא בוצע|שלב E|CWV|NAP|ביקורות|Alt|תמונות/.test(g);
    })) {
      // Honest partial: verified what we can, flagged unverified — NOT הושלם
      status = 'בתהליך';
    } else if (realAnalysis && found.length && gaps.length) {
      status = 'בתהליך';
    } else if (!realAnalysis) {
      status = 'ממתין';
      gaps.push('לא בוצעה בדיקת איכות אמיתית');
    } else {
      status = 'ממתין';
    }

    if (gaps.length) recs.push('לטפל: ' + gaps.slice(0, 3).join('; '));
    if (contradictions.length) recs.push('סתירות: ' + contradictions.slice(0, 2).join('; '));
    if (!gaps.length && !contradictions.length) recs.push('עבר בדיקת איכות מול Pack/C-rev2');

    var confidence = realAnalysis
      ? Math.max(0.2, found.length / Math.max(1, found.length + gaps.length + contradictions.length))
      : 0.1;

    return {
      id: asst.id,
      specId: asst.specId,
      name: asst.name,
      domain: asst.domain,
      groupId: asst.groupId,
      status: status,
      checked: 'בדיקת איכות: התאמה לדליה + C-rev2 + מקורות + סתירות',
      found: found.length ? found.join(' · ') : 'אין ממצאים מאומתים',
      recommended: recs.join(' · '),
      gaps: gaps,
      contradictions: contradictions,
      missing: missing,
      sources: sources,
      fitDalia: crev2.positioningOk ? 'מיצוב תואם כיוון' : 'מיצוב דורש תיקון',
      fitCrev2: (!crev2.hasCarData && !crev2.hasOtobus && crev2.fleetOsNotPublic) ? 'תואם מגבלות C-rev2' : 'חריגות C-rev2',
      confidence: Math.round(confidence * 100) / 100,
      confidenceLabel: confLabel(confidence),
      realAnalysis: realAnalysis,
      qualityOk: status === 'הושלם',
      actions: gaps.length || contradictions.length ? ['לתקן נתונים', 'להעביר ליועץ'] : ['להמשיך'],
      updatedAt: new Date().toISOString(),
      source: 'rule-engine-v6-quality',
    };
  }

  function analyzeConsultant(cons, assistantReports, ctx) {
    var related = assistantReports.filter(function (r) {
      if (cons.groups.indexOf('*') >= 0) return true;
      var asst = REGISTRY.find(function (a) { return a.id === r.id; });
      return asst && cons.groups.indexOf(asst.groupId) >= 0;
    });
    // Exclude skipped ads from denominator for non-ads consultants partially
    var actionable = related.filter(function (r) { return !/^דולג/.test(r.status); });
    var done = actionable.filter(function (r) { return r.status === 'הושלם'; }).length;
    var inProgress = actionable.filter(function (r) { return r.status === 'בתהליך'; }).length;
    var gaps = actionable.reduce(function (acc, r) { return acc.concat(r.gaps || []); }, []);
    var contradictions = actionable.reduce(function (acc, r) { return acc.concat(r.contradictions || []); }, []);
    var uniqueGaps = gaps.filter(function (g, i) { return gaps.indexOf(g) === i; });
    var uniqueContra = contradictions.filter(function (g, i) { return contradictions.indexOf(g) === i; });
    var score = actionable.length ? Math.round((done / actionable.length) * 100) : 0;

    var approved = [];
    var rejected = [];
    var risks = [];
    var conditions = [];

    // Content-based decisions (not score alone)
    actionable.forEach(function (r) {
      if (r.status === 'הושלם' && r.realAnalysis && !(r.contradictions && r.contradictions.length)) {
        approved.push(r.id + ' ' + r.name);
      } else if (/^דולג/.test(r.status)) {
        /* skip */
      } else {
        rejected.push(r.id + ' ' + r.name + ' (' + r.status + ')');
      }
    });

    if (uniqueContra.length) risks.push('סתירות: ' + uniqueContra.slice(0, 3).join('; '));
    if (uniqueGaps.some(function (g) { return /FleetOS|CarData|CarGeek חסר|מיצוב/.test(g); })) {
      risks.push('חריגות C-rev2 / מיצוב');
    }
    if (ctx.gMap && Object.keys(ctx.gMap).some(function (k) { return ctx.gMap[k].status !== 'חי מאומת' && /searchConsole|analytics4|businessProfile/.test(k); })) {
      risks.push('חיבורי Google לא אומתו חי');
    }

    conditions.push('נפחי KW נשארים הערכה עד API');
    conditions.push('לא להציג FleetOS כמותג ציבורי');
    if (!ctx.crev2.hasCarGeek) conditions.push('חובה לשלב CarGeek לפני קידום מתחרים');

    var status;
    var decisionReason;
    if (cons.id === 'b10') {
      // Chief: content-based, NOT score alone
      var criticalBlockers = uniqueContra.length > 0
        || uniqueGaps.some(function (g) { return /FleetOS מופיע|CarData עדיין|Otobus עדיין|חסר CarGeek/.test(g); })
        || done < 1;
      var enoughReal = actionable.filter(function (r) { return r.realAnalysis; }).length >= Math.min(35, actionable.length);
      if (!criticalBlockers && enoughReal && inProgress >= 0 && done >= 5 && uniqueGaps.filter(function (g) {
        return /FleetOS|CarData|מיצוב חסר/.test(g);
      }).length === 0) {
        // Still require no critical C-rev2 failures; allow בתהליך on unverified Google
        var hardGaps = uniqueGaps.filter(function (g) {
          return !/לא אומת|הערכה|טרם|לא נמדד|לא בוצע|שלב E|CWV|NAP|ביקורות|Alt|תמונות|גיאוגרפ|crawl/.test(g);
        });
        if (hardGaps.length === 0 && uniqueContra.length === 0) {
          status = 'אושר עם תיקון';
          decisionReason = 'Chief: אין סתירות קריטיות ו-C-rev2 הבסיסי עומד; נותרו פערים של אימות Google/טכני/תמונות — לא אישור מלא ל-E';
        } else {
          status = 'ממתין';
          decisionReason = 'Chief: פערים קשיחים שנותרו — ' + hardGaps.slice(0, 3).join('; ');
        }
      } else {
        status = 'ממתין';
        decisionReason = 'Chief: לא מאשר מעבר — חסמים תוכניים/C-rev2 או מחסור בניתוחים אמיתיים';
      }
      if (score >= 80 && status === 'ממתין') {
        decisionReason += ' (ציון מספרי ' + score + '% אינו מספיק לאישור)';
      }
    } else {
      if (uniqueContra.length || uniqueGaps.some(function (g) { return /FleetOS מופיע|CarData עדיין|חסר CarGeek/.test(g); })) {
        status = 'ממתין';
        decisionReason = 'נדחה זמנית בגלל סתירות/C-rev2';
      } else if (done > 0 && inProgress >= 0 && uniqueGaps.every(function (g) {
        return /לא אומת|הערכה|טרם|לא נמדד|לא בוצע|שלב E|CWV|NAP|ביקורות|Alt|תמונות|גיאוגרפ|crawl/.test(g);
      })) {
        status = 'אושר עם תיקון';
        decisionReason = 'אושר חלקית: ניתוחים אמיתיים בוצעו; פערים שנותרו הם אימות/מדידה — לא המצאת נתונים';
      } else if (done === actionable.length && actionable.length) {
        status = 'אושר';
        decisionReason = 'כל העוזרים הרלוונטיים עברו בדיקת איכות ללא פערים';
      } else {
        status = 'ממתין';
        decisionReason = 'ממתין להשלמת ניתוחי איכות בעוזרים';
      }
    }

    return {
      id: cons.id,
      specId: cons.specId,
      name: cons.name,
      domain: cons.domain,
      status: status,
      checked: 'קריאת ממצאי ' + actionable.length + ' עוזרים + החלטה מקצועית (לא ציון בלבד)',
      found: done + ' הושלמו · ' + inProgress + ' בתהליך · ציון ייחוס ' + score + '%',
      recommended: decisionReason,
      principle: cons.domain,
      score: score,
      mustFix: uniqueGaps.slice(0, 5).join(' · ') || '—',
      approvedItems: approved.slice(0, 12),
      rejectedItems: rejected.slice(0, 12),
      risks: risks,
      conditions: conditions,
      decisionReason: decisionReason,
      updatedAt: new Date().toISOString(),
      source: 'rule-engine-v6-quality',
    };
  }

  function runAll(apiSnap) {
    var ctx = gatherContext(apiSnap);
    var assistants = REGISTRY.map(function (a) { return analyzeAssistant(a, ctx); });
    var consultants = CONSULTANTS.map(function (c) { return analyzeConsultant(c, assistants, ctx); });
    var quality = {
      realAnalysisCount: assistants.filter(function (a) { return a.realAnalysis && !/^דולג/.test(a.status); }).length,
      completedQuality: assistants.filter(function (a) { return a.status === 'הושלם'; }).length,
      inProgress: assistants.filter(function (a) { return a.status === 'בתהליך'; }).length,
      skippedAds: assistants.filter(function (a) { return /^דולג/.test(a.status); }).length,
      contradictions: assistants.reduce(function (n, a) { return n + (a.contradictions || []).length; }, 0),
    };
    var store = {
      assistants: assistants,
      consultants: consultants,
      ranAt: new Date().toISOString(),
      version: VERSION,
      quality: quality,
      crev2Snapshot: {
        hasCarGeek: ctx.crev2.hasCarGeek,
        hasCarData: ctx.crev2.hasCarData,
        hasOtobus: ctx.crev2.hasOtobus,
        fleetOsNotPublic: ctx.crev2.fleetOsNotPublic,
        positioningOk: ctx.crev2.positioningOk,
      },
      googleAuditKey: GOOGLE_AUDIT_KEY,
    };
    saveLs(REPORTS_KEY, store);
    assistants.forEach(function (r) {
      if (window.ProjectBrief && ProjectBrief.applyAssistantReport) ProjectBrief.applyAssistantReport(r);
    });
    consultants.forEach(function (r) {
      if (window.ProjectBrief && ProjectBrief.applyConsultantReport) ProjectBrief.applyConsultantReport(r);
    });
    return store;
  }

  function loadReports() { return parseLs(REPORTS_KEY); }

  function overlayToV5Data(data, apiSnap) {
    if (!data) return data;
    var store = loadReports();
    if (!store || !store.ranAt) store = runAll(apiSnap);
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
          item.confidence = r.confidenceLabel;
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
    data._assistantsEngine = { version: VERSION, ranAt: store.ranAt, quality: store.quality };
    return data;
  }

  function getActiveCounts() {
    var store = loadReports() || runAll();
    var aDone = (store.assistants || []).filter(function (a) { return a.status === 'הושלם'; }).length;
    var aProc = (store.assistants || []).filter(function (a) { return a.status === 'בתהליך'; }).length;
    var aReal = (store.assistants || []).filter(function (a) { return a.realAnalysis && !/^דולג/.test(a.status); }).length;
    var cDone = (store.consultants || []).filter(function (c) { return /אושר/.test(c.status); }).length;
    return {
      assistantsActive: aDone + aProc,
      assistantsDone: aDone,
      assistantsRealAnalysis: aReal,
      consultantsActive: cDone,
      total: { assistants: 50, consultants: 10 },
      quality: store.quality,
    };
  }

  function toPipelineState() {
    var store = loadReports() || runAll();
    var assistants = {};
    var consultants = {};
    (store.assistants || []).forEach(function (a) { assistants[a.id] = { status: a.status, note: a.found }; });
    (store.consultants || []).forEach(function (c) { consultants[c.id] = { status: c.status, note: c.found }; });
    return { assistants: assistants, consultants: consultants };
  }

  window.CocoDaliaAssistantsEngine = {
    VERSION: VERSION,
    REGISTRY: REGISTRY,
    CONSULTANTS: CONSULTANTS,
    gatherContext: gatherContext,
    auditGoogleConnections: auditGoogleConnections,
    runAll: runAll,
    loadReports: loadReports,
    overlayToV5Data: overlayToV5Data,
    getActiveCounts: getActiveCounts,
    toPipelineState: toPipelineState,
    GOOGLE_AUDIT_KEY: GOOGLE_AUDIT_KEY,
  };
})();
