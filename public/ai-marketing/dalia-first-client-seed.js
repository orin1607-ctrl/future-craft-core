/**
 * Dalia first real client — full business profile seed (Staging only).
 * Used by simulation + enriches wizard/strategy context.
 */
(function () {
  'use strict';

  var COMPANY = 'דליה פתרונות תפעול ותחזוקה לרכב';
  var CLIENT_ID = 'dalia-c-official';
  var MISSING = 'חסר מידע';

  var KEYWORDS = [
    'תוכנה לניהול צי רכב', 'מערכת לניהול צי רכב', 'אפליקציה לניהול צי רכב',
    'מערכת תפעול ותחזוקת רכבים', 'ניהול צי רכב לעסקים', 'תחזוקת צי רכב',
    'ניהול רכבי חברה', 'מערכת לניהול רכבי חברה', 'אפליקציה לניהול רכבים',
    'Fleet Management', 'Fleet Management Software', 'FleetOS',
    'ניהול נהגים', 'ניהול טיפולים', 'ניהול תקלות', 'תחזוקה מונעת',
    'מערכת לניהול מוסכים וספקים', 'מעקב אחר רכבים', 'מערכת GPS לציי רכב',
    'איתור רכבים', 'שליטה מרחוק על צי רכב', 'מצלמות לרכב', 'חיישנים לרכב',
    'מערכת התראות', 'ניהול ביטוחים לרכב', 'ניהול טסטים', 'ניהול מסמכי רכב',
    'מערכת לניהול צי רכב לעסקים', 'פתרונות לציי רכב', 'תפעול רכבים לעסקים',
    'ניהול תחזוקת רכבים',
  ];

  var SERVICES = [
    'תוכנת FleetOS', 'אפליקציה לניהול צי רכב', 'ניהול צי רכב', 'תפעול צי רכב',
    'תחזוקת רכבים', 'ניהול נהגים', 'ניהול טיפולים', 'ניהול תקלות', 'דוחות',
    'התראות', 'GPS', 'מצלמות', 'חיישנים', 'שינוע רכבים', 'שירותי דרך',
    'מוקד שירות', 'מעקב טיפולים', 'מעקב ביטוחים', 'מעקב טסטים',
    'ניהול ספקים', 'ניהול מוסכים',
  ];

  var COMPETITORS = [
    'CarData', 'Pointer', 'Ituran', 'Otobus', 'Fleet Complete',
    'מערכות ניהול צי ישראליות', 'ספקי GPS לצי רכב',
  ];

  var AUDIENCE = [
    'עסקים עם צי רכב (5 רכבים ומעלה)', 'חברות הובלה', 'חברות שליחויות',
    'חברות ליסינג', 'חברות בנייה', 'חברות שירות', 'חברות השכרה', 'חברות הפצה',
  ];

  function buildBizProfile() {
    return {
      name: COMPANY,
      company: COMPANY,
      sector: 'ניהול, תפעול ותחזוקת ציי רכב — לא מוסך',
      mainService: 'שירות חודשי + תוכנת FleetOS לניהול צי',
      services: SERVICES.join(', '),
      ideal: 'עסקים עם 5 רכבים ומעלה — לא מוסך',
      site: 'https://dalia-c.com/',
      loc: 'ישראל',
      comp: COMPETITORS.join('\n'),
      challenges: 'מעבר ממיצג מימון/אתר ישן לחזון FleetOS ותפעול צי; SEO תחרותי בתחום ניהול צי',
      budget: MISSING,
      notGarage: true,
      model: 'שירות חודשי + תוכנה',
      software: 'FleetOS — תוכנה + אפליקציית נהגים',
    };
  }

  function buildBusinessContext() {
    return {
      clientId: CLIENT_ID,
      company: COMPANY,
      domain: 'dalia-c.com',
      services: SERVICES.slice(),
      competitors: COMPETITORS.slice(),
      strategy: {
        focusKeywords: KEYWORDS.map(function (k) { return { query: k, keyword: k }; }),
        platforms: ['אתר', 'GSC', 'GA', 'GBP', 'Ads', 'LinkedIn', 'YouTube', 'WhatsApp', 'FleetOS', 'אפליקציה'],
        audience: AUDIENCE.slice(),
        regions: ['כל הארץ'],
        positioning: 'חברה לניהול תפעול ותחזוקת צי — לא מוסך',
      },
      updatedAt: new Date().toISOString(),
    };
  }

  function buildBriefingState() {
    return {
      version: '1.0.0',
      buildType: 'אתר',
      mainGoal: 'מכירת תוכנה',
      services: [
        'FleetOS / תוכנת ניהול צי', 'תפעול צי רכב', 'תחזוקה וטיפולים',
        'GPS וטלמטיקה', 'מצלמות וחיישנים', 'ניהול נהגים', 'דוחות והתראות', 'AI בצי',
      ],
      audience: ['עסקים עם צי רכב', 'חברות ליסינג', 'מפעילי הובלות', 'קבלנים', 'ארגונים גדולים'],
      regions: ['כל הארץ'],
      competitorsAuto: COMPETITORS.slice(0, 3),
      competitorsManual: COMPETITORS.slice(3),
      keywordsSuggested: KEYWORDS.slice(),
      keywordsApproved: KEYWORDS.slice(),
      keywordsManual: [],
      platforms: ['אתר', 'GSC', 'GA', 'GBP', 'Ads', 'LinkedIn', 'YouTube', 'WhatsApp', 'FleetOS', 'אפליקציה'],
      updatedAt: new Date().toISOString(),
    };
  }

  function applyFullProfile(clearGates) {
    var biz = buildBizProfile();
    var ctx = buildBusinessContext();
    try {
      localStorage.setItem('dalia_biz', JSON.stringify(biz));
      localStorage.setItem('coco-business-context-v1', JSON.stringify(ctx));
      localStorage.setItem('coco-strategic-briefing-v1', JSON.stringify(buildBriefingState()));
      if (clearGates) {
        [
          'coco-business-summary-approved-v1', 'coco-strategic-briefing-approved-v1',
          'coco-materials-gate-v1', 'coco-seo-strategy-approved-v1',
          'coco-pre-build-report-approved-v1', 'coco-pre-build-readiness-override-v1',
        ].forEach(function (k) { localStorage.removeItem(k); });
      }
      if (window.DaliaSite && DaliaSite.SITE) {
        DaliaSite.SITE.company = COMPANY;
        if (DaliaSite.applySiteLabels) DaliaSite.applySiteLabels();
      }
    } catch (e) {
      return { ok: false, error: String(e) };
    }
    return { ok: true, company: COMPANY, keywordCount: KEYWORDS.length, serviceCount: SERVICES.length };
  }

  function approveAllGatesProgrammatically() {
    var results = {};
    applyFullProfile(false);

    if (window.BusinessSummaryApproval) {
      BusinessSummaryApproval.aggregateSummary();
      results.summary = BusinessSummaryApproval.approveSummary();
    }
    if (window.StrategicBriefing) {
      var st = buildBriefingState();
      localStorage.setItem('coco-strategic-briefing-v1', JSON.stringify(st));
      results.briefing = StrategicBriefing.approveBriefing(st);
    }
    if (window.MaterialsReadinessGate) {
      var mg = MaterialsReadinessGate.get();
      (MaterialsReadinessGate.CHECKLIST_ITEMS || []).forEach(function (it) { mg.checklist[it.id] = true; });
      mg.hasAdditionalInfo = false;
      mg.materialsConfirmed = true;
      localStorage.setItem('coco-materials-gate-v1', JSON.stringify(mg));
      results.materials = MaterialsReadinessGate.isReady();
    }
    if (window.SeoStrategy) {
      var model = SeoStrategy.buildStrategyModel();
      results.seo = SeoStrategy.approveStrategy(model);
    }
    if (window.PreBuildWorkReport) {
      PreBuildWorkReport.exportPreBuildReportArtifacts();
      PreBuildWorkReport.approveReport();
      PreBuildWorkReport.updateBuildButtonsGate();
      results.report = PreBuildWorkReport.isApproved();
    }
    return results;
  }

  window.DaliaFirstClientSeed = {
    COMPANY: COMPANY,
    CLIENT_ID: CLIENT_ID,
    KEYWORDS: KEYWORDS,
    SERVICES: SERVICES,
    COMPETITORS: COMPETITORS,
    AUDIENCE: AUDIENCE,
    buildBizProfile: buildBizProfile,
    buildBusinessContext: buildBusinessContext,
    buildBriefingState: buildBriefingState,
    applyFullProfile: applyFullProfile,
    approveAllGatesProgrammatically: approveAllGatesProgrammatically,
  };
})();
