/**
 * CRM — ניווט חזרה לדליה
 */
(function () {
  'use strict';
  var params = new URLSearchParams(location.search);
  var isFullscreen = params.get('fullscreen') === '1';
  var isEmbedded = window.self !== window.top;

  function getDaliaBase() {
    if (window.DALIA_APP_BASE) return window.DALIA_APP_BASE;
    var path = location.pathname || '/';
    var idx = path.indexOf('dalia-crm-platform');
    if (idx > 0) return path.substring(0, idx);
    return '/future-craft-core/';
  }

  function exitToDalia() {
    if (isEmbedded || isFullscreen) {
      try {
        window.parent.postMessage({ type: 'dalia-coco-exit', path: '/admin-home' }, '*');
      } catch (e) { /* ignore */ }
    }
    if (!isEmbedded) {
      var base = getDaliaBase();
      if (!base.endsWith('/')) base += '/';
      location.href = base + 'admin-home';
    }
  }

  function injectTopbarDaliaBtn() {
    document.querySelectorAll('.crm-layout .topbar').forEach(function (topbar) {
      if (topbar.querySelector('.prd-dalia-exit')) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-ghost prd-dalia-exit';
      btn.style.fontSize = '12px';
      btn.textContent = '← דליה';
      btn.addEventListener('click', function (e) { e.preventDefault(); exitToDalia(); });
      var left = topbar.querySelector('.topbar-left');
      if (left) left.insertBefore(btn, left.firstChild);
    });
  }

  window.CrmDaliaNav = { init: injectTopbarDaliaBtn, exitToDalia: exitToDalia };
})();
