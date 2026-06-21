/**
 * CO.CO — Floating AI Assistant Layer
 * Works on every screen; does not replace existing navigation.
 */
(function () {
  'use strict';

  var SCREEN_GUIDE = {
    dashboard: 'דשבורד ראשי — KPI וסטטוס שבועי',
    director: 'מנהל AI — ניתוחים והמלצות',
    keywords: 'מילות מפתח — מחקר ודירוג',
    content: 'מפעל תוכן — יצירת מאמרים וטיוטות',
    strategy: 'אסטרטגיית AI — תוכנית שיווק',
    ailab: 'מעבדת AI — ניסויים ו-A/B',
    intel: 'מרכז מודיעין — הזדמנויות GSC',
    competitors: 'ניתוח מתחרים',
    seo: 'מודיעין SEO',
    approval: 'מרכז אישורים — טיוטות ממתינות',
    briefing: 'תדרוך יומי',
    landing: 'דפי נחיתה',
    pages: 'ניהול אתר',
    gbp: 'Google Business Profile',
    ads: 'Google Ads',
    reports: 'דוחות',
    usermanual: 'מדריך שימוש',
    aiguide: 'מדריך AI',
  };

  var QUICK_CHIPS = [
    'תעשה לי סיכום יומי',
    'מה הכי דחוף?',
    'תכין תוכנית עבודה לשבוע',
    'מה ממתין לאישור?',
    'הזדמנויות SEO',
    'המלצות קידום',
  ];

  var NAV_RE = /\[\[nav:([a-z0-9_-]+)\]\]/gi;
  var SYNC_RE = /\[\[action:sync\]\]/gi;
  var RUNAI_RE = /\[\[action:runai:([a-z0-9_-]+)(?::([^\]]+))?\]\]/gi;

  var state = { open: false, busy: false, history: [], recognition: null, micOk: false };

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function currentScreenId() {
    var active = document.querySelector('.screen.active');
    if (!active) return 'dashboard';
    return active.id.replace(/^sc-/, '');
  }

  function currentScreenLabel() {
    var id = 'sc-' + currentScreenId();
    return (window.screenLabels && window.screenLabels[id]) || id;
  }

  function buildDataContext() {
    var d = window.COCO && window.COCO.data;
    if (!d) return 'נתוני דשבורד: לא נטענו עדיין.';
    var k = d.kpis || {};
    var lines = [
      'מקור נתונים: ' + (d.meta?.source || 'demo'),
      'מיקום ממוצע: ' + (k.avgPosition?.value || '—'),
      'קליקים שבועיים: ' + (k.weeklyClicks?.value || '—'),
      'חשיפות: ' + (k.weeklyImpressions?.value || '—'),
      'CTR: ' + (k.avgCtr?.value || '—'),
      'מילות מפתח פעילות: ' + (k.activeKeywords?.value || '—'),
      'טיוטות ממתינות לאישור: ' + (d.badges?.pendingApproval ?? window.COCO?.state?.approvalCount ?? '—'),
      'הזדמנויות AI: ' + (k.aiOpportunities?.value || '—'),
      'עמודים חלשים: ' + (k.weakPages?.value || '—'),
    ];
    if (d.keywords?.length) {
      lines.push('מילות מפתח מובילות: ' + d.keywords.slice(0, 5).map(function (kw) {
        return kw.keyword + ' (דירוג ' + kw.rank + ')';
      }).join(', '));
    }
    if (d.approvals?.length) {
      lines.push('פריטים לאישור: ' + d.approvals.map(function (a) { return a.title; }).join('; '));
    }
    return lines.join('\n');
  }

  function buildSystemPrompt() {
    var screens = Object.keys(SCREEN_GUIDE).map(function (id) {
      return '- ' + id + ': ' + SCREEN_GUIDE[id];
    }).join('\n');

    return [
      'אתה מנהל השיווק AI של CO.CO דליה (dalia-c.com).',
      'תפקידך: להוביל את המשתמש "יוני" בתוך מערכת ניהול שיווק — בעברית, ברור, ידידותי ומקצועי.',
      'אתה יודע את המסכים במערכת ומפנה אליהם. אתה מסביר איפה ללחוץ ומה לעשות.',
      'השתמש בנתוני הדשבורד שסופקו — אל תמציא מספרים.',
      '',
      'מסך נוכחי: ' + currentScreenLabel() + ' (' + currentScreenId() + ')',
      '',
      'נתונים חיים:',
      buildDataContext(),
      '',
      'מסכים זמינים (להפניה):',
      screens,
      '',
      'פקודות מיוחדות (הוסף בסוף התשובה כשמתאים):',
      '[[nav:SCREEN_ID]] — פתיחת מסך (לדוגמה [[nav:keywords]] [[nav:approval]] [[nav:content]])',
      '[[action:sync]] — סנכרון Google Sheets + GSC + GA4',
      '[[action:runai:MODULE:בקשה קצרה]] — הרצת מודול AI (לדוגמה [[action:runai:content:כתוב מתווה מאמר]])',
      '',
      'כללי:',
      '- ענה בנקודות כשמתאים. סכם יומי = מה קרה, מה דחוף, מה לעשות.',
      '- פרסום/אישור סופי תמיד דורש אישור המשתמש — הפנה ל"מרכז אישורים".',
      '- אם אין OpenAI — הסבר להפעיל npm run ai-marketing:dev ו-.env.openai',
    ].join('\n');
  }

  function stripMarkers(text) {
    return String(text || '')
      .replace(NAV_RE, '')
      .replace(SYNC_RE, '')
      .replace(RUNAI_RE, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function parseActions(text) {
    var actions = [];
    var nav;
    NAV_RE.lastIndex = 0;
    while ((nav = NAV_RE.exec(text))) {
      var sid = nav[1];
      var label = (window.screenLabels && window.screenLabels['sc-' + sid]) || sid;
      actions.push({ type: 'nav', screen: sid, label: '↗ ' + label });
    }
    SYNC_RE.lastIndex = 0;
    if (SYNC_RE.test(text)) {
      actions.push({ type: 'sync', label: '🔄 סנכרן נתונים' });
    }
    RUNAI_RE.lastIndex = 0;
    var run;
    while ((run = RUNAI_RE.exec(text))) {
      actions.push({ type: 'runai', module: run[1], prompt: (run[2] || '').trim(), label: '🤖 הרץ: ' + run[1] });
    }
    return actions;
  }

  function appendMsg(role, text, actions) {
    var box = $('cocoAiMsgs');
    if (!box) return;
    var el = document.createElement('div');
    el.className = 'coco-ai-msg ' + role;
    el.textContent = text;
    if (actions && actions.length) {
      var row = document.createElement('div');
      row.className = 'coco-ai-actions';
      actions.forEach(function (act) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'coco-ai-act' + (act.type === 'nav' ? ' primary' : '');
        b.textContent = act.label;
        b.addEventListener('click', function () { runAction(act); });
        row.appendChild(b);
      });
      el.appendChild(row);
    }
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;
  }

  function runAction(act) {
    if (act.type === 'nav' && typeof window.gotoSc === 'function') {
      window.gotoSc(act.screen);
      if (typeof window.showToast === 'function') window.showToast('↗ ' + act.label.replace(/^↗\s*/, ''), 'info');
      return;
    }
    if (act.type === 'sync' && typeof window.syncNow === 'function') {
      window.syncNow();
      return;
    }
    if (act.type === 'runai' && typeof window.runAi === 'function') {
      window.runAi(act.module, act.prompt || 'ניתוח קצר', '🤖 ' + act.module);
      return;
    }
  }

  function setOpen(open) {
    state.open = open;
    $('cocoAiPanel')?.classList.toggle('open', open);
    $('cocoAiBackdrop')?.classList.toggle('open', open);
    $('cocoAiPanel')?.setAttribute('aria-hidden', open ? 'false' : 'true');
    $('cocoAiBackdrop')?.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) {
      $('cocoAiInput')?.focus();
      if (!$('cocoAiMsgs')?.children.length) {
        appendMsg('bot', 'שלום יוני 👋\nאני מנהל השיווק AI.\n\nשאל אותי כל דבר — סיכום יומי, מה דחוף, מילות מפתח, תוכן, SEO — ואני אוביל אותך למסך הנכון.');
      }
    }
  }

  function apiChat(prompt) {
    var api = window.COCO_API;
    if (!api?.hasApi) {
      return Promise.resolve({
        ok: false,
        message: 'AI זמין בפיתוח מקומי: npm run ai-marketing:dev + .env.openai',
      });
    }
    return api.fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assistant: true,
        module: 'assistant',
        system: buildSystemPrompt(),
        prompt: prompt,
        history: state.history,
        max_tokens: 1100,
      }),
    }).then(function (r) {
      return { ok: r.ok && r.data?.ok, text: r.data?.text, message: r.data?.message };
    }).catch(function (e) {
      return { ok: false, message: e.message };
    });
  }

  function sendMessage(text) {
    var msg = (text || $('cocoAiInput')?.value || '').trim();
    if (!msg || state.busy) return;
    $('cocoAiInput').value = '';
    appendMsg('user', msg);
    state.history.push({ role: 'user', content: msg });
    state.busy = true;
    var thinking = document.createElement('div');
    thinking.className = 'coco-ai-msg bot thinking';
    thinking.textContent = 'חושב…';
    thinking.id = 'cocoAiThinking';
    $('cocoAiMsgs')?.appendChild(thinking);
    $('cocoAiMsgs').scrollTop = $('cocoAiMsgs').scrollHeight;

    apiChat(msg).then(function (res) {
      thinking.remove();
      state.busy = false;
      if (!res.ok || !res.text) {
        appendMsg('bot', res.message || 'לא הצלחתי לקבל תשובה. בדוק חיבור OpenAI.');
        return;
      }
      var actions = parseActions(res.text);
      var clean = stripMarkers(res.text);
      state.history.push({ role: 'assistant', content: clean });
      if (state.history.length > 12) state.history = state.history.slice(-12);
      appendMsg('bot', clean, actions);
    });
  }

  function initChips() {
    var box = $('cocoAiChips');
    if (!box) return;
    QUICK_CHIPS.forEach(function (label) {
      var c = document.createElement('button');
      c.type = 'button';
      c.className = 'coco-ai-chip';
      c.textContent = label;
      c.addEventListener('click', function () { sendMessage(label); });
      box.appendChild(c);
    });
  }

  function initMic() {
    var btn = $('cocoAiMic');
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR || !btn) {
      if (btn) { btn.classList.add('disabled'); btn.title = 'מיקרופון לא נתמך בדפדפן זה'; }
      return;
    }
    state.micOk = true;
    var rec = new SR();
    rec.lang = 'he-IL';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    state.recognition = rec;

    rec.onresult = function (e) {
      var t = e.results[0][0].transcript;
      $('cocoAiInput').value = t;
      btn.classList.remove('listening');
    };
    rec.onerror = function () { btn.classList.remove('listening'); };
    rec.onend = function () { btn.classList.remove('listening'); };

    btn.addEventListener('click', function () {
      if (btn.classList.contains('listening')) {
        rec.stop();
        btn.classList.remove('listening');
        return;
      }
      try {
        rec.start();
        btn.classList.add('listening');
      } catch (e) {
        if (typeof window.showToast === 'function') window.showToast('לא ניתן להפעיל מיקרופון', 'warn');
      }
    });
  }

  function init() {
    initChips();
    initMic();
    if (new URLSearchParams(location.search).get('embedded') === '1' || window.self !== window.top) {
      var fab = document.getElementById('cocoAiFab');
      var panel = document.getElementById('cocoAiPanel');
      var backdrop = document.getElementById('cocoAiBackdrop');
      if (fab) fab.style.display = 'none';
      if (panel) panel.style.display = 'none';
      if (backdrop) backdrop.style.display = 'none';
    }
    $('cocoAiFab')?.addEventListener('click', function () { setOpen(!state.open); });
    $('cocoAiClose')?.addEventListener('click', function () { setOpen(false); });
    $('cocoAiBackdrop')?.addEventListener('click', function () { setOpen(false); });
    $('cocoAiSend')?.addEventListener('click', function () { sendMessage(); });
    $('cocoAiInput')?.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && state.open) setOpen(false);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.COCO_ASSISTANT = { open: function () { setOpen(true); }, send: sendMessage, micSupported: function () { return state.micOk; } };
})();
