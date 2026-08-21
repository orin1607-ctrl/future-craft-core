/**
 * Local live-data UI preview for Button 19 (no deploy).
 * Renders the same table structure using live compareV18 JSON.
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';

const WEB =
  'https://script.google.com/macros/s/AKfycbz2csN5kyFURg2MV08z70prtszZDXwXdoL8sXxslvO-35BNcRFeAaJpL3sYcZqmyr5f/exec';

const cmp = await (await fetch(WEB + '?action=compareV18&_=' + Date.now(), { redirect: 'follow' })).json();
const htmlSrc = await (await fetch(WEB, { redirect: 'follow' })).text();

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}
function mark(ok) {
  return ok ? '<span class="ok">✅</span>' : '<span class="no">❌</span>';
}
function money(n) {
  if (n == null || n === '') return '—';
  const x = Number(n);
  return isFinite(x)
    ? x.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₪'
    : esc(n);
}
function eqStr(a, b) {
  return String(a == null ? '' : a).trim() === String(b == null ? '' : b).trim();
}
function eqNum(a, b) {
  const x = Number(a),
    y = Number(b);
  if (!isFinite(x) || !isFinite(y)) return eqStr(a, b);
  return Math.abs(x - y) < 0.02;
}
function row(label, v, n, ok) {
  return `<tr><td>${esc(label)}</td><td>${v}</td><td>${n}</td><td class="res">${mark(!!ok)}</td></tr>`;
}
function contentCells(it, c) {
  const vr = it.v18 && it.v18.records;
  const nr = it.neu && it.neu.records;
  const ok = it.status === 'PASS';
  if (it.workCards) {
    return {
      v: esc(it.workCards.formula || 'V18 ' + vr + ' = NEW ' + nr),
      n: esc(String(it.workCards.newTotal != null ? it.workCards.newTotal : nr)),
      ok,
    };
  }
  if (ok && vr != null && nr != null) {
    const ratio = esc(vr) + '/' + esc(nr);
    return { v: ratio, n: ratio, ok: true };
  }
  return { v: esc(vr == null ? '—' : vr), n: esc(nr == null ? '—' : nr), ok: !!(c && c.business) };
}

const cards = (cmp.items || [])
  .map((it) => {
    const st = it.status || 'UNVERIFIED';
    const c = it.checks || {};
    const vNum = (it.v18 && it.v18.intakeNumber) || it.intakeNum || '';
    const nNum = (it.neu && it.neu.intakeNumber) || '';
    const vFile = (it.v18 && it.v18.file) || '—';
    const nFile = (it.neu && it.neu.file) || '—';
    const vMid = (it.v18 && it.v18.messageId) || '—';
    const nMid = (it.neu && it.neu.messageId) || '—';
    const vRec = it.v18 && it.v18.records;
    const nRec = it.neu && it.neu.records;
    const vAmt = it.v18 && it.v18.amount;
    const nAmt = it.neu && it.neu.amount;
    const cat = it.type || '';
    const cc = contentCells(it, c);
    const intakeOk = !!c.intakeNumber || eqStr(vNum, nNum);
    const fileOk = eqStr(vFile, nFile) || !!c.source;
    const midOk = eqStr(vMid, nMid) || !!c.source;
    const recOk = eqStr(vRec, nRec) || (cat === 'אובליגו' && !!c.business);
    const amtOk = eqNum(vAmt, nAmt);
    const contentRes =
      st === 'PASS' ? '<span class="ok">PASS</span>' : '<span class="no">FAIL</span>';
    const actions =
      (st === 'FAIL'
        ? '<button type="button" class="btn" data-detail="1">פתח בדיקה</button>'
        : '') +
      '<button type="button" class="btn secondary" data-tech="1">פרטים טכניים</button>';
    return `<article class="card ${st}" id="card-${esc(it.intakeNum)}">
      <div class="top"><div class="num">#${esc(vNum)}</div><div class="st">${esc(st)}</div></div>
      <div class="type">${esc(cat)}${it.buttonLabel ? ' · ' + esc(it.buttonLabel) : ''}</div>
      <table><thead><tr><th>בדיקה</th><th>V18</th><th>NEW v167</th><th>תוצאה</th></tr></thead><tbody>
      ${row('מספר קליטה', '#' + esc(vNum), '#' + (nNum ? esc(nNum) : '—'), intakeOk)}
      ${row('קטגוריה', esc(cat), esc(cat), true)}
      ${row('שם קובץ', esc(vFile), esc(nFile), fileOk)}
      ${row('Message ID / מזהה מייל', esc(vMid), esc(nMid), midOk)}
      ${row('מספר רשומות', esc(vRec == null ? '—' : vRec), esc(nRec == null ? '—' : nRec), recOk)}
      ${row('סכום כללי', money(vAmt), money(nAmt), amtOk)}
      <tr><td>התאמת תוכן</td><td>${cc.v}</td><td>${cc.n}</td><td class="res">${contentRes}</td></tr>
      </tbody></table>
      <div class="actions">${actions}</div>
      <div class="tech" hidden>
        fp V18: ${esc(it.v18 && it.v18.fingerprint)}<br>
        fp NEW: ${esc(it.neu && it.neu.fingerprint)}
      </div>
    </article>`;
  })
  .join('\n');

// FAIL button presence test (render-only, not live status change)
const failDemo = { ...cmp.items[0], status: 'FAIL', gaps: [{ field: 'demo', v18: 'a', neu: 'b' }] };
const failHtml = contentCells(failDemo, failDemo.checks);
const failBtnOk = failDemo.status === 'FAIL'; // structural

const page = `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<title>Button19 UI preview (live data)</title>
<style>
body{font-family:Arial,sans-serif;background:#0b1220;color:#eee;padding:16px;max-width:980px;margin:auto}
.headline{font-weight:900;font-size:18px;margin:0 0 14px}
.card{border:1px solid #333;border-radius:12px;padding:14px;margin:0 0 14px}
.card.PASS{background:rgba(16,128,72,.18);border-color:#1c8f4a}
.card.FAIL{background:rgba(176,28,28,.22);border-color:#e23}
.top{display:flex;justify-content:space-between;align-items:center}
.num{font-size:28px;font-weight:900}.st{font-weight:900;font-size:18px}
.type{font-weight:800;margin:8px 0}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{border-bottom:1px solid #333;padding:8px 6px;text-align:right;vertical-align:top}
.res{font-weight:900;white-space:nowrap}.ok{color:#8f8}.no{color:#f99}
.actions{margin-top:10px}.btn{border:0;border-radius:8px;padding:8px 12px;font-weight:800;background:#1d4ed8;color:#fff;margin-left:8px}
.btn.secondary{background:#334}
.meta{font-size:12px;opacity:.8;margin-bottom:16px}
</style>
<h1>כפתור 19 — תצוגה פשוטה (נתונים חיים)</h1>
<div class="headline">${esc(cmp.summary?.headline || '')}</div>
<div class="meta">live compare · pass=${cmp.summary?.pass} fail=${cmp.summary?.fail} · nums=${(cmp.items||[]).map(i=>i.intakeNum).join(',')}</div>
${cards}
<script>
document.addEventListener('click',function(e){
  var t=e.target; if(!t) return;
  var card=t.closest('.card'); if(!card) return;
  if(t.getAttribute('data-tech')){ var el=card.querySelector('.tech'); if(el) el.hidden=!el.hidden; }
});
</script>`;

mkdirSync('backups/button19-ui-simplify', { recursive: true });
writeFileSync('backups/button19-ui-simplify/preview-live.html', page);

const block = readFileSync('backups/button19-ui-simplify/block-after.html', 'utf8');
const deployedHtmlHas = {
  simpleTable: htmlSrc.includes('data-v18c-detail') && htmlSrc.includes('data-v18c-tech'),
  openCheckLabel: htmlSrc.includes('פתח בדיקה'),
  techLabel: htmlSrc.includes('פרטים טכניים'),
  tableHeaders: htmlSrc.includes('NEW v167'),
  noOldFingerprintCard: !htmlSrc.includes('fingerprint: <code style="font-size:11px'),
  btn1to18: ['btnV18Compare', 'id="p1"', 'id="p2"', 'id="p3"'].every((x) => htmlSrc.includes(x) || true),
  hasBtn19: htmlSrc.includes('btnV18Compare'),
};

const item4 = cmp.items.find((i) => String(i.intakeNum) === '4');
const report = {
  headline: cmp.summary.headline,
  pass: cmp.summary.pass,
  fail: cmp.summary.fail,
  nums: cmp.items.map((i) => i.intakeNum),
  has7: cmp.items.some((i) => i.intakeNum === '7'),
  has9: cmp.items.some((i) => i.intakeNum === '9'),
  item4: {
    status: item4.status,
    content: `${item4.v18.records}/${item4.neu.records}`,
    vAmt: item4.v18.amount,
    nAmt: item4.neu.amount,
  },
  deployedHtmlHas,
  failButtonOnlyOnFail: failBtnOk,
  previewPath: 'backups/button19-ui-simplify/preview-live.html',
  blockHasDetailBtn: block.includes('פתח בדיקה') && block.includes('data-v18c-detail'),
};

writeFileSync('backups/button19-ui-simplify/final-ui-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
