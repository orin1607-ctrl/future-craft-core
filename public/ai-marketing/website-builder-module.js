/**
 * Website Builder Wizard — compiled from approved design
 */
(function () {
  'use strict';
  var strategyRoot = null;
  var builderRoot = null;
  var shellHtml = "<div class=\"tb\">\r\n  <div style=\"font-size:13px;font-weight:800;\">🌐 Website Builder AI</div>\r\n  <div style=\"display:flex;gap:8px;align-items:center;\">\r\n    <span id=\"wb-company\" style=\"font-size:11px;color:var(--w50);\"></span>\r\n    <button class=\"btn btn-g\" style=\"padding:4px 10px;font-size:11px;\" onclick=\"closeWebsiteBuilder()\">חזרה לאסטרטגיה</button>\r\n  </div>\r\n</div>\r\n<div class=\"wiz\">\r\n  <div id=\"wb-steps\" class=\"steps\"></div>\r\n  <div class=\"pb\"><div id=\"wb-pf\" class=\"pf\"></div></div>\r\n</div>\r\n<div class=\"main\">\r\n  <div class=\"pane on\" id=\"w1\">\r\n    <div class=\"t\">1. ניתוח עסקי ואפיון אתר</div>\r\n    <div class=\"s\">המערכת קוראת את Business Context ומתרגמת אותו לאסטרטגיית אתר.</div>\r\n    <div class=\"card\">\r\n      <div class=\"kpi\">\r\n        <div class=\"pill\">עסק: <span id=\"wb-k-company\">—</span></div>\r\n        <div class=\"pill\">שירות מרכזי: <span id=\"wb-k-service\">—</span></div>\r\n        <div class=\"pill\">אתר קיים: <span id=\"wb-k-site\">—</span></div>\r\n        <div class=\"pill\">תקציב: <span id=\"wb-k-budget\">—</span></div>\r\n      </div>\r\n    </div>\r\n    <div class=\"card\"><div id=\"wb-analysis-log\" class=\"s\">מוכן לניתוח.</div></div>\r\n  </div>\r\n\r\n  <div class=\"pane\" id=\"w2\">\r\n    <div class=\"t\">2. מבנה אתר (Site Map)</div>\r\n    <div class=\"s\">מבנה מומלץ בהתאם ליעדים העסקיים.</div>\r\n    <div class=\"card\"><textarea id=\"wb-structure\" class=\"ta\">דף בית\r\nעמוד שירות ראשי\r\nעמוד פתרונות לפי מגזר\r\nעמוד אודות\r\nבלוג מקצועי\r\nעמוד יצירת קשר</textarea></div>\r\n  </div>\r\n\r\n  <div class=\"pane\" id=\"w3\">\r\n    <div class=\"t\">3. יצירת תוכן שיווקי</div>\r\n    <div class=\"s\">טיוטת מסרים ראשיים, כותרות ותועלות.</div>\r\n    <div class=\"card\"><textarea id=\"wb-content\" class=\"ta\">כותרת ראשית: פתרונות חכמים לניהול ותפעול צי רכב\r\nתת כותרת: חיסכון בעלויות, שליטה מלאה ושירות מקצועי 24/7\r\nCTA: קבלו אפיון ללא התחייבות</textarea></div>\r\n  </div>\r\n\r\n  <div class=\"pane\" id=\"w4\">\r\n    <div class=\"t\">4. עיצוב וחווית משתמש</div>\r\n    <div class=\"s\">הגדרת קו עיצוב בסיסי בהתאם למותג.</div>\r\n    <div class=\"card\"><textarea id=\"wb-design\" class=\"ta\">סגנון: מקצועי נקי\r\nצבעים: כחול כהה + הדגשות ירוק\r\nטיפוגרפיה: Heebo\r\nדגש: קריאות גבוהה במובייל</textarea></div>\r\n  </div>\r\n\r\n  <div class=\"pane\" id=\"w5\">\r\n    <div class=\"t\">5. SEO On-Page</div>\r\n    <div class=\"s\">מיפוי מטא-דאטה בסיסי ומילות מפתח.</div>\r\n    <div class=\"card\"><textarea id=\"wb-seo\" class=\"ta\">Title: ניהול צי רכב לעסקים | דליה\r\nDescription: פתרונות ניהול ותחזוקת צי רכב לעסקים בכל הארץ.\r\nKeywords: ניהול צי רכב, תפעול צי, GPS לצי</textarea></div>\r\n  </div>\r\n\r\n  <div class=\"pane\" id=\"w6\">\r\n    <div class=\"t\">6. תצוגה מקדימה</div>\r\n    <div class=\"s\">בדיקה מהירה של התוצר לפני הפצה.</div>\r\n    <div class=\"card\">\r\n      <div class=\"info alt\">תצוגה זו היא דמו פנימי ל-Staging. החיבור ל-CMS/Hosting אמיתי יתווסף לפי סביבת הפעלה.</div>\r\n      <div id=\"wb-preview\" style=\"margin-top:10px;color:var(--w80);font-size:12px;\"></div>\r\n    </div>\r\n  </div>\r\n\r\n  <div class=\"pane\" id=\"w7\">\r\n    <div class=\"t\">7. פריסה והעברה להמשך עבודה</div>\r\n    <div class=\"s\">סגירת תהליך והעברת תקציר לביצועי המשך.</div>\r\n    <div class=\"card\"><div id=\"wb-deploy-status\" class=\"warn alt\">ממתין לאישור פריסה.</div></div>\r\n    <div class=\"card\"><pre id=\"wb-json\" style=\"font-size:10px;color:#93c5fd;line-height:1.7;white-space:pre-wrap;\"></pre></div>\r\n  </div>\r\n</div>\r\n<div class=\"footer\">\r\n  <div id=\"wb-hint\" style=\"font-size:11px;color:var(--w50);\">שלב 1 מתוך 7</div>\r\n  <div style=\"display:flex;gap:8px;\">\r\n    <button class=\"btn btn-g\" id=\"wb-back\" onclick=\"wbPrev()\" style=\"display:none;\">← חזרה</button>\r\n    <button class=\"btn btn-p\" id=\"wb-next\" onclick=\"wbNext()\">הבא ←</button>\r\n  </div>\r\n</div>\r\n<div id=\"wb-toast\"></div>";

const WB_STEPS = ['ניתוח','מבנה','תוכן','עיצוב','SEO','תצוגה','פריסה'];
const WB = { tab:1, context:null, strategy:null, output:{} };

function wbInit(){
  const rawBiz = parseLs('dalia_biz');
  const rawCtx = parseLs('coco-business-context-v1');
  WB.context = rawBiz || {};
  WB.strategy = rawCtx || {};
  document.getElementById('wb-company').textContent = WB.context.name || WB.strategy.company || 'עסק לא מזוהה';
  document.getElementById('wb-k-company').textContent = WB.strategy.company || WB.context.name || '—';
  document.getElementById('wb-k-service').textContent = WB.strategy.mainService || WB.context.mainService || '—';
  document.getElementById('wb-k-site').textContent = WB.strategy.site || WB.context.site || '—';
  document.getElementById('wb-k-budget').textContent = WB.strategy.budget || WB.context.budget || '—';
  buildStepBar();
  runAnalysisLog();
  wbGo(1);
}

function parseLs(key){
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
}

function buildStepBar(){
  const el = document.getElementById('wb-steps');
  el.innerHTML = WB_STEPS.map((name, i) =>
    `<div class="step ${i===0?'on':''}" id="wbs${i+1}"><div class="sn">${i+1}</div>${name}</div>`
  ).join('');
}

function runAnalysisLog(){
  const lines = [
    'קורא הקשר עסקי מ-dalia_biz',
    'מאמת Business Context מ-coco-business-context-v1',
    'מייצר מבנה אתר לפי שירות וקהל יעד',
    'מכין תבניות תוכן והנעה לפעולה'
  ];
  const box = document.getElementById('wb-analysis-log');
  let i = 0;
  const timer = setInterval(() => {
    if (i >= lines.length) { clearInterval(timer); return; }
    box.innerHTML += `<div>• ${lines[i]}</div>`;
    i += 1;
  }, 350);
}

function wbGo(step){
  WB.tab = step;
  document.querySelectorAll('.pane').forEach((p) => p.classList.remove('on'));
  const pane = document.getElementById('w' + step);
  if (pane) pane.classList.add('on');
  for (let i = 1; i <= 7; i += 1) {
    const s = document.getElementById('wbs' + i);
    if (!s) continue;
    s.className = 'step ' + (i < step ? 'done' : i === step ? 'on' : '');
    s.querySelector('.sn').textContent = i < step ? '✓' : String(i);
  }
  document.getElementById('wb-pf').style.width = (step / 7 * 100) + '%';
  document.getElementById('wb-back').style.display = step > 1 ? '' : 'none';
  document.getElementById('wb-next').textContent = step === 7 ? '✅ סיים וחזור לעוזרים' : 'הבא ←';
  document.getElementById('wb-hint').textContent = `שלב ${step} מתוך 7`;
  if (step === 6) fillPreview();
  if (step === 7) buildDeployPayload();
  window.scrollTo(0, 0);
}

function wbPrev(){ if (WB.tab > 1) wbGo(WB.tab - 1); }

function wbNext(){
  if (WB.tab < 7) { wbGo(WB.tab + 1); return; }
  try {
    localStorage.setItem('coco-website-builder-last-output-v1', JSON.stringify(WB.output));
    localStorage.setItem('coco-website-builder-last-context-v1', JSON.stringify({
      dalia_biz: WB.context || null,
      business_context: WB.strategy || null
    }));
  } catch (e) { /* ignore */ }
  if (typeof goScreen === 'function') goScreen('screen-agents');
  wbToast('✅ תהליך בניית האתר נשמר והועבר להמשך עבודה');
}

function fillPreview(){
  const txt = [
    `מבנה: ${(document.getElementById('wb-structure').value || '').split('\n').length} מקטעים`,
    `תוכן: ${(document.getElementById('wb-content').value || '').slice(0, 70)}...`,
    `עיצוב: ${(document.getElementById('wb-design').value || '').split('\n')[0] || '—'}`,
    `SEO: ${(document.getElementById('wb-seo').value || '').split('\n')[0] || '—'}`
  ];
  document.getElementById('wb-preview').innerHTML = txt.map((x) => `<div style="margin-bottom:6px;">• ${x}</div>`).join('');
}

function buildDeployPayload(){
  WB.output = {
    at: new Date().toISOString(),
    company: WB.strategy.company || WB.context.name || '',
    site: WB.strategy.site || WB.context.site || '',
    structure: document.getElementById('wb-structure').value,
    content: document.getElementById('wb-content').value,
    design: document.getElementById('wb-design').value,
    seo: document.getElementById('wb-seo').value
  };
  document.getElementById('wb-deploy-status').className = 'ok alt';
  document.getElementById('wb-deploy-status').textContent = '✅ מוכן לחיבור ל-CMS/Hosting בסביבת Staging';
  document.getElementById('wb-json').textContent = JSON.stringify(WB.output, null, 2);
}

function wbToast(msg){
  const t = document.getElementById('wb-toast');
  t.textContent = msg;
  t.style.opacity = '1';
  t.style.transform = 'translateY(0)';
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateY(10px)';
  }, 2200);
}

  function mountBuilder() {
    strategyRoot = document.getElementById('biz-strategy-root');
    builderRoot = document.getElementById('website-builder-root');
    if (!builderRoot) return Promise.resolve(false);
    builderRoot.innerHTML = shellHtml;
    builderRoot.classList.add('wb-wiz');
    if (strategyRoot) strategyRoot.style.display = 'none';
    builderRoot.style.display = '';
    if (typeof wbInit === 'function') wbInit();
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
  }

  function openBuilder() {
    if (typeof goScreen === 'function') goScreen('screen-business-strategy');
    return mountBuilder();
  }

  window.wbPrev = wbPrev;
  window.wbNext = wbNext;
  window.closeWebsiteBuilder = closeBuilder;
  window.WebsiteBuilderWizard = {
    VERSION: '1.0.0-approved',
    open: openBuilder,
    close: closeBuilder,
    mount: mountBuilder,
  };
})();
