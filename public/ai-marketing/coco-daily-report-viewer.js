/**
 * CO.CO — Daily Progress Report Viewer (Business trial)
 * Latest report only + Hebrew labels. Resend stays dry_run-gated.
 */
(function () {
  'use strict';

  var VERSION = '2.1.1-daily-viewer-html-first';
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
      '<div class="ph-t">📅 דוח יומי (אחרון)</div>' +
      '<div class="s">תצוגה למנהל עסק · פתחו HTML לסינון חכם · שליחה חסומה כרגע</div>' +
      '<div id="coco-daily-latest" style="font-size:12px;margin-top:8px;">טוען…</div>' +
      '<div id="coco-daily-actions" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;"></div>' +
      '</div>';

    fetch(base + 'index.json?t=' + Date.now())
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (idx) {
        var el = document.getElementById('coco-daily-latest');
        var actions = document.getElementById('coco-daily-actions');
        if (!el || !actions) return;
        if (!idx || !idx.latest) {
          el.textContent = 'אין דוח אחרון ללקוח זה';
          return;
        }
        var L = idx.latest;
        el.innerHTML =
          '<div><strong>מספר דוח:</strong> ' + (L.reportNumberDisplay || ('#' + L.reportNumber)) + '</div>' +
          '<div><strong>תאריך:</strong> ' + (L.date || '—') + '</div>' +
          '<div><strong>ציון הפרויקט:</strong> ' + (L.projectScore ?? '—') +
          ' · <strong>בריאות המערכת:</strong> ' + (L.healthScore ?? '—') + '</div>';

        var pdfHref = base + (L.pdf || 'latest.pdf');
        var htmlHref = base + (L.html || 'latest.html');
        actions.innerHTML =
          '<a class="btn btn-p btn-sm" href="' + htmlHref + '" target="_blank" rel="noopener">פתח דוח HTML (סינון)</a>' +
          '<a class="btn btn-o btn-sm" href="' + pdfHref + '" download="' + (L.pdfFileName || 'report.pdf') + '">הורד PDF</a>' +
          '<button type="button" class="btn btn-o btn-sm" id="coco-daily-resend">שלח שוב למייל</button>';

        var btn = document.getElementById('coco-daily-resend');
        if (btn) {
          btn.addEventListener('click', function () {
            window.alert('שליחה חוזרת חסומה כרגע.\nלא נשלח מייל.\nלא שונה סטטוס.\nלא נוצר דוח חדש.');
          });
        }
      })
      .catch(function () {
        var el = document.getElementById('coco-daily-latest');
        if (el) el.textContent = 'לא ניתן לטעון את הדוח האחרון';
      });
  }

  window.CocoDailyReportViewer = { VERSION: VERSION, mount: mount, ROOT_ID: ROOT_ID };
})();
