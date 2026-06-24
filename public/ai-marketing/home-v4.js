/**
 * Project 001 — Mockup V4: AI home + dashboard + category worlds (no sidebar)
 */
(function () {
  'use strict';

  var DEMO = {
    greeting: 'יוני',
    businessStatus: 'יציב — עלייה בחשיפות, GBP ממתין לאישור Google',
    changes: [
      { type: 'up', text: 'קליקים GSC עלו 14% מאתמול' },
      { type: 'up', text: 'מילה "ניהול צי רכב" עלתה לדירוג 3' },
      { type: 'down', text: 'CTR ירד 0.2% בעמוד הבית' },
      { type: 'warn', text: '5 ביקורות GBP ללא תגובה' },
    ],
    topTask: 'הגב על 5 ביקורות Google Business + אשר פוסט GBP',
    goals: [
      { name: 'קליקים חודשיים', current: 3842, target: 5000, pct: 77 },
      { name: 'מילות בטופ-10', current: 24, target: 40, pct: 60 },
      { name: 'טיוטות שפורסמו', current: 3, target: 8, pct: 38 },
    ],
    recommend: [
      'פרסם פוסט GBP על מבצע חצי שנה',
      'כתוב מאמר: ניהול צי חשמלי',
      'תקן Meta ב-3 עמודים חלשים',
      'הגב על ביקורות GBP',
      'סנכרן נתוני GSC + GA4',
    ],
    opportunities: [
      '3 מילות מפתח חדשות עם נפח גבוה',
      'מתחרה ירד בדירוג על "תוכנת ניהול צי"',
      'עמוד /שירותים מקבל יותר חשיפות',
    ],
    needsApproval: 7,
    autoDone: ['סנכרון GSC — 248 מילות', 'זיהוי 9 עמודים חלשים', 'הכנת 2 טיוטות'],
    actions: [
      { id: 'a1', title: 'הגב על 5 ביקורות GBP', module: 'gbp', needsApproval: true },
      { id: 'a2', title: 'הכן פוסט GBP — מבצע חצי שנה', module: 'gbp', needsApproval: true },
      { id: 'a3', title: 'תקן Meta ב-3 עמודים', module: 'pages', needsApproval: true },
      { id: 'a4', title: 'סנכרן GSC + GA4', module: 'dashboard', needsApproval: false },
      { id: 'a5', title: 'צור מתווה מאמר — צי חשמלי', module: 'content', needsApproval: false },
    ],
  };

  var WORK_STEPS = [
    'בדיקת האתר ועמודים חלשים', 'ניתוח SEO ומילות מפתח', 'משיכת נתוני Search Console',
    'ניתוח Google Analytics', 'בדיקת Google Business Profile', 'סקירת Google Ads',
    'ניתוח מתחרים', 'סקירת מחסן תוכן', 'יצירת דוח יומי', 'יצירת 5 משימות חדשות',
    'הכנת 3 המלצות AI', 'הכנת 2 טיוטות תוכן', 'העברת 3 פריטים לאישור', 'עדכון זיכרון מרכזי',
  ];

  var PRD_BUTTONS = [
    {
      id: 'companies', icon: '🏢', title: 'חברות ולקוחות', sub: 'כרטיס שיווק מחובר לדליה — מקור אמת אחד',
      items: [
        { ico: '🏢', label: 'מרכז לקוחות שיווק', sc: 'mkt-hub' },
      ],
    },
    {
      id: 'status', icon: '📊', title: 'מצב נוכחי', sub: 'דשבורד, התראות, משימות, בריאות מערכת',
      items: [
        { ico: '📊', label: 'דשבורד ראשי', sc: 'dashboard' },
        { ico: '📈', label: 'דשבורד מנהלים', sc: 'executive' },
        { ico: '☀️', label: 'תדרוך יומי', sc: 'briefing' },
        { ico: '🎯', label: 'מדדי ביצוע KPI', sc: 'kpi' },
        { ico: '🔔', label: 'התראות', sc: 'notifications' },
        { ico: '📋', label: 'משימות פתוחות', sc: 'tasks' },
        { ico: '❤️', label: 'בריאות מערכת', sc: 'health' },
        { ico: '🔍', label: 'Search Console', sc: 'dashboard' },
        { ico: '📊', label: 'Google Analytics', sc: 'kpi' },
      ],
    },
    {
      id: 'goals', icon: '🎯', title: 'המטרות שלנו', sub: 'יעדים, אסטרטגיה, תחזיות, מתחרים',
      items: [
        { ico: '🎯', label: 'יעדים ו-KPI', sc: 'kpi' },
        { ico: '♟️', label: 'אסטרטגיה', sc: 'strategy' },
        { ico: '🗺️', label: 'תוכנית עבודה', sc: 'roadmap' },
        { ico: '💹', label: 'תחזיות ROI', sc: 'roi' },
        { ico: '🏆', label: 'מתחרים', sc: 'competitors' },
        { ico: '🔑', label: 'מילות מפתח', sc: 'keywords' },
        { ico: '🔭', label: 'מחקר שוק', sc: 'intel' },
        { ico: '📰', label: 'חדשות שוק', sc: 'news' },
        { ico: '🔽', label: 'משפך שיווק', sc: 'funnel' },
        { ico: '🗺️', label: 'מסע לקוח', sc: 'journey' },
      ],
    },
    {
      id: 'assets', icon: '🌐', title: 'הנכסים הדיגיטליים', sub: 'אתר, Google, Meta, קמפיינים, חיבורים',
      items: [
        { ico: '🌐', label: 'כל העמודים', sc: 'pages' },
        { ico: '🚀', label: 'דפי נחיתה', sc: 'landing' },
        { ico: '✍️', label: 'תוכן ומאמרים', sc: 'content' },
        { ico: '📚', label: 'מחסן תוכן', sc: 'warehouse' },
        { ico: '📍', label: 'Google Business', sc: 'gbp' },
        { ico: '💰', label: 'Google Ads', sc: 'ads' },
        { ico: '👥', label: 'רשתות / CRM', sc: 'crm' },
        { ico: '⚙️', label: 'חיבורים והגדרות', sc: 'settings' },
        { ico: '🔐', label: 'הרשאות', sc: 'permissions' },
        { ico: '🚗', label: 'שילוב FleetOS', sc: 'fleetint' },
      ],
    },
    {
      id: 'assistants', icon: '🤖', title: 'העוזרים שלנו', sub: 'Website AI, SEO, Analytics, Google, Meta',
      items: [
        { ico: '🧠', label: 'מנהל AI', sc: 'director' },
        { ico: '🧪', label: 'מעבדת AI', sc: 'ailab' },
        { ico: '🤖', label: 'מצב אוטונומי', sc: 'autonomous' },
        { ico: '📖', label: 'מדריך AI', sc: 'aiguide' },
        { ico: '📈', label: 'מודיעין SEO', sc: 'seo' },
        { ico: '🔭', label: 'מרכז מודיעין', sc: 'intel' },
        { ico: '🎨', label: 'סטודיו תמונות AI', sc: 'aiimage' },
        { ico: '📅', label: 'תזמון ופרסום', sc: 'scheduler' },
        { ico: '🔥', label: 'מפת חום', sc: 'heatmap' },
      ],
    },
    {
      id: 'actions', icon: '⚙️', title: 'הפעולות', sub: 'משימות מאושרות, Preview, ביצוע',
      items: [
        { ico: '📋', label: 'משימות', sc: 'tasks' },
        { ico: '✅', label: 'מרכז אישורים', sc: 'approval' },
        { ico: '📅', label: 'פרסום מתוזמן', sc: 'scheduler' },
        { ico: '🤖', label: 'פעולות אוטומטיות', sc: 'autonomous' },
      ],
    },
    {
      id: 'history', icon: '📚', title: 'ההיסטוריה', sub: 'כל שינוי, פעולה, גרסה, תוצאה',
      items: [
        { ico: '🕐', label: 'היסטוריית פעולות', sc: 'history' },
        { ico: '✅', label: 'היסטוריית אישורים', sc: 'approval' },
        { ico: '📘', label: 'מדריך שימוש', sc: 'usermanual' },
        { ico: '📚', label: 'מרכז ידע', sc: 'warehouse' },
      ],
    },
    {
      id: 'decisions', icon: '🧠', title: 'מרכז החלטות AI', sub: 'מה דחוף, מה חשוב, מה לעשות היום',
      items: [
        { ico: '💬', label: 'צ\'אט AI מנהל השיווק', sc: 'aichat' },
        { ico: '🧠', label: 'מנהל החלטות AI', sc: 'director' },
        { ico: '☀️', label: 'תדרוך והחלטות יומיות', sc: 'briefing' },
        { ico: '🔭', label: 'הזדמנויות וסיכונים', sc: 'intel' },
        { ico: '📊', label: 'דשבורד החלטות', sc: 'executive' },
      ],
    },
    {
      id: 'reports', icon: '📑', title: 'הדוחות', sub: 'SEO, Analytics, ROI, השוואות, ייצוא',
      items: [
        { ico: '📄', label: 'דוחות', sc: 'reports' },
        { ico: '💹', label: 'ROI', sc: 'roi' },
        { ico: '📈', label: 'ביצועים', sc: 'executive' },
        { ico: '⚖️', label: 'השוואות', sc: 'competitors' },
        { ico: '✔️', label: 'QA ובדיקות', sc: 'qa' },
        { ico: '🗺️', label: 'מפת דרכים', sc: 'roadmap' },
        { ico: '📦', label: 'כל המודולים', sc: 'modules' },
      ],
    },
  ];

  var CATEGORIES = PRD_BUTTONS;

  var DASH_CARDS = [
    { ico: '🌐', lbl: 'מצב האתר', key: 'site', sc: 'pages', cls: 'good' },
    { ico: '📈', lbl: 'SEO', key: 'seo', sc: 'seo', cls: '' },
    { ico: '📊', lbl: 'Google Analytics', key: 'ga', sc: 'kpi', cls: '' },
    { ico: '🔍', lbl: 'Search Console', key: 'gsc', sc: 'dashboard', cls: '' },
    { ico: '📍', lbl: 'Google Business', key: 'gbp', sc: 'gbp', cls: 'warn' },
    { ico: '💰', lbl: 'Google Ads', key: 'ads', sc: 'ads', cls: 'warn' },
    { ico: '📍', lbl: 'מיקום ממוצע', key: 'pos', sc: 'keywords', cls: 'good' },
    { ico: '👆', lbl: 'כניסות', key: 'clicks', sc: 'kpi', cls: 'good' },
    { ico: '🎯', lbl: 'לידים', key: 'leads', sc: 'funnel', cls: '' },
    { ico: '📋', lbl: 'משימות', key: 'tasks', sc: 'tasks', cls: '' },
    { ico: '✅', lbl: 'אישורים', key: 'approval', sc: 'approval', cls: 'warn' },
    { ico: '🎯', lbl: 'KPI', key: 'kpi', sc: 'kpi', cls: '' },
    { ico: '🔔', lbl: 'התראות', key: 'notif', sc: 'notifications', cls: '' },
    { ico: '🔌', lbl: 'מצב חיבורים', key: 'conn', sc: 'settings', cls: '' },
  ];

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  function fmtDate() {
    var d = new Date();
    var days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    return days[d.getDay()] + ', ' + d.getDate() + '.' + (d.getMonth() + 1) + '.' + d.getFullYear();
  }

  function isLive() {
    if (window.DaliaSite && DaliaSite.isLiveOnly && DaliaSite.isLiveOnly()) return true;
    if (typeof window.isLiveData === 'function') return window.isLiveData();
    var d = window.COCO && window.COCO.data;
    return !!(d && d.meta && (d.meta.source === 'live' || d.meta.liveOnly));
  }

  function pendingList(msg) {
    return [{ type: 'warn', text: msg || 'ממתין לחיבור' }];
  }

  function pendingActions() {
    return [{ id: 'pending', title: 'ממתין לנתונים / הרשאות', module: 'pending', needsApproval: false }];
  }

  function connSummary(conn) {
    if (!conn) return '—';
    var p = [];
    if (conn.searchConsole?.ok) p.push('GSC ✓');
    if (conn.analytics4?.ok) p.push('GA4 ✓');
    if (conn.businessProfile?.ok) p.push('GBP ✓');
    else if (conn.businessProfile) p.push('GBP ⏳');
    if (conn.googleAds?.ok) p.push('Ads ✓');
    else if (conn.googleAds) p.push('Ads ⏳');
    return p.join(' · ') || '—';
  }

  function buildLiveChanges(d) {
    var k = d.kpis || {};
    var out = [];
    if (k.weeklyClicks) out.push({ type: 'neu', text: 'קליקים GSC: ' + k.weeklyClicks.value });
    if (k.avgPosition) out.push({ type: 'neu', text: 'מיקום ממוצע: ' + k.avgPosition.value });
    if (k.ga4Sessions) out.push({ type: 'up', text: 'GA4 סשנים: ' + k.ga4Sessions.value });
    var gbp = d.gbpLive;
    if (gbp && !gbp.ok) out.push({ type: 'warn', text: 'GBP ממתין לאישור Google' });
    var ads = d.adsLive;
    if (ads && !ads.ok) out.push({ type: 'warn', text: 'Google Ads ממתין ל-Developer Token' });
    var kw = d.keywords || [];
    if (kw[0]) out.push({ type: 'up', text: 'מילה מובילה: "' + kw[0].keyword + '" — דירוג ' + kw[0].rank });
    return out.length ? out : (isLive() ? pendingList('ממתין לעדכון GSC/GA4') : DEMO.changes);
  }

  function buildLiveAutoDone(d) {
    var out = [];
    var ls = d.lastSync;
    if (ls?.timestamp) out.push('סנכרון אחרון: ' + new Date(ls.timestamp).toLocaleDateString('he-IL'));
    if (ls?.counts?.gsc_queries) out.push('GSC: ' + ls.counts.gsc_queries + ' שאילתות');
    if (ls?.counts?.ga4_pages) out.push('GA4: ' + ls.counts.ga4_pages + ' עמודים');
    var weak = d.kpis?.weakPages?.value;
    if (weak && weak !== '0') out.push('זיהוי ' + weak + ' עמודים חלשים');
    var drafts = d.badges?.pendingApproval;
    if (drafts) out.push(drafts + ' טיוטות ממתינות לאישור');
    return out.length ? out : (isLive() ? ['ממתין לנתונים'] : DEMO.autoDone);
  }

  function buildLiveActions(d) {
    var list = d.approvals || [];
    if (!list.length) return isLive() ? pendingActions() : DEMO.actions;
    return list.slice(0, 6).map(function (a, i) {
      return { id: a.id || ('live' + i), title: a.title, module: 'approval', needsApproval: true };
    });
  }

  function getData() {
    var d = window.COCO && window.COCO.data;
    var k = d && d.kpis ? d.kpis : {};
    var live = isLive();
    var pending = d?.badges?.pendingApproval ?? window.COCO?.state?.approvalCount ?? DEMO.needsApproval;
    var weakN = k.weakPages?.value || '0';
    var kwN = k.activeKeywords?.value || '0';
    return {
      greeting: DEMO.greeting,
      status: live
        ? ('קליקים: ' + (k.weeklyClicks?.value || '0') +
          ' · מיקום ' + (k.avgPosition?.value || '—') +
          ' · GA4: ' + (k.ga4Sessions?.value || d?.ga4Sessions || '—') + ' סשנים' +
          (d?.gbpLive && !d.gbpLive.ok ? ' · GBP ממתין' : ''))
        : DEMO.businessStatus,
      changes: live ? buildLiveChanges(d) : (isLive() ? pendingList() : DEMO.changes),
      topTask: live && d?.aiSeoSuggestions?.length
        ? d.aiSeoSuggestions[0].title || d.aiSeoSuggestions[0]
        : (isLive() ? 'ממתין לנתונים מ-GSC/GA4' : DEMO.topTask),
      goals: live ? [
        { name: 'קליקים GSC', current: Number(k.weeklyClicks?.value) || 0, target: 100, pct: Math.min(99, Number(k.weeklyClicks?.value) || 0) },
        { name: 'מילות מפתח', current: Number(kwN) || 0, target: 50, pct: Math.min(99, Math.round((Number(kwN) || 0) * 2)) },
        { name: 'סשנים GA4', current: Number(k.ga4Sessions?.value || d?.ga4Sessions) || 0, target: 500, pct: Math.min(99, Math.round((Number(k.ga4Sessions?.value) || 0) / 5)) },
      ] : (isLive() ? [{ name: 'ממתין', current: 0, target: 0, pct: 0 }] : DEMO.goals),
      recommend: live && d?.aiSeoSuggestions?.length
        ? d.aiSeoSuggestions.slice(0, 5).map(function (s) { return s.title || s.text || String(s); })
        : (isLive() ? ['ממתין למפתח AI'] : DEMO.recommend),
      opportunities: live
        ? ['הזדמנויות AI: ' + (k.aiOpportunities?.value || '0'), 'עמודים לשיפור: ' + weakN].concat(
          (d.keywords || []).slice(0, 2).map(function (kw) { return 'מילה: ' + kw.keyword + ' (דירוג ' + kw.rank + ')'; })
        )
        : (isLive() ? ['ממתין לנתונים'] : DEMO.opportunities),
      needsApproval: pending,
      autoDone: live ? buildLiveAutoDone(d) : (isLive() ? ['ממתין'] : DEMO.autoDone),
      actions: live ? buildLiveActions(d) : (isLive() ? pendingActions() : DEMO.actions),
      dash: {
        site: weakN !== '0' ? (weakN + ' עמודים חלשים') : (live ? 'תקין' : '9 עמודים חלשים'),
        seo: k.avgPosition?.value || '—',
        ga: k.ga4Sessions?.value || String(d?.ga4Sessions ?? '—'),
        gsc: kwN + ' מילים',
        gbp: d?.gbpLive?.ok ? 'פעיל' : (d?.gbpLive?.status === 'pending_google_api_approval' ? 'ממתין Google' : 'ממתין'),
        ads: d?.adsLive?.ok ? 'פעיל' : 'ממתין API',
        pos: k.avgPosition?.value || '—',
        clicks: k.weeklyClicks?.value || '0',
        leads: live ? '—' : '42',
        tasks: live ? String(pending) + ' פתוחות' : '12 פתוחות',
        approval: String(pending),
        kpi: live ? (k.avgCtr?.value || '—') : (isLive() ? '—' : '77%'),
        notif: live ? String(pending) : '12',
        conn: live ? connSummary(d.connections) : 'GSC+GA4 ✓',
      },
    };
  }

  function renderList(elId, items, dotKey) {
    var el = $(elId);
    if (!el) return;
    el.innerHTML = items.map(function (it) {
      var dot = typeof it === 'string' ? 'neu' : (it.type || dotKey || 'neu');
      var text = typeof it === 'string' ? it : it.text;
      return '<li><span class="v4-dot v4-dot-' + dot + '"></span><span>' + esc(text) + '</span></li>';
    }).join('');
  }

  function renderGoals(goals) {
    var el = $('v4Goals');
    if (!el) return;
    el.innerHTML = goals.map(function (g) {
      return '<div class="goal-row"><div class="goal-hdr"><span>' + esc(g.name) + '</span><span>' +
        g.current + ' / ' + g.target + '</span></div><div class="goal-bar"><div class="goal-fill" style="width:' +
        g.pct + '%"></div></div></div>';
    }).join('');
  }

  function renderHome() {
    var data = getData();
    if ($('v4Greet')) $('v4Greet').textContent = 'בוקר טוב, ' + data.greeting;
    if ($('v4Date')) $('v4Date').textContent = fmtDate();
    if ($('v4Status')) {
      var scope = window.PrdFilter && typeof window.PrdFilter.getScopeLabel === 'function'
        ? window.PrdFilter.getScopeLabel() : '';
      $('v4Status').textContent = scope ? scope + ' · ' + data.status : data.status;
    }
    if ($('v4Proposal')) {
      $('v4Proposal').textContent = data.greeting + ', מצאתי ' + data.actions.length +
        ' פעולות שכדאי לבצע היום. מה תרצה לעשות?';
    }
    renderList('v4Changes', data.changes);
    if ($('v4TopTask')) $('v4TopTask').textContent = data.topTask;
    renderGoals(data.goals);
    renderList('v4Recommend', data.recommend.map(function (t) { return { type: 'neu', text: t }; }));
    renderList('v4Approval', [
      { type: 'warn', text: data.needsApproval + ' פריטים במרכז אישורים' },
      { type: 'neu', text: 'פוסט GBP + תגובות לביקורות' },
    ]);
    renderList('v4Opportunities', data.opportunities.map(function (t) { return { type: 'up', text: t }; }));
    renderList('v4Auto', data.autoDone);
    renderDashboard(data.dash);
    updateDemoBanner();
    window.HOME_V4 = { data: data, actions: data.actions };
  }

  function renderDashboard(dash) {
    var grid = $('v4DashGrid');
    if (!grid) return;
    var isDemo = !isLive();
    grid.innerHTML = DASH_CARDS.map(function (c) {
      return '<button type="button" class="v4-dash-card ' + (c.cls || '') + '" data-goto="' + c.sc + '">' +
        '<div class="ico">' + c.ico + '</div>' +
        '<div class="lbl">' + esc(c.lbl) + '</div>' +
        '<div class="val">' + esc(dash[c.key] || '—') + '</div>' +
        (isDemo ? '<span class="demo-tag">דמו</span>' : '') +
        '</button>';
    }).join('');
    grid.querySelectorAll('[data-goto]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (typeof window.gotoSc === 'function') window.gotoSc(btn.dataset.goto);
      });
    });
  }

  function renderCategories() {
    var grid = $('v4CategoryGrid');
    if (!grid || grid.dataset.ready) return;
    grid.innerHTML = CATEGORIES.map(function (cat) {
      return '<button type="button" class="v4-world-btn cat-main" data-cat="' + cat.id + '">' +
        '<span class="w-ico">' + cat.icon + '</span>' +
        '<span class="w-text"><span class="w-title">' + esc(cat.title) + '</span>' +
        '<span class="w-sub">' + esc(cat.sub) + '</span></span></button>';
    }).join('');
    grid.querySelectorAll('[data-cat]').forEach(function (btn) {
      btn.addEventListener('click', function () { openCategory(btn.dataset.cat); });
    });
    grid.dataset.ready = '1';
  }

  function openCategory(catId) {
    var cat = CATEGORIES.find(function (c) { return c.id === catId; });
    if (!cat) return;
    window.PRD_CURRENT_CAT = catId;
    window.V4_CURRENT_CAT = catId;
    if ($('v4CatTitle')) $('v4CatTitle').innerHTML = cat.icon + ' ' + esc(cat.title);
    if ($('v4CatSub')) $('v4CatSub').textContent = cat.sub;
    var items = $('v4CategoryItems');
    if (items) {
      items.innerHTML = cat.items.map(function (it) {
        return '<button type="button" class="v4-world-btn item" data-goto="' + it.sc + '">' +
          '<span class="w-ico">' + it.ico + '</span>' +
          '<span class="w-text"><span class="w-title">' + esc(it.label) + '</span></span></button>';
      }).join('');
      items.querySelectorAll('[data-goto]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (typeof window.gotoSc === 'function') window.gotoSc(btn.dataset.goto);
        });
      });
    }
    if (typeof window.gotoSc === 'function') window.gotoSc('category');
  }

  function appendChat(role, text) {
    var box = $('v4ChatMsgs');
    if (!box) return;
    var div = document.createElement('div');
    div.className = 'v4-msg ' + role;
    div.innerHTML = '<div class="bubble">' + esc(text) + '</div>';
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  var v4ChatHistory = [];
  var v4ChatBusy = false;

  function appendChatActions(bubble, actions) {
    if (!actions || !actions.length) return;
    var row = document.createElement('div');
    row.className = 'v4-chat-actions';
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:10px';
    actions.forEach(function (act) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-outline btn-sm';
      b.textContent = act.label;
      b.addEventListener('click', function () {
        if (window.COCO_ASSISTANT?.runAction) window.COCO_ASSISTANT.runAction(act);
        else if (act.type === 'nav' && typeof window.gotoSc === 'function') window.gotoSc(act.screen);
      });
      row.appendChild(b);
    });
    bubble.appendChild(row);
  }

  function chatSend(text) {
    var t = String(text || '').trim();
    if (!t || v4ChatBusy) return;
    var input = $('v4ChatInput');
    if (input) input.value = '';
    appendChat('user', t);

    if (/בצע הכול|בצע את הכל/.test(t)) { executeAll(); return; }
    if (/הצג משימות|משימות/.test(t) && t.length < 20) { showTasks(); return; }

    var canAi = window.COCO_API?.hasApi || window.COCO_STAGING?.accessToken;
    var apiChat = window.COCO_ASSISTANT?.apiChat || window.marketingApiChat;
    var buildSys = window.COCO_ASSISTANT?.buildSystemPrompt;

    if (!canAi || !apiChat) {
      chatSendFallback(t);
      return;
    }

    v4ChatBusy = true;
    v4ChatHistory.push({ role: 'user', content: t });
    var think = document.createElement('div');
    think.className = 'v4-msg ai';
    think.innerHTML = '<div class="bubble" style="opacity:0.7">חושב…</div>';
    think.id = 'v4ChatThinking';
    $('v4ChatMsgs')?.appendChild(think);
    $('v4ChatMsgs').scrollTop = $('v4ChatMsgs').scrollHeight;

    var chatPromise = window.COCO_ASSISTANT?.apiChat
      ? window.COCO_ASSISTANT.apiChat(t, v4ChatHistory)
      : window.marketingApiChat({
        module: 'assistant',
        prompt: t,
        system: buildSys ? buildSys() : '',
        history: v4ChatHistory,
      });

    chatPromise.then(function (res) {
      think.remove();
      v4ChatBusy = false;
      if (!res.ok || !res.text) {
        appendChat('ai', res.message || 'לא הצלחתי לקבל תשובה. נסה שוב או התחבר דרך דליה.');
        return;
      }
      var parseActs = window.COCO_ASSISTANT?.parseActions;
      var strip = window.COCO_ASSISTANT?.stripMarkers;
      var actions = parseActs ? parseActs(res.text) : [];
      var clean = strip ? strip(res.text) : res.text;
      v4ChatHistory.push({ role: 'assistant', content: clean });
      if (v4ChatHistory.length > 12) v4ChatHistory = v4ChatHistory.slice(-12);
      var box = $('v4ChatMsgs');
      var div = document.createElement('div');
      div.className = 'v4-msg ai';
      var bubble = document.createElement('div');
      bubble.className = 'bubble';
      bubble.textContent = clean;
      div.appendChild(bubble);
      appendChatActions(bubble, actions);
      box.appendChild(div);
      box.scrollTop = box.scrollHeight;
    });
  }

  function chatSendFallback(t) {
    if (/למה|ממליץ/.test(t)) {
      var d = getData();
      appendChat('ai', 'המלצותיי מבוססות על נתוני המערכת:\n• קליקים: ' + d.dash.clicks +
        '\n• מיקום: ' + d.dash.pos + '\n• אישורים: ' + d.needsApproval +
        (isLive() ? '\n\n(מצב חי — GSC/GA4)' : '\n\n(מצב דמו — חבר נתונים חיים)'));
      return;
    }
    if (/נתונים|מספרים|דוח/.test(t)) {
      var data = getData();
      appendChat('ai', 'נתונים עיקריים:\n• קליקים: ' + data.dash.clicks +
        '\n• מיקום ממוצע: ' + data.dash.pos +
        '\n• GA4 סשנים: ' + data.dash.ga +
        '\n• אישורים ממתינים: ' + data.needsApproval);
      return;
    }
    appendChat('ai', 'אני מנהל השיווק AI.\nלהפעלת AI מלא — היכנס דרך דליה (Super Admin) או npm run ai-marketing:dev.\n\nשאל על:\n• מה דחוף היום?\n• איזה עמוד לשפר?\n• מה השתנה בגוגל?');
  }

  function showTasks() {
    var actions = window.HOME_V4?.actions || DEMO.actions;
    var html = actions.map(function (a, i) {
      return (i + 1) + '. ' + a.title + (a.needsApproval ? ' (לאישור)' : '');
    }).join('\n');
    appendChat('ai', '📋 משימות להיום:\n' + html);
  }

  function executeAll() {
    var actions = window.HOME_V4?.actions || DEMO.actions;
    var approval = actions.filter(function (a) { return a.needsApproval; });
    var direct = actions.filter(function (a) { return !a.needsApproval; });
    direct.forEach(function (a) {
      if (a.module === 'dashboard' && typeof window.syncNow === 'function') window.syncNow();
    });
    appendChat('ai', 'בוצע:\n✓ ' + direct.length + ' פעולות\n⏳ ' + approval.length + ' הועברו לאישורים');
    if (typeof window.showToast === 'function') {
      window.showToast('✓ ' + direct.length + ' בוצעו · ' + approval.length + ' לאישור', 'success');
    }
  }

  function runWorkForMe() {
    var ov = $('workOverlay');
    var log = $('workLog');
    var fill = $('workProgressFill');
    var title = $('workTitle');
    if (!ov || !log) return;
    ov.classList.add('open');
    log.innerHTML = '';
    if (fill) fill.style.width = '0%';
    if (title) title.textContent = 'עובד בשבילך…';
    var i = 0;
    function step() {
      if (i >= WORK_STEPS.length) {
        if (fill) fill.style.width = '100%';
        if (title) title.textContent = 'סיימתי!';
        log.innerHTML += '<div class="done fw7 mt8">ביצעתי 14 פעולות. 3 דורשות אישור.</div>';
        setTimeout(function () {
          ov.classList.remove('open');
          appendChat('ai', 'סיימתי לעבוד בשבילך — 14 פעולות, 3 לאישור.');
          if (typeof window.showToast === 'function') window.showToast('עבוד בשבילי הושלם', 'success');
          if (typeof window.gotoSc === 'function') window.gotoSc('approval');
        }, 1200);
        return;
      }
      var line = document.createElement('div');
      line.className = 'done';
      line.textContent = '✓ ' + WORK_STEPS[i];
      log.appendChild(line);
      i++;
      if (fill) fill.style.width = Math.round((i / WORK_STEPS.length) * 100) + '%';
      setTimeout(step, 260 + Math.random() * 180);
    }
    step();
  }

  function updateDemoBanner() {
    var banner = $('v4DemoBanner');
    var lbl = document.getElementById('dataSourceLabel');
    var live = isLive();
    if (lbl) lbl.textContent = 'מקור: ' + (live ? 'חי (GSC/GA4)' : 'דמו');
    if (banner) {
      if (live) {
        banner.style.display = 'flex';
        banner.innerHTML = '<span class="tag" style="background:#16a34a">חי</span>' +
          '<span>GSC + GA4 מחוברים. GBP ו-Ads ממתינים לאישור Google. סנכרון מלא מהמשרד: npm run project-001:sync-and-export</span>';
      } else {
        banner.style.display = 'flex';
      }
    }
  }

  function bindTextareaGrow() {
    var ta = $('v4ChatInput');
    if (!ta) return;
    ta.addEventListener('input', function () {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
    });
  }

  function scrollToChat() {
    var el = $('v4Chat');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('v4ChatInput')?.focus();
  }

  function injectModuleBars() {
    document.querySelectorAll('.screen').forEach(function (sc) {
      if (sc.id === 'sc-morning' || sc.id === 'sc-category' || sc.id === 'sc-modules') return;
      if (sc.querySelector('.v4-module-bar')) return;
      var bar = document.createElement('div');
      bar.className = 'v4-module-bar';
      bar.innerHTML = '<button type="button" class="v4-back-btn v4-go-dalia">← חזרה לדליה</button>' +
        '<button type="button" class="v4-back-btn v4-go-home">→ בית שיווק</button>' +
        '<button type="button" class="v4-back-btn ghost v4-go-cat" style="display:none">→ חזרה לקטגוריה</button>';
      sc.insertBefore(bar, sc.firstChild);
      bar.querySelector('.v4-go-dalia')?.addEventListener('click', function () {
        if (window.PrdDaliaNav && typeof window.PrdDaliaNav.exitToDalia === 'function') {
          window.PrdDaliaNav.exitToDalia();
        } else if (window.parent !== window) {
          window.parent.postMessage({ type: 'dalia-coco-exit', path: '/admin-home' }, '*');
        }
      });
      bar.querySelector('.v4-go-home')?.addEventListener('click', function () {
        if (typeof window.gotoSc === 'function') window.gotoSc('morning');
      });
      bar.querySelector('.v4-go-cat')?.addEventListener('click', function () {
        if (window.V4_CURRENT_CAT) openCategory(window.V4_CURRENT_CAT);
        else if (typeof window.gotoSc === 'function') window.gotoSc('morning');
      });
    });
  }

  function bindEvents() {
    document.body.classList.add('v4-mode', 'prd-mode');

    bindTextareaGrow();
    $('prdBtnDecisions')?.addEventListener('click', function () { openCategory('decisions'); });
    $('v4BtnWork')?.addEventListener('click', runWorkForMe);
    $('v4BtnExecAll')?.addEventListener('click', executeAll);
    $('v4BtnExecAll2')?.addEventListener('click', executeAll);
    $('v4BtnTasks')?.addEventListener('click', showTasks);
    $('v4BtnWhy')?.addEventListener('click', function () { chatSend('למה אתה ממליץ?'); });
    $('v4ChatSend')?.addEventListener('click', function () { chatSend($('v4ChatInput')?.value); });
    $('v4ChatInput')?.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); chatSend(e.target.value); }
    });
    document.querySelectorAll('.v4-chip').forEach(function (chip) {
      chip.addEventListener('click', function () { chatSend(chip.dataset.prompt); });
    });
    $('v4CatBackHome')?.addEventListener('click', function () {
      if (typeof window.gotoSc === 'function') window.gotoSc('morning');
    });
    $('topbarHome')?.addEventListener('click', function () {
      if (typeof window.gotoSc === 'function') window.gotoSc('morning');
    });
    $('workOverlay')?.addEventListener('click', function (e) {
      if (e.target.id === 'workOverlay') e.target.classList.remove('open');
    });
  }

  function onScreenChange(id) {
    var bare = id.replace(/^sc-/, '');
    var topHome = $('topbarHome');
    if (topHome) topHome.style.display = bare === 'morning' ? 'none' : 'inline-flex';
    document.querySelectorAll('.v4-go-cat').forEach(function (btn) {
      var cat = window.PRD_CURRENT_CAT || window.V4_CURRENT_CAT;
      btn.style.display = cat && bare !== 'category' && bare !== 'morning' && bare !== 'aichat' ? 'inline-flex' : 'none';
    });
    var isModule = bare !== 'morning' && bare !== 'category' && bare !== 'modules';
    document.body.classList.toggle('v4-has-module', isModule);
    if (bare === 'morning') renderHome();
    if (bare === 'mkt-hub' && window.MarketingClient) window.MarketingClient.renderHub();
    if (bare === 'mkt-client' && window.MarketingClient && window.MarketingClient.openClient) {
      /* render handled by marketing-client */
    }
    if (window.PrdFilter && typeof window.PrdFilter.remount === 'function') window.PrdFilter.remount();
    if (window.PrdDataGrid && typeof window.PrdDataGrid.enhanceAll === 'function') window.PrdDataGrid.enhanceAll();
    if (window.PrdDaliaNav && typeof window.PrdDaliaNav.updateScreenLabels === 'function') {
      window.PrdDaliaNav.updateScreenLabels();
    }
  }

  function init() {
    bindEvents();
    renderCategories();
    renderHome();
    injectModuleBars();
    if (window.PrdFilter && typeof window.PrdFilter.remount === 'function') window.PrdFilter.remount();
    if (window.PrdTheme && typeof window.PrdTheme.mountSettings === 'function') window.PrdTheme.mountSettings();
    window.addEventListener('prd-filter-change', function () { renderHome(); });
    appendChat('ai', 'בוקר טוב! אני מנהל השיווק AI.\nשאל אותי כל שאלה, או לחץ "עבוד בשבילי".');

    var fab = document.getElementById('cocoAiFab');
    if (fab) fab.style.display = 'none';

    var orig = window.gotoSc;
    if (typeof orig === 'function') {
      window.gotoSc = function (id) {
        var fullId = id.startsWith('sc-') ? id : 'sc-' + id;
        orig(id);
        onScreenChange(fullId);
      };
    }

    var loadP = window.loadData;
    if (typeof loadP === 'function') loadP().then(renderHome);
    else if (window.COCO) setTimeout(renderHome, 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.HomeV4 = { render: renderHome, openCategory: openCategory, categories: CATEGORIES, buttons: PRD_BUTTONS };
  window.HomePrd = window.HomeV4;
})();
