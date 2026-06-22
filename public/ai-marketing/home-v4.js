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

  var CATEGORIES = [
    {
      id: 'ai', icon: '🤖', title: 'AI מנהל שיווק', sub: 'מנהל AI, תדרוך, מעבדה, אוטונומי',
      items: [
        { ico: '🧠', label: 'מנהל AI', sc: 'director' },
        { ico: '☀️', label: 'תדרוך יומי', sc: 'briefing' },
        { ico: '🧪', label: 'מעבדת AI', sc: 'ailab' },
        { ico: '🤖', label: 'מצב אוטונומי', sc: 'autonomous' },
        { ico: '📖', label: 'מדריך AI', sc: 'aiguide' },
        { ico: '🔭', label: 'מרכז מודיעין', sc: 'intel' },
        { ico: '📊', label: 'דשבורד קלאסי', sc: 'dashboard' },
        { ico: '📈', label: 'דשבורד מנהלים', sc: 'executive' },
      ],
    },
    {
      id: 'plan', icon: '📋', title: 'תכנון ואסטרטגיה', sub: 'יעדים, תוכנית, מחקר, תחזיות',
      items: [
        { ico: '♟️', label: 'אסטרטגיה', sc: 'strategy' },
        { ico: '🎯', label: 'יעדים ו-KPI', sc: 'kpi' },
        { ico: '🗺️', label: 'תוכנית עבודה', sc: 'roadmap' },
        { ico: '💹', label: 'תחזיות ROI', sc: 'roi' },
        { ico: '🔭', label: 'מחקר שוק', sc: 'intel' },
        { ico: '🏆', label: 'מתחרים', sc: 'competitors' },
        { ico: '🔑', label: 'מילות מפתח', sc: 'keywords' },
        { ico: '📰', label: 'חדשות שוק', sc: 'news' },
      ],
    },
    {
      id: 'site', icon: '🌍', title: 'אתר', sub: 'עמודים, תוכן, נחיתה, פרסום',
      items: [
        { ico: '🌐', label: 'כל העמודים', sc: 'pages' },
        { ico: '➕', label: 'עמוד / דף חדש', sc: 'landing' },
        { ico: '✏️', label: 'עריכת עמודים', sc: 'pages' },
        { ico: '🛠️', label: 'דפי שירות', sc: 'landing' },
        { ico: '🚀', label: 'דפי נחיתה', sc: 'landing' },
        { ico: '✍️', label: 'מאמרים', sc: 'content' },
        { ico: '🎨', label: 'תמונות AI', sc: 'aiimage' },
        { ico: '🎬', label: 'תוכן וסרטונים', sc: 'content' },
        { ico: '❓', label: 'FAQ ועמודים', sc: 'pages' },
        { ico: '📝', label: 'טפסים ותפריטים', sc: 'pages' },
        { ico: '🔗', label: 'קישורים פנימיים', sc: 'pages' },
        { ico: '📈', label: 'SEO לעמודים', sc: 'seo' },
        { ico: '📚', label: 'מחסן תוכן', sc: 'warehouse' },
        { ico: '📅', label: 'פרסום ותזמון', sc: 'scheduler' },
        { ico: '✅', label: 'אישורים', sc: 'approval' },
      ],
    },
    {
      id: 'promo', icon: '🚀', title: 'קידום ושיווק', sub: 'SEO, Google, קמפיינים, מתחרים',
      items: [
        { ico: '📈', label: 'SEO', sc: 'seo' },
        { ico: '🔍', label: 'Search Console', sc: 'dashboard' },
        { ico: '📊', label: 'Google Analytics', sc: 'kpi' },
        { ico: '💰', label: 'Google Ads', sc: 'ads' },
        { ico: '📍', label: 'Google Business', sc: 'gbp' },
        { ico: '🔑', label: 'מילות מפתח', sc: 'keywords' },
        { ico: '🏆', label: 'מתחרים', sc: 'competitors' },
        { ico: '📣', label: 'קמפיינים', sc: 'ads' },
        { ico: '👥', label: 'רשתות / CRM', sc: 'crm' },
        { ico: '🔽', label: 'משפך שיווק', sc: 'funnel' },
        { ico: '🗺️', label: 'מסע לקוח', sc: 'journey' },
      ],
    },
    {
      id: 'exec', icon: '⚡', title: 'ביצוע ומשימות', sub: 'משימות, אישורים, אוטומציה',
      items: [
        { ico: '📋', label: 'משימות', sc: 'tasks' },
        { ico: '✅', label: 'אישורים', sc: 'approval' },
        { ico: '🤖', label: 'אוטומציות', sc: 'autonomous' },
        { ico: '🧠', label: 'פעולות AI', sc: 'director' },
        { ico: '🛡️', label: 'Approval Center', sc: 'approval' },
        { ico: '📅', label: 'פרסום', sc: 'scheduler' },
        { ico: '🔔', label: 'התראות', sc: 'notifications' },
      ],
    },
    {
      id: 'reports', icon: '📊', title: 'דוחות וביצועים', sub: 'KPI, ROI, לידים, השוואות',
      items: [
        { ico: '📄', label: 'דוחות', sc: 'reports' },
        { ico: '📅', label: 'דוחות יומיים', sc: 'reports' },
        { ico: '📆', label: 'דוחות שבועיים', sc: 'reports' },
        { ico: '🗓️', label: 'דוחות חודשיים', sc: 'reports' },
        { ico: '🎯', label: 'KPI', sc: 'kpi' },
        { ico: '💹', label: 'ROI', sc: 'roi' },
        { ico: '📈', label: 'ביצועים', sc: 'executive' },
        { ico: '🎯', label: 'לידים', sc: 'funnel' },
        { ico: '📍', label: 'מיקומים', sc: 'keywords' },
        { ico: '⚖️', label: 'השוואות', sc: 'competitors' },
        { ico: '🔥', label: 'מפת חום', sc: 'heatmap' },
      ],
    },
    {
      id: 'knowledge', icon: '🧠', title: 'ידע והיסטוריה', sub: 'שיחות, פעולות, מסקנות AI',
      items: [
        { ico: '🕐', label: 'היסטוריית פעולות', sc: 'history' },
        { ico: '💬', label: 'היסטוריית שיחות', sc: 'history' },
        { ico: '✅', label: 'היסטוריית אישורים', sc: 'approval' },
        { ico: '📚', label: 'מרכז ידע', sc: 'warehouse' },
        { ico: '📘', label: 'מדריך שימוש', sc: 'usermanual' },
        { ico: '💡', label: 'מסקנות AI', sc: 'history' },
        { ico: '✔️', label: 'מה הצליח', sc: 'history' },
        { ico: '⚠️', label: 'מה נכשל', sc: 'history' },
      ],
    },
    {
      id: 'settings', icon: '⚙️', title: 'חיבורים והגדרות', sub: 'Google, API, הרשאות, אבטחה',
      items: [
        { ico: '📊', label: 'Google Analytics', sc: 'settings' },
        { ico: '🔍', label: 'Search Console', sc: 'settings' },
        { ico: '💰', label: 'Google Ads', sc: 'settings' },
        { ico: '📍', label: 'Google Business', sc: 'settings' },
        { ico: '🌐', label: 'WordPress / אתר', sc: 'settings' },
        { ico: '📧', label: 'Gmail', sc: 'settings' },
        { ico: '📁', label: 'Drive / Docs / Sheets', sc: 'settings' },
        { ico: '☁️', label: 'Cloudflare / API', sc: 'settings' },
        { ico: '📘', label: 'Facebook / Meta', sc: 'settings' },
        { ico: '📸', label: 'Instagram', sc: 'settings' },
        { ico: '💼', label: 'LinkedIn', sc: 'settings' },
        { ico: '▶️', label: 'YouTube', sc: 'settings' },
        { ico: '💬', label: 'WhatsApp', sc: 'settings' },
        { ico: '🤖', label: 'ChatGPT', sc: 'settings' },
        { ico: '🧠', label: 'Claude', sc: 'settings' },
        { ico: '✨', label: 'Gemini', sc: 'settings' },
        { ico: '👤', label: 'משתמשים והרשאות', sc: 'permissions' },
        { ico: '🔐', label: 'אבטחה', sc: 'permissions' },
        { ico: '❤️', label: 'בריאות מערכת', sc: 'health' },
        { ico: '🚗', label: 'שילוב FleetOS', sc: 'fleetint' },
        { ico: '✔️', label: 'QA ובדיקות', sc: 'qa' },
        { ico: '🗺️', label: 'מפת דרכים', sc: 'roadmap' },
      ],
    },
  ];

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

  function getData() {
    var d = window.COCO && window.COCO.data;
    var k = d && d.kpis ? d.kpis : {};
    var pending = d?.badges?.pendingApproval ?? window.COCO?.state?.approvalCount ?? DEMO.needsApproval;
    return {
      greeting: DEMO.greeting,
      status: (k.weeklyClicks?.value ? 'קליקים: ' + k.weeklyClicks.value : DEMO.businessStatus) +
        (k.avgPosition?.value ? ' · מיקום ' + k.avgPosition.value : '') +
        (d?.gbpLive?.status === 'pending_google_api_approval' ? ' · GBP ממתין' : ''),
      changes: DEMO.changes,
      topTask: DEMO.topTask,
      goals: DEMO.goals,
      recommend: DEMO.recommend,
      opportunities: DEMO.opportunities,
      needsApproval: pending,
      autoDone: DEMO.autoDone,
      actions: DEMO.actions,
      dash: {
        site: '9 עמודים חלשים',
        seo: k.avgPosition?.value || '8.3',
        ga: k.weeklyClicks?.value || '3,842',
        gsc: '248 מילות',
        gbp: d?.gbpLive?.status === 'pending_google_api_approval' ? 'ממתין' : 'פעיל',
        ads: 'ממתין API',
        pos: k.avgPosition?.value || '8.3',
        clicks: k.weeklyClicks?.value || '3,842',
        leads: '42',
        tasks: '12 פתוחות',
        approval: String(pending),
        kpi: '77%',
        notif: '12',
        conn: 'GSC+GA4 ✓',
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
    if ($('v4Status')) $('v4Status').textContent = data.status;
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
    var isDemo = !(window.COCO && window.COCO.data && window.COCO.data.meta && window.COCO.data.meta.source === 'live');
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
        '<span class="w-title">' + esc(cat.title) + '</span>' +
        '<span class="w-sub">' + esc(cat.sub) + '</span></button>';
    }).join('');
    grid.querySelectorAll('[data-cat]').forEach(function (btn) {
      btn.addEventListener('click', function () { openCategory(btn.dataset.cat); });
    });
    grid.dataset.ready = '1';
  }

  function openCategory(catId) {
    var cat = CATEGORIES.find(function (c) { return c.id === catId; });
    if (!cat) return;
    window.V4_CURRENT_CAT = catId;
    if ($('v4CatTitle')) $('v4CatTitle').innerHTML = cat.icon + ' ' + esc(cat.title);
    if ($('v4CatSub')) $('v4CatSub').textContent = cat.sub;
    var items = $('v4CategoryItems');
    if (items) {
      items.innerHTML = cat.items.map(function (it) {
        return '<button type="button" class="v4-world-btn item" data-goto="' + it.sc + '">' +
          '<span class="w-ico">' + it.ico + '</span>' +
          '<span class="w-title">' + esc(it.label) + '</span></button>';
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

  function chatSend(text) {
    var t = String(text || '').trim();
    if (!t) return;
    var input = $('v4ChatInput');
    if (input) input.value = '';
    appendChat('user', t);
    var low = t.toLowerCase();
    if (/בצע הכול|בצע את הכל/.test(t)) { executeAll(); return; }
    if (/הצג משימות|משימות/.test(t) && t.length < 20) { showTasks(); return; }
    if (/למה|ממליץ/.test(t)) {
      appendChat('ai', 'המלצותיי מבוססות על:\n• ירידת CTR בעמוד הבית\n• 5 ביקורות GBP ללא מענה\n• עלייה של מתחרה על מילת מפתח מרכזית\n• פערי תוכן בנושא צי חשמלי');
      return;
    }
    if (/נתונים|מספרים|דוח/.test(t)) {
      appendChat('ai', 'נתונים עיקריים:\n• קליקים: 3,842 (+14%)\n• מיקום ממוצע: 8.3\n• אישורים ממתינים: ' + (getData().needsApproval) + '\n\nלפירוט — כרטיסי הדשבורד למטה או קטגוריית דוחות.');
      return;
    }
    appendChat('ai', 'אני מנהל השיווק AI. שאל על:\n• מה דחוף היום?\n• איזה עמוד לשפר?\n• מה השתנה בגוגל?\n• מה המתחרים עשו?');
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
    var isLive = window.COCO && window.COCO.data && window.COCO.data.meta && window.COCO.data.meta.source === 'live';
    if (lbl) lbl.textContent = 'מקור: ' + (isLive ? 'חי (GSC/GA4)' : 'דמו');
    if (banner) banner.style.display = isLive ? 'none' : 'flex';
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
      bar.innerHTML = '<button type="button" class="v4-back-btn v4-go-home">→ חזרה לבית</button>' +
        '<button type="button" class="v4-back-btn ghost v4-go-cat" style="display:none">→ חזרה לקטגוריה</button>';
      sc.insertBefore(bar, sc.firstChild);
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
    document.body.classList.add('v4-mode');

    bindTextareaGrow();
    $('v4BtnWork')?.addEventListener('click', runWorkForMe);
    $('v4BtnExecAll')?.addEventListener('click', executeAll);
    $('v4BtnExecAll2')?.addEventListener('click', executeAll);
    $('v4BtnTasks')?.addEventListener('click', showTasks);
    $('v4BtnWhy')?.addEventListener('click', function () { chatSend('למה אתה ממליץ?'); });
    $('v4BtnAsk')?.addEventListener('click', scrollToChat);
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
      btn.style.display = window.V4_CURRENT_CAT && bare !== 'category' && bare !== 'morning' ? 'inline-flex' : 'none';
    });
    if (bare === 'morning') renderHome();
  }

  function init() {
    bindEvents();
    renderCategories();
    renderHome();
    injectModuleBars();
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

    var loadP = window.COCO && window.loadData;
    if (typeof loadP === 'function') loadP().then(renderHome);
    else if (window.COCO) setTimeout(renderHome, 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.HomeV4 = { render: renderHome, openCategory: openCategory, categories: CATEGORIES };
})();
