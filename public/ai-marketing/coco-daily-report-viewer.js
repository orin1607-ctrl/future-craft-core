/**
 * CO.CO — Daily Progress Report Viewer (history UI, read-only)
 */
(function () {
  'use strict';

  var VERSION = '1.0.0-daily-viewer';
  var ROOT_ID = 'coco-daily-report-root';

  function pagesBase() {
    var b = window.COCO_PAGES_BASE || '/';
    if (b.charAt(0) === '/') b = location.origin + b;
    if (b.charAt(b.length - 1) !== '/') b += '/';
    return b;
  }

  function clientSlug() {
    try {
      var q = new URLSearchParams(location.search);
      if (q.get('clientId')) return q.get('clientId');
      var ctx = JSON.parse(localStorage.getItem('coco-pirsum-client-v1') || '{}');
      return ctx.clientId || 'dalia-c-official';
    } catch (e) {
      return 'dalia-c-official';
    }
  }

  function mount(rootId) {
    var root = document.getElementById(rootId || ROOT_ID);
    if (!root) return;
    var slug = clientSlug();
    var base = pagesBase() + 'coco-reports/' + encodeURIComponent(slug) + '/daily/';
    root.innerHTML =
      '<div class="card" style="margin-top:10px;">' +
      '<div class="ph-t">📅 דוחות התקדמות יומיים</div>' +
      '<div class="s">Read Only · היסטוריה לפי תאריך · ללא Pipeline</div>' +
      '<div id="coco-daily-list" style="font-size:12px;margin-top:8px;">טוען…</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">' +
      '<a class="btn btn-p btn-sm" href="' + base + 'latest.html" target="_blank" rel="noopener">דוח אחרון</a>' +
      '<a class="btn btn-o btn-sm" href="' + base + 'latest.json" target="_blank" rel="noopener">JSON</a>' +
      '</div></div>';

    fetch(base + 'index.json?t=' + Date.now())
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (idx) {
        var el = document.getElementById('coco-daily-list');
        if (!el) return;
        if (!idx || !idx.reports || !idx.reports.length) {
          el.textContent = 'אין דוחות עדיין ללקוח ' + slug;
          return;
        }
        el.innerHTML = idx.reports.map(function (r) {
          return '<div style="padding:6px 0;border-bottom:1px solid var(--w10,#e2e8f0);">' +
            '<strong>' + r.date + '</strong> · Score ' + (r.projectScore ?? '—') +
            ' · Health ' + (r.healthScore ?? '—') +
            ' · <a href="' + base + r.html + '" target="_blank" rel="noopener">HTML</a>' +
            ' · <a href="' + base + r.json + '" target="_blank" rel="noopener">JSON</a>' +
            (r.emailPreview ? ' · <a href="' + base + r.emailPreview + '" target="_blank" rel="noopener">אימייל</a>' : '') +
            '</div>';
        }).join('');
      })
      .catch(function () {
        var el = document.getElementById('coco-daily-list');
        if (el) el.textContent = 'לא ניתן לטעון היסטוריה (ייתכן שטרם פורסם ל-Pages)';
      });
  }

  window.CocoDailyReportViewer = { VERSION: VERSION, mount: mount, ROOT_ID: ROOT_ID };
})();
