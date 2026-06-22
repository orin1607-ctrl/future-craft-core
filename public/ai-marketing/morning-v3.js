/**
 * Project 001 — Mockup V3: Morning briefing + Work-for-me + inline chat
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
    needsApproval: 3,
    autoDone: [
      'סנכרון GSC — 248 מילות מפתח',
      'זיהוי 9 עמודים חלשים',
      'הכנת 2 טיוטות תוכן',
    ],
    open: [
      'אישור 7 טיוטות במרכז אישורים',
      'חיבור GBP API (ממתין Google)',
      'Google Ads Basic Access (ממתין)',
    ],
    actions: [
      { id: 'a1', title: 'הגב על 5 ביקורות GBP', module: 'gbp', needsApproval: true },
      { id: 'a2', title: 'הכן פוסט GBP — מבצע חצי שנה', module: 'gbp', needsApproval: true },
      { id: 'a3', title: 'תקן Meta ב-3 עמודים', module: 'pages', needsApproval: true },
      { id: 'a4', title: 'סנכרן GSC + GA4', module: 'dashboard', needsApproval: false },
      { id: 'a5', title: 'צור מתווה מאמר — צי חשמלי', module: 'content', needsApproval: false },
    ],
  };

  var WORK_STEPS = [
    'בדיקת האתר ועמודים חלשים',
    'ניתוח SEO ומילות מפתח',
    'משיכת נתוני Search Console',
    'ניתוח Google Analytics',
    'בדיקת Google Business Profile',
    'סקירת Google Ads (ממתין API)',
    'ניתוח מתחרים',
    'סקירת מחסן תוכן',
    'יצירת דוח יומי',
    'יצירת 5 משימות חדשות',
    'הכנת 3 המלצות AI',
    'הכנת 2 טיוטות תוכן',
    'העברת 3 פריטים לאישור',
    'עדכון זיכרון מרכזי',
  ];

  function $(id) { return document.getElementById(id); }

  var AI_PRIMARY = ['morning', 'approval', 'tasks', 'settings'];

  function bareId(fullId) {
    return String(fullId || '').replace(/^sc-/, '');
  }

  function shouldUseFullNav(fullId) {
    var bare = bareId(fullId);
    if (bare === 'modules') return true;
    return AI_PRIMARY.indexOf(bare) === -1;
  }

  function setNavMode(mode) {
    document.body.classList.remove('nav-ai', 'nav-full');
    document.body.classList.add(mode === 'full' ? 'nav-full' : 'nav-ai');
    var fullNav = $('sbNavFull');
    var aiNav = $('sbNavAi');
    if (fullNav) fullNav.hidden = mode !== 'full';
    if (aiNav) aiNav.hidden = mode === 'full';
    var btn = $('modulesBtnFullNav');
    if (btn) btn.textContent = mode === 'full' ? '✓ ניווט מלא פעיל' : '📋 ניווט מלא בסרגל';
  }

  function openAllModules() {
    setNavMode('full');
    if (typeof window.gotoSc === 'function') window.gotoSc('modules');
  }

  window.CocoNavMode = {
    set: setNavMode,
    openAllModules: openAllModules,
    onGoto: function (fullId) {
      if (bareId(fullId) === 'morning') setNavMode('ai');
      else if (shouldUseFullNav(fullId)) setNavMode('full');
    },
  };


  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  function fmtDate() {
    var d = new Date();
    var days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    return days[d.getDay()] + ', ' + d.getDate() + '.' + (d.getMonth() + 1) + '.' + d.getFullYear();
  }

  function dataFromCoco() {
    var d = window.COCO && window.COCO.data;
    if (!d) return null;
    var k = d.kpis || {};
    var pending = d.badges?.pendingApproval ?? window.COCO?.state?.approvalCount ?? DEMO.needsApproval;
    return {
      greeting: 'יוני',
      businessStatus: (k.weeklyClicks?.value ? 'קליקים: ' + k.weeklyClicks.value : 'מצב שיווקי') +
        (k.avgPosition?.value ? ' · מיקום ממוצע ' + k.avgPosition.value : '') +
        (d.gbpLive?.status === 'pending_google_api_approval' ? ' · GBP ממתין לאישור' : ''),
      changes: DEMO.changes,
      topTask: DEMO.topTask,
      goals: DEMO.goals,
      recommend: DEMO.recommend,
      needsApproval: pending,
      autoDone: DEMO.autoDone,
      open: DEMO.open,
      actions: DEMO.actions,
      source: d.meta?.source || 'live',
    };
  }

  function renderList(elId, items, dotKey) {
    var el = $(elId);
    if (!el) return;
    el.innerHTML = items.map(function (it) {
      var dot = typeof it === 'string' ? 'neu' : (it.type || dotKey || 'neu');
      var text = typeof it === 'string' ? it : it.text;
      return '<li><span class="dot dot-' + dot + '"></span><span>' + esc(text) + '</span></li>';
    }).join('');
  }

  function renderGoals(goals) {
    var el = $('morningGoals');
    if (!el) return;
    el.innerHTML = goals.map(function (g) {
      return '<div class="goal-row"><div class="goal-hdr"><span>' + esc(g.name) + '</span><span>' +
        g.current + ' / ' + g.target + '</span></div><div class="goal-bar"><div class="goal-fill" style="width:' +
        g.pct + '%"></div></div></div>';
    }).join('');
  }

  function renderMorning() {
    var data = dataFromCoco() || DEMO;
    var greet = $('morningGreet');
    if (greet) greet.textContent = 'בוקר טוב, ' + data.greeting;
    var dateEl = $('morningDate');
    if (dateEl) dateEl.textContent = fmtDate();

    var status = $('morningStatus');
    if (status) status.textContent = data.businessStatus;
    var top = $('morningTopTask');
    if (top) top.textContent = data.topTask;

    var statPending = $('morningStatPending');
    if (statPending) statPending.textContent = data.needsApproval;
    var statOpen = $('morningStatOpen');
    if (statOpen) statOpen.textContent = data.open.length;
    var statRec = $('morningStatRec');
    if (statRec) statRec.textContent = data.recommend.length;
    var statAuto = $('morningStatAuto');
    if (statAuto) statAuto.textContent = data.autoDone.length;

    renderList('morningChanges', data.changes);
    renderList('morningRecommend', data.recommend.map(function (r) { return { type: 'neu', text: r }; }));
    renderList('morningApproval', data.open.slice(0, 2).concat(['ממתין לאישורך: ' + data.needsApproval + ' פריטים']).map(function (t) {
      return typeof t === 'string' ? { type: 'warn', text: t } : t;
    }));
    renderList('morningAuto', data.autoDone.map(function (t) { return { type: 'up', text: t }; }));
    renderList('morningOpen', data.open.map(function (t) { return { type: 'warn', text: t }; }));
    renderGoals(data.goals);

    var proposal = $('morningProposalText');
    if (proposal) {
      proposal.textContent = data.greeting + ', מצאתי ' + data.actions.length +
        ' פעולות שכדאי לבצע היום. האם לבצע אותן?';
    }

    window.MORNING_V3 = { data: data, actions: data.actions };
  }

  function appendChat(role, text) {
    var box = $('morningChatMsgs');
    if (!box) return;
    var div = document.createElement('div');
    div.className = 'morning-msg ' + role;
    div.innerHTML = '<div class="bubble">' + esc(text) + '</div>';
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  function morningSend(text) {
    if (!text || !text.trim()) return;
    appendChat('user', text.trim());
    var input = $('morningChatInput');
    if (input) input.value = '';

    var lower = text.trim().toLowerCase();
    if (/בצע|הכול|הכל/.test(lower)) {
      executeAllActions();
      return;
    }
    if (/משימות|הצג/.test(lower)) {
      showTasksModal();
      return;
    }
    if (/למה|ממליץ/.test(lower)) {
      appendChat('ai', 'המלצותיי מבוססות על:\n• עלייה בחיפושי "ניהול צי"\n• 5 ביקורות GBP ללא מענה\n• 3 עמודים עם CTR נמוך\n• יעד חודשי — עדיין 23% פער בקליקים');
      return;
    }
    if (/נתונים|מספרים|הראה/.test(lower)) {
      appendChat('ai', 'נתונים עיקריים (דמו / dashboard):\n• קליקים שבועיים: ' +
        (window.COCO?.data?.kpis?.weeklyClicks?.value || '3,842') +
        '\n• מילות פעילות: ' + (window.COCO?.data?.kpis?.activeKeywords?.value || '248') +
        '\n• ממתין לאישור: ' + (window.MORNING_V3?.data?.needsApproval || '7'));
      if (typeof window.gotoSc === 'function') appendChat('ai', '[[nav:modules]] — לעומק במודולים');
      return;
    }

    if (window.runAi && window.COCO_API?.hasApi) {
      window.runAi('morning', text, '🌅 בוקר AI');
      appendChat('ai', 'שולח ל-AI… (ראה גם חלונית AI אם פתוחה)');
      return;
    }

    appendChat('ai', 'אני מנהל השיווק AI שלך. נסה:\n• "בצע הכול"\n• "הצג משימות"\n• "למה אתה ממליץ?"\n• "תראה נתונים"\n\nלתשובות מלאות: הפעל npm run ai-marketing:dev');
  }

  function showTasksModal() {
    var actions = window.MORNING_V3?.actions || DEMO.actions;
    var html = '<ul class="morning-list" style="list-style:none;padding:0">' +
      actions.map(function (a, i) {
        return '<li style="padding:8px 0;border-bottom:1px solid var(--border)">' +
          (i + 1) + '. ' + esc(a.title) +
          (a.needsApproval ? ' <span class="pill pill-orange" style="font-size:10px">לאישור</span>' : '') +
          '</li>';
      }).join('') + '</ul>';
    if (typeof window.openActionModal === 'function') {
      window.openActionModal('📋 משימות להיום', html, [{ label: 'סגור', cls: 'btn-ghost' }]);
    } else {
      appendChat('ai', actions.map(function (a, i) { return (i + 1) + '. ' + a.title; }).join('\n'));
    }
  }

  function executeAllActions() {
    var actions = window.MORNING_V3?.actions || DEMO.actions;
    var approval = actions.filter(function (a) { return a.needsApproval; });
    var direct = actions.filter(function (a) { return !a.needsApproval; });

    direct.forEach(function (a) {
      if (a.module === 'dashboard' && typeof window.syncNow === 'function') window.syncNow();
    });

    approval.forEach(function (a) {
      if (typeof window.queueGbpApproval === 'function' && a.module === 'gbp') {
        window.queueGbpApproval('gbp', a.title, 'מהבוקר AI — ממתין לאישורך');
      }
    });

    appendChat('ai', 'בוצע:\n✓ ' + direct.length + ' פעולות (סנכרון / הכנה)\n⏳ ' +
      approval.length + ' פעולות הועברו למרכז אישורים — לא פורסם כלום בלי אישורך.');

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
        log.innerHTML += '<div class="done fw7 mt8">ביצעתי 14 פעולות. 3 דורשות אישור שלך.</div>';
        setTimeout(function () {
          ov.classList.remove('open');
          appendChat('ai', 'סיימתי לעבוד בשבילך:\n\n✅ 14 בדיקות ובדיקות הושלמו\n📋 5 משימות חדשות\n📝 2 טיוטות תוכן\n✅ 3 פריטים במרכז אישורים\n\nמה תרצה לעשות עכשיו?');
          if (typeof window.showToast === 'function') window.showToast('עבוד בשבילי הושלם — 3 לאישור', 'success');
          if (typeof window.gotoSc === 'function') window.gotoSc('approval');
        }, 1200);
        return;
      }
      var line = document.createElement('div');
      line.className = 'done';
      line.textContent = '✓ ' + WORK_STEPS[i];
      log.appendChild(line);
      log.scrollTop = log.scrollHeight;
      if (fill) fill.style.width = Math.round(((i + 1) / WORK_STEPS.length) * 100) + '%';
      i++;
      setTimeout(step, 280 + Math.random() * 200);
    }
    step();
  }

  function initModulesHub() {
    var grid = $('modulesGrid');
    if (!grid || grid.dataset.ready) return;
    var tiles = [
      { cat: 'דשבורד וניהול', items: [
        { sc: 'dashboard', ico: '📊', label: 'דשבורד ראשי' },
        { sc: 'executive', ico: '📈', label: 'דשבורד מנהלים' },
        { sc: 'director', ico: '🧠', label: 'מנהל AI' },
        { sc: 'approval', ico: '✅', label: 'מרכז אישורים' },
        { sc: 'notifications', ico: '🔔', label: 'התראות' },
        { sc: 'tasks', ico: '📋', label: 'משימות' },
        { sc: 'briefing', ico: '☀️', label: 'תדרוך יומי' },
      ]},
      { cat: 'אתר ותוכן', items: [
        { sc: 'pages', ico: '🌐', label: 'ניהול אתר' },
        { sc: 'landing', ico: '🚀', label: 'דפי נחיתה' },
        { sc: 'content', ico: '✍️', label: 'מפעל תוכן' },
        { sc: 'warehouse', ico: '📚', label: 'מחסן תוכן' },
        { sc: 'scheduler', ico: '📅', label: 'תזמון' },
        { sc: 'aiguide', ico: '📖', label: 'מדריך AI' },
      ]},
      { cat: 'SEO ומחקר', items: [
        { sc: 'seo', ico: '📈', label: 'מודיעין SEO' },
        { sc: 'keywords', ico: '🔑', label: 'מילות מפתח' },
        { sc: 'intel', ico: '🔭', label: 'מרכז מודיעין' },
        { sc: 'competitors', ico: '🏆', label: 'מתחרים' },
        { sc: 'news', ico: '📰', label: 'חדשות' },
      ]},
      { cat: 'Google', items: [
        { sc: 'gbp', ico: '📍', label: 'Google Business' },
        { sc: 'ads', ico: '💰', label: 'Google Ads' },
      ]},
      { cat: 'אנליטיקה ושיווק', items: [
        { sc: 'kpi', ico: '🎯', label: 'KPI' },
        { sc: 'roi', ico: '💹', label: 'ROI' },
        { sc: 'funnel', ico: '🔽', label: 'משפך' },
        { sc: 'journey', ico: '🗺️', label: 'מסע לקוח' },
        { sc: 'heatmap', ico: '🔥', label: 'מפת חום' },
        { sc: 'reports', ico: '📄', label: 'דוחות' },
        { sc: 'crm', ico: '👥', label: 'שיווק CRM' },
      ]},
      { cat: 'AI ואסטרטגיה', items: [
        { sc: 'strategy', ico: '♟️', label: 'אסטרטגיה' },
        { sc: 'ailab', ico: '🧪', label: 'מעבדת AI' },
        { sc: 'autonomous', ico: '🤖', label: 'מצב אוטונומי' },
        { sc: 'aiimage', ico: '🎨', label: 'סטודיו תמונות' },
      ]},
      { cat: 'מערכת', items: [
        { sc: 'history', ico: '🕐', label: 'היסטוריה' },
        { sc: 'health', ico: '❤️', label: 'בריאות' },
        { sc: 'fleetint', ico: '🚗', label: 'שילוב FleetOS' },
        { sc: 'settings', ico: '⚙️', label: 'חיבורים והגדרות' },
        { sc: 'permissions', ico: '🔐', label: 'הרשאות' },
        { sc: 'roadmap', ico: '🗺️', label: 'מפת דרכים' },
        { sc: 'usermanual', ico: '📘', label: 'מדריך' },
        { sc: 'qa', ico: '✔️', label: 'QA' },
      ]},
    ];
    grid.innerHTML = tiles.map(function (cat) {
      return '<div class="mod-cat"><h3>' + esc(cat.cat) + '</h3><div class="mod-grid">' +
        cat.items.map(function (t) {
          return '<button type="button" class="mod-tile" data-goto="' + t.sc + '"><span class="ico">' +
            t.ico + '</span>' + esc(t.label) + '</button>';
        }).join('') + '</div></div>';
    }).join('');
    grid.querySelectorAll('[data-goto]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (typeof window.gotoSc === 'function') window.gotoSc(btn.dataset.goto);
      });
    });
    grid.dataset.ready = '1';
  }

  function bindNavButtons() {
    $('morningBtnModules')?.addEventListener('click', openAllModules);
    $('topbarAllModules')?.addEventListener('click', openAllModules);
    $('modulesBtnFullNav')?.addEventListener('click', function () {
      var next = document.body.classList.contains('nav-full') ? 'ai' : 'full';
      setNavMode(next);
      if (next === 'full' && typeof window.gotoSc === 'function') window.gotoSc('modules');
    });
  }

  function bindEvents() {
    document.body.classList.add('v3-mode');
    setNavMode('ai');

    bindNavButtons();
    $('morningBtnWork')?.addEventListener('click', runWorkForMe);
    $('morningBtnExecAll')?.addEventListener('click', executeAllActions);
    $('morningBtnTasks')?.addEventListener('click', showTasksModal);
    $('morningBtnWhy')?.addEventListener('click', function () { morningSend('למה אתה ממליץ על זה?'); });
    $('morningBtnData')?.addEventListener('click', function () { morningSend('תראה לי את הנתונים'); });

    $('morningChatSend')?.addEventListener('click', function () {
      morningSend($('morningChatInput')?.value);
    });
    $('morningChatInput')?.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); morningSend(e.target.value); }
    });

    document.querySelectorAll('.morning-chip').forEach(function (chip) {
      chip.addEventListener('click', function () { morningSend(chip.dataset.prompt); });
    });

    $('workOverlay')?.addEventListener('click', function (e) {
      if (e.target.id === 'workOverlay') e.target.classList.remove('open');
    });
  }

  function init() {
    bindEvents();
    initModulesHub();
    renderMorning();
    appendChat('ai', 'בוקר טוב! אני מנהל השיווק AI שלך.\n\nסיכרתי את המצב למעלה. שאל אותי כל שאלה, או לחץ "עבוד בשבילי".');

    var fab = document.getElementById('cocoAiFab');
    if (fab) fab.style.display = 'none';

    var origGoto = window.gotoSc;
    if (typeof origGoto === 'function') {
      window.gotoSc = function (id) {
        origGoto(id);
        var bare = bareId(id.startsWith('sc-') ? id : 'sc-' + id);
        var fab = document.getElementById('cocoAiFab');
        if (fab) fab.style.display = (bare === 'morning') ? 'none' : '';
        if (bare === 'morning') renderMorning();
      };
    }

    var loadP = window.COCO && window.loadData;
    if (typeof loadP === 'function') {
      loadP().then(function () { renderMorning(); });
    } else if (window.COCO) {
      setTimeout(renderMorning, 500);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.MorningV3 = { render: renderMorning, workForMe: runWorkForMe, executeAll: executeAllActions };
})();
