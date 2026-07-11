/**
 * Business-facing HTML for CO.CO daily report (manager language, same visual language).
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

export function renderBusinessHtml(report) {
  const mc = report.managerCard;
  const assets = report.assets || [];
  const catalog = report.assetCatalog || [];
  const healthBiz = report.healthBusiness;

  const assetChecks = catalog.map((a) => {
    const disabled = a.available === false ? 'disabled' : '';
    const checked = a.id === 'site-main' ? 'checked' : '';
    const soon = a.available === false ? ' <span class="soon">(בקרוב)</span>' : '';
    return `<label class="chk"><input type="checkbox" name="asset" value="${h(a.id)}" data-asset="${h(a.id)}" ${checked} ${disabled}> ${h(a.labelHe)}${soon}</label>`;
  }).join('');

  const assetSections = assets.map((a) => `
<section class="card asset-block" data-asset-section="${h(a.id)}">
  <h2>${h(a.labelHe)}</h2>
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
  <h3 class="h3">איפה אנחנו היום</h3>
  <ul class="exec">${(a.whereToday || []).map((x) => `<li>${metricCell(x)}</li>`).join('')}</ul>
  <h3 class="h3">מה השתנה</h3>
  <ul class="exec">${(a.whatChanged || []).map((x) => `<li>${metricCell(x)}</li>`).join('')}</ul>
  <h3 class="h3">מה חסר</h3>
  <ul class="exec">${(a.whatsMissing || []).map((x) => `<li>${metricCell(x)}</li>`).join('')}</ul>
  <h3 class="h3">שלוש פעולות חשובות</h3>
  <ol>${(a.top3 || []).map((x) => `<li>${metricCell(x)}</li>`).join('')}</ol>
</section>`).join('');

  const comparison = report.comparison;

  return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<title>דוח יומי #${h(report.meta.reportNumberPadded)} — ${h(report.client.company)}</title>
<style>
:root{--ink:#0f172a;--muted:#64748b;--line:#dbe3f0;--bg:#f1f5f9;--card:#fff;--brand:#0b1735;--ok:#047857;--warn:#b45309;--bad:#b91c1c;--ai:#6d28d9;--miss:#334155}
*{box-sizing:border-box}
body{font-family:Heebo,Arial,sans-serif;margin:0;background:var(--bg);color:var(--ink);line-height:1.45}
.wrap{max-width:980px;margin:0 auto;padding:18px 14px 56px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin-bottom:12px}
.cover{background:linear-gradient(145deg,#0b1735,#1e3a5f);color:#fff;border:none}
.cover h1{margin:0 0 8px;font-size:1.35rem}
.cover .sub{opacity:.85;font-size:.9rem}
.actions{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 0}
.btn{display:inline-block;padding:8px 12px;border-radius:10px;text-decoration:none;font-weight:700;font-size:.85rem;border:1px solid transparent;cursor:pointer;background:#e2e8f0;color:#0f172a}
.btn-pdf{background:#fbbf24;color:#111}
.btn-o{background:transparent;border-color:rgba(255,255,255,.35);color:#fff}
.btn-go{background:#2563eb;color:#fff;border:0}
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
.filter label{font-size:.72rem;color:var(--muted);display:flex;flex-direction:column;gap:4px}
.filter input,.filter select{padding:7px 9px;border:1px solid var(--line);border-radius:8px;font-size:.85rem;min-width:130px}
.chk{display:block;padding:6px 0;font-size:.88rem}.soon{color:var(--muted);font-size:.75rem}
.trend{font-size:1.05rem;font-weight:800;margin-bottom:4px}
.decision li{margin-bottom:8px}
.modal-bg{display:none;position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:40;align-items:center;justify-content:center;padding:16px}
.modal-bg.on{display:flex}
.modal{background:#fff;border-radius:14px;max-width:420px;width:100%;padding:16px;border:1px solid var(--line)}
.modal h3{margin:0 0 10px;font-size:1rem}
.cats label{display:block;padding:6px 0;font-size:.88rem}
@media print{.filter,.actions,#assetModal,.no-print{display:none!important}.card{break-inside:avoid}}
</style></head><body><div class="wrap">

<section class="card cover" id="page1">
  <div class="badge">דוח יומי לעסק · ניסיון דליה</div>
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

<section class="card no-print">
  <h2>סינון מהיר</h2>
  <div class="filter">
    <label>תאריך<input type="date" id="fDate" value="${h(report.meta.reportDate)}"></label>
    <label>מספר דוח<input type="text" id="fNum" value="${h(report.meta.reportNumberDisplay)}" readonly></label>
    <label>סוג נכס / קמפיין
      <button type="button" class="btn" id="btnAssets" style="margin-top:0">בחירת נכסים…</button>
    </label>
    <button type="button" class="btn btn-go" id="btnApply">הצג דוח</button>
  </div>
  <p class="note" id="selHint">ברירת מחדל: אתר ראשי (קידום אורגני). אפשר לבחור כמה נכסים.</p>
</section>

<section class="card" id="decisionCard">
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

<section class="card">
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

<section class="card">
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
  <p>${h(comparison.summary)}</p>
  <ul class="exec">${(comparison.bullets || []).map((b) => `<li>${h(b)}</li>`).join('')}</ul>
  <p class="note">${h(comparison.note)}</p>
</section>

<section class="card">
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

<section class="card">
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
  <div class="modal" role="dialog" aria-labelledby="assetModalTitle">
    <h3 id="assetModalTitle">בחירת נכסים / קמפיינים</h3>
    <div class="cats">${assetChecks}</div>
    <p class="note">ברירת מחדל: נכס אחד. אפשר לסמן כמה — הדוח יוצג לפי הבחירה, בלי לערבב נתונים.</p>
    <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">
      <button type="button" class="btn" id="modalCancel">סגור</button>
      <button type="button" class="btn btn-go" id="modalOk">אישור</button>
    </div>
  </div>
</div>

<script>
(function(){
  var modal=document.getElementById('assetModal');
  var btn=document.getElementById('btnAssets');
  var ok=document.getElementById('modalOk');
  var cancel=document.getElementById('modalCancel');
  var apply=document.getElementById('btnApply');
  var hint=document.getElementById('selHint');
  function selected(){
    return Array.prototype.slice.call(document.querySelectorAll('input[name=asset]:checked')).map(function(i){return i.value;});
  }
  function applyFilter(){
    var sel=selected();
    if(!sel.length){
      var main=document.querySelector('input[value=site-main]');
      if(main){ main.checked=true; sel=['site-main']; }
    }
    document.querySelectorAll('[data-asset-section]').forEach(function(el){
      el.style.display = sel.indexOf(el.getAttribute('data-asset-section'))>=0 ? '' : 'none';
    });
    var cmp=document.getElementById('compareBlock');
    if(cmp) cmp.style.display = sel.length>1 ? '' : 'none';
    if(hint) hint.textContent = 'נבחרו: '+sel.length+' נכס/ים · הדוח מציג רק אותם';
  }
  if(btn) btn.onclick=function(){ modal.classList.add('on'); modal.setAttribute('aria-hidden','false'); };
  if(cancel) cancel.onclick=function(){ modal.classList.remove('on'); };
  if(ok) ok.onclick=function(){ modal.classList.remove('on'); applyFilter(); };
  if(apply) apply.onclick=applyFilter;
  applyFilter();
})();
</script>
</body></html>`;
}
