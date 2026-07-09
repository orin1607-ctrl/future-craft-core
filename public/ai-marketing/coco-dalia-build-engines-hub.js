/**
 * CO.CO דליה — Build Engines Hub (13 engines panel + owner actions)
 */
(function () {
  'use strict';

  var VERSION = '5.2.0-hub';

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function statusClass(st) {
    if (st === 'הושלם' || st === 'מוכן') return 'bd-g';
    if (st === 'ממתין למפתח' || st === 'דורש API Key') return 'bd-y';
    if (st === 'שגיאה') return 'bd-r';
    return 'bd-x';
  }

  function renderEnginesList(store) {
    var engines = (store && store.engines) || [];
    if (!engines.length && window.CocoDaliaBuildEnginesEngine) {
      store = CocoDaliaBuildEnginesEngine.runAll(null, { skipParallel: true });
      engines = store.engines || [];
    }
    return engines.map(function (e) {
      var owner = e.ownerAction;
      var link = owner && owner.url
        ? '<a href="' + esc(owner.url) + '" target="_blank" rel="noopener" style="color:var(--acc2);font-size:10px;">פתח חיבור ↗</a>'
        : '';
      return '<div class="simple-row" style="cursor:default;flex-wrap:wrap;gap:4px;">' +
        '<span style="font-size:14px;">' + esc(e.icon) + '</span>' +
        '<span class="simple-name" style="flex:1;min-width:140px;">' + esc(e.name) +
        '<div style="font-size:10px;color:var(--w50);font-weight:400;">' + esc(e.id) + ' · ' + esc(e.category) + '</div></span>' +
        '<span class="bd ' + statusClass(e.status) + '">' + esc(e.status) + '</span>' +
        '<div style="width:100%;font-size:10px;color:var(--w60);padding:0 4px 4px 28px;">' + esc(e.note || '') + ' ' + link + '</div>' +
        '</div>';
    }).join('');
  }

  function renderOwnerBlock(pending) {
    if (!pending || !pending.length) {
      return '<div style="font-size:11px;color:var(--green);padding:8px;">✅ אין בקשות פתוחות ממך כרגע — כל המנועים רצים או ממתינים ל-Edge.</div>';
    }
    return '<div style="font-size:11px;color:var(--yel);margin-bottom:8px;">⚠️ ' + pending.length + ' מנועים ממתינים לפעולה שלך (פרטים למטה בדוח OWNER-ACTIONS)</div>' +
      pending.map(function (p) {
        var o = p.action || {};
        return '<div style="border:1px solid rgba(245,158,11,.3);border-radius:8px;padding:8px;margin-bottom:6px;font-size:11px;">' +
          '<b>' + esc(p.id) + '</b>: ' + esc(p.note || '') +
          (o.url ? '<br><a href="' + esc(o.url) + '" target="_blank" rel="noopener" style="color:var(--acc2);">' + esc(o.service || o.url) + ' ↗</a>' : '') +
          '</div>';
      }).join('');
  }

  function resolveHubPreviewUrl() {
    if (window.CocoPipelineBridge && CocoPipelineBridge.resolvePreviewUrls) {
      return CocoPipelineBridge.resolvePreviewUrls();
    }
    var ctx = {};
    try { ctx = JSON.parse(localStorage.getItem('coco-pirsum-client-v1') || '{}'); } catch (e) { ctx = {}; }
    var slug = String(ctx.clientId || 'dalia-c-official').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    var base = window.COCO_PAGES_BASE || '/';
    if (base.charAt(0) === '/') base = location.origin + base;
    if (base.charAt(base.length - 1) !== '/') base += '/';
    return { indexUrl: base + 'client-previews/' + slug + '/index.html', gatewayUrl: base + 'client-previews/preview-gateway.html?slug=' + encodeURIComponent(slug) };
  }

  function mount(rootId) {
    var root = document.getElementById(rootId || 'coco-build-engines-hub');
    if (!root) return;

    var store = (window.CocoDaliaBuildEnginesEngine && CocoDaliaBuildEnginesEngine.loadEngines()) || null;
    var pending = (window.CocoDaliaBuildEnginesRunner && CocoDaliaBuildEnginesRunner.getOwnerActions()) || [];
    var preview = resolveHubPreviewUrl();

    root.innerHTML =
      '<div class="card" style="margin-top:10px;">' +
      '<div class="ph-t">🛠️ מנועי בניית אתרים (13)</div>' +
      '<div class="s">הרצה מקבילית — c13 → c12 · Preview בקישור בלבד (Staging)</div>' +
      '<div id="be-owner-pending" style="margin:8px 0;">' + renderOwnerBlock(pending) + '</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">' +
      '<button type="button" class="btn btn-p btn-sm" id="be-run-all">▶ הרץ את כל המנועים</button>' +
      '<a class="btn btn-p btn-sm" id="be-open-preview" href="' + esc(preview.indexUrl) + '" target="_blank" rel="noopener" style="text-decoration:none;display:inline-flex;align-items:center;">🔗 פתח Preview לבדיקה ↗</a>' +
      '<a class="btn btn-o btn-sm" id="be-open-gateway" href="' + esc(preview.gatewayUrl) + '" target="_blank" rel="noopener" style="text-decoration:none;display:inline-flex;align-items:center;">🌐 Gateway</a>' +
      '</div>' +
      '<div id="be-engines-list">' + renderEnginesList(store) + '</div>' +
      '</div>';

    root.querySelector('#be-run-all').addEventListener('click', function () {
      if (window.CocoDaliaBuildEnginesEngine) {
        CocoDaliaBuildEnginesEngine.runAll(null, {});
        if (typeof toast === 'function') toast('▶ מנועים רצים במקביל…');
        setTimeout(function () { mount(rootId); }, 2500);
      }
    });

    window.addEventListener('coco:engines-updated', function () { mount(rootId); });
    window.addEventListener('coco:engines-outputs-updated', function () { mount(rootId); });
  }

  window.CocoDaliaBuildEnginesHub = { VERSION: VERSION, mount: mount };
})();
