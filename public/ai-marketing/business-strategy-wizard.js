/**
 * AI Business Strategy Wizard — 5-step flow for Staging / דליה
 */
(function () {
  'use strict';

  var STEP_LABELS = ['🏢 הכרת עסק', '🔗 חיבור נכסים', '🧠 ניתוח AI', '📄 דוח ללקוח', '✅ אישור'];
  var HINTS = ['פרטי דליה נטענו מהמערכת', 'נכסים מחוברים מ-dalia-c.com', 'הפעל ניתוח AI', 'בדוק את הדוח', 'אשר והעבר לעוזרים'];
  var CHIPS_SEC = ['לוגיסטיקה', 'פיזור ואספקה', 'מסחר', 'בנייה', 'מוסכים'];
  var CHIPS_CHAL = ['מעט לידים', 'חוסר מודעות', 'אתר ישן', 'אין תוכן שיווקי', 'תקציב מוגבל'];

  var S = { tab: 1, max: 1, analysed: false, data: {}, mounted: false };
  var rootEl = null;

  function mod() {
    return window.BusinessStrategyModule;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function v(id) {
    var e = document.getElementById(id);
    return e ? e.value.trim() : '';
  }

  function set(id, val) {
    var e = document.getElementById(id);
    if (e) e.value = val == null ? '' : val;
  }

  function toast(msg) {
    if (typeof showToast === 'function') showToast(msg);
  }

  function field(id, label, val, ph) {
    return '<div class="bw-fl"><label>' + esc(label) + '</label>' +
      '<input class="bw-inp" id="' + id + '" value="' + esc(val || '') + '" placeholder="' + esc(ph || '') + '"></div>';
  }

  function textarea(id, label, val, ph) {
    return '<div class="bw-fl"><label>' + esc(label) + '</label>' +
      '<textarea class="bw-inp bw-ta" id="' + id + '" placeholder="' + esc(ph || '') + '">' + esc(val || '') + '</textarea></div>';
  }

  function chipsHtml(id, items, selected) {
    selected = selected || [];
    return '<div id="' + id + '">' + items.map(function (t) {
      var on = selected.indexOf(t) >= 0 ? ' on' : '';
      return '<span class="bw-chip' + on + '" data-chip="' + esc(t) + '">' + esc(t) + '</span>';
    }).join('') + '</div>';
  }

  function buildShell() {
    return (
      '<div class="biz-wiz">' +
      '<div class="bw-tb">' +
      '<div class="bw-logo"><div class="bw-dot"></div>CO.CO <em style="color:var(--acc2);font-style:normal">דליה</em> — אסטרטגיית שיווק AI</div>' +
      '<div style="display:flex;gap:6px;align-items:center">' +
      '<span id="bw-client" style="font-size:11px;color:var(--w50)"></span>' +
      '<span style="font-size:10px;padding:2px 9px;border-radius:99px;background:rgba(245,158,11,.15);color:var(--yel);border:1px solid rgba(245,158,11,.25)">Staging · דליה</span>' +
      '<button type="button" class="bw-btn bw-btn-g" id="bw-back-hub" style="font-size:11px;padding:4px 10px">← מרכז</button>' +
      '</div></div>' +
      '<div class="bw-wiz"><div class="bw-steps" id="bw-steps"></div><div class="bw-pb"><div class="bw-pf" id="bw-pf" style="width:20%"></div></div></div>' +
      '<div class="bw-main" id="bw-panes"></div>' +
      '<div class="bw-footer">' +
      '<div id="bw-hint" style="font-size:11px;color:var(--w50)"></div>' +
      '<div style="display:flex;gap:8px">' +
      '<button type="button" class="bw-btn bw-btn-g" id="bw-prev" style="display:none">← חזרה</button>' +
      '<button type="button" class="bw-btn bw-btn-p" id="bw-next">הבא ←</button>' +
      '</div></div></div>'
    );
  }

  function buildPanes() {
    var d = S.data;
    return (
      '<div class="bw-pane on" id="bw-p1">' +
      '<div class="bw-sec"><div class="bw-ph-t">🏢 הכרת העסק</div><div class="bw-ph-s">פרטי דליה נטענו אוטומטית ממערכת דליה + crawl של dalia-c.com. ניתן לערוך לפני הניתוח.</div></div>' +
      '<div class="bw-sec"><div class="bw-st">פרטי העסק</div><div class="bw-card"><div class="bw-g2">' +
      field('b-name', 'שם העסק *', d.name) + field('b-sector', 'תחום *', d.sector) +
      field('b-site', 'אתר', d.site) + field('b-loc', 'מיקום', d.loc) +
      field('b-age', 'ותק', d.age) +
      '</div></div>' +
      '<div class="bw-st" style="margin-top:12px">שירותים</div><div class="bw-card">' +
      field('b-main', 'שירות מרכזי', d.mainService) +
      textarea('b-services', 'כל השירותים', d.services) +
      textarea('b-diff', 'בידול', d.diff) +
      field('b-pain', 'כאב שפותרים', d.pain) +
      field('b-usp', 'USP', d.usp) +
      '</div>' +
      '<div class="bw-st" style="margin-top:12px">קהל יעד</div><div class="bw-card">' +
      field('b-ideal', 'לקוח אידיאלי', d.ideal) + field('b-bad', 'לא מתאים', d.bad) +
      '<div class="bw-st">תחומי לקוחות</div>' + chipsHtml('sec-chips', CHIPS_SEC, d.sectors) +
      '</div>' +
      '<div class="bw-st" style="margin-top:12px">מטרות</div><div class="bw-card">' +
      textarea('b-goal', 'מטרה ל-12 חודשים', d.goal) +
      '<div class="bw-st">אתגרים</div>' + chipsHtml('chal-chips', CHIPS_CHAL, d.challenges) +
      textarea('b-comp', 'מתחרים', d.comp) + field('b-vs', 'יתרון על מתחרים', d.vs) +
      '</div></div></div>' +

      '<div class="bw-pane" id="bw-p2">' +
      '<div class="bw-sec"><div class="bw-ph-t">🔗 נכסים דיגיטליים</div><div class="bw-ph-s">נכסים שזוהו כמחוברים ב-Staging עבור dalia-c.com</div></div>' +
      '<div class="bw-sec"><div class="bw-alt bw-alt-i">ℹ️ הנכסים נמשכו מ-dashboard.json וחיבורי Google הפעילים</div>' +
      '<div class="bw-card" id="bw-connected-list"></div>' +
      '<div class="bw-alt bw-alt-w" style="margin-top:10px">GBP · Google Ads · Meta — ממתינים לאישור / חיבור (לא חוסם את האסטרטגיה)</div>' +
      '</div></div>' +

      '<div class="bw-pane" id="bw-p3">' +
      '<div class="bw-sec"><div class="bw-ph-t">🧠 ניתוח AI</div><div class="bw-ph-s">סריקת אתר + GSC + GA4 + work-plan</div></div>' +
      '<div class="bw-sec" id="bw-ana-ready" style="text-align:center;padding:24px 0">' +
      '<div style="font-size:32px;margin-bottom:10px">🚀</div>' +
      '<div style="font-weight:700;margin-bottom:8px">מוכן לניתוח</div>' +
      '<div style="font-size:12px;color:var(--w50);margin-bottom:16px" id="bw-scan-preview"></div>' +
      '<button type="button" class="bw-btn bw-btn-p" id="bw-run-analysis">▶ הפעל ניתוח AI</button></div>' +
      '<div class="bw-sec"><div class="bw-ai-box" id="bw-ai-box"><div id="bw-ai-log"></div></div>' +
      '<div id="bw-ana-done" style="display:none" class="bw-alt bw-alt-ok">✅ ניתוח הושלם — עבור לדוח ללקוח</div></div></div>' +

      '<div class="bw-pane" id="bw-p4">' +
      '<div class="bw-sec"><div class="bw-ph-t">📄 דוח אסטרטגיה</div><div class="bw-ph-s">מבוסס נתוני dalia-c.com + הקלט שלך</div></div>' +
      '<div class="bw-sec" id="bw-report"></div></div>' +

      '<div class="bw-pane" id="bw-p5">' +
      '<div class="bw-sec"><div class="bw-ph-t">✅ אישור ומעבר לעוזרים</div>' +
      '<div class="bw-alt bw-alt-i">המודול מזין עוזרים, מטרות ופעולות — לא מחליף אותם</div></div>' +
      '<div class="bw-sec"><div class="bw-st">Business Context — JSON</div><div class="bw-card"><pre class="bw-pre" id="bw-ctx-json"></pre></div>' +
      '<div id="bw-exported" style="display:none" class="bw-alt bw-alt-ok">✅ הועבר בהצלחה! עבור לעוזרים / מטרות / פעולות</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">' +
      '<button type="button" class="bw-btn bw-btn-p" id="bw-go-agents">🤖 עוזרים</button>' +
      '<button type="button" class="bw-btn bw-btn-g" id="bw-go-goals">🎯 מטרות</button>' +
      '<button type="button" class="bw-btn bw-btn-g" id="bw-go-actions">⚙️ פעולות</button>' +
      '</div></div></div>'
    );
  }

  function wireChips() {
    if (!rootEl) return;
    rootEl.querySelectorAll('.bw-chip').forEach(function (el) {
      el.addEventListener('click', function () { el.classList.toggle('on'); });
    });
  }

  function gChips(id) {
    if (!rootEl) return [];
    var box = rootEl.querySelector('#' + id);
    if (!box) return [];
    return [].map.call(box.querySelectorAll('.bw-chip.on'), function (c) { return c.getAttribute('data-chip') || c.textContent; });
  }

  function collect() {
    S.data = Object.assign(S.data, {
      name: v('b-name'), sector: v('b-sector'), site: v('b-site'), loc: v('b-loc'), age: v('b-age'),
      mainService: v('b-main'), services: v('b-services'), diff: v('b-diff'), pain: v('b-pain'), usp: v('b-usp'),
      ideal: v('b-ideal'), bad: v('b-bad'), goal: v('b-goal'), comp: v('b-comp'), vs: v('b-vs'),
      sectors: gChips('sec-chips'), challenges: gChips('chal-chips'),
      connected: S.data.connected || [],
    });
    var tb = rootEl && rootEl.querySelector('#bw-client');
    if (tb && S.data.name) tb.textContent = S.data.name;
  }

  function renderConnected() {
    var list = rootEl && rootEl.querySelector('#bw-connected-list');
    if (!list) return;
    var items = S.data.connected || [];
    list.innerHTML = items.map(function (n) {
      return '<div class="bw-rep-row"><span class="bw-bd-g">● מחובר</span><span style="margin-right:8px;font-size:13px">' + esc(n) + '</span></div>';
    }).join('') || '<div style="font-size:12px;color:var(--w50)">אין נכסים מחוברים</div>';
  }

  function buildSteps() {
    var el = rootEl && rootEl.querySelector('#bw-steps');
    if (!el) return;
    el.innerHTML = STEP_LABELS.map(function (l, i) {
      var n = i + 1;
      var cls = n < S.tab ? 'done' : (n === S.tab ? 'on' : '');
      var sn = n < S.tab ? '✓' : n;
      return '<div class="bw-step ' + cls + '" data-step="' + n + '"><div class="bw-sn">' + sn + '</div>' + l + '</div>';
    }).join('');
    el.querySelectorAll('.bw-step').forEach(function (s) {
      var n = parseInt(s.getAttribute('data-step'), 10);
      s.addEventListener('click', function () {
        if (n <= S.max) goTab(n);
      });
    });
  }

  function goTab(n) {
    if (n > S.max) { toast('השלם את השלב הנוכחי קודם'); return; }
    S.tab = n;
    rootEl.querySelectorAll('.bw-pane').forEach(function (p) { p.classList.remove('on'); });
    var pane = rootEl.querySelector('#bw-p' + n);
    if (pane) pane.classList.add('on');
    buildSteps();
    var pf = rootEl.querySelector('#bw-pf');
    if (pf) pf.style.width = (n / 5 * 100) + '%';
    var prev = rootEl.querySelector('#bw-prev');
    var next = rootEl.querySelector('#bw-next');
    if (prev) prev.style.display = n > 1 ? '' : 'none';
    if (next) next.textContent = n === 5 ? '✅ אשר ושלח ←' : 'הבא ←';
    var hint = rootEl.querySelector('#bw-hint');
    if (hint) hint.textContent = HINTS[n - 1] || '';
    if (n === 4) buildReport();
    if (n === 5) buildFinal();
    window.scrollTo(0, 0);
  }

  function nextTab() {
    var n = S.tab;
    if (n === 1 && !v('b-name') && !v('b-sector')) { toast('⚠️ שם ותחום חובה'); return; }
    if (n === 3 && !S.analysed) { toast('⚠️ הפעל ניתוח AI קודם'); return; }
    if (n === 5) { doExport(); return; }
    S.max = Math.max(S.max, n + 1);
    collect();
    goTab(n + 1);
  }

  function buildReport() {
    collect();
    var d = S.data;
    var scan = (mod() && mod().scanSiteInsights) ? mod().scanSiteInsights() : {};
    var rep = rootEl.querySelector('#bw-report');
    if (!rep) return;
    rep.innerHTML =
      '<div class="bw-card">' +
      '<div class="bw-rep-row"><div class="bw-rep-lbl">עסק</div><div class="bw-rep-val">' + esc(d.name) + ' · ' + esc(d.sector) + '</div></div>' +
      '<div class="bw-rep-row"><div class="bw-rep-lbl">אתר</div><div class="bw-rep-val">' + esc(d.site) + ' · ' + (scan.pageCount || '—') + ' עמודים</div></div>' +
      '<div class="bw-rep-row"><div class="bw-rep-lbl">GSC</div><div class="bw-rep-val">' + esc(scan.gscClicks) + ' קליקים · ' + esc(scan.keywords && scan.keywords.join(', ')) + '</div></div>' +
      '<div class="bw-rep-row"><div class="bw-rep-lbl">מטרה</div><div class="bw-rep-val">' + esc(d.goal) + '</div></div>' +
      '<div class="bw-rep-row"><div class="bw-rep-lbl">המלצה</div><div class="bw-rep-val">SEO אורגני + שיפור עמודי שירות · GBP כשיאושר · תוכן לפי work-plan</div></div>' +
      '<div class="bw-rep-row"><div class="bw-rep-lbl">פעולות פתוחות</div><div class="bw-rep-val">' + esc(scan.actionsOpen) + ' ב-work-plan · ' + esc(scan.goalsCount) + ' מטרות עמוד</div></div>' +
      '</div>';
  }

  function buildFinal() {
    collect();
    var ctx = mod() ? mod().buildBusinessContext(S.data) : {};
    var pre = rootEl.querySelector('#bw-ctx-json');
    if (pre) pre.textContent = JSON.stringify(ctx, null, 2);
  }

  function runAnalysis() {
    collect();
    var ready = rootEl.querySelector('#bw-ana-ready');
    var box = rootEl.querySelector('#bw-ai-box');
    var done = rootEl.querySelector('#bw-ana-done');
    if (ready) ready.style.display = 'none';
    if (box) box.classList.add('show');
    var scan = mod() ? mod().scanSiteInsights() : { log: ['מנתח...'] };
    var lines = scan.log || [];
    var log = rootEl.querySelector('#bw-ai-log');
    if (log) {
      log.innerHTML = lines.map(function (s, i) {
        return '<div class="bw-ai-line" id="bw-al' + i + '">' + esc(s) + '</div>';
      }).join('');
      lines.forEach(function (_, i) {
        setTimeout(function () {
          var e = rootEl.querySelector('#bw-al' + i);
          if (e) e.classList.add('show');
        }, i * 600 + 200);
      });
    }
    setTimeout(function () {
      S.analysed = true;
      S.max = Math.max(S.max, 4);
      if (done) done.style.display = 'block';
      toast('✅ ניתוח הושלם');
    }, lines.length * 600 + 800);
  }

  function doExport() {
    collect();
    var res = mod() ? mod().exportToPlatform(S.data) : { ok: false };
    if (!res.ok) { toast('⚠️ שגיאה בהעברה'); return; }
    var exp = rootEl.querySelector('#bw-exported');
    if (exp) exp.style.display = 'block';
    var next = rootEl.querySelector('#bw-next');
    if (next) next.style.display = 'none';
    toast('🚀 הועבר לעוזרים, מטרות ופעולות');
  }

  function bindEvents() {
    if (!rootEl) return;
    rootEl.querySelector('#bw-next').addEventListener('click', nextTab);
    rootEl.querySelector('#bw-prev').addEventListener('click', function () { if (S.tab > 1) goTab(S.tab - 1); });
    rootEl.querySelector('#bw-back-hub').addEventListener('click', function () {
      if (typeof goScreen === 'function') goScreen('screen-hub');
    });
    rootEl.querySelector('#bw-run-analysis').addEventListener('click', runAnalysis);
    rootEl.querySelector('#bw-go-agents').addEventListener('click', function () { goScreen('screen-agents'); });
    rootEl.querySelector('#bw-go-goals').addEventListener('click', function () { goScreen('screen-goals'); });
    rootEl.querySelector('#bw-go-actions').addEventListener('click', function () { goScreen('screen-actions'); });
    wireChips();
  }

  function prefill() {
    return (mod() ? mod().whenDataReady() : Promise.resolve()).then(function () {
      if (mod()) return mod().loadCompetitors();
    }).then(function () {
      S.data = mod() ? mod().buildSeed() : {};
      S.tab = 1;
      S.max = 1;
      S.analysed = false;
    });
  }

  function mount() {
    rootEl = document.getElementById('biz-strategy-root');
    if (!rootEl) return Promise.resolve(false);
    if (!mod() || !mod().isEnabled()) {
      rootEl.innerHTML = '<div style="padding:40px;text-align:center;color:#94a3b8">מודול אסטרטגיית עסק זמין ב-Staging ללקוח דליה בלבד</div>';
      return Promise.resolve(false);
    }
    return prefill().then(function () {
      rootEl.innerHTML = buildShell();
      rootEl.classList.add('biz-wiz');
      var panes = rootEl.querySelector('#bw-panes');
      if (panes) panes.innerHTML = buildPanes();
      renderConnected();
      buildSteps();
      goTab(1);
      var preview = rootEl.querySelector('#bw-scan-preview');
      if (preview && mod()) {
        var sc = mod().scanSiteInsights();
        preview.textContent = sc.pageCount + ' עמודים · GSC ' + (sc.gscClicks != null ? sc.gscClicks : '—') + ' קליקים';
      }
      bindEvents();
      S.mounted = true;
      return true;
    });
  }

  function open() {
    if (!mod() || !mod().isEnabled()) {
      toast('מודול זמין ב-Staging לדליה בלבד');
      if (typeof goScreen === 'function') goScreen('screen-clients');
      return Promise.resolve();
    }
    return mount().then(function () {
      if (typeof goScreen === 'function') goScreen('screen-business-strategy');
    });
  }

  window.BusinessStrategyWizard = {
    open: open,
    mount: mount,
    VERSION: '1.0.0',
  };
})();
