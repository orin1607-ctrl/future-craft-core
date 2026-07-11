/**
 * Business-facing HTML for CO.CO daily report (manager language, same visual language).
 * Compact filter: date · report # · סוג נכס + small button → popup with multi asset checkboxes
 * and categories for the focused asset only.
 */
function h(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function metricCell(m) {
  if (!m || typeof m !== 'object') return h(m);
  const reason = m.missingReason ? `<div class="miss">${h(m.missingReason)}</div>` : '';
  return `<div class="mv">${h(m.value)}</div>
    <div class="meta-line"><span class="tag tag-${h(m.reliability)}">${h(m.reliabilityHe)}</span>
    · ${h(m.sourceHe || m.source)} · עודכן: ${h(m.updatedAtHe || m.updatedAt)}</div>${reason}`;
}

function trendBadge(t) {
  const map = { up: '🟢 משתפר', flat: '🟡 יציב', down: '🔴 דורש טיפול' };
  return `<div class="trend">${map[t.level] || t.level}</div><div class="note">${h(t.reason)}</div>`;
}

function renderCategoryBlock(assetId, cat) {
  const items = (cat.items || []).map((x) => `<li>${metricCell(x)}</li>`).join('');
  return `<div class="cat-block" data-asset-cat="${h(assetId)}" data-cat="${h(cat.id)}">
  <h3 class="h3">${h(cat.labelHe)}</h3>
  <ul class="exec">${items || `<li class="note">אין פריטים להצגה</li>`}</ul>
</div>`;
}

export function renderBusinessHtml(report) {
  const mc = report.managerCard;
  const assets = report.assets || [];
  const catalog = report.assetCatalog || [];
  const healthBiz = report.healthBusiness;

  const assetChecks = catalog.map((a) => {
    const checked = a.defaultSelected ? 'checked' : '';
    const soon = a.hasLiveData === false ? ' <span class="soon">(אין נתונים חיים עדיין)</span>' : '';
    return `<label class="chk asset-pick" data-pick="${h(a.id)}">
      <input type="checkbox" name="asset" value="${h(a.id)}" data-asset="${h(a.id)}" ${checked}>
      ${h(a.labelHe)}${soon}
    </label>`;
  }).join('');

  const assetSections = assets.map((a) => {
    const cats = (a.categories || []).map((c) => renderCategoryBlock(a.id, c)).join('');
    return `
<section class="card asset-block" data-asset-section="${h(a.id)}">
  <h2>${h(a.labelHe)}</h2>
  <div class="asset-overview">
    <div class="trend-wrap">${trendBadge(a.trend)}</div>
    <div class="grid2">
      <div class="kpi"><div class="l">פוטנציאל עסקי</div><div class="v">${h(a.businessPotential.score)}</div>
        <div class="note">${h(a.businessPotential.why)}</div>
        ${metricCell(a.businessPotential.meta)}
      </div>
      <div class="kpi"><div class="l">התקדמות לקמפיין</div><div class="v">${h(a.progressLabel)}</div>
        ${metricCell(a.progressMeta)}
      </div>
    </div>
  </div>
  ${cats}
</section>`;
  }).join('');

  const comparison = report.comparison;
  const catalogJson = JSON.stringify(catalog.map((a) => ({
    id: a.id,
    labelHe: a.labelHe,
    categories: (a.categories || []).map((c) => ({ id: c.id, labelHe: c.labelHe })),
  }))).replace(/</g, '\\u003c');

  return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>דוח יומי #${h(report.meta.reportNumberPadded)} — ${h(report.client.company)}</title>
<style>
:root{--ink:#0f172a;--muted:#64748b;--line:#dbe3f0;--bg:#f1f5f9;--card:#fff;--brand:#0b1735;--ok:#047857;--warn:#b45309;--bad:#b91c1c;--ai:#6d28d9;--miss:#334155}
*{box-sizing:border-box}
body{font-family:Heebo,Arial,sans-serif;margin:0;background:var(--bg);color:var(--ink);line-height:1.45;-webkit-text-size-adjust:100%}
body.modal-open{overflow:hidden;touch-action:none}
.wrap{max-width:980px;margin:0 auto;padding:18px 14px 56px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin-bottom:12px}
.cover{background:linear-gradient(145deg,#0b1735,#1e3a5f);color:#fff;border:none}
.cover h1{margin:0 0 8px;font-size:1.35rem}
.cover .sub{opacity:.85;font-size:.9rem}
.client-id{margin:10px 0 12px;padding:10px 12px;background:rgba(255,255,255,.12);border-radius:10px;border:1px solid rgba(255,255,255,.22)}
.client-id .client-name{font-size:1.15rem;font-weight:800;line-height:1.3}
.client-id .client-company{font-size:.92rem;opacity:.92;margin-top:2px;line-height:1.35}
.asset-block .asset-overview{margin-bottom:4px}
.actions{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 0}
.btn{display:inline-block;padding:8px 12px;border-radius:10px;text-decoration:none;font-weight:700;font-size:.85rem;border:1px solid transparent;cursor:pointer;background:#e2e8f0;color:#0f172a;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.btn-pdf{background:#fbbf24;color:#111}
.btn-o{background:transparent;border-color:rgba(255,255,255,.35);color:#fff}
.btn-go{background:#2563eb;color:#fff;border:0}
.btn-assets{background:#0b1735;color:#fff;border:0;padding:6px 10px;font-size:.78rem;font-weight:700;min-height:36px;width:auto;align-self:flex-start;white-space:nowrap}
h2{font-size:1.05rem;margin:0 0 10px}.h3{font-size:.92rem;margin:12px 0 6px;color:#334155}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
@media(max-width:720px){.grid,.grid2{grid-template-columns:1fr 1fr}}
.kpi{background:#f8fafc;border:1px solid var(--line);border-radius:12px;padding:10px}
.kpi .l{font-size:.7rem;color:var(--muted)}.kpi .v{font-size:1.2rem;font-weight:800;margin-top:2px}
.mv{font-weight:700}.meta-line{font-size:.65rem;color:var(--muted);margin-top:3px}
.miss{font-size:.68rem;color:var(--miss);margin-top:3px}
.tag{display:inline-block;padding:1px 6px;border-radius:999px;font-size:.62rem;font-weight:700}
.tag-live{background:#d1fae5;color:var(--ok)}.tag-cache{background:#e0e7ff;color:#3730a3}
.tag-internal{background:#e2e8f0;color:#334155}.tag-ai_estimate{background:#ede9fe;color:var(--ai)}
.tag-missing{background:#fee2e2;color:var(--bad)}
.note{font-size:.8rem;color:var(--muted)}.badge{display:inline-block;padding:2px 8px;border-radius:999px;background:rgba(255,255,255,.15);font-size:.72rem}
ul.exec{margin:0;padding-right:18px}
.filter{display:flex;gap:8px;flex-wrap:wrap;align-items:end}
.filter label,.filter-asset{font-size:.72rem;color:var(--muted);display:flex;flex-direction:column;gap:4px}
.filter input{padding:7px 9px;border:1px solid var(--line);border-radius:8px;font-size:.85rem;min-width:130px;min-height:44px;touch-action:manipulation}
.filter-asset{flex-direction:row;align-items:center;gap:8px;min-height:44px}
.filter-asset > span{white-space:nowrap}
.chk{display:flex;align-items:center;gap:8px;padding:8px 0;font-size:.88rem;min-height:44px}.soon{color:var(--muted);font-size:.75rem}
.trend{font-size:1.05rem;font-weight:800;margin-bottom:4px}
.decision li{margin-bottom:8px}
.modal-bg{display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:1000;align-items:flex-end;justify-content:center;padding:12px;padding-bottom:max(12px,env(safe-area-inset-bottom))}
.modal-bg.on{display:flex}
.modal{background:#fff;border-radius:14px;max-width:460px;width:100%;padding:16px;border:1px solid var(--line);max-height:min(92vh,calc(100dvh - 24px));display:flex;flex-direction:column;overflow:hidden}
.modal h3{margin:0 0 8px;font-size:1rem;flex-shrink:0}
.modal > .note{flex-shrink:0}
.modal .sec-title{font-size:.72rem;color:var(--muted);margin:12px 0 6px;font-weight:700}
.modal-body{flex:1;min-height:0;overflow:auto;-webkit-overflow-scrolling:touch}
.asset-tabs{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 4px}
.asset-tabs button{border:1px solid var(--line);background:#f8fafc;border-radius:999px;padding:8px 12px;font-size:.78rem;cursor:pointer;min-height:40px;touch-action:manipulation}
.asset-tabs button.on{background:#0b1735;color:#fff;border-color:#0b1735}
.cats-panel label{display:flex;align-items:center;gap:8px;padding:8px 0;font-size:.88rem;min-height:44px}
.asset-pick.on{background:#f1f5f9;border-radius:8px;padding-right:6px}
#selSummary{font-size:.78rem;color:var(--muted);margin-top:6px}
.modal-actions{display:flex;gap:8px;margin-top:12px;justify-content:stretch;flex-shrink:0;background:#fff;padding-top:8px;border-top:1px solid var(--line)}
.modal-actions .btn{flex:1;min-height:44px}
@media(max-width:720px){
  .filter{flex-wrap:wrap;align-items:end}
  .filter label{flex:1 1 140px;min-width:0}
  .filter input{min-width:0;width:100%;min-height:44px;font-size:1rem}
  .filter-asset{flex:0 0 auto;width:auto}
  .btn-assets{width:auto;min-width:0;min-height:36px;padding:6px 10px;font-size:.78rem}
  .btn-go{min-height:44px;font-size:.9rem}
  .grid{grid-template-columns:1fr 1fr}
  .modal{max-width:100%;border-radius:16px 16px 0 0}
}
@media(min-width:721px){.modal-bg{align-items:center;padding:16px}}
@media print{.filter,.actions,#assetModal,.no-print{display:none!important}.card{break-inside:avoid}}
</style></head><body><div class="wrap">

<section class="card cover" id="page1">
  <div class="badge">דוח יומי לעסק · ניסיון דליה</div>
  <div class="client-id" id="clientIdentity">
    <div class="client-name">${h(report.client.contact || 'יוני אטיאס')}</div>
    <div class="client-company">${h(report.client.company || 'דליה פתרונות תפעול ותחזוקה לרכב')}</div>
  </div>
  <h1>דוח יומי #${h(report.meta.reportNumberPadded)}</h1>
  <div class="sub">
    ${h(report.meta.reportDate)} · ${h(report.meta.generatedTimeIL)} ·
    מייל: לא נשלח (תצוגה בלבד)
  </div>
  <div style="margin-top:12px;padding:10px 12px;background:rgba(255,255,255,.12);border-radius:10px;border:1px solid rgba(255,255,255,.2)">
    <div style="font-size:.72rem;opacity:.85;margin-bottom:4px">בשורה התחתונה להיום</div>
    <div style="font-size:.98rem;font-weight:700;line-height:1.45">${h(report.bottomLineToday)}</div>
  </div>
  <div class="actions">
    <a class="btn btn-pdf" href="${h(report.meta.pdfFileName)}" download>הורד PDF</a>
    <a class="btn btn-o" href="${h(report.client.previewUrl)}" target="_blank" rel="noopener">פתח אתר</a>
  </div>
</section>

<section class="card no-print" id="filterCard">
  <h2>סינון מהיר</h2>
  <div class="filter">
    <label>תאריך<input type="date" id="fDate" value="${h(report.meta.reportDate)}"></label>
    <label>מספר דוח<input type="text" id="fNum" value="${h(report.meta.reportNumberDisplay)}" readonly></label>
    <div class="filter-asset">
      <span>סוג נכס</span>
      <button type="button" class="btn btn-assets" id="btnAssets" aria-haspopup="dialog" aria-controls="assetModal">בחירה…</button>
    </div>
    <button type="button" class="btn btn-go" id="btnApply">הצג דוח</button>
  </div>
  <p class="note" id="selHint">ברירת מחדל: אתר ראשי. לחצו «בחירה…» לבחירת נכסים וקטגוריות.</p>
  <div id="selSummary"></div>
</section>

<section class="card" id="decisionCard" data-report-section="overview">
  <h2>מה חשוב לדעת עכשיו</h2>
  <ol class="decision">
    <li><strong>האם הקמפיין מתקדם?</strong><br>${metricCell(mc.campaignProgress)}</li>
    <li><strong>האם אנחנו מתקדמים לעבר המטרה?</strong><br>${metricCell(mc.towardGoal)}</li>
    <li><strong>האם המיקום השתפר?</strong><br>${metricCell(mc.rankingImproved)}</li>
    <li><strong>האם מביאים יותר לידים?</strong><br>${metricCell(mc.moreLeads)}</li>
    <li><strong>יש בעיה שמעכבת?</strong><br>${metricCell(mc.blocker)}</li>
    <li><strong>שלוש פעולות חשובות עכשיו</strong>
      <ol>${(mc.top3 || []).map((t) => `<li>${metricCell(t)}</li>`).join('')}</ol>
    </li>
  </ol>
</section>

<section class="card" id="healthCard" data-report-section="health">
  <h2>בריאות המערכת</h2>
  <div class="grid">
    <div class="kpi"><div class="l">מצב כללי</div><div class="v">${h(healthBiz.statusLabel)}</div><div class="note">${h(healthBiz.statusWhy)}</div></div>
    <div class="kpi"><div class="l">ציון בריאות המערכת</div><div class="v">${h(report.healthScore)}</div>
      <div class="meta-line">תקין ${h(report.healthSummary.ok)} · דורש תשומת לב ${h(report.healthSummary.warn)} · לא הוגדר ${h(report.healthSummary.undef)}</div>
    </div>
    <div class="kpi"><div class="l">50 העוזרים</div><div class="v">${h(healthBiz.assistantsLabel)}</div>${metricCell(healthBiz.assistantsMeta)}</div>
    <div class="kpi"><div class="l">יועצים ומנועים</div><div class="v">${h(healthBiz.enginesLabel)}</div>${metricCell(healthBiz.enginesMeta)}</div>
  </div>
  <p class="note">${h(healthBiz.detailNote)}</p>
</section>

<section class="card" id="scoresCard" data-report-section="overview">
  <h2>ציונים</h2>
  <div class="grid">
    <div class="kpi"><div class="l">ציון הפרויקט</div><div class="v">${h(report.scores.projectScore.value)}</div>${metricCell(report.scores.projectScore)}</div>
    <div class="kpi"><div class="l">פוטנציאל עסקי</div><div class="v">${h(report.businessPotential.score)}</div>
      <div class="note">${h(report.businessPotential.why)}</div>${metricCell(report.businessPotential.meta)}</div>
    <div class="kpi"><div class="l">התקדמות</div><div class="v">${h(report.scores.progressPct.value)}%</div>${metricCell(report.scores.progressPct)}</div>
    <div class="kpi"><div class="l">מוכן לעלייה?</div><div class="v">${report.scores.goLiveReady.value ? 'כן' : 'לא'}</div>${metricCell(report.scores.goLiveReady)}</div>
  </div>
</section>

${assetSections}

<section class="card" id="compareBlock" data-compare="1">
  <h2>השוואה בין נכסים</h2>
  <p id="compareSummary">${h(comparison.summary)}</p>
  <ul class="exec" id="compareBullets">${(comparison.bullets || []).map((b) => `<li>${h(b)}</li>`).join('')}</ul>
  <p class="note">${h(comparison.note)}</p>
</section>

<section class="card" id="fourAnswersCard" data-report-section="overview">
  <h2>ארבע תשובות לסיום</h2>
  <ol>
    <li><strong>איפה אנחנו היום?</strong><br>${metricCell(report.fourAnswers.whereToday)}</li>
    <li><strong>האם התקדמנו מאז הדוח הקודם?</strong><br>${metricCell(report.fourAnswers.progressSincePrev)}</li>
    <li><strong>מה חסר כדי להתקדם חזק יותר?</strong><br>${metricCell(report.fourAnswers.whatsMissingForFirst)}</li>
    <li><strong>שלוש פעולות חשובות עכשיו</strong>
      <ol>${(report.fourAnswers.top3 || []).map((t) => `<li>${metricCell(t)}</li>`).join('')}</ol>
    </li>
  </ol>
</section>

<section class="card" id="legendCard" data-report-section="overview">
  <h2>מקרא אמינות</h2>
  <p>
    <span class="tag tag-live">נתון חי</span>
    <span class="tag tag-cache">נתון ממטמון</span>
    <span class="tag tag-internal">חישוב פנימי</span>
    <span class="tag tag-ai_estimate">הערכת AI</span>
    <span class="tag tag-missing">אין נתון חי</span>
  </p>
  <p class="note">המלצות AI מסומנות בבירור ואינן מוצגות כנתון חי.</p>
</section>

</div>

<div class="modal-bg" id="assetModal" aria-hidden="true">
  <div class="modal" role="dialog" aria-labelledby="assetModalTitle" aria-modal="true">
    <h3 id="assetModalTitle">בחירת נכסים וקטגוריות</h3>
    <p class="note" id="assetModalNote">סמנו נכס אחד או יותר. הקטגוריות למטה הן של הנכס הממוקד בלבד.</p>
    <div class="modal-body">
      <div class="sec-title">1. נכסים</div>
      <div class="cats" id="assetList">${assetChecks}</div>
      <div class="sec-title">2. קטגוריות של הנכס הממוקד</div>
      <div class="asset-tabs" id="assetTabs" hidden></div>
      <div class="cats-panel" id="catsPanel" data-focus-asset=""></div>
    </div>
    <div class="modal-actions">
      <button type="button" class="btn" id="modalCancel">סגור</button>
      <button type="button" class="btn btn-go" id="modalOk">אישור</button>
    </div>
  </div>
</div>

<script type="application/json" id="assetCatalogJson">${catalogJson}</script>
<script>
(function(){
  var catalog = [];
  try { catalog = JSON.parse(document.getElementById('assetCatalogJson').textContent || '[]'); } catch(e) { catalog = []; }
  var catState = {};
  catalog.forEach(function(a){
    catState[a.id] = {};
    (a.categories || []).forEach(function(c){ catState[a.id][c.id] = true; });
  });

  var modal = document.getElementById('assetModal');
  var btn = document.getElementById('btnAssets');
  var ok = document.getElementById('modalOk');
  var cancel = document.getElementById('modalCancel');
  var apply = document.getElementById('btnApply');
  var hint = document.getElementById('selHint');
  var summary = document.getElementById('selSummary');
  var tabs = document.getElementById('assetTabs');
  var catsPanel = document.getElementById('catsPanel');
  var modalNote = document.getElementById('assetModalNote');
  var focusAsset = 'site-main';
  var compareData = ${JSON.stringify({
    singleSummary: comparison.summarySingle || comparison.summary,
    multiSummary: comparison.summaryMulti || 'השוואה בין הנכסים שנבחרו — בשפת החלטה עסקית:',
    bullets: comparison.bullets || [],
    note: comparison.note || '',
  })};

  function selectedAssets(){
    return Array.prototype.slice.call(document.querySelectorAll('input[name=asset]:checked')).map(function(i){ return i.value; });
  }

  function ensureDefault(){
    var sel = selectedAssets();
    if(!sel.length){
      var main = document.querySelector('input[name=asset][value="site-main"]');
      if(main){ main.checked = true; sel = ['site-main']; }
    }
    return sel;
  }

  function labelOf(id){
    var a = catalog.find(function(x){ return x.id === id; });
    return a ? a.labelHe : id;
  }

  function shortLabel(id){
    var full = labelOf(id);
    if(id === 'site-main') return 'אתר';
    if(id === 'google-ads') return 'Ads';
    if(id === 'site-extra') return 'אתר נוסף';
    return full.split(' ')[0] || full;
  }

  function renderCatsPanel(){
    var sel = ensureDefault();
    if(sel.indexOf(focusAsset) < 0) focusAsset = sel[0];

    document.querySelectorAll('.asset-pick').forEach(function(lab){
      var id = lab.getAttribute('data-pick');
      lab.classList.toggle('on', id === focusAsset);
    });

    if(modalNote){
      modalNote.textContent = sel.length > 1
        ? ('מוצגות הקטגוריות של «' + labelOf(focusAsset) + '» בלבד. עברו בין הנכסים שנבחרו עם הלשוניות.')
        : ('רק הקטגוריות של «' + labelOf(focusAsset) + '» — בלי לערבב נושאים.');
    }

    tabs.hidden = sel.length < 2;
    tabs.innerHTML = '';
    if(sel.length > 1){
      sel.forEach(function(id){
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = shortLabel(id);
        if(id === focusAsset) b.className = 'on';
        b.onclick = function(){ focusAsset = id; renderCatsPanel(); };
        tabs.appendChild(b);
      });
    }

    var asset = catalog.find(function(x){ return x.id === focusAsset; }) || { categories: [] };
    catsPanel.innerHTML = '';
    catsPanel.setAttribute('data-focus-asset', focusAsset);
    if(!(asset.categories || []).length){
      catsPanel.innerHTML = '<p class="note">אין קטגוריות לנכס זה.</p>';
      return;
    }
    asset.categories.forEach(function(c){
      var lab = document.createElement('label');
      var inp = document.createElement('input');
      inp.type = 'checkbox';
      inp.checked = !!(catState[focusAsset] && catState[focusAsset][c.id]);
      inp.setAttribute('data-cat-id', c.id);
      inp.onchange = function(){
        if(!catState[focusAsset]) catState[focusAsset] = {};
        catState[focusAsset][c.id] = inp.checked;
      };
      lab.appendChild(inp);
      lab.appendChild(document.createTextNode(' ' + c.labelHe));
      catsPanel.appendChild(lab);
    });
  }

  function allCatsOn(assetId){
    var asset = catalog.find(function(x){ return x.id === assetId; });
    var cats = (asset && asset.categories) || [];
    if(!cats.length) return true;
    return cats.every(function(c){ return !!(catState[assetId] && catState[assetId][c.id]); });
  }

  function selectedCats(assetId){
    return Object.keys(catState[assetId] || {}).filter(function(k){ return catState[assetId][k]; });
  }

  function isFullReportView(sel){
    if(sel.length !== 1 || sel[0] !== 'site-main') return false;
    return allCatsOn('site-main');
  }

  function healthWanted(sel){
    return sel.some(function(id){ return !!(catState[id] && catState[id]['site-health']); });
  }

  function applyFilter(){
    var sel = ensureDefault();
    var full = isFullReportView(sel);

    document.querySelectorAll('[data-report-section="overview"]').forEach(function(el){
      el.style.display = full ? '' : 'none';
    });

    var healthCard = document.getElementById('healthCard');
    if(healthCard){
      healthCard.style.display = (full || healthWanted(sel)) ? '' : 'none';
    }

    document.querySelectorAll('[data-asset-section]').forEach(function(el){
      var id = el.getAttribute('data-asset-section');
      var assetOn = sel.indexOf(id) >= 0 && selectedCats(id).length > 0;
      el.style.display = assetOn ? '' : 'none';
      var overview = el.querySelector('.asset-overview');
      if(overview) overview.style.display = (assetOn && allCatsOn(id)) ? '' : 'none';
    });

    document.querySelectorAll('.cat-block').forEach(function(el){
      var aid = el.getAttribute('data-asset-cat');
      var cid = el.getAttribute('data-cat');
      var assetOn = sel.indexOf(aid) >= 0;
      var catOn = !!(catState[aid] && catState[aid][cid]);
      el.style.display = assetOn && catOn ? '' : 'none';
    });

    var cmp = document.getElementById('compareBlock');
    var cmpSum = document.getElementById('compareSummary');
    var cmpUl = document.getElementById('compareBullets');
    if(cmp){
      if(sel.length > 1){
        cmp.style.display = '';
        if(cmpSum) cmpSum.textContent = compareData.multiSummary;
        if(cmpUl){
          cmpUl.innerHTML = '';
          (compareData.bullets || []).forEach(function(line){
            var li = document.createElement('li');
            li.textContent = line;
            cmpUl.appendChild(li);
          });
        }
      } else {
        cmp.style.display = 'none';
      }
    }

    var names = sel.map(labelOf);
    var shorts = sel.map(shortLabel);
    var catBits = sel.map(function(id){
      var on = selectedCats(id);
      var asset = catalog.find(function(x){ return x.id === id; }) || { categories: [] };
      if(on.length === (asset.categories || []).length) return labelOf(id) + ' (הכול)';
      var labels = on.map(function(cid){
        var c = (asset.categories || []).find(function(x){ return x.id === cid; });
        return c ? c.labelHe : cid;
      });
      return labelOf(id) + ': ' + labels.join(', ');
    });
    if(hint){
      if(full) hint.textContent = 'מוצג דוח מלא של האתר הראשי. לחצו «בחירה…» כדי להציג רק סעיפים נבחרים.';
      else if(names.length > 1) hint.textContent = 'נבחרו: ' + shorts.join(' + ') + ' — מוצגים רק הסעיפים שסומנו.';
      else hint.textContent = 'מוצג מסונן: ' + (catBits[0] || names[0]) + ' — שאר הסעיפים מוסתרים.';
    }
    if(summary) summary.textContent = catBits.join(' · ');
    if(btn) btn.textContent = sel.length > 1 ? ('בחירה… (' + sel.length + ')') : 'בחירה…';

    var firstVisible = document.querySelector('[data-asset-section]:not([style*="display: none"]), #healthCard:not([style*="display: none"]), [data-report-section="overview"]:not([style*="display: none"])');
    if(firstVisible && !full && document.activeElement && document.activeElement.id === 'modalOk'){
      try { firstVisible.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch(e) {}
    }
  }

  function openModal(){
    ensureDefault();
    var sel = selectedAssets();
    if(sel.indexOf(focusAsset) < 0) focusAsset = sel[0] || 'site-main';
    renderCatsPanel();
    modal.classList.add('on');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }

  function closeModal(){
    modal.classList.remove('on');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }

  document.querySelectorAll('input[name=asset]').forEach(function(inp){
    inp.addEventListener('change', function(){
      var sel = selectedAssets();
      if(!sel.length){
        inp.checked = true;
        return;
      }
      if(inp.checked) focusAsset = inp.value;
      else if(sel.indexOf(focusAsset) < 0) focusAsset = sel[0];
      renderCatsPanel();
    });
  });

  if(btn) btn.addEventListener('click', openModal);
  if(cancel) cancel.addEventListener('click', closeModal);
  if(ok) ok.addEventListener('click', function(){
    closeModal();
    applyFilter();
    var target = document.querySelector('.cat-block[style=""], .cat-block:not([style*="display: none"]), #healthCard:not([style*="display: none"]), [data-asset-section]:not([style*="display: none"])');
    if(target){
      try { target.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch(e) {}
    }
  });
  if(apply) apply.addEventListener('click', function(){ applyFilter(); });
  if(modal) modal.addEventListener('click', function(e){ if(e.target === modal) closeModal(); });

  window.__openSmartCats = function(){ openModal(); };
  window.__smartFocusAsset = function(){ return focusAsset; };

  applyFilter();
})();
</script>
</body></html>`;
}
