/**
 * Website Builder Wizard — in-screen staging flow with preview completion.
 */
(function () {
  'use strict';

  var strategyRoot = null;
  var builderRoot = null;
  var SHELL_HTML = `
<div class="tb">
  <div style="font-size:13px;font-weight:800;">🌐 Website Builder AI</div>
  <div style="display:flex;gap:8px;align-items:center;">
    <span id="wb-company" style="font-size:11px;color:var(--w50);"></span>
    <button class="btn btn-g" style="padding:4px 10px;font-size:11px;" onclick="closeWebsiteBuilder()">חזרה לאסטרטגיה</button>
  </div>
</div>
<div class="wiz">
  <div id="wb-steps" class="steps"></div>
  <div class="pb"><div id="wb-pf" class="pf"></div></div>
</div>
<div class="main">
  <div class="pane on" id="w1">
    <div class="t">1. ניתוח עסקי ואפיון אתר</div>
    <div class="s">המערכת קוראת את Business Context ומתרגמת אותו לאסטרטגיית אתר.</div>
    <div class="card">
      <div class="kpi">
        <div class="pill">עסק: <span id="wb-k-company">—</span></div>
        <div class="pill">שירות מרכזי: <span id="wb-k-service">—</span></div>
        <div class="pill">אתר קיים: <span id="wb-k-site">—</span></div>
        <div class="pill">תקציב: <span id="wb-k-budget">—</span></div>
      </div>
    </div>
    <div class="card"><div id="wb-analysis-log" class="s">מוכן לניתוח.</div></div>
  </div>

  <div class="pane" id="w2">
    <div class="t">2. מבנה אתר (Site Map)</div>
    <div class="s">מבנה מומלץ בהתאם ליעדים העסקיים.</div>
    <div class="card"><textarea id="wb-structure" class="ta">דף בית
עמוד שירות ראשי
עמוד פתרונות לפי מגזר
עמוד אודות
בלוג מקצועי
עמוד יצירת קשר</textarea></div>
  </div>

  <div class="pane" id="w3">
    <div class="t">3. יצירת תוכן שיווקי</div>
    <div class="s">טיוטת מסרים ראשיים, כותרות ותועלות.</div>
    <div class="card"><textarea id="wb-content" class="ta">כותרת ראשית: פתרונות חכמים לניהול ותפעול צי רכב
תת כותרת: חיסכון בעלויות, שליטה מלאה ושירות מקצועי 24/7
CTA: קבלו אפיון ללא התחייבות</textarea></div>
  </div>

  <div class="pane" id="w4">
    <div class="t">4. עיצוב וחווית משתמש</div>
    <div class="s">הגדרת קו עיצוב בסיסי בהתאם למותג.</div>
    <div class="card"><textarea id="wb-design" class="ta">סגנון: מקצועי נקי
צבעים: כחול כהה + הדגשות ירוק
טיפוגרפיה: Heebo
דגש: קריאות גבוהה במובייל</textarea></div>
  </div>

  <div class="pane" id="w5">
    <div class="t">5. SEO On-Page</div>
    <div class="s">מיפוי מטא-דאטה בסיסי ומילות מפתח.</div>
    <div class="card"><textarea id="wb-seo" class="ta">Title: ניהול צי רכב לעסקים | דליה
Description: פתרונות ניהול ותחזוקת צי רכב לעסקים בכל הארץ.
Keywords: ניהול צי רכב, תפעול צי, GPS לצי</textarea></div>
  </div>

  <div class="pane" id="w6">
    <div class="t">6. תצוגה מקדימה מהירה</div>
    <div class="s">בדיקה לפני בנייה של תצוגת האתר הסופית.</div>
    <div class="card">
      <div class="info alt">השלב הבא מייצר תצוגת דמו מלאה מתוך הנתונים העסקיים.</div>
      <div id="wb-preview" style="margin-top:10px;color:var(--w80);font-size:12px;"></div>
    </div>
  </div>

  <div class="pane" id="w7">
    <div class="t">7. סיום ובניית Preview</div>
    <div class="s">לחיצה על סיום בונה תצוגת אתר דמו בתוך המערכת (ללא deploy אמיתי).</div>
    <div class="card"><div id="wb-deploy-status" class="warn alt">ממתין ללחיצה על סיום.</div></div>
    <div class="card"><pre id="wb-json" style="font-size:10px;color:#93c5fd;line-height:1.7;white-space:pre-wrap;"></pre></div>
    <div id="wb-complete" style="display:none;">
      <div class="card">
        <div class="ok alt">✅ האתר נבנה כתצוגת Preview (דמו).</div>
        <div style="margin-top:10px;font-size:11px;color:var(--w50);" id="wb-complete-note"></div>
      </div>
      <div class="card">
        <div style="font-size:12px;font-weight:700;margin-bottom:8px;">תצוגה מקדימה</div>
        <iframe id="wb-preview-frame" style="width:100%;height:360px;border:1px solid var(--w10);border-radius:10px;background:#fff;" title="Website preview"></iframe>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
        <button class="btn btn-p" onclick="wbContinueToAgents()">המשך לעוזרים</button>
        <button class="btn btn-g" onclick="wbGo(6)">חזרה לעריכה</button>
        <button class="btn btn-g" onclick="wbToast('🚧 Deploy אמיתי יתווסף בשלב הבא')">Deploy (Demo)</button>
      </div>
    </div>
  </div>
</div>
<div class="footer">
  <div id="wb-hint" style="font-size:11px;color:var(--w50);">שלב 1 מתוך 7</div>
  <div style="display:flex;gap:8px;">
    <button class="btn btn-g" id="wb-back" onclick="wbPrev()" style="display:none;">← חזרה</button>
    <button class="btn btn-p" id="wb-next" onclick="wbNext()">הבא ←</button>
  </div>
</div>
<div id="wb-toast"></div>`;

  var WB_STEPS = ['ניתוח', 'מבנה', 'תוכן', 'עיצוב', 'SEO', 'תצוגה', 'סיום'];
  var WB = { tab: 1, context: null, strategy: null, output: {}, built: false };

  function parseLs(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function buildStepBar() {
    var el = document.getElementById('wb-steps');
    if (!el) return;
    el.innerHTML = WB_STEPS.map(function (name, i) {
      return '<div class="step ' + (i === 0 ? 'on' : '') + '" id="wbs' + (i + 1) + '"><div class="sn">' + (i + 1) + '</div>' + name + '</div>';
    }).join('');
  }

  function runAnalysisLog() {
    var lines = [
      'קורא הקשר עסקי מ-dalia_biz',
      'מאמת Business Context מ-coco-business-context-v1',
      'מייצר מבנה אתר לפי שירות וקהל יעד',
      'מכין תבניות תוכן והנעה לפעולה',
    ];
    var box = document.getElementById('wb-analysis-log');
    if (!box) return;
    var i = 0;
    box.innerHTML = '';
    var timer = setInterval(function () {
      if (i >= lines.length) { clearInterval(timer); return; }
      box.innerHTML += '<div>• ' + lines[i] + '</div>';
      i += 1;
    }, 300);
  }

  function generatePreviewHtml() {
    var company = WB.output.company || WB.strategy.company || WB.context.name || 'העסק שלך';
    var service = WB.strategy.mainService || WB.context.mainService || 'השירות המרכזי';
    var site = WB.output.site || WB.strategy.site || WB.context.site || '';
    var structure = (WB.output.structure || '').split('\n').filter(Boolean);
    var features = (WB.output.content || '').split('\n').filter(Boolean).slice(0, 4);
    var pages = structure.length ? structure : ['דף בית', 'שירותים', 'אודות', 'צור קשר'];
    var pageLinks = pages.map(function (p, idx) {
      return '<a href="#p' + idx + '" style="color:#fff;text-decoration:none;padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.12);font-size:12px;">' + esc(p) + '</a>';
    }).join(' ');
    var featuresHtml = features.map(function (f) {
      return '<li style="margin-bottom:8px;">' + esc(f) + '</li>';
    }).join('');

    return '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>' + esc(company) + '</title>' +
      '<style>body{font-family:Heebo,Arial,sans-serif;margin:0;background:#f8fafc;color:#0f172a}header{background:#0b1735;color:#fff;padding:18px}main{padding:20px;max-width:980px;margin:0 auto}.hero{background:#fff;border:1px solid #dbeafe;border-radius:12px;padding:18px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:14px}.card{background:#fff;border:1px solid #cbd5e1;border-radius:10px;padding:12px}.tag{display:inline-block;margin-top:8px;padding:4px 8px;border-radius:99px;background:#eff6ff;color:#1d4ed8;font-size:12px}footer{margin-top:18px;font-size:12px;color:#334155}</style>' +
      '</head><body><header><div style="font-size:20px;font-weight:800;">' + esc(company) + '</div><div style="margin-top:6px;font-size:13px;">' + esc(service) + '</div><div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">' + pageLinks + '</div></header>' +
      '<main><section class="hero"><h1 style="margin:0 0 8px;">' + esc(company) + ' — אתר שיווקי</h1><p style="margin:0 0 12px;">תצוגת Preview שנבנתה אוטומטית מתוך נתוני האסטרטגיה.</p><span class="tag">Preview Demo</span></section>' +
      '<section class="cards">' + pages.slice(0, 4).map(function (p) {
        return '<article class="card"><h3 style="margin:0 0 8px;">' + esc(p) + '</h3><p style="margin:0;color:#334155;">עמוד תבנית שנוצר מהמבנה שהוגדר ב-Builder.</p></article>';
      }).join('') + '</section>' +
      '<section class="hero" style="margin-top:14px;"><h2 style="margin:0 0 10px;font-size:18px;">תוכן שיווקי</h2><ul style="margin:0;padding-right:18px;">' + (featuresHtml || '<li>לא הוזן תוכן עדיין.</li>') + '</ul></section>' +
      '<footer>מקור: ' + esc(site || 'ללא אתר מקור') + ' | מצב: Preview בלבד (ללא deploy אמיתי)</footer></main></body></html>';
  }

  function fillPreview() {
    var txt = [
      'מבנה: ' + ((document.getElementById('wb-structure').value || '').split('\n').filter(Boolean).length) + ' מקטעים',
      'תוכן: ' + (document.getElementById('wb-content').value || '').slice(0, 90) + '...',
      'עיצוב: ' + ((document.getElementById('wb-design').value || '').split('\n')[0] || '—'),
      'SEO: ' + ((document.getElementById('wb-seo').value || '').split('\n')[0] || '—'),
    ];
    document.getElementById('wb-preview').innerHTML = txt.map(function (x) { return '<div style="margin-bottom:6px;">• ' + esc(x) + '</div>'; }).join('');
  }

  function buildDeployPayload() {
    WB.output = {
      at: new Date().toISOString(),
      company: WB.strategy.company || WB.context.name || '',
      site: WB.strategy.site || WB.context.site || '',
      structure: document.getElementById('wb-structure').value,
      content: document.getElementById('wb-content').value,
      design: document.getElementById('wb-design').value,
      seo: document.getElementById('wb-seo').value,
      buildMode: 'preview-demo',
    };
    document.getElementById('wb-deploy-status').className = 'warn alt';
    document.getElementById('wb-deploy-status').textContent = 'מוכן לסיום: בלחיצה על "סיום ובנה Preview" תיווצר תצוגת אתר דמו.';
    document.getElementById('wb-json').textContent = JSON.stringify(WB.output, null, 2);
  }

  function renderCompletionPreview() {
    buildDeployPayload();
    WB.output.previewHtml = generatePreviewHtml();
    WB.output.previewBuiltAt = new Date().toISOString();
    WB.output.deployStatus = 'preview_generated';
    var status = document.getElementById('wb-deploy-status');
    status.className = 'ok alt';
    status.textContent = '✅ האתר נבנה כ-Preview דמו בתוך המסך (ללא deploy אמיתי).';
    document.getElementById('wb-json').textContent = JSON.stringify(WB.output, null, 2);
    var frame = document.getElementById('wb-preview-frame');
    if (frame) frame.srcdoc = WB.output.previewHtml || '';
    var note = document.getElementById('wb-complete-note');
    if (note) note.textContent = 'מה קיים עכשיו: Preview תבניתי עם נתוני העסק. מה עדיין דמו: build/deploy אמיתי לשרת חיצוני.';
    var complete = document.getElementById('wb-complete');
    if (complete) complete.style.display = '';
    WB.built = true;
  }

  function persistOutput() {
    try {
      localStorage.setItem('coco-website-builder-last-output-v1', JSON.stringify(WB.output));
      localStorage.setItem('coco-website-builder-last-context-v1', JSON.stringify({
        dalia_biz: WB.context || null,
        business_context: WB.strategy || null,
      }));
      localStorage.setItem('coco-website-builder-preview-html-v1', WB.output.previewHtml || '');
    } catch (e) { /* ignore */ }
  }

  function wbGo(step) {
    WB.tab = step;
    document.querySelectorAll('#website-builder-root .pane').forEach(function (p) { p.classList.remove('on'); });
    var pane = document.getElementById('w' + step);
    if (pane) pane.classList.add('on');
    for (var i = 1; i <= 7; i += 1) {
      var s = document.getElementById('wbs' + i);
      if (!s) continue;
      s.className = 'step ' + (i < step ? 'done' : i === step ? 'on' : '');
      var sn = s.querySelector('.sn');
      if (sn) sn.textContent = i < step ? '✓' : String(i);
    }
    document.getElementById('wb-pf').style.width = ((step / 7) * 100) + '%';
    document.getElementById('wb-back').style.display = step > 1 ? '' : 'none';
    document.getElementById('wb-next').textContent = step === 7 ? '✅ סיום ובנה Preview' : 'הבא ←';
    document.getElementById('wb-hint').textContent = 'שלב ' + step + ' מתוך 7';
    if (step === 6) fillPreview();
    if (step === 7) buildDeployPayload();
    window.scrollTo(0, 0);
  }

  function wbPrev() { if (WB.tab > 1) wbGo(WB.tab - 1); }

  function wbNext() {
    if (WB.tab < 7) { wbGo(WB.tab + 1); return; }
    renderCompletionPreview();
    persistOutput();
    wbToast('✅ Preview נבנה. ניתן להמשיך לעוזרים בנפרד.');
  }

  function wbContinueToAgents() {
    persistOutput();
    if (typeof goScreen === 'function') goScreen('screen-agents');
    wbToast('🚀 המשך לעוזרים נשמר בנפרד מה-Website Builder');
  }

  function wbToast(msg) {
    var t = document.getElementById('wb-toast');
    if (!t) return;
    t.textContent = msg;
    t.style.opacity = '1';
    t.style.transform = 'translateY(0)';
    setTimeout(function () {
      t.style.opacity = '0';
      t.style.transform = 'translateY(10px)';
    }, 2200);
  }

  function wbInit() {
    var rawBiz = parseLs('dalia_biz');
    var rawCtx = parseLs('coco-business-context-v1');
    WB.context = rawBiz || {};
    WB.strategy = rawCtx || {};
    WB.output = {};
    WB.built = false;
    document.getElementById('wb-company').textContent = WB.context.name || WB.strategy.company || 'עסק לא מזוהה';
    document.getElementById('wb-k-company').textContent = WB.strategy.company || WB.context.name || '—';
    document.getElementById('wb-k-service').textContent = WB.strategy.mainService || WB.context.mainService || '—';
    document.getElementById('wb-k-site').textContent = WB.strategy.site || WB.context.site || '—';
    document.getElementById('wb-k-budget').textContent = WB.strategy.budget || WB.context.budget || '—';
    var complete = document.getElementById('wb-complete');
    if (complete) complete.style.display = 'none';
    buildStepBar();
    runAnalysisLog();
    wbGo(1);
  }

  function setFabVisibility(hidden) {
    var fab = document.getElementById('cocoAiFab');
    if (!fab) return;
    if (hidden) {
      if (!fab.getAttribute('data-wb-prev-display')) {
        fab.setAttribute('data-wb-prev-display', fab.style.display || '');
      }
      fab.style.display = 'none';
      return;
    }
    var prev = fab.getAttribute('data-wb-prev-display');
    fab.style.display = prev == null ? '' : prev;
    fab.removeAttribute('data-wb-prev-display');
  }

  function mountBuilder() {
    strategyRoot = document.getElementById('biz-strategy-root');
    builderRoot = document.getElementById('website-builder-root');
    if (!builderRoot) return Promise.resolve(false);
    builderRoot.innerHTML = SHELL_HTML;
    builderRoot.classList.add('wb-wiz');
    if (strategyRoot) strategyRoot.style.display = 'none';
    builderRoot.style.display = '';
    setFabVisibility(true);
    wbInit();
    return Promise.resolve(true);
  }

  function closeBuilder() {
    strategyRoot = document.getElementById('biz-strategy-root');
    builderRoot = document.getElementById('website-builder-root');
    if (builderRoot) {
      builderRoot.style.display = 'none';
      builderRoot.innerHTML = '';
    }
    if (strategyRoot) {
      strategyRoot.style.display = '';
      strategyRoot.classList.add('biz-wiz');
    }
    setFabVisibility(false);
  }

  function openBuilder() {
    if (typeof goScreen === 'function') goScreen('screen-business-strategy');
    return mountBuilder();
  }

  window.wbGo = wbGo;
  window.wbPrev = wbPrev;
  window.wbNext = wbNext;
  window.wbContinueToAgents = wbContinueToAgents;
  window.closeWebsiteBuilder = closeBuilder;
  window.WebsiteBuilderWizard = {
    VERSION: '1.1.0-preview-completion',
    open: openBuilder,
    close: closeBuilder,
    mount: mountBuilder,
  };
})();
