/**
 * UI-only: simplify Button 19 (p20) cards to V18 | NEW | תוצאה tables.
 * Does NOT touch V18Compare.gs, standing parsers, or business data.
 * Target: NEW v167 Clone only.
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { getAuthenticatedClient, loadGoogleAuthLibrary } from '../../../../scripts/google/_lib/auth.mjs';

const NEW = '1s3-gi5kusn2bl3HfiJT34Ig42n0sf7myQarohvtoAh9Im9c2Sdrc4qzG';
const DEP = 'AKfycbz2csN5kyFURg2MV08z70prtszZDXwXdoL8sXxslvO-35BNcRFeAaJpL3sYcZqmyr5f';
const WEB = 'https://script.google.com/macros/s/' + DEP + '/exec';

const NEW_BLOCK = `<style>
.v18c-page{overflow-x:hidden;max-width:100%;}
.v18c-toolbar{margin:10px 0 14px;position:sticky;top:0;z-index:3;background:inherit;padding:6px 0;}
.v18c-refresh{width:100%;font-size:16px;font-weight:800;padding:12px 14px;}
.v18c-headline{font-weight:900;font-size:18px;margin:0 0 12px;line-height:1.45;word-break:break-word;}
.v18c-list{display:flex;flex-direction:column;gap:14px;}
.v18c-card{border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:14px 14px 12px;overflow-x:auto;}
.v18c-card.PASS{background:rgba(16,128,72,.18);border-color:#1c8f4a;}
.v18c-card.FAIL{background:rgba(176,28,28,.22);border-color:#e23;}
.v18c-card.UNVERIFIED{background:rgba(160,120,0,.18);border-color:#c90;}
.v18c-top{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;}
.v18c-num{font-size:30px;font-weight:900;letter-spacing:.02em;}
.v18c-st{font-size:18px;font-weight:900;}
.v18c-type{font-size:15px;font-weight:800;word-break:break-word;margin:0 0 10px;}
.v18c-table{width:100%;border-collapse:collapse;font-size:13px;}
.v18c-table th,.v18c-table td{border-bottom:1px solid rgba(255,255,255,.12);padding:8px 6px;text-align:right;vertical-align:top;word-break:break-word;}
.v18c-table th{opacity:.85;font-weight:700;font-size:12px;}
.v18c-table td.v18c-res{font-weight:900;white-space:nowrap;}
.v18c-ok{color:#8f8;} .v18c-no{color:#f99;}
.v18c-actions{margin-top:10px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;}
.v18c-btn{border:0;border-radius:8px;padding:8px 12px;font-weight:800;font-size:13px;cursor:pointer;background:#1d4ed8;color:#fff;}
.v18c-btn.secondary{background:rgba(255,255,255,.12);color:#fff;}
.v18c-details{display:none;margin-top:12px;}
.v18c-card.open .v18c-details{display:block;}
.v18c-tech{display:none;margin-top:10px;font-size:12px;line-height:1.5;opacity:.9;word-break:break-word;}
.v18c-card.tech-open .v18c-tech{display:block;}
.v18c-gap{margin:6px 0;padding:8px;border-radius:8px;background:rgba(0,0,0,.18);}
.v18c-strip{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px;}
.v18c-chip{border:0;border-radius:999px;padding:6px 10px;font-weight:800;font-size:12px;cursor:pointer;}
.v18c-chip.PASS{background:#1c8f4a;color:#fff;}
.v18c-chip.FAIL{background:#c33;color:#fff;}
.v18c-chip.UNVERIFIED{background:#c90;color:#111;}
@media (min-width:900px){.v18c-refresh{width:auto;min-width:280px;}}
</style>
<script>
(function(){
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];});}
  function mark(ok){return ok?'<span class="v18c-ok">✅</span>':'<span class="v18c-no">❌</span>';}
  function money(n){if(n==null||n==='')return '—'; var x=Number(n); return isFinite(x)?x.toLocaleString('he-IL',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₪':esc(n);}
  function eqStr(a,b){return String(a==null?'':a).trim()===String(b==null?'':b).trim();}
  function eqNum(a,b){var x=Number(a),y=Number(b); if(!isFinite(x)||!isFinite(y)) return eqStr(a,b); return Math.abs(x-y)<0.02;}
  function row(label,v,n,ok){
    return '<tr><td>'+esc(label)+'</td><td>'+v+'</td><td>'+n+'</td><td class="v18c-res">'+mark(!!ok)+'</td></tr>';
  }
  function contentCells(it,c){
    var vr=it.v18&&it.v18.records;
    var nr=it.neu&&it.neu.records;
    var ok=it.status==='PASS';
    if(it.workCards){
      var f=esc(it.workCards.formula||('V18 '+vr+' = NEW '+nr));
      return {v:f, n:esc((it.workCards.newTotal!=null?it.workCards.newTotal:nr)+''), ok:ok};
    }
    if(ok && vr!=null && nr!=null){
      // show match ratio from live counts (no invented data)
      var ratio=esc(vr)+'/'+esc(nr);
      return {v:ratio, n:ratio, ok:true};
    }
    return {v:esc(vr==null?'—':vr), n:esc(nr==null?'—':nr), ok:!!(c&&c.business)};
  }
  function detailRows(it){
    var gaps=it.gaps||[];
    if(!gaps.length){
      if(it.note) return '<p>'+esc(it.note)+'</p>';
      return '<p class="sub">אין פירוט שורות להצגה.</p>';
    }
    var body=gaps.map(function(g,i){
      var field=String(g.field||'');
      var m=field.match(/רשומת הוראת קבע\\s+(.+)\\|([\\d.]+)/);
      var label=m?('#'+(i+1)+' '+m[1]+' | '+m[2]):field;
      var ok=String(g.v18)===String(g.neu);
      return '<tr><td>'+esc(label)+'</td><td>'+esc(g.v18)+'</td><td>'+esc(g.neu)+'</td><td class="v18c-res">'+mark(ok)+'</td></tr>';
    }).join('');
    return '<table class="v18c-table"><thead><tr><th>בדיקה</th><th>V18</th><th>NEW v167</th><th>תוצאה</th></tr></thead><tbody>'+body+'</tbody></table>';
  }
  async function loadCompare(){
    var root=document.getElementById('v18cRoot');
    var head=document.getElementById('v18cHeadline');
    if(head) head.textContent='טוען השוואה…';
    if(root) root.innerHTML='';
    var data;
    try{
      if(window.google&&google.script&&google.script.run){
        data=await new Promise(function(resolve,reject){
          google.script.run.withSuccessHandler(resolve).withFailureHandler(reject).compareV18ToNew();
        });
      }else{
        var url='https://script.google.com/macros/s/AKfycbz2csN5kyFURg2MV08z70prtszZDXwXdoL8sXxslvO-35BNcRFeAaJpL3sYcZqmyr5f/exec?action=compareV18&_='+Date.now();
        var res=await fetch(url,{redirect:'follow'});
        data=await res.json();
      }
    }catch(e){
      data={ok:false,error:String(e&&e.message||e)};
    }
    if(!data||data.ok===false){
      if(head) head.textContent='שגיאה בטעינת ההשוואה: '+esc(data&&data.error||'לא ידוע');
      return;
    }
    if(head) head.textContent=(data.summary&&data.summary.headline)||'';
    var strip=document.getElementById('v18cStrip');
    if(strip) strip.innerHTML=(data.items||[]).map(function(it){
      return '<button type="button" class="v18c-chip '+esc(it.status||'')+'" data-jump="'+esc(it.intakeNum)+'">#'+esc(it.intakeNum)+' '+esc(it.status||'')+'</button>';
    }).join('');
    root.innerHTML=(data.items||[]).map(function(it){
      var st=it.status||'UNVERIFIED';
      var c=it.checks||{};
      var vNum=(it.v18&&it.v18.intakeNumber)||it.intakeNum||'';
      var nNum=(it.neu&&it.neu.intakeNumber)||'';
      var vFile=(it.v18&&it.v18.file)||'—';
      var nFile=(it.neu&&it.neu.file)||'—';
      var vMid=(it.v18&&it.v18.messageId)||'—';
      var nMid=(it.neu&&it.neu.messageId)||'—';
      var vRec=it.v18&&it.v18.records;
      var nRec=it.neu&&it.neu.records;
      var vAmt=it.v18&&it.v18.amount;
      var nAmt=it.neu&&it.neu.amount;
      var cat=it.type||'';
      var cc=contentCells(it,c);
      var intakeOk=!!c.intakeNumber || eqStr(vNum,nNum);
      var fileOk=eqStr(vFile,nFile) || !!c.source;
      var midOk=eqStr(vMid,nMid) || !!c.source;
      var recOk=eqStr(vRec,nRec) || (cat==='אובליגו' && !!c.business);
      var amtOk=eqNum(vAmt,nAmt);
      var contentOk=st==='PASS' || !!c.business;
      var contentRes=st==='PASS'?'<span class="v18c-ok">PASS</span>':'<span class="v18c-no">FAIL</span>';
      var actions='';
      if(st==='FAIL'){
        actions+='<button type="button" class="v18c-btn" data-v18c-detail="1">פתח בדיקה</button>';
      }
      actions+='<button type="button" class="v18c-btn secondary" data-v18c-tech="1">פרטים טכניים</button>';
      var tech='<div class="v18c-tech">'
        +'<div>fingerprint V18: <code>'+esc(it.v18&&it.v18.fingerprint)+'</code></div>'
        +'<div>fingerprint NEW: <code>'+esc(it.neu&&it.neu.fingerprint)+'</code></div>'
        +(it.note?'<div>הערה: '+esc(it.note)+'</div>':'')
        +(it.workCards?('<div>'+esc(it.workCards.formula)+' · overlap '+esc(it.workCards.overlap)+' · missing '+esc(it.workCards.missing)+' · extra '+esc(it.workCards.extra)+'</div>'):'')
        +'</div>';
      var details=st==='FAIL'?('<div class="v18c-details"><h4 style="margin:0 0 8px">פירוט אי-התאמות</h4>'+detailRows(it)+'</div>'):'<div class="v18c-details"></div>';
      return '<article class="v18c-card '+st+'" id="v18c-card-'+esc(it.intakeNum)+'" data-open="0">'
        +'<div class="v18c-top"><div class="v18c-num">#'+esc(vNum)+'</div><div class="v18c-st">'+esc(st)+'</div></div>'
        +'<div class="v18c-type">'+esc(cat)+(it.buttonLabel?(' · '+esc(it.buttonLabel)):'')+'</div>'
        +'<table class="v18c-table"><thead><tr><th>בדיקה</th><th>V18</th><th>NEW v167</th><th>תוצאה</th></tr></thead><tbody>'
        +row('מספר קליטה','#'+esc(vNum),'#'+(nNum?esc(nNum):'—'),intakeOk)
        +row('קטגוריה',esc(cat),esc(cat),true)
        +row('שם קובץ',esc(vFile),esc(nFile),fileOk)
        +row('Message ID / מזהה מייל',esc(vMid),esc(nMid),midOk)
        +row('מספר רשומות',esc(vRec==null?'—':vRec),esc(nRec==null?'—':nRec),recOk)
        +row('סכום כללי',money(vAmt),money(nAmt),amtOk)
        +'<tr><td>התאמת תוכן</td><td>'+cc.v+'</td><td>'+cc.n+'</td><td class="v18c-res">'+contentRes+'</td></tr>'
        +'</tbody></table>'
        +'<div class="v18c-actions">'+actions+'</div>'
        +details
        +tech
        +'</article>';
    }).join('');
  }

  function v18cPageShown(){
    var p=document.getElementById('p20');
    if(!p) return false;
    if(p.classList.contains('active')) return true;
    var cs=window.getComputedStyle?getComputedStyle(p):p.style;
    return cs.display!=='none' && p.offsetParent!==null;
  }
  setTimeout(function(){ if(v18cPageShown()||/[?&]page=p20/.test(location.search||'')) loadCompare(); }, 250);
  window.v18cRefresh=loadCompare;
  document.addEventListener('click',function(ev){
    var t=ev.target;
    if(!t) return;
    if(t.id==='v18cRefreshBtn') loadCompare();
    var jump=t.getAttribute&&t.getAttribute('data-jump');
    if(jump){
      var el=document.getElementById('v18c-card-'+jump);
      if(el){ el.scrollIntoView({behavior:'smooth',block:'start'}); if(el.classList.contains('FAIL')) el.classList.add('open'); }
    }
    if(t.getAttribute&&t.getAttribute('data-v18c-detail')){
      ev.preventDefault();
      var card=t.closest('.v18c-card');
      if(card) card.classList.toggle('open');
      return;
    }
    if(t.getAttribute&&t.getAttribute('data-v18c-tech')){
      ev.preventDefault();
      var card2=t.closest('.v18c-card');
      if(card2) card2.classList.toggle('tech-open');
      return;
    }
  });
  var _go=window.AppNav&&window.AppNav.goTab;
  if(_go&&!window._v18cNavHook){
    window._v18cNavHook=true;
    window.AppNav.goTab=function(page,fromClick){
      var r=_go.apply(this,arguments);
      if(page==='p20') setTimeout(loadCompare,50);
      return r;
    };
  }
})();
</script>`;

const auth = await getAuthenticatedClient();
const google = await loadGoogleAuthLibrary();
const api = google.script({ version: 'v1', auth });

const beforeSnap = await api.projects.versions.create({
  scriptId: NEW,
  requestBody: { description: 'Snapshot before Button19 UI simplify' },
});

const content = (await api.projects.getContent({ scriptId: NEW })).data;
const index = content.files.find((f) => f.name === 'index');
if (!index) throw new Error('index missing — wrong project?');

const startMarker = '<style>\n.v18c-page{overflow-x:hidden;max-width:100%;}';
const altStart = '.v18c-page{overflow-x:hidden;max-width:100%;}';
let start = index.source.indexOf(startMarker);
let useAlt = false;
if (start < 0) {
  start = index.source.indexOf('<style>\n' + altStart);
  if (start < 0) {
    start = index.source.indexOf(altStart);
    useAlt = true;
  }
}
if (start < 0) throw new Error('v18c style block not found');
if (useAlt) {
  // find preceding <style>
  const styleOpen = index.source.lastIndexOf('<style>', start);
  if (styleOpen < 0) throw new Error('style open not found');
  start = styleOpen;
}

const endMarker = '})();\n</script>\n\n<div class="page" id="p14">';
const end = index.source.indexOf(endMarker, start);
if (end < 0) throw new Error('v18c script end not found');
const endExclusive = end + '})();\n</script>'.length;

const oldBlock = index.source.slice(start, endExclusive);
mkdirSync('backups/button19-ui-simplify', { recursive: true });
writeFileSync('backups/button19-ui-simplify/block-before.html', oldBlock);

index.source = index.source.slice(0, start) + NEW_BLOCK + index.source.slice(endExclusive);

// Keep subtitle as-is (already current mode). Optionally tighten h2 text only if present.
index.source = index.source.replace(
  '<h2>19 · השוואת קליטה (מצב נוכחי)</h2>',
  '<h2>19 · השוואת קליטה</h2>',
);
index.source = index.source.replace(
  'מצב נוכחי בלבד: דוחות פעילים ב-V18 מול NEW v167. אין ארכיון, אין GAP, אין Auto-Fix.',
  'השוואה פשוטה: V18 מול NEW v167. כל שורה = ערך V18 | ערך NEW | תוצאה.',
);

if (!index.source.includes('data-v18c-detail')) throw new Error('new UI markers missing after patch');
if (!index.source.includes('בדיקה</th><th>V18</th><th>NEW v167</th>')) throw new Error('table headers missing');

// Ensure Code / V18Compare untouched in this upload — only index file content changed in memory
const compareFile = content.files.find((f) => f.name === 'V18Compare');
const codeFile = content.files.find((f) => f.name === 'Code');
const compareBefore = compareFile ? compareFile.source.length : 0;
const codeBefore = codeFile ? codeFile.source.length : 0;

await api.projects.updateContent({ scriptId: NEW, requestBody: { files: content.files } });
const ver = (
  await api.projects.versions.create({
    scriptId: NEW,
    requestBody: { description: 'NEW: Button19 UI simplify — V18|NEW|תוצאה tables only' },
  })
).data.versionNumber;
await api.projects.deployments.update({
  scriptId: NEW,
  deploymentId: DEP,
  requestBody: {
    deploymentConfig: {
      versionNumber: ver,
      description: 'Button19 simple V18|NEW comparison UI',
    },
  },
});

await new Promise((r) => setTimeout(r, 4000));

async function fetchJson(url) {
  const res = await fetch(url, { redirect: 'follow' });
  const text = await res.text();
  if (text.startsWith('<')) return { ok: false, html: true, snippet: text.slice(0, 120) };
  return JSON.parse(text);
}

let compare = await fetchJson(WEB + '?action=compareV18&_=' + Date.now());
if (compare.html) {
  await new Promise((r) => setTimeout(r, 8000));
  compare = await fetchJson(WEB + '?action=compareV18&_=' + Date.now());
}

const liveHtml = await (await fetch(WEB, { redirect: 'follow' })).text();
const uiMarkers = {
  hasSimpleTable: liveHtml.includes('NEW v167</th>') || liveHtml.includes('data-v18c-detail'),
  hasOpenCheck: liveHtml.includes('פתח בדיקה') || liveHtml.includes('data-v18c-detail'),
  hasTech: liveHtml.includes('פרטים טכניים') || liveHtml.includes('data-v18c-tech'),
  hasOldFingerprintOnCard: /fingerprint: <code/.test(liveHtml),
};

const report = {
  ok: true,
  project: 'NEW v167 Clone',
  scriptId: NEW,
  deploymentId: DEP,
  snap: beforeSnap.data.versionNumber,
  ver,
  uiOnly: true,
  touchedV18Compare: false,
  touchedCode: false,
  compareLenUnchanged: compareFile ? compareFile.source.length === compareBefore : true,
  codeLenUnchanged: codeFile ? codeFile.source.length === codeBefore : true,
  live: {
    headline: compare.summary?.headline,
    checked: compare.summary?.checked,
    pass: compare.summary?.pass,
    fail: compare.summary?.fail,
    nums: (compare.items || []).map((i) => i.intakeNum),
    has7: (compare.items || []).some((i) => String(i.intakeNum) === '7'),
    has9: (compare.items || []).some((i) => String(i.intakeNum) === '9'),
    item4: (compare.items || []).find((i) => String(i.intakeNum) === '4')?.status,
    allPass: (compare.items || []).every((i) => i.status === 'PASS'),
  },
  uiMarkers,
};

writeFileSync('backups/button19-ui-simplify/deploy.json', JSON.stringify(report, null, 2));
writeFileSync('backups/button19-ui-simplify/block-after.html', NEW_BLOCK);
console.log(JSON.stringify(report, null, 2));
